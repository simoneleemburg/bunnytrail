/**
 * Vercel Edge Middleware — passphrase gate enforcement.
 *
 * Re-export this as your project's `middleware.ts` default export:
 *
 *     export { default, config } from 'bunnytrail/middleware';
 *
 * Runs at the CDN edge before any prerendered static file or SSR
 * response is served. Checks the bt_session cookie against the
 * SHA-256 hash of BUNNYTRAIL_WORLD_SECRET. Unauthenticated requests
 * are redirected to / where the gate UI lives.
 *
 * When BUNNYTRAIL_WORLD_SECRET is unset the middleware is a no-op,
 * so ungated worlds incur no overhead.
 */

import { next } from '@vercel/functions';

const SESSION_COOKIE = 'bt_session';

/** SHA-256 hex of a string using the Web Crypto API (edge-compatible). */
async function sha256Hex(input: string): Promise<string> {
	const encoded = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest('SHA-256', encoded);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/** Parse a cookie header string into a name→value map. */
function parseCookies(header: string | null): Record<string, string> {
	if (!header) return {};
	return Object.fromEntries(
		header.split(';').map((c) => {
			const [k, ...rest] = c.trim().split('=');
			return [k.trim(), decodeURIComponent(rest.join('='))];
		})
	);
}

export default async function middleware(request: Request): Promise<Response> {
	const secret = (process.env.BUNNYTRAIL_WORLD_SECRET ?? '').trim();

	// Gate disabled — pass through.
	if (!secret) return next();

	const { pathname } = new URL(request.url);

	// Always pass through the login page and auth endpoints.
	if (
		pathname === '/login' ||
		pathname === '/api/auth/login' ||
		pathname === '/api/auth/logout' ||
		pathname === '/api/auth/check' ||
		pathname.startsWith('/api/assets/')
	) {
		return next();
	}

	// Validate session cookie.
	const cookies = parseCookies(request.headers.get('cookie'));
	const cookie = cookies[SESSION_COOKIE];
	if (cookie) {
		const expected = await sha256Hex(secret);
		if (cookie === expected) return next();
	}

	// Not authenticated — redirect to gate.
	return new Response(null, { status: 303, headers: { Location: '/' } });
}

// Exclude SvelteKit and Vercel internals from middleware — those
// never need auth and running on them adds latency for no benefit.
export const config = {
	matcher: ['/((?!_app/|_vercel/|favicon\\.ico).*)']
};
