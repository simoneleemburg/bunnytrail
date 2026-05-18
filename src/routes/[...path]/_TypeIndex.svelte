<script lang="ts">
	import type { TypeIndexData } from './_typeIndex.load';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data }: { data: TypeIndexData } = $props();

	// Two orthogonal UI states:
	//   • view-mode: nested (containers shown with children) vs flat
	//     (all entities at the same level, no nesting visible)
	//   • kind-filter: shows only entities of a given `kind` field
	//
	// Both apply at the same time and reset on navigation (per-page
	// local state only).
	type ViewMode = 'nested' | 'flat';
	let viewMode = $state<ViewMode>('nested');
	let activeKind = $state<string | null>(null);

	const hasContainers = $derived(data.containers.length > 0);

	// Kind counts are derived from the *flat* list of entities so the
	// counts don't change when the user switches view-mode.
	const kindCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const e of data.flat) {
			const k = e.kind ?? '—';
			counts.set(k, (counts.get(k) ?? 0) + 1);
		}
		return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	});

	function matchesKind(card: { kind: string | null }): boolean {
		if (activeKind === null) return true;
		return (card.kind ?? '—') === activeKind;
	}

	// In nested mode the visible grid is just the standalone entities
	// (containers + nested children are shown separately, above).
	// In flat mode it's the full list.
	const visibleGrid = $derived(
		(viewMode === 'flat' ? data.flat : data.standalone).filter(matchesKind)
	);

	// Containers section is only shown in nested mode, and only if at
	// least one container or one of its children matches the active
	// kind filter (otherwise the section would be visually empty).
	const visibleContainers = $derived.by(() => {
		if (viewMode !== 'nested') return [];
		return data.containers
			.map((c) => ({
				container: c.container,
				containerMatches: matchesKind(c.container),
				children: c.children.filter(matchesKind)
			}))
			.filter((c) => c.containerMatches || c.children.length > 0);
	});
</script>

<svelte:head>
	<title>{data.label.plural} · Alteria</title>
</svelte:head>

<PageHeader eyebrow="All" title={data.label.plural} />

{#if data.description}
	<p class="type-description">{data.description}</p>
{/if}

{#if data.subtypes.length > 0}
	<section class="subtypes" aria-label="Subtypes">
		<h2 class="subtypes-heading">Within {data.label.plural.toLowerCase()}</h2>
		<ul class="subtype-list">
			{#each data.subtypes as sub (sub.type)}
				<li>
					<a class="subtype-link" href={`/${sub.type}`}>
						<span class="subtype-label">{sub.plural}</span>
						<span class="subtype-count">{sub.count}</span>
					</a>
					{#if sub.description}
						<p class="subtype-description">{sub.description}</p>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if data.flat.length === 0}
	<p class="empty">
		<em>No {data.label.plural.toLowerCase()} have been recorded yet.</em>
	</p>
{:else}
	{#if kindCounts.length > 1 || hasContainers}
		<nav class="filters" aria-label="Filter and view">
			{#if kindCounts.length > 1}
				<div class="filter-group" role="group" aria-label="Filter by kind">
					<button
						type="button"
						class="filter"
						class:active={activeKind === null}
						onclick={() => (activeKind = null)}
					>
						All <span class="count">{data.flat.length}</span>
					</button>
					{#each kindCounts as [kind] (kind)}
						<button
							type="button"
							class="filter"
							class:active={activeKind === kind}
							onclick={() => (activeKind = kind)}
						>
							{kind}
						</button>
					{/each}
				</div>
			{/if}
			{#if hasContainers}
				<div class="filter-group view-toggle" role="group" aria-label="View mode">
					<button
						type="button"
						class="filter"
						class:active={viewMode === 'nested'}
						onclick={() => (viewMode = 'nested')}
					>
						Nested
					</button>
					<button
						type="button"
						class="filter"
						class:active={viewMode === 'flat'}
						onclick={() => (viewMode = 'flat')}
					>
						Flat
					</button>
				</div>
			{/if}
		</nav>
	{/if}

	{#if visibleContainers.length > 0}
		<section class="containers" aria-label="Container entities">
			{#each visibleContainers as group (group.container.id)}
				<div class="container-group">
					{#if group.containerMatches}
						<EntityCard
							id={group.container.id}
							name={group.container.name}
							type={data.label.singular}
							kind={group.container.kind}
							summaryHtml={group.container.summaryHtml}
							tags={group.container.tags}
							era={group.container.era}
						/>
					{:else}
						<p class="container-stub">
							Within <a href={`/${group.container.id}`}>{group.container.name}</a>
						</p>
					{/if}
					{#if group.children.length > 0}
						<ul class="child-list">
							{#each group.children as child (child.id)}
								<li>
									<a href={`/${child.id}`} class="child-link">
										<span class="child-name">{child.name}</span>
										{#if child.kind}<span class="child-kind">{child.kind}</span>{/if}
									</a>
									{#if child.summaryHtml}
										<p class="child-summary">{@html child.summaryHtml}</p>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</section>
	{/if}

	{#if visibleGrid.length > 0}
		<div class="grid">
			{#each visibleGrid as entity (entity.id)}
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
		justify-content: space-between;
		gap: var(--space-3) var(--space-5);
		margin: 0 0 var(--space-6) 0;
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--rule);
	}

	.filter-group {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	.view-toggle {
		gap: var(--space-2) var(--space-3);
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

	.subtypes {
		margin: 0 0 var(--space-7) 0;
		padding-bottom: var(--space-5);
		border-bottom: var(--rule-thin);
	}

	.subtypes-heading {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.08em;
		font-weight: 500;
		color: var(--ink-faint);
		margin: 0 0 var(--space-3) 0;
	}

	.subtype-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--space-4) var(--space-6);
	}

	.subtype-link {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		color: inherit;
		text-decoration: none;
		border-bottom: 1px solid var(--rule);
		padding-bottom: var(--space-1);
	}

	.subtype-link:hover .subtype-label {
		color: var(--accent);
	}

	.subtype-label {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		color: var(--ink);
	}

	.subtype-count {
		font-size: var(--text-xs);
		font-variant: tabular-nums small-caps;
		color: var(--ink-faint);
	}

	.subtype-description {
		margin: var(--space-2) 0 0 0;
		font-size: var(--text-sm);
		color: var(--ink-soft);
		line-height: var(--leading-normal);
	}

	.containers {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		margin: 0 0 var(--space-5) 0;
	}

	.container-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.container-stub {
		margin: 0;
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	.container-stub a {
		color: var(--ink-soft);
		text-decoration: none;
		border-bottom: 1px solid var(--rule);
	}

	.container-stub a:hover {
		color: var(--accent);
	}

	.child-list {
		list-style: none;
		padding: 0;
		margin: 0 0 0 var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		border-left: 1px solid var(--rule);
		padding-left: var(--space-4);
	}

	.child-list li {
		padding-top: var(--space-1);
	}

	.child-link {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		color: inherit;
		text-decoration: none;
	}

	.child-link:hover .child-name {
		color: var(--accent);
	}

	.child-name {
		font-family: var(--font-display);
		font-size: var(--text-base);
		color: var(--ink);
	}

	.child-kind {
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	.child-summary {
		margin: var(--space-1) 0 0 0;
		color: var(--ink-soft);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
	}
</style>
