
import { BLOG_DIR, CONTENT_DIR, KINDS_DIR, SOURCES_DIR } from '$lib/server/globals';
import { graph } from '$lib/server/graph';
import { startWatcher } from '$lib/server/watcher';

console.log(`[alteria] booting with: ${CONTENT_DIR}, ${KINDS_DIR}, ${BLOG_DIR}, and ${SOURCES_DIR}`);
// Boot: load the graph once, then start watching the content/ directory in dev.
// Top-level await is fine here — SvelteKit awaits this module before serving.
await graph.load();
startWatcher();
