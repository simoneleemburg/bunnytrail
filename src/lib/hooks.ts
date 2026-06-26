// Engine boot module. Imported for its side effects from a consumer
// world repo's `src/hooks.server.ts` (or from the engine's own
// `src/hooks.server.ts` during dogfooding):
//
//     import 'bunnytrail/hooks';
//     export { init } from 'bunnytrail/hooks';
//
// SvelteKit calls `init` before serving the first request, so it is
// safe to rely on the graph being ready by the time any load function
// runs.
import { BLOG_DIR, CONTENT_DIR, GUIDES_DIR, KINDS_DIR, SOURCES_DIR } from './server/globals';
import { graph } from './server/graph';
import { world } from './server/world';
import { startWatcher } from './server/watcher';

console.log(
	`[bunnytrail] booting with: ${CONTENT_DIR}, ${KINDS_DIR}, ${BLOG_DIR}, ${GUIDES_DIR}, and ${SOURCES_DIR}`
);

export const init = async () => {
	await graph.load();
	await world.load();
	startWatcher();
};
