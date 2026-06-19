<script lang="ts">
	import { page } from '$app/state';
	import KindPage from './KindPage.svelte';
	import type { KindCard, KindPageData, KindRefSection, KindSliceNode } from './load';

	let { data }: { data: KindPageData } = $props();
</script>

<svelte:head>
	<title>{data.plural} · Kinds · {page.data.world.shortName}</title>
</svelte:head>

<KindPage {data} />
