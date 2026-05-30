<script lang="ts">
	import Page from '$lib/routes/blog/slug/Page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<Page {data} />
