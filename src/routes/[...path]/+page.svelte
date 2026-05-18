<script lang="ts">
	import type { PageData } from './$types';
	import TypeIndex from './_TypeIndex.svelte';
	import EntityPage from './_EntityPage.svelte';

	let { data }: { data: PageData } = $props();
</script>

{#if data.kind === 'type'}
	<TypeIndex {data} />
{:else}
	<EntityPage {data} />
{/if}
