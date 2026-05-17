import { graph } from '$lib/server/graph';
import { startWatcher } from '$lib/server/watcher';

// Boot: load the graph once, then start watching the content/ directory in dev.
// Top-level await is fine here — SvelteKit awaits this module before serving.
await graph.load();
startWatcher();
