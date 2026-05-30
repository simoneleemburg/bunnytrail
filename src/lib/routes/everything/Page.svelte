<script lang="ts">
	import type { EverythingData } from './load';
	import CollectionPage from '../path/CollectionPage.svelte';

	let { data }: { data: EverythingData } = $props();
</script>

<CollectionPage {data} />
