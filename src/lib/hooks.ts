// Engine boot module. Imported for its side effects from a consumer
// world repo's `src/hooks.server.ts` (or from the engine's own
// `src/hooks.server.ts` during dogfooding):
//
//     import 'bunnytrail/hooks';
//     export { init } from 'bunnytrail/hooks';
//
// Loading is kicked off eagerly at module import time so it runs in
// parallel with the rest of server startup. SvelteKit's `init` hook
// then just awaits the already-in-flight promise — meaning the graph
// is ready (or nearly so) by the time the first request arrives,
// rather than making the first request pay the full load cost.
import { BLOG_DIR, CONTENT_DIR, GUIDES_DIR, KINDS_DIR, SOURCES_DIR } from './server/globals';
import { graph } from './server/graph';
import { world } from './server/world';
import { startWatcher } from './server/watcher';

console.log(
	`[bunnytrail] booting with: ${CONTENT_DIR}, ${KINDS_DIR}, ${BLOG_DIR}, ${GUIDES_DIR}, and ${SOURCES_DIR}`
);

// Kick off loading immediately — don't wait for SvelteKit to call init().
const bootPromise = graph.load().then(() => world.load()).then(() => {
	console.log('[bunnytrail] graph ready');
});

export const init = async () => {
	await bootPromise;
	startWatcher();
};
