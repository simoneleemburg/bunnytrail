import { assets } from '$lib/server/assets';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/assets/[name]
 *
 * Serves a named pre-baked asset (e.g. mundus-map.svg) from the
 * ASSETS_DIR, which is either the bundled src/lib/assets/ fallback
 * or the external alteria_world assets directory when ALTERIA_WORLD_DIR
 * is configured.
 *
 * Intentionally narrow: only flat filenames are accepted (no slashes).
 * The AssetCache validates this in `readAsset`.
 */
export const GET: RequestHandler = async ({ params }) => {
	const { name } = params;

	let content: string | null;
	try {
		content = await assets.get(name);
	} catch (err) {
		// readAsset throws on path-traversal attempts.
		error(400, err instanceof Error ? err.message : 'bad asset name');
	}

	if (content === null) {
		error(404, `asset not found: ${name}`);
	}

	const contentType = name.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';

	return new Response(content, {
		headers: {
			'Content-Type': contentType,
			// Cache for 1 hour in production; no-store in dev so the watcher-invalidated
			// version is always fetched fresh.
			'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=3600' : 'no-store'
		}
	});
};
