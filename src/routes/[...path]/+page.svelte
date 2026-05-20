<script lang="ts">
	import type { PageData } from './$types';
	import CollectionPage from './_CollectionPage.svelte';
	import EntityPage from './_EntityPage.svelte';
	import ChapterPage from './_ChapterPage.svelte';

	let { data }: { data: PageData } = $props();
</script>

{#if data.kind === 'collection'}
	<CollectionPage {data} />
{:else if data.kind === 'chapter'}
	<ChapterPage {data} />
{:else}
	<EntityPage {data} />
{/if}
