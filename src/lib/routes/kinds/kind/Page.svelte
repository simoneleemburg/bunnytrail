<script lang="ts">
	import { page } from '$app/state';
	import KindPage from './KindPage.svelte';
	import type { KindCard, KindRefSection, KindSliceNode } from './load';

	let {
		data
	}: {
		data: {
			kindId: string;
			singular: string;
			plural: string;
			description: string | null;
			bodyHtml: string | null;
			slice: KindSliceNode | null;
			direct: KindCard[];
			kindRefSections: KindRefSection[];
			backlinks: KindCard[];
		};
	} = $props();
</script>

<svelte:head>
	<title>{data.plural} · Kinds · {page.data.world.shortName}</title>
</svelte:head>

<KindPage {data} />
