import type { RequestEvent } from '@sveltejs/kit';
import { isGateEnabled, verifySecret, sessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '$lib/server/auth';

/**
 * POST /api/auth/login
 *
 * Accepts a FormData body with a single field `secret`.
 * Returns JSON `{ ok: true }` on success (with session cookie set)
 * or `{ ok: false }` on failure — so the client can handle feedback
 * without a page redirect/reload.
 */
export async function POST(event: RequestEvent): Promise<Response> {
	if (!isGateEnabled()) {
		return new Response(JSON.stringify({ ok: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const formData = await event.request.formData();
	const input = String(formData.get('secret') ?? '');

	if (!verifySecret(input)) {
		return new Response(JSON.stringify({ ok: false }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	event.cookies.set(SESSION_COOKIE, sessionToken(), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		maxAge: SESSION_MAX_AGE
	});

	return new Response(JSON.stringify({ ok: true }), {
		headers: { 'Content-Type': 'application/json' }
	});
}
