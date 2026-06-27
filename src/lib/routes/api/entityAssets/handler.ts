import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { error } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { CONTENT_DIR } from '$lib/server/globals';
import { IMAGE_EXTENSIONS } from '$lib/server/markdown';

/**
 * GET /api/entity-assets/<folder-path>/<filename>
 *
 * Streams an image file that lives alongside an entity's
 * `index.{yaml,md}` or a collection's `_collection.{yaml,md}`, so
 * authors can write `![alt](foo.png)` in their prose and have it
 * resolve to the sibling file in the same folder. The markdown
 * renderer rewrites bare image srcs into this endpoint — see
 * `rewriteImageSrcs` in `src/lib/server/markdown.ts`.
 *
 * Security:
 *   • The folder portion must name a real entity folder or
 *     collection folder known to the graph. Arbitrary paths under
 *     CONTENT_DIR are rejected — we don't want to serve `.yaml`
 *     or `.md` source files through this endpoint.
 *   • The filename must be a flat name (no slashes), contain no
 *     `..`, and carry an allow-listed image extension. Anything
 *     else is rejected before touching the filesystem.
 *
 * Caching mirrors `/api/assets/[name]`: no-store in dev, 1h in
 * production.
 */

/**
 * Render mode mirrors the root layout (see bin/shims.ts):
 *
 *   • Public world (BUNNYTRAIL_SSR unset) → prerender = true. The
 *     whole site is static; bake every sibling image into the output
 *     so adapter-vercel's CDN can serve them (the function can't read
 *     `content/` when the site is fully prerendered). entries() below
 *     enumerates them.
 *   • Gated world (BUNNYTRAIL_SSR set) → prerender = false. These
 *     images are login-only content, so they must be served by a
 *     runtime function that passes through the `handle` gate. A
 *     prerendered file would be a public CDN object — unauthenticated
 *     and ungatable. The function reads `content/` at runtime; the
 *     world's content tree is bundled into the serverless function by
 *     the consumer's vercel.json buildCommand (cpSync into the
 *     catch-all function).
 */
export const prerender = !process.env.BUNNYTRAIL_SSR;

export const entries = async (): Promise<Array<{ path: string }>> => {
	await graph.ready();
	const folders = new Set<string>();
	for (const e of graph.all()) folders.add(e.id);
	for (const cp of graph.collections().keys()) folders.add(cp);

	const out: Array<{ path: string }> = [];
	for (const folder of folders) {
		const dir = resolve(CONTENT_DIR, folder);
		let dirents;
		try {
			dirents = await readdir(dir, { withFileTypes: true });
		} catch {
			// Folder might not exist on disk (flat-file entity with no
			// sibling folder), or be unreadable — either way, nothing
			// to enumerate.
			continue;
		}
		for (const ent of dirents) {
			if (!ent.isFile()) continue;
			const name = ent.name;
			const dot = name.lastIndexOf('.');
			const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
			if (!IMAGE_EXTENSIONS.has(ext)) continue;
			out.push({ path: `${folder}/${name}` });
		}
	}
	return out;
};

export const GET = async ({ params }: { params: { path: string } }) => {
	const rawPath = params.path ?? '';
	const segments = rawPath.split('/').filter(Boolean);
	if (segments.length < 2) error(404, 'not found');
	if (segments.some((s: string) => s === '..' || s === '.' || !s)) error(400, 'bad path');

	const filename = segments[segments.length - 1];
	const folder = segments.slice(0, -1).join('/');

	const dot = filename.lastIndexOf('.');
	const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
	if (!IMAGE_EXTENSIONS.has(ext)) error(404, 'unsupported extension');

	// The folder must be a real entity or collection — otherwise we
	// could be coaxed into serving anything under CONTENT_DIR.
	await graph.ready();
	const isKnownFolder = graph.get(folder) !== undefined || graph.collection(folder) !== undefined;
	if (!isKnownFolder) error(404, 'unknown folder');

	const filePath = resolve(CONTENT_DIR, folder, filename);
	// Defence-in-depth: the resolved path must stay under CONTENT_DIR.
	const root = resolve(CONTENT_DIR);
	if (!filePath.startsWith(root + '/') && filePath !== root) error(400, 'escapes content root');

	let bytes: Buffer;
	try {
		const st = await stat(filePath);
		if (!st.isFile()) error(404, 'not a file');
		bytes = await readFile(filePath);
	} catch (err) {
		if (err instanceof Error && 'status' in err) throw err;
		error(404, 'not found');
	}

	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': contentTypeFor(ext),
			'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=3600' : 'no-store'
		}
	});
};

function contentTypeFor(ext: string): string {
	switch (ext) {
		case 'svg':
			return 'image/svg+xml';
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'gif':
			return 'image/gif';
		case 'webp':
			return 'image/webp';
		case 'avif':
			return 'image/avif';
		default:
			return 'application/octet-stream';
	}
}
