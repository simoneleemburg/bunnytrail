<script lang="ts">
	import type { PageData } from './$types';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data }: { data: PageData } = $props();

	let activeKind = $state<string | null>(null);

	const kindCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const e of data.entities) {
			const k = e.kind ?? '—';
			counts.set(k, (counts.get(k) ?? 0) + 1);
		}
		return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	});

	const visible = $derived(
		activeKind === null
			? data.entities
			: data.entities.filter((e) => (e.kind ?? '—') === activeKind)
	);
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
	{#if kindCounts.length > 1}
		<nav class="filters" aria-label="Filter by kind">
			<button
				type="button"
				class="filter"
				class:active={activeKind === null}
				onclick={() => (activeKind = null)}
			>
				All <span class="count">{data.entities.length}</span>
			</button>
			{#each kindCounts as [kind, count] (kind)}
				<button
					type="button"
					class="filter"
					class:active={activeKind === kind}
					onclick={() => (activeKind = kind)}
				>
					{kind}
					<span class="count">{count}</span>
				</button>
			{/each}
		</nav>
	{/if}

	<div class="grid">
		{#each visible as entity (entity.id)}
			<EntityCard
				id={entity.id}
				name={entity.name}
				type={data.label.singular}
				kind={entity.kind}
				summaryHtml={entity.summaryHtml}
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

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: 0 0 var(--space-6) 0;
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--rule);
	}

	.filter {
		appearance: none;
		background: transparent;
		border: 0;
		padding: 0;
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.06em;
		color: var(--ink-soft);
		cursor: pointer;
		line-height: 1.6;
		border-bottom: 1px solid transparent;
	}

	.filter:hover {
		color: var(--accent);
	}

	.filter.active {
		color: var(--ink);
		border-bottom-color: var(--ink);
	}

	.count {
		display: inline-block;
		margin-left: 0.25em;
		font-size: var(--text-xs);
		color: var(--ink-faint);
		font-variant: tabular-nums;
	}

	.filter.active .count {
		color: var(--ink-soft);
	}
</style>
