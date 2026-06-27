// Engine boot module. Imported for its side effects from a consumer
// world repo's `src/hooks.server.ts` (or from the engine's own
// `src/hooks.server.ts` during dogfooding):
//
//     import 'bunnytrail/hooks';
//     export { init, handle } from 'bunnytrail/hooks';
//
// Loading is kicked off eagerly at module import time so it runs in
// parallel with the rest of server startup. SvelteKit's `init` hook
// then just awaits the already-in-flight promise — meaning the graph
// is ready (or nearly so) by the time the first request arrives,
// rather than making the first request pay the full load cost.
import { BLOG_DIR, CONTENT_DIR, GUIDES_DIR, KINDS_DIR, SOURCES_DIR } from './server/globals';
import { graph } from './server/graph';
import { world } from './server/world';
import { blog } from './server/blog';
import { guides } from './server/guides';
import { sources } from './server/sources';
import { influences } from './server/influences';
import { startWatcher } from './server/watcher';
import { isGateEnabled, isValidSession, SESSION_COOKIE } from './server/auth';
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

console.log(
	`[bunnytrail] booting with: ${CONTENT_DIR}, ${KINDS_DIR}, ${BLOG_DIR}, ${GUIDES_DIR}, and ${SOURCES_DIR}`
);

// Kick off loading immediately — don't wait for SvelteKit to call init().
// graph must complete before world (world reads eraConfig from the graph),
// then blog/guides/sources/influences can all boot in parallel.
const bootPromise = graph.load()
	.then(() => Promise.all([
		world.load(),
		blog.load(),
		guides.load(),
		sources.load(),
		influences.load(),
	]))
	.then(() => {
		console.log('[bunnytrail] graph ready');
	});

export const init = async () => {
	await bootPromise;
	startWatcher();
};

/**
 * SvelteKit `handle` hook. When `BUNNYTRAIL_WORLD_SECRET` is set,
 * every request is checked for a valid session cookie. Requests
 * without a valid session are redirected to /login.
 *
 * Always passes through:
 *   - /login — the gate UI itself.
 *   - /api/auth/login — handles form POST.
 *   - /api/auth/check — session check endpoint.
 *   - /api/assets/… — needed to style the gate page.
 */
export const handle: Handle = async ({ event, resolve }) => {
	if (!isGateEnabled()) return resolve(event);

	const pathname = event.url.pathname;

	// Always pass through the home page, login page, and its dependencies.
	// The home page (/) is prerendered and public — it carries no gated
	// content (BUNNYTRAIL_WORLD_SECRET is unavailable at build time, so it
	// renders with gateEnabled=false). Gating it here would loop with the
	// post-login redirect to /. Real content pages stay gated below.
	const isPassthrough =
		pathname === '/' ||
		pathname === '/login' ||
		pathname === '/api/auth/login' ||
		pathname === '/api/auth/check' ||
		pathname.startsWith('/api/assets/');

	if (isPassthrough) return resolve(event);

	// Check session cookie.
	const cookie = event.cookies.get(SESSION_COOKIE);
	if (isValidSession(cookie)) return resolve(event);

	// Not authenticated — redirect to login page.
	redirect(303, '/login');
};
