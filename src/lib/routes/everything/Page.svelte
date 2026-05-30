<script lang="ts">
	import type { PageData } from './$types';
	import CollectionPage from '../[...path]/_CollectionPage.svelte';

	let { data }: { data: PageData } = $props();
</script>

<CollectionPage {data} />
