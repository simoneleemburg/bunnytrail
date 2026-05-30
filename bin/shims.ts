// Shared shim generator used by both `bunnytrail init` (consumer
// scaffolding) and `bunnytrail sync` (regenerating consumer shims
// after the engine adds or removes routes), and by the engine's
// own `scripts/generate-shims.mjs` for in-repo dogfooding.
//
// Every route in the engine lives in `src/lib/routes/<route>/` as
// regular Svelte/TS files. SvelteKit's filesystem router won't see
// those; the consumer (or the engine itself) needs a thin shim file
// in `src/routes/<sk-path>/+page.server.ts` etc. that re-exports
// the engine's implementation.
//
// Two modes:
//   • `engine`     — shims import from `$lib/routes/...`. Used by
//                    the engine repo itself for dogfooding.
//   • `consumer`   — shims import from `bunnytrail/routes/...` (the
//                    package exports map). Used by world repos that
//                    install bunnytrail.
//
// Consumer shims also include `export const prerender = true` on
// the root layout to satisfy adapter-vercel's filesystem-access
// constraints (the loader walks `content/` recursively, which only
// works at build time).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type ShimMode = 'engine' | 'consumer';

export interface GenerateShimsOptions {
	targetDir: string;
	mode: ShimMode;
}

interface Shim {
	file: string;
	contents: string;
}

/** Where shim files re-export load/handler/component from. */
function importBase(mode: ShimMode): string {
	return mode === 'engine' ? '$lib/routes' : 'bunnytrail/routes';
}

/** Whether to bake `export const prerender = true` into the root layout. */
function prerender(mode: ShimMode): boolean {
	return mode === 'consumer';
}

const pageServer = (mode: ShimMode, lib: string, extra = '') =>
	`export { load } from '${importBase(mode)}/${lib}/load';\n${extra}`;

const pageSvelte = (mode: ShimMode, lib: string) => `<script lang="ts">
\timport Page from '${importBase(mode)}/${lib}/Page.svelte';
\timport type { PageData } from './$types';

\tlet { data }: { data: PageData } = $props();
</script>

<Page {data} />
`;

const layoutServer = (mode: ShimMode, lib: string, name: string, extra: string) =>
	`export { load } from '${importBase(mode)}/${lib}/${name}';\n${extra}`;

const layoutSvelte = (mode: ShimMode, lib: string) => `<script lang="ts">
\timport type { Snippet } from 'svelte';
\timport Layout from '${importBase(mode)}/${lib}/Layout.svelte';
\timport type { LayoutData } from './$types';

\tlet { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<Layout {data} {children} />
`;

const server = (mode: ShimMode, lib: string, verb = 'GET') =>
	`export { ${verb} } from '${importBase(mode)}/${lib}/handler';\n`;

export function planShims(mode: ShimMode): Shim[] {
	const rootLayoutExtras = prerender(mode)
		? `\n// Prerender every page at build time. adapter-vercel's serverless\n// functions can't read arbitrary files at runtime, and bunnytrail's\n// loader walks \`content/\` recursively — so we prerender the whole\n// site instead.\nexport const prerender = true;\n`
		: '';

	const out: Shim[] = [
		// Root
		{ file: '+layout.server.ts', contents: layoutServer(mode, 'layout', 'load', rootLayoutExtras) },
		{ file: '+layout.svelte', contents: layoutSvelte(mode, 'layout') },
		{ file: '+page.server.ts', contents: pageServer(mode, 'home') },
		{ file: '+page.svelte', contents: pageSvelte(mode, 'home') },

		// [...path] catch-all
		{ file: '[...path]/+page.server.ts', contents: pageServer(mode, 'path') },
		{ file: '[...path]/+page.svelte', contents: pageSvelte(mode, 'path') },

		// API endpoints
		{ file: 'api/assets/[name]/+server.ts', contents: server(mode, 'api/assets') },
		{
			file: 'api/entity-assets/[...path]/+server.ts',
			contents: server(mode, 'api/entityAssets')
		},

		// Blog
		{
			file: 'blog/+layout.server.ts',
			contents: layoutServer(mode, 'blog', 'layoutLoad', '')
		},
		{ file: 'blog/+page.server.ts', contents: pageServer(mode, 'blog') },
		{ file: 'blog/+page.svelte', contents: pageSvelte(mode, 'blog') },
		{ file: 'blog/[slug]/+page.server.ts', contents: pageServer(mode, 'blog/slug') },
		{ file: 'blog/[slug]/+page.svelte', contents: pageSvelte(mode, 'blog/slug') },

		// Cognita legacy redirect
		{ file: 'cognita/+server.ts', contents: server(mode, 'cognita') },

		// Everything index
		{ file: 'everything/+page.server.ts', contents: pageServer(mode, 'everything') },
		{ file: 'everything/+page.svelte', contents: pageSvelte(mode, 'everything') },

		// Guides
		{ file: 'guides/[slug]/+page.server.ts', contents: pageServer(mode, 'guides/slug') },
		{ file: 'guides/[slug]/+page.svelte', contents: pageSvelte(mode, 'guides/slug') },

		// Kinds taxonomy
		{ file: 'kinds/+page.server.ts', contents: pageServer(mode, 'kinds') },
		{ file: 'kinds/+page.svelte', contents: pageSvelte(mode, 'kinds') },
		{ file: 'kinds/[kind]/+page.server.ts', contents: pageServer(mode, 'kinds/kind') },
		{ file: 'kinds/[kind]/+page.svelte', contents: pageSvelte(mode, 'kinds/kind') },

		// Sources
		{ file: 'sources/+page.server.ts', contents: pageServer(mode, 'sources') },
		{ file: 'sources/+page.svelte', contents: pageSvelte(mode, 'sources') },

		// Tags
		{ file: 'tags/[tag]/+page.server.ts', contents: pageServer(mode, 'tags/tag') },
		{ file: 'tags/[tag]/+page.svelte', contents: pageSvelte(mode, 'tags/tag') },

		// Health dashboard
		{ file: 'health/+page.server.ts', contents: pageServer(mode, 'health') },
		{ file: 'health/+page.svelte', contents: pageSvelte(mode, 'health') }
	];
	return out;
}

export async function generateShims(opts: GenerateShimsOptions): Promise<string[]> {
	const root = resolve(opts.targetDir, 'src/routes');
	const shims = planShims(opts.mode);
	const written: string[] = [];
	for (const { file, contents } of shims) {
		const full = resolve(root, file);
		await mkdir(dirname(full), { recursive: true });
		await writeFile(full, contents);
		written.push(file);
	}
	return written;
}
