<script lang="ts">
	import type { PageData } from './$types';
	import TypeIndex from '../[...path]/_TypeIndex.svelte';

	let { data }: { data: PageData } = $props();
</script>

<TypeIndex {data} />
