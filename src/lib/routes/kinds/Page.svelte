<script lang="ts">
	import KindsIndexPage from './_KindsIndexPage.svelte';
	import type { KindNode } from './+page.server';

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
