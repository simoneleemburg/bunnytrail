<script lang="ts">
	import type { PageData } from './$types';
	import CollectionPage from './_CollectionPage.svelte';
	import EntityPage from './_EntityPage.svelte';
	import ChapterPage from './_ChapterPage.svelte';
	import CraftPage from './_CraftPage.svelte';
	import KindsIndexPage from '../kinds/_KindsIndexPage.svelte';
	import KindPage from '../kinds/[kind]/_KindPage.svelte';
	import { page } from '$app/state';

	let { data }: { data: PageData } = $props();

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
{:else}
	<EntityPage {data} />
{/if}
