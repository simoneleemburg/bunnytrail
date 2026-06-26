import { graph } from '$lib/server/graph';
import type { RequestHandler } from '@sveltejs/kit';

/**
 * GET /api/search?q=<query>
 *
 * Returns up to 3 smart search results for the UI overlay. Results are
 * entities or collections, scored and optionally collapsed to a single
 * collection when all hits belong to the same parent.
 *
 * Response: `{ results: SearchResult[] }`
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	await graph.ready();
	const results = graph.searchForUI(q.trim());
	return new Response(JSON.stringify({ results }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
