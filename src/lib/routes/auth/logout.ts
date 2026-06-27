import type { RequestEvent } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/auth';

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie. The client handles navigation back to /.
 * Returns JSON so the fetch caller knows it succeeded.
 */
export async function POST(event: RequestEvent): Promise<Response> {
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	return new Response(JSON.stringify({ ok: true }), {
		headers: { 'Content-Type': 'application/json' }
	});
}
