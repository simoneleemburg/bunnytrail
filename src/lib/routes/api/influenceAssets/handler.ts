import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { error } from '@sveltejs/kit';
import { INFLUENCES_DIR } from '$lib/server/globals';
import { IMAGE_EXTENSIONS } from '$lib/server/markdown';

/**
 * GET /api/influence-assets/[slug]/[filename]
 *
 * Serves an image file that lives alongside an influence entry's
 * `index.md` in `content_meta/influences/<slug>/`. Mirrors
 * `/api/guide-assets/` for guide sibling files.
 *
 * Authors write `![alt](portrait.jpg)` (bare filename) in influence
 * prose; the markdown renderer rewrites it to this endpoint when the
 * influence's slug is passed as `imageBaseDir` with
 * `imageBaseEndpoint = 'influence-assets'`.
 *
 * Render mode mirrors the root layout: prerender = true for a public
 * world, but prerender = false for a gated world (BUNNYTRAIL_SSR set)
 * so the images are served by a runtime function behind the `handle`
 * gate rather than becoming public CDN objects.
 */

export const prerender = !process.env.BUNNYTRAIL_SSR;

export const entries = async (): Promise<Array<{ slug: string; filename: string }>> => {
	const out: Array<{ slug: string; filename: string }> = [];
	let slugDirs: string[];
	try {
		const dirents = await readdir(INFLUENCES_DIR, { withFileTypes: true });
		slugDirs = dirents.filter((e) => e.isDirectory()).map((e) => e.name);
	} catch {
		return out;
	}

	for (const slug of slugDirs) {
		const dir = resolve(INFLUENCES_DIR, slug);
		let files;
		try {
			files = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const f of files) {
			if (!f.isFile()) continue;
			const dot = f.name.lastIndexOf('.');
			const ext = dot >= 0 ? f.name.slice(dot + 1).toLowerCase() : '';
			if (!IMAGE_EXTENSIONS.has(ext)) continue;
			out.push({ slug, filename: f.name });
		}
	}
	return out;
};

export const GET = async ({ params }: { params: { slug: string; filename: string } }) => {
	const { slug, filename } = params;

	if (slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
		error(400, 'invalid slug');
	}
	if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
		error(400, 'invalid filename');
	}

	const dot = filename.lastIndexOf('.');
	const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
	if (!IMAGE_EXTENSIONS.has(ext)) error(404, 'unsupported extension');

	const influencesRoot = resolve(INFLUENCES_DIR);
	const filePath = resolve(INFLUENCES_DIR, slug, filename);
	if (!filePath.startsWith(influencesRoot + '/')) error(400, 'escapes influences root');

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
