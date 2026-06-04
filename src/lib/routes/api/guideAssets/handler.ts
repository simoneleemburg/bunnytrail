import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { error } from '@sveltejs/kit';
import { GUIDES_DIR } from '$lib/server/globals';
import { IMAGE_EXTENSIONS } from '$lib/server/markdown';

/**
 * GET /api/guide-assets/[slug]/[filename]
 *
 * Serves an image or SVG file that lives alongside a guide's
 * `index.md` in `content_meta/guides/<slug>/`. This mirrors
 * `/api/entity-assets/` for entity sibling files, but targets the
 * guides directory instead of the content tree.
 *
 * Authors write `![alt](map.svg)` (bare filename) in a guide body;
 * the markdown renderer rewrites it to this endpoint when the guide's
 * slug is passed as `imageBaseDir`.
 *
 * Security:
 *   • The slug must be a well-formed guide slug (kebab-case, no
 *     traversal characters). Only slugs that correspond to real
 *     directories under GUIDES_DIR are accepted.
 *   • The filename must be a flat name (no slashes), contain no
 *     `..`, and carry an allow-listed image extension.
 *
 * Prerendering: `prerender = true` + `entries()` so every guide
 * sibling image gets baked into the static output at build time.
 */

export const prerender = true;

export const entries = async (): Promise<Array<{ slug: string; filename: string }>> => {
	const out: Array<{ slug: string; filename: string }> = [];
	let slugDirs: string[];
	try {
		const dirents = await readdir(GUIDES_DIR, { withFileTypes: true });
		slugDirs = dirents.filter((e) => e.isDirectory()).map((e) => e.name);
	} catch {
		return out;
	}

	for (const slug of slugDirs) {
		const dir = resolve(GUIDES_DIR, slug);
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

	// Basic validation — no traversal characters.
	if (slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
		error(400, 'invalid slug');
	}
	if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
		error(400, 'invalid filename');
	}

	const dot = filename.lastIndexOf('.');
	const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
	if (!IMAGE_EXTENSIONS.has(ext)) error(404, 'unsupported extension');

	// Resolve and clamp to GUIDES_DIR.
	const guidesRoot = resolve(GUIDES_DIR);
	const filePath = resolve(GUIDES_DIR, slug, filename);
	if (!filePath.startsWith(guidesRoot + '/')) error(400, 'escapes guides root');

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
