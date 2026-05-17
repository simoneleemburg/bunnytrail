<script lang="ts">
	import type { PageData } from './$types';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.label.plural} · Alteria</title>
</svelte:head>

<PageHeader eyebrow="All" title={data.label.plural} />

{#if data.description}
	<p class="type-description">{data.description}</p>
{/if}

{#if data.entities.length === 0}
	<p class="empty">
		<em>No {data.label.plural.toLowerCase()} have been recorded yet.</em>
	</p>
{:else}
	<div class="grid">
		{#each data.entities as entity (entity.id)}
			<EntityCard
				id={entity.id}
				name={entity.name}
				type={data.label.singular}
				summary={entity.summary}
				tags={entity.tags}
				era={entity.era}
			/>
		{/each}
	</div>
{/if}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--space-5) var(--space-6);
	}

	.empty {
		color: var(--ink-faint);
	}

	.type-description {
		max-width: 48rem;
		margin: 0 0 var(--space-6) 0;
		color: var(--ink-soft);
		font-style: italic;
	}
</style>
