<script lang="ts">
	import type { PathPageData } from './load';
	import CollectionPage from './CollectionPage.svelte';
	import EntityPage from './EntityPage.svelte';
	import ChapterPage from './ChapterPage.svelte';
	import CraftPage from './CraftPage.svelte';
	import KindsIndexPage from '../kinds/KindsIndexPage.svelte';
	import KindPage from '../kinds/kind/KindPage.svelte';
	import SymbologyPage from '../symbology/Page.svelte';
	import TimelinePage from './TimelinePage.svelte';
	import TimelineDotPage from './TimelineDotPage.svelte';
	import { page } from '$app/state';

	let { data }: { data: PathPageData } = $props();

	// Scope-aware "↑ Kinds" up-link for the cluster-scoped kind
	// page: walks back to `/<cluster>/kinds` rather than the
	// universal `/kinds`. Pulled from the path prefix because
	// only [...path] dispatches the scoped variant.
	const kindUpHref = $derived.by(() => {
		const m = page.url.pathname.match(/^\/([a-z0-9][a-z0-9-]*)\/kinds\//);
		return m ? `/${m[1]}/kinds` : '/kinds';
	});
</script>

{#if data.kind === 'collection'}
	<CollectionPage {data} />
{:else if data.kind === 'chapter'}
	<ChapterPage {data} />
{:else if data.kind === 'craft'}
	<CraftPage {data} />
{:else if data.kind === 'kindsIndex'}
	<KindsIndexPage {data} />
{:else if data.kind === 'kindPage'}
	<KindPage {data} upHref={kindUpHref} />
{:else if data.kind === 'symbology'}
	<SymbologyPage {data} />
{:else if data.kind === 'timeline'}
	<TimelinePage {data} />
{:else if data.kind === 'timeline-dot'}
	<TimelineDotPage {data} />
{:else}
	<EntityPage {data} />
{/if}
