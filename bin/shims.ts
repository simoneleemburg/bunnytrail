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
// Consumer shims also bake a conditional `prerender` export onto the
// root layout: prerender by default, SSR when BUNNYTRAIL_SSR is set at
// build time (so the `handle` hook can enforce auth on every request).
// BUNNYTRAIL_SSR is a build-visible flag, distinct from the sensitive
// runtime-only BUNNYTRAIL_WORLD_SECRET — see the layout shim comment.

import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
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
		? `\n// Render mode is chosen at BUILD time by BUNNYTRAIL_SSR:\n//\n//   • unset/empty → prerender the whole site to static HTML. Safe for\n//     ungated worlds (no per-request auth) and required by the iPad\n//     adapter-node build. adapter-vercel serves the static output from\n//     the CDN; the loader walks \`content/\` at build time.\n//   • set (truthy) → SSR. Every request runs through the \`handle\` hook\n//     (in bunnytrail/hooks), which enforces the passphrase gate.\n//     Prerendered pages bypass \`handle\` entirely, so a gated world MUST\n//     build with BUNNYTRAIL_SSR=1 or deep links won't be protected.\n//\n// This is intentionally a SEPARATE flag from BUNNYTRAIL_WORLD_SECRET:\n// the secret is sensitive (encrypted) and therefore runtime-only —\n// Vercel does not expose it to the build step, so it can't drive a\n// build-time prerender decision. BUNNYTRAIL_SSR is a plain,\n// non-sensitive build flag. Set BUNNYTRAIL_SSR=1 wherever\n// BUNNYTRAIL_WORLD_SECRET is set, in the build environment.\nexport const prerender = !process.env.BUNNYTRAIL_SSR;\n`
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
		{ file: 'graph/+page.svelte', contents: pageSvelte(mode, 'graph') },

		// Login gate
		{ file: 'login/+page.server.ts', contents: pageServer(mode, 'login', { extraExports: ['prerender'] }) },
		{ file: 'login/+page.svelte', contents: pageSvelte(mode, 'login') }
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

	// Migration cleanup: earlier engine versions generated a root-level
	// `middleware.ts` re-exporting `bunnytrail/middleware` (an edge gate).
	// The gate now lives entirely in the SSR `handle` hook, so a stale
	// shim would import a deleted export and break the consumer build.
	// Remove it on sync — but only if it's the generated shim, never a
	// hand-authored middleware the world may have added themselves.
	if (opts.mode === 'consumer') {
		const staleMiddleware = resolve(opts.targetDir, 'middleware.ts');
		try {
			const contents = await readFile(staleMiddleware, 'utf8');
			if (contents.includes('bunnytrail/middleware')) {
				await rm(staleMiddleware);
				written.push('removed: middleware.ts');
			}
		} catch {
			// No middleware.ts present — nothing to clean up.
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
