import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { isGateEnabled, verifySecret, sessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '$lib/server/auth';

/**
 * POST /api/auth/login
 *
 * Accepts a `application/x-www-form-urlencoded` body with a single
 * field `secret`. On success, sets the session cookie and redirects
 * to `/`. On failure, redirects back to `/?gate_error=1`.
 */
export async function POST(event: RequestEvent): Promise<Response> {
	if (!isGateEnabled()) {
		redirect(303, '/');
	}

	const formData = await event.request.formData();
	const input = String(formData.get('secret') ?? '');

	if (!verifySecret(input)) {
		redirect(303, '/?gate_error=1');
	}

	event.cookies.set(SESSION_COOKIE, sessionToken(), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		maxAge: SESSION_MAX_AGE
	});

	redirect(303, '/');
}
