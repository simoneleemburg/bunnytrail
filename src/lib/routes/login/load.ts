import { redirect } from '@sveltejs/kit';
import { world } from '$lib/server/world';
import { assets } from '$lib/server/assets';
import { isGateEnabled, isValidSession, safeRedirectTarget, SESSION_COOKIE } from '$lib/server/auth';
import type { RequestEvent } from '@sveltejs/kit';

// /login must never be prerendered — it reads cookies to check the
// session and redirects, which requires a live server request.
export const prerender = false;

/**
 * GET /login
 *
 * Public gate page. Redirects to the `from` target (or /) if already
 * authenticated. When BUNNYTRAIL_WORLD_SECRET is unset the gate is
 * disabled and this page redirects straight through too.
 */
export async function load(event: RequestEvent) {
	await world.ready();

	// Sanitize the post-login target up front so both the
	// already-authed redirect and the page payload use the same value.
	const from = safeRedirectTarget(event.url.searchParams.get('from'));

	// If gate is disabled or session is already valid → go to target.
	if (!isGateEnabled() || isValidSession(event.cookies.get(SESSION_COOKIE))) {
		redirect(302, from);
	}

	const worldConfig = world.config();
	const crest = await assets.get('crest.svg');
	const ornamentSvg = worldConfig.ornament.svg ? await assets.get(worldConfig.ornament.svg) : null;

	const ornamentGlyphStyle = worldConfig.ornament.glyph
		? `:root { --ornament-glyph: ${JSON.stringify(worldConfig.ornament.glyph)}; }`
		: null;

	const worldMarkStyle = worldConfig.ornament.worldMark
		? `:root { --wordmark-mark: ${JSON.stringify(worldConfig.ornament.worldMark)}; } .wordmark-mark { display: inline; }`
		: null;

	return {
		world: worldConfig,
		crest,
		ornament: {
			glyph: worldConfig.ornament.glyph,
			svg: ornamentSvg
		},
		ornamentGlyphStyle,
		worldMarkStyle,
		gatePrompt: worldConfig.gatePrompt,
		secretLength: (process.env.BUNNYTRAIL_WORLD_SECRET ?? '').trim().length,
		from
	};
}

export type LoginData = Awaited<ReturnType<typeof load>>;
