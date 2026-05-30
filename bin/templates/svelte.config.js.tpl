import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		prerender: {
			// Don't fail the build on broken in-site links — they'll
			// 404 at runtime like any normal site. Common cases: tag
			// chips pointing at a /tags index that doesn't exist as a
			// route, breadcrumb links to virtual parent paths, etc.
			handleHttpError: 'warn',
			handleMissingId: 'warn'
		}
	}
};

export default config;
