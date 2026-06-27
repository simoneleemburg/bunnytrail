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

import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

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

/** Whether to bake a prerender export into the root layout. */
function prerender(mode: ShimMode): boolean {
	return mode === 'consumer';
}

// Kit infers PageData/LayoutData by inspecting the load file's
// return type, but only when `load` is re-exported by name —
// `export *` defeats the inference and PageData collapses to `{}`.
// So we keep explicit named re-exports, and let routes opt in to
// extra named exports (currently just `entries` for prerender
// enumeration) via the `extraExports` option.

interface RouteShimOpts {
	extraExports?: string[];
}

const pageServer = (mode: ShimMode, lib: string, opts: RouteShimOpts = {}, extra = '') => {
	const names = ['load', ...(opts.extraExports ?? [])];
	return `export { ${names.join(', ')} } from '${importBase(mode)}/${lib}/load';\n${extra}`;
};

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

const server = (mode: ShimMode, lib: string, opts: RouteShimOpts = {}, verb = 'GET') => {
	const names = [verb, ...(opts.extraExports ?? [])];
	return `export { ${names.join(', ')} } from '${importBase(mode)}/${lib}/handler';\n`;
};

export function planShims(mode: ShimMode): Shim[] {
	const rootLayoutExtras = prerender(mode)
		? `\n// Prerender every page at build time. adapter-vercel's serverless\n// functions can't read arbitrary files at runtime, and bunnytrail's\n// loader walks \`content/\` recursively — so we prerender the whole\n// site instead.\n// Set BUNNYTRAIL_NEVER_PRERENDER=1 at build time to disable this\n// (e.g. for a local SSR server where content is read at request time).\nexport const prerender = !process.env.BUNNYTRAIL_NEVER_PRERENDER;\n`
		: '';

	const homePageExtras = '';

	const out: Shim[] = [
		// Root
		{ file: '+layout.server.ts', contents: layoutServer(mode, 'layout', 'load', rootLayoutExtras) },
		{ file: '+layout.svelte', contents: layoutSvelte(mode, 'layout') },
		{ file: '+page.server.ts', contents: pageServer(mode, 'home', {}, homePageExtras) },
		{ file: '+page.svelte', contents: pageSvelte(mode, 'home') },

		// [...path] catch-all
		{ file: '[...path]/+page.server.ts', contents: pageServer(mode, 'path', { extraExports: ['entries'] }) },
		{ file: '[...path]/+page.svelte', contents: pageSvelte(mode, 'path') },

		// API endpoints
		{
			file: 'api/assets/[name]/+server.ts',
			contents: server(mode, 'api/assets', { extraExports: ['prerender', 'entries'] })
		},
		{
			file: 'api/entity-assets/[...path]/+server.ts',
			contents: server(mode, 'api/entityAssets', { extraExports: ['prerender', 'entries'] })
		},
		{
			file: 'api/guide-assets/[slug]/[filename]/+server.ts',
			contents: server(mode, 'api/guideAssets', { extraExports: ['prerender', 'entries'] })
		},
		{
			file: 'api/influence-assets/[slug]/[filename]/+server.ts',
			contents: server(mode, 'api/influenceAssets', { extraExports: ['prerender', 'entries'] })
		},
		{
			file: 'api/search/+server.ts',
			contents: server(mode, 'api/search')
		},
		{
			file: 'api/auth/login/+server.ts',
			contents: server(mode, 'auth', {}, 'POST')
		},
		{
			file: 'api/auth/logout/+server.ts',
			contents: `export { POST } from '${importBase(mode)}/auth/logout';\n`
		},
		{
			file: 'api/auth/check/+server.ts',
			contents: `export { GET } from '${importBase(mode)}/api/authCheck/handler';\n`
		},
		// Blog
		{
			file: 'blog/+layout.server.ts',
			contents: layoutServer(mode, 'blog', 'layoutLoad', '')
		},
		{ file: 'blog/+page.server.ts', contents: pageServer(mode, 'blog') },
		{ file: 'blog/+page.svelte', contents: pageSvelte(mode, 'blog') },
		{
			file: 'blog/[slug]/+page.server.ts',
			contents: pageServer(mode, 'blog/slug', { extraExports: ['entries'] })
		},
		{ file: 'blog/[slug]/+page.svelte', contents: pageSvelte(mode, 'blog/slug') },

		// Guides
		{ file: 'guides/+page.server.ts', contents: pageServer(mode, 'guides') },
		{ file: 'guides/+page.svelte', contents: pageSvelte(mode, 'guides') },
		{ file: 'guides/[slug]/+page.server.ts', contents: pageServer(mode, 'guides/slug') },
		{ file: 'guides/[slug]/+page.svelte', contents: pageSvelte(mode, 'guides/slug') },

		// Influences
		{ file: 'influences/+page.server.ts', contents: pageServer(mode, 'influences') },
		{ file: 'influences/+page.svelte', contents: pageSvelte(mode, 'influences') },
		{ file: 'influences/[slug]/+page.server.ts', contents: pageServer(mode, 'influences/slug') },
		{ file: 'influences/[slug]/+page.svelte', contents: pageSvelte(mode, 'influences/slug') },

		// Kinds taxonomy
		{ file: 'kinds/+page.server.ts', contents: pageServer(mode, 'kinds') },
		{ file: 'kinds/+page.svelte', contents: pageSvelte(mode, 'kinds') },
		{ file: 'kinds/[kind]/+page.server.ts', contents: pageServer(mode, 'kinds/kind') },
		{ file: 'kinds/[kind]/+page.svelte', contents: pageSvelte(mode, 'kinds/kind') },

		// Relations schema
		{ file: 'relations/+page.server.ts', contents: pageServer(mode, 'relations') },
		{ file: 'relations/+page.svelte', contents: pageSvelte(mode, 'relations') },
		{ file: 'relations/[...kind]/+page.server.ts', contents: pageServer(mode, 'relations/relation') },
		{ file: 'relations/[...kind]/+page.svelte', contents: pageSvelte(mode, 'relations/relation') },

		// Properties schema
		{ file: 'properties/+page.server.ts', contents: pageServer(mode, 'properties') },
		{ file: 'properties/+page.svelte', contents: pageSvelte(mode, 'properties') },
		{ file: 'properties/[kind]/+page.server.ts', contents: pageServer(mode, 'properties/kind') },
		{ file: 'properties/[kind]/+page.svelte', contents: pageSvelte(mode, 'properties/kind') },

		// Sources
		{ file: 'sources/+page.server.ts', contents: pageServer(mode, 'sources') },
		{ file: 'sources/+page.svelte', contents: pageSvelte(mode, 'sources') },

		// Tags
		{ file: 'tags/[tag]/+page.server.ts', contents: pageServer(mode, 'tags/tag') },
		{ file: 'tags/[tag]/+page.svelte', contents: pageSvelte(mode, 'tags/tag') },

		// Symbology index
		{ file: 'symbology/+page.server.ts', contents: pageServer(mode, 'symbology') },
		{ file: 'symbology/+page.svelte', contents: pageSvelte(mode, 'symbology') },

		// Health dashboard
		{ file: 'health/+page.server.ts', contents: pageServer(mode, 'health') },
		{ file: 'health/+page.svelte', contents: pageSvelte(mode, 'health') },

		// Graph — entity relationship visualisation
		{ file: 'graph/+page.server.ts', contents: pageServer(mode, 'graph') },
		{ file: 'graph/+page.svelte', contents: pageSvelte(mode, 'graph') }
	];
	return out;
}

export async function generateShims(opts: GenerateShimsOptions): Promise<string[]> {
	const root = resolve(opts.targetDir, 'src/routes');
	const shims = planShims(opts.mode);
	const plannedSet = new Set(shims.map((s) => s.file.split(/[\\/]/).join('/')));
	const written: string[] = [];
	for (const { file, contents } of shims) {
		const full = resolve(root, file);
		await mkdir(dirname(full), { recursive: true });
		await writeFile(full, contents);
		written.push(file);
	}
	await reconcile(root, plannedSet);

	// Consumer-only root-level files (live at project root, not src/routes/).
	if (opts.mode === 'consumer') {
		const rootFiles: Shim[] = [
			{
				file: 'middleware.ts',
				contents: `export { default, config } from 'bunnytrail/middleware';\n`
			}
		];
		for (const { file, contents } of rootFiles) {
			const full = resolve(opts.targetDir, file);
			await writeFile(full, contents);
			written.push(file);
		}
	}

	return written;
}

/**
 * Delete any stale shim file under `src/routes/` that isn't in the
 * current plan, then prune the empty directories that result. Only
 * touches SvelteKit shim filenames (`+layout.*`, `+page.*`,
 * `+server.ts`) so unrelated hand-authored files (eg. README.md,
 * static assets a user may have parked there) are left alone.
 */
async function reconcile(root: string, planned: Set<string>): Promise<void> {
	const isShim = (name: string) =>
		name === '+server.ts' ||
		/^\+layout\.(server\.ts|svelte)$/.test(name) ||
		/^\+page\.(server\.ts|svelte)$/.test(name);

	async function walk(dir: string): Promise<void> {
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			const full = resolve(dir, e.name);
			if (e.isDirectory()) {
				await walk(full);
				// Prune empty dirs (don't touch the root itself).
				if (full !== root) {
					const remaining = await readdir(full);
					if (remaining.length === 0) await rm(full, { recursive: true });
				}
			} else if (e.isFile() && isShim(e.name)) {
				const rel = relative(root, full).split(sep).join('/');
				if (!planned.has(rel)) await rm(full);
			}
		}
	}

	try {
		await stat(root);
	} catch {
		return;
	}
	await walk(root);
}
