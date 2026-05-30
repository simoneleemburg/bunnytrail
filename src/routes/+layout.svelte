<script lang="ts">
	import type { Snippet } from 'svelte';
	import Layout from '$lib/routes/layout/Layout.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<Layout {data} {children} />
