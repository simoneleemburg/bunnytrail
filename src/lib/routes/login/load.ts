import { redirect } from '@sveltejs/kit';
import { world } from '$lib/server/world';
import { assets } from '$lib/server/assets';
import { isGateEnabled, isValidSession, SESSION_COOKIE } from '$lib/server/auth';
import { WORLD_CONFIG_PATH } from '$lib/server/globals';
import { existsSync } from 'node:fs';
import type { RequestEvent } from '@sveltejs/kit';

// /login must never be prerendered — it reads cookies to check the
// session and redirects, which requires a live server request.
export const prerender = false;

/**
 * GET /login
 *
 * Public gate page. Redirects to / if already authenticated.
 * When BUNNYTRAIL_WORLD_SECRET is unset the gate is disabled
 * and this page redirects straight to / too.
 */
export async function load(event: RequestEvent) {
	console.log('[bunnytrail/login] cwd:', process.cwd(), 'world config path:', WORLD_CONFIG_PATH);
	await world.ready();

	// If gate is disabled or session is already valid → go home.
	if (!isGateEnabled() || isValidSession(event.cookies.get(SESSION_COOKIE))) {
		redirect(302, '/');
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
		_debug_cwd: process.cwd(),
		_debug_worldConfigPath: WORLD_CONFIG_PATH,
		_debug_worldMdExists: existsSync(WORLD_CONFIG_PATH)
	};
}

export type LoginData = Awaited<ReturnType<typeof load>>;
