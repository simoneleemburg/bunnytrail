<script lang="ts">
	import Page from '$lib/routes/blog/Page.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<Page {data} />
