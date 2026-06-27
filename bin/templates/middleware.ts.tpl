// bundle-rev: 1 — bump this to force Vercel to rebundle the edge function
// when only the engine's middleware logic (in node_modules) changes.
export { default } from 'bunnytrail/middleware';

// Vercel's static analysis for the middleware matcher runs on this file
// before bundling — it cannot follow re-exports into node_modules to find
// the config. The matcher must be a static literal here or Vercel ignores
// it and runs middleware on every route, including /_app/immutable/ assets,
// causing 303 redirects for JS/CSS module scripts.
export const config = {
	matcher: ['/((?!_app/|_vercel/|favicon\\.ico).*)']
};
