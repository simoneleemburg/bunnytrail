<script lang="ts">
	import type { PageData } from './$types';
	import ContainerPage from './_ContainerPage.svelte';
	import EntityPage from './_EntityPage.svelte';
	import TypeIndex from './_TypeIndex.svelte';

	let { data }: { data: PageData } = $props();
</script>

{#if data.kind === 'type'}
	<TypeIndex {data} />
{:else if data.kind === 'container'}
	<ContainerPage {data} />
{:else}
	<EntityPage {data} />
{/if}
