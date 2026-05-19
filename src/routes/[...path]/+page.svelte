<script lang="ts">
	import type { PageData } from './$types';
	import CollectionPage from './_CollectionPage.svelte';
	import EntityPage from './_EntityPage.svelte';

	let { data }: { data: PageData } = $props();
</script>

{#if data.kind === 'type'}
	<CollectionPage {data} />
{:else}
	<EntityPage {data} />
{/if}
