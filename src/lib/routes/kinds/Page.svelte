<script lang="ts">
	import KindsIndexPage from './KindsIndexPage.svelte';
	import type { KindNode } from './load';

	let {
		data
	}: {
		data: { roots: KindNode[]; unregistered: { kind: string; count: number }[] };
	} = $props();
</script>

<svelte:head>
	<title>Kinds · Alteria</title>
</svelte:head>

<KindsIndexPage {data} />
