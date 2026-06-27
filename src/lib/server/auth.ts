import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Passphrase gate for bunnytrail worlds.
 *
 * Set `BUNNYTRAIL_WORLD_SECRET` in the environment to enable the gate.
 * When unset the gate is entirely disabled and the site is public.
 *
 * Session cookie: `bt_session`
 *   Value = SHA-256 hex of the secret. Changing the secret
 *   automatically invalidates all existing sessions.
 *   HttpOnly, SameSite=Lax, Secure in production, 7-day max-age.
 */

export const SESSION_COOKIE = 'bt_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 1 week in seconds

/** True when the passphrase gate is active. */
export function isGateEnabled(): boolean {
	return Boolean(process.env.BUNNYTRAIL_WORLD_SECRET?.trim());
}

/** Expected cookie value: SHA-256 hex of the raw secret. */
function expectedToken(): string {
	const secret = (process.env.BUNNYTRAIL_WORLD_SECRET ?? '').trim();
	return createHash('sha256').update(secret).digest('hex');
}

/**
 * Returns true if the provided cookie value is the valid session token.
 * Uses a length-constant comparison to avoid timing attacks.
 */
export function isValidSession(cookieValue: string | undefined): boolean {
	if (!cookieValue) return false;
	const expected = expectedToken();
	// Both must be the same byte length (hex strings of same hash are always equal length).
	const a = Buffer.from(cookieValue.padEnd(expected.length, '\0'));
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/**
 * Returns true if the submitted passphrase matches the secret.
 * Uses a timing-safe comparison.
 */
export function verifySecret(input: string): boolean {
	const secret = (process.env.BUNNYTRAIL_WORLD_SECRET ?? '').trim();
	if (!secret) return false;
	const a = Buffer.from(input.padEnd(secret.length, '\0'));
	const b = Buffer.from(secret.padEnd(input.length, '\0'));
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/** The token to store in the session cookie on successful auth. */
export function sessionToken(): string {
	return expectedToken();
}

/**
 * Sanitize a post-login redirect target (`?from=…`) to a safe,
 * same-origin internal path. Guards against open-redirect: an
 * attacker who controls the `from` value must not be able to bounce
 * a freshly-authenticated user to an external site or back to the
 * gate.
 *
 * Returns a path that always:
 *   - starts with a single `/` (relative to this origin),
 *   - is not protocol-relative (`//evil.com`) or a full URL,
 *   - is not the login page or an auth endpoint (would loop),
 * Falls back to `/` when the input is missing or fails any check.
 */
export function safeRedirectTarget(from: string | null | undefined): string {
	if (!from) return '/';

	// Must be an absolute path on this origin. Reject full URLs
	// (`http://…`, `https://…`, `javascript:…`) and protocol-relative
	// (`//host`) targets outright.
	if (!from.startsWith('/') || from.startsWith('//')) return '/';
	// Backslashes can be normalized to `/` by some browsers — treat a
	// leading `/\` as protocol-relative too.
	if (from.startsWith('/\\')) return '/';

	// Don't bounce back to the gate or auth endpoints — that loops.
	if (from === '/login' || from.startsWith('/login?') || from.startsWith('/api/auth/')) {
		return '/';
	}

	return from;
}

