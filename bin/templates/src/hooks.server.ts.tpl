// All the engine boots in here. Side-effect import: loads the graph
// once and starts the file watcher in dev. SvelteKit awaits this
// module before serving requests, so it's safe to rely on the graph
// being ready by the time any load function runs.
import 'bunnytrail/hooks';
