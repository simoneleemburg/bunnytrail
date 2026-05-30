#!/usr/bin/env node
// One-shot shim generator. Drops re-export files under src/routes/ that
// point at the engine's $lib/routes/ implementations. Idempotent.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve('src/routes');

/** @type {Array<{file: string, contents: string}>} */
const files = [];

const pageServer = (lib) => `export { load } from '$lib/routes/${lib}/load';\n`;
const pageSvelte = (lib) => `<script lang="ts">
\timport Page from '$lib/routes/${lib}/Page.svelte';
\timport type { PageData } from './$types';

\tlet { data }: { data: PageData } = $props();
</script>

<Page {data} />
`;
const layoutServer = (lib, name = 'load') => `export { load } from '$lib/routes/${lib}/${name}';\n`;
const layoutSvelte = (lib) => `<script lang="ts">
\timport type { Snippet } from 'svelte';
\timport Layout from '$lib/routes/${lib}/Layout.svelte';
\timport type { LayoutData } from './$types';

\tlet { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<Layout {data} {children} />
`;
const server = (lib, verb = 'GET') => `export { ${verb} } from '$lib/routes/${lib}/handler';\n`;

// Root layout + home
files.push({ file: '+layout.server.ts', contents: layoutServer('layout') });
files.push({ file: '+layout.svelte', contents: layoutSvelte('layout') });
files.push({ file: '+page.server.ts', contents: pageServer('home') });
files.push({ file: '+page.svelte', contents: pageSvelte('home') });

// [...path]
files.push({ file: '[...path]/+page.server.ts', contents: pageServer('path') });
files.push({ file: '[...path]/+page.svelte', contents: pageSvelte('path') });

// api/assets/[name]
files.push({ file: 'api/assets/[name]/+server.ts', contents: server('api/assets') });
// api/entity-assets/[...path]
files.push({ file: 'api/entity-assets/[...path]/+server.ts', contents: server('api/entityAssets') });

// blog (layout + index + slug)
files.push({ file: 'blog/+layout.server.ts', contents: layoutServer('blog', 'layoutLoad') });
files.push({ file: 'blog/+page.server.ts', contents: pageServer('blog') });
files.push({ file: 'blog/+page.svelte', contents: pageSvelte('blog') });
files.push({ file: 'blog/[slug]/+page.server.ts', contents: pageServer('blog/slug') });
files.push({ file: 'blog/[slug]/+page.svelte', contents: pageSvelte('blog/slug') });

// cognita redirect
files.push({ file: 'cognita/+server.ts', contents: server('cognita') });

// everything
files.push({ file: 'everything/+page.server.ts', contents: pageServer('everything') });
files.push({ file: 'everything/+page.svelte', contents: pageSvelte('everything') });

// guides/[slug]
files.push({ file: 'guides/[slug]/+page.server.ts', contents: pageServer('guides/slug') });
files.push({ file: 'guides/[slug]/+page.svelte', contents: pageSvelte('guides/slug') });

// kinds
files.push({ file: 'kinds/+page.server.ts', contents: pageServer('kinds') });
files.push({ file: 'kinds/+page.svelte', contents: pageSvelte('kinds') });
files.push({ file: 'kinds/[kind]/+page.server.ts', contents: pageServer('kinds/kind') });
files.push({ file: 'kinds/[kind]/+page.svelte', contents: pageSvelte('kinds/kind') });

// sources
files.push({ file: 'sources/+page.server.ts', contents: pageServer('sources') });
files.push({ file: 'sources/+page.svelte', contents: pageSvelte('sources') });

// tags/[tag]
files.push({ file: 'tags/[tag]/+page.server.ts', contents: pageServer('tags/tag') });
files.push({ file: 'tags/[tag]/+page.svelte', contents: pageSvelte('tags/tag') });

for (const { file, contents } of files) {
	const full = resolve(root, file);
	await mkdir(dirname(full), { recursive: true });
	await writeFile(full, contents);
	console.log('wrote', file);
}
