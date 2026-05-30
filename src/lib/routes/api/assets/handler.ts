import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assets } from '$lib/server/assets';
import { ASSETS_DIR } from '$lib/server/globals';
import { IMAGE_EXTENSIONS } from '$lib/server/markdown';
import { error } from '@sveltejs/kit';

/**
 * GET /api/assets/[name]
 *
 * Serves a named pre-baked asset from the ASSETS_DIR, which is
 * either the bundled `src/lib/assets/` fallback or the external
 * world assets directory when BUNNYTRAIL_WORLD_DIR is set.
 *
 * SVGs and CSS are routed through the in-memory text cache (same
 * path the cognita page uses to inline `mundus-map.svg`). Other
 * image formats are read straight from disk as binary on each
 * request — caching those in memory isn't worth it for our scale.
 *
 * Only flat filenames with an allow-listed extension are accepted
 * (`png, jpg, jpeg, gif, svg, webp, avif, css`). Anything else is
 * rejected before touching the filesystem.
 */
const BUNDLED_ASSETS_DIR = resolve(process.cwd(), 'src/lib/assets');
const TEXT_EXTENSIONS = new Set(['svg', 'css']);

export const GET = async ({ params }: { params: { name: string } }) => {
	const { name } = params;
	if (name.includes('/') || name.includes('\\') || name.includes('..')) {
		error(400, 'invalid asset name');
	}
	const dot = name.lastIndexOf('.');
	const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
	if (!IMAGE_EXTENSIONS.has(ext) && !TEXT_EXTENSIONS.has(ext)) {
		error(404, 'unsupported extension');
	}

	if (TEXT_EXTENSIONS.has(ext)) {
		let content: string | null;
		try {
			content = await assets.get(name);
		} catch (err) {
			error(400, err instanceof Error ? err.message : 'bad asset name');
		}
		if (content === null) error(404, `asset not found: ${name}`);
		return new Response(content, {
			headers: {
				'Content-Type': textContentTypeFor(ext),
				'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=3600' : 'no-store'
			}
		});
	}

	// Binary image: try the configured assets dir first, then the
	// bundled fallback. No in-memory caching.
	const bytes =
		(await tryReadBinary(resolve(ASSETS_DIR, name))) ??
		(ASSETS_DIR !== BUNDLED_ASSETS_DIR
			? await tryReadBinary(resolve(BUNDLED_ASSETS_DIR, name))
			: null);
	if (bytes === null) error(404, `asset not found: ${name}`);

	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': contentTypeFor(ext),
			'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=3600' : 'no-store'
		}
	});
};

async function tryReadBinary(path: string): Promise<Buffer | null> {
	try {
		const st = await stat(path);
		if (!st.isFile()) return null;
		return await readFile(path);
	} catch {
		return null;
	}
}

function contentTypeFor(ext: string): string {
	switch (ext) {
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

function textContentTypeFor(ext: string): string {
	switch (ext) {
		case 'svg':
			return 'image/svg+xml';
		case 'css':
			return 'text/css; charset=utf-8';
		default:
			return 'text/plain; charset=utf-8';
	}
}
