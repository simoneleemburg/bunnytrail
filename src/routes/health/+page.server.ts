// Shim: route logic lives in the engine's $lib so consumers can
// re-export it the same way the engine does. See `bin/scaffold.ts`.
export { load } from '$lib/routes/health/load';
