import type { RequestEvent } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/auth';

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie and redirects to the home page (gate).
 */
export async function POST(event: RequestEvent): Promise<Response> {
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	return new Response(null, {
		status: 303,
		headers: { Location: '/' }
	});
}
