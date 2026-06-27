// Engine boot module. The `init` export is awaited by SvelteKit before
// the first request is served, ensuring the graph and world singletons
// are fully loaded. The `handle` hook enforces the passphrase gate when
// BUNNYTRAIL_WORLD_SECRET is set.
export { init, handle } from 'bunnytrail/hooks';
