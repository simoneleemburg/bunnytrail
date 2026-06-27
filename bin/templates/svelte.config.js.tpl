import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Pin the Vercel runtime — the default tracks the local
		// Node version, which fails when you build with a newer
		// Node than Vercel offers (currently up to 22.x).
		adapter: adapter({ runtime: 'nodejs22.x' }),
		// Use absolute asset paths so /_app/immutable/... URLs resolve
		// correctly from non-root pages like /login (relative ./_app/...
		// would resolve to /login/_app/... and get 303'd by the auth gate).
		paths: { relative: false },
		prerender: {
			// Don't fail the build on broken in-site links — they'll
			// 404 at runtime like any normal site. Common cases: tag
			// chips pointing at a /tags index that doesn't exist as a
			// route, breadcrumb links to virtual parent paths, etc.
			handleHttpError: 'warn',
			handleMissingId: 'warn',
			// Some prerenderable endpoints (e.g. /api/entity-assets)
			// enumerate their entries from the world graph and may
			// legitimately be empty for a given world. Don't fail
			// the build when that happens.
			handleUnseenRoutes: 'warn'
		}
	}
};

export default config;
