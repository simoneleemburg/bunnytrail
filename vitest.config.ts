import { defineConfig } from 'vitest/config';

/**
 * Vitest runs in plain Node — no SvelteKit plugin, no DOM. We only have
 * server/loader unit tests for now. If/when we add component tests, add the
 * svelte plugin here and configure a jsdom environment for those files.
 */
export default defineConfig({
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node'
	},
	resolve: {
		alias: {
			$lib: new URL('./src/lib', import.meta.url).pathname
		}
	}
});
