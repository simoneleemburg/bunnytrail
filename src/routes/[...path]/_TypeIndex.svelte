<script lang="ts">
	import type { TypeIndexData, ContainerNode } from './_typeIndex.load';
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
	const hasSubtypes = $derived(data.subtypes.length > 0);
	const hasViewToggle = $derived(hasContainers || hasSubtypes);

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

	// Subtype tiles only show in nested mode, and their counts /
	// visibility follow the active kind filter: a subtype with zero
	// entities of the active kind is hidden entirely.
	const visibleSubtypes = $derived.by(() => {
		if (viewMode !== 'nested') return [];
		return data.subtypes
			.map((sub) => {
				const count =
					activeKind === null ? sub.count : (sub.kindCounts[activeKind] ?? 0);
				return { ...sub, visibleCount: count };
			})
			.filter((sub) => sub.visibleCount > 0);
	});

	// View-model for a rendered container row. `containerMatches`
	// drives whether to render the full EntityCard or just a small
	// "Within X" stub (kept so descendants below still have context).
	type RenderNode = {
		container: ContainerNode['container'];
		containerMatches: boolean;
		children: RenderNode[];
	};

	// Recursively filter a container node by the active kind, keeping
	// any node where the container itself matches OR any descendant
	// matches. Returns null when the entire subtree is hidden.
	function filterNode(node: ContainerNode): RenderNode | null {
		const children = node.children
			.map(filterNode)
			.filter((c): c is RenderNode => c !== null);
		const containerMatches = matchesKind(node.container);
		if (!containerMatches && children.length === 0) return null;
		return { container: node.container, containerMatches, children };
	}

	// In nested mode the visible grid is just the standalone entities
	// (containers + nested children are shown separately, above).
	// In flat mode it's the full list.
	const visibleGrid = $derived(
		(viewMode === 'flat' ? data.flat : data.standalone).filter(matchesKind)
	);

	const visibleContainers = $derived.by(() => {
		if (viewMode !== 'nested') return [];
		return data.containers
			.map(filterNode)
			.filter((n): n is RenderNode => n !== null);
	});
</script>

<svelte:head>
	<title>{data.label.plural} · Alteria</title>
</svelte:head>

<PageHeader eyebrow="All" title={data.label.plural} />

{#if data.description}
	<p class="type-description">{data.description}</p>
{/if}

{#if data.flat.length === 0}
	<p class="empty">
		<em>No {data.label.plural.toLowerCase()} have been recorded yet.</em>
	</p>
{:else}
	{#if kindCounts.length > 1 || hasViewToggle}
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
			{#if hasViewToggle}
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

	{#if visibleSubtypes.length > 0}
		<section class="subtypes" aria-label="Subtypes">
			<h2 class="subtypes-heading">Within {data.label.plural.toLowerCase()}</h2>
			<ul class="subtype-list">
				{#each visibleSubtypes as sub (sub.type)}
					<li>
						<a class="subtype-link" href={`/${sub.type}`}>
							<span class="subtype-label">{sub.plural}</span>
							<span class="subtype-count">{sub.visibleCount}</span>
						</a>
						{#if sub.description}
							<p class="subtype-description">{sub.description}</p>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#snippet containerTree(node: RenderNode)}
		<div class="container-group">
			{#if node.containerMatches}
				<EntityCard
					id={node.container.id}
					name={node.container.name}
					type={data.label.singular}
					kind={node.container.kind}
					summaryHtml={node.container.summaryHtml}
					tags={node.container.tags}
					era={node.container.era}
				/>
			{:else}
				<p class="container-stub">
					Within <a href={`/${node.container.id}`}>{node.container.name}</a>
				</p>
			{/if}
			{#if node.children.length > 0}
				<div class="child-list">
					{#each node.children as child (child.container.id)}
						{@render containerTree(child)}
					{/each}
				</div>
			{/if}
		</div>
	{/snippet}

	{#if visibleContainers.length > 0}
		<section class="containers" aria-label="Container entities">
			{#each visibleContainers as group (group.container.id)}
				{@render containerTree(group)}
			{/each}
		</section>
	{/if}

	{#if visibleGrid.length > 0}
		<div class="grid">
			{#each visibleGrid as entity (entity.id)}
				<EntityCard
					id={entity.id}
					name={entity.name}
					type={entity.typeLabel ?? data.label.singular}
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
		margin: 0 0 0 var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		border-left: 1px solid var(--rule);
		padding-left: var(--space-5);
	}
</style>
