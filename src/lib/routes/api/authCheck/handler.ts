import type { RequestEvent } from '@sveltejs/kit';
import { isGateEnabled, isValidSession, SESSION_COOKIE } from '$lib/server/auth';

/**
 * GET /api/auth/check
 *
 * Lightweight session check. Returns { authed: true } when the
 * session cookie is valid (or the gate is disabled), { authed: false }
 * otherwise. Used by the home page after a prerendered load to
 * determine whether to show the gate or the world content without
 * needing to SSR the full page.
 */
export async function GET(event: RequestEvent): Promise<Response> {
	const authed = !isGateEnabled() || isValidSession(event.cookies.get(SESSION_COOKIE));
	return new Response(JSON.stringify({ authed }), {
		headers: { 'Content-Type': 'application/json' }
	});
}
