import { BLOG_DIR } from '$lib/server/blog';
import { graph } from '$lib/server/graph';
import { KINDS_DIR } from '$lib/server/kinds';
import { CONTENT_DIR } from '$lib/server/loader';
import { SOURCES_DIR } from '$lib/server/sources';
import { startWatcher } from '$lib/server/watcher';
import 'dotenv/config';

console.log(`[alteria] booting with: ${CONTENT_DIR}, ${KINDS_DIR}, ${BLOG_DIR}, and ${SOURCES_DIR}`);
// Boot: load the graph once, then start watching the content/ directory in dev.
// Top-level await is fine here — SvelteKit awaits this module before serving.
await graph.load();
startWatcher();
