<script lang="ts">
	import { page } from '$app/state';
	import KindsIndexPage from './KindsIndexPage.svelte';
	import type { OntologySection, KindNode } from './load';

	let {
		data
	}: {
		data: { sections: OntologySection[]; unregistered: { kind: string; count: number }[] };
	} = $props();
</script>

<svelte:head>
	<title>Kinds · {page.data.world.shortName}</title>
</svelte:head>

<KindsIndexPage {data} />
