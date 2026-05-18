<script lang="ts">
	import type { TypeIndexData, ContainerNode, OrbitNode } from './_typeIndex.load';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Tag from '$lib/components/Tag.svelte';

	let { data }: { data: TypeIndexData } = $props();

	// Display caps for tags. Subtype tiles get a tight cap to keep
	// the tile compact; the page-level filter starts collapsed at
	// FILTER_TOP_N and reveals the rest behind a "show all" toggle.
	const SUBTYPE_TAG_CAP = 6;
	const FILTER_TOP_N = 8;

	// Three orthogonal UI states:
	//   • view-mode: nested (containers shown with children) vs flat
	//   • kind-filter: shows only entities of a given `kind` field
	//   • tag-filter: multi-select, AND semantics — an entity must
	//     have *every* selected tag to remain visible
	//
	// All three apply at the same time and reset on navigation
	// (per-page local state only).
	type ViewMode = 'nested' | 'flat' | 'orbits';
	let viewMode = $state<ViewMode>('nested');
	let activeKind = $state<string | null>(null);
	let activeTags = $state<Set<string>>(new Set());
	let showAllTags = $state(false);

	const hasContainers = $derived(data.containers.length > 0);
	const hasSubtypes = $derived(data.subtypes.length > 0);
	const hasOrbits = $derived(data.orbits.length > 0);
	const hasViewToggle = $derived(hasContainers || hasSubtypes || hasOrbits);

	// Flatten the orbit forest into a single list of entity cards.
	// Used in orbits mode to drive kind/tag chips and filter counts
	// off the actually-visible entity set — not data.flat, which
	// includes entities outside the orbit graph (e.g. realms,
	// materials, phenomena) and excludes orbit-graph entities of
	// other types (e.g. planets from /places).
	const orbitEntities = $derived.by(() => {
		const out: typeof data.flat = [];
		const walk = (node: (typeof data.orbits)[number]) => {
			out.push(node.entity);
			for (const c of node.children) walk(c);
		};
		for (const root of data.orbits) walk(root);
		return out;
	});

	// The entity set the chips and filters operate over. In orbits
	// mode this is the orbit forest; otherwise the full page set.
	const filterEntitySet = $derived(viewMode === 'orbits' ? orbitEntities : data.flat);

	// Kind counts are derived from the *flat* list of entities so the
	// counts don't change when the user switches view-mode.
	const kindCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const e of filterEntitySet) {
			const k = e.kind ?? '—';
			counts.set(k, (counts.get(k) ?? 0) + 1);
		}
		return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	});

	function matchesKind(card: { kind: string | null }): boolean {
		if (activeKind === null) return true;
		return (card.kind ?? '—') === activeKind;
	}

	function matchesTags(card: { tags: string[] }): boolean {
		if (activeTags.size === 0) return true;
		for (const t of activeTags) {
			if (!card.tags.includes(t)) return false;
		}
		return true;
	}

	function matchesFilters(card: { kind: string | null; tags: string[] }): boolean {
		return matchesKind(card) && matchesTags(card);
	}

	// Tags available for the page-level filter row: aggregated from
	// every entity currently passing the *kind* filter. We deliberately
	// don't intersect with active tags here, so the user can see what
	// other tags would narrow further (with their projected counts
	// under both filters applied together).
	const availableTags = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const e of filterEntitySet) {
			if (!matchesKind(e)) continue;
			// Count under combined active-tag filter too — so the user
			// sees what each tag *adds* to the current selection.
			if (!matchesTags(e)) continue;
			for (const t of e.tags) {
				counts.set(t, (counts.get(t) ?? 0) + 1);
			}
		}
		// Active tags are always present in the row even if their
		// own count under the current selection equals the whole
		// visible set — they need to be clickable to deselect.
		for (const t of activeTags) {
			if (!counts.has(t)) counts.set(t, 0);
		}
		return [...counts.entries()]
			.map(([label, count]) => ({ label, count }))
			.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
	});

	const visibleFilterTags = $derived(
		showAllTags ? availableTags : availableTags.slice(0, FILTER_TOP_N)
	);
	const hiddenTagCount = $derived(Math.max(0, availableTags.length - FILTER_TOP_N));

	function toggleTag(label: string) {
		const next = new Set(activeTags);
		if (next.has(label)) next.delete(label);
		else next.add(label);
		activeTags = next;
	}

	function clearTags() {
		activeTags = new Set();
	}

	// Subtype tiles only show in nested mode. Their counts, visibility
	// and displayed tags all follow the active kind + tag filters: a
	// subtype with zero matching entities is hidden entirely.
	const visibleSubtypes = $derived.by(() => {
		if (viewMode !== 'nested') return [];
		return data.subtypes
			.map((sub) => {
				// Re-derive count + tag list under the current filters.
				// Kind narrows first; tag narrows the count further by
				// requiring every active tag to appear under that kind.
				const baseTags = activeKind === null ? sub.tags : (sub.tagsByKind[activeKind] ?? []);
				const visibleCount = activeKind === null ? sub.count : (sub.kindCounts[activeKind] ?? 0);
				let filteredCount = visibleCount;
				let displayTags = baseTags;
				if (activeTags.size > 0) {
					// Approximate: drop tags that don't co-occur with
					// every active tag. We don't have per-tag-pair
					// counts so we leave the count alone if any active
					// tag is missing entirely (hides the tile).
					const present = new Set(baseTags.map((t) => t.label));
					for (const t of activeTags) {
						if (!present.has(t)) {
							filteredCount = 0;
							break;
						}
					}
					// Don't repeat active tags inside the tile.
					displayTags = baseTags.filter((t) => !activeTags.has(t.label));
				}
				return {
					...sub,
					visibleCount: filteredCount,
					displayTags: displayTags.slice(0, SUBTYPE_TAG_CAP)
				};
			})
			.filter((sub) => sub.visibleCount > 0);
	});

	type RenderNode = {
		container: ContainerNode['container'];
		containerMatches: boolean;
		children: RenderNode[];
	};

	// Recursively filter a container node by the active kind+tag
	// filters, keeping any node where the container itself matches OR
	// any descendant matches. Returns null when the entire subtree is
	// hidden.
	function filterNode(node: ContainerNode): RenderNode | null {
		const children = node.children.map(filterNode).filter((c): c is RenderNode => c !== null);
		const containerMatches = matchesFilters(node.container);
		if (!containerMatches && children.length === 0) return null;
		return { container: node.container, containerMatches, children };
	}

	const visibleGrid = $derived.by(() => {
		if (viewMode === 'orbits') return [];
		const source = viewMode === 'flat' ? data.flat : data.standalone;
		return source.filter(matchesFilters);
	});

	const visibleContainers = $derived.by(() => {
		if (viewMode !== 'nested') return [];
		return data.containers.map(filterNode).filter((n): n is RenderNode => n !== null);
	});

	// Orbits view renders the full structural tree as-is. We don't
	// apply the kind/tag filters here — the tree's value is the
	// gravitational relationships between bodies; pruning by tag or
	// kind would leave dangling branches that misrepresent the
	// hierarchy. Filters quietly apply only to flat/nested views.
	// Orbits view renders the structural tree, but with a twist:
	// when a filter is active, whole root trees with no matching
	// entity anywhere inside them are pruned out entirely. Within
	// a kept tree, non-matching cards stay rendered but get dimmed
	// (see `orbitTree` snippet) — so context-around-a-match is
	// preserved, but empty systems don't take up space.
	const visibleOrbits = $derived.by(() => {
		if (viewMode !== 'orbits') return [];
		if (activeKind === null && activeTags.size === 0) return data.orbits;
		const treeHasMatch = (node: OrbitNode): boolean => {
			if (matchesFilters(node.entity)) return true;
			return node.children.some(treeHasMatch);
		};
		return data.orbits.filter(treeHasMatch);
	});
</script>

<svelte:head>
	<title>{data.label.plural} · Alteria</title>
</svelte:head>

<PageHeader title={data.label.plural} />

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
						All <span class="count">{filterEntitySet.length}</span>
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
					{#if hasOrbits}
						<button
							type="button"
							class="filter"
							class:active={viewMode === 'orbits'}
							onclick={() => (viewMode = 'orbits')}
						>
							Orbits
						</button>
					{/if}
				</div>
			{/if}
		</nav>
	{/if}

	{#if availableTags.length > 0}
		<nav class="tag-filter" aria-label="Filter by tag">
			<span class="tag-filter-label">Tags</span>
			<ul class="tag-filter-list">
				{#each visibleFilterTags as tag (tag.label)}
					<li>
						<button
							type="button"
							class="tag-chip"
							class:active={activeTags.has(tag.label)}
							onclick={() => toggleTag(tag.label)}
							aria-pressed={activeTags.has(tag.label)}
						>
							{tag.label}<span class="tag-chip-count">{tag.count}</span>
						</button>
					</li>
				{/each}
				{#if hiddenTagCount > 0 && !showAllTags}
					<li>
						<button type="button" class="tag-more" onclick={() => (showAllTags = true)}>
							+{hiddenTagCount} more
						</button>
					</li>
				{/if}
				{#if showAllTags && availableTags.length > FILTER_TOP_N}
					<li>
						<button type="button" class="tag-more" onclick={() => (showAllTags = false)}>
							show fewer
						</button>
					</li>
				{/if}
				{#if activeTags.size > 0}
					<li>
						<button type="button" class="tag-clear" onclick={clearTags}> clear </button>
					</li>
				{/if}
			</ul>
		</nav>
	{/if}

	{#if visibleSubtypes.length > 0}
		<section class="subtypes" aria-label="Subtypes">
			<ul class="subtype-list">
				{#each visibleSubtypes as sub (sub.type)}
					<li class="subtype">
						<a class="subtype-link" href={`/${sub.type}`}>
							<div class="subtype-eyebrow">
								<span class="subtype-tag">Collection</span>
								<span class="subtype-count">{sub.visibleCount}</span>
							</div>
							<h3 class="subtype-label">{sub.plural}</h3>
						</a>
						{#if sub.description}
							<p class="subtype-description">{sub.description}</p>
						{/if}
						{#if sub.displayTags.length > 0}
							<ul class="subtype-tags">
								{#each sub.displayTags as tag (tag.label)}
									<li><Tag label={tag.label} href={`/tags/${tag.label}`} /></li>
								{/each}
							</ul>
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
					sigil={node.container.sigil}
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

	{#snippet orbitTree(node: OrbitNode)}
		{@const dimmed =
			(activeKind !== null || activeTags.size > 0) && !matchesFilters(node.entity)}
		<div class="orbit-group" class:dimmed>
			<EntityCard
				id={node.entity.id}
				name={node.entity.name}
				type={node.entity.typeLabel ?? data.label.singular}
				kind={node.entity.kind}
				summaryHtml={node.entity.summaryHtml}
				tags={node.entity.tags}
				era={node.entity.era}
				sigil={node.entity.sigil}
			/>
			{#if node.children.length > 0}
				<div class="orbit-children">
					{#each node.children as child (child.entity.id)}
						{@render orbitTree(child)}
					{/each}
				</div>
			{/if}
		</div>
	{/snippet}

	{#if visibleOrbits.length > 0}
		<section class="orbits" aria-label="Orbital hierarchy">
			{#each visibleOrbits as root (root.entity.id)}
				{@render orbitTree(root)}
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
					sigil={entity.sigil}
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
	}

	.subtype-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--space-4) var(--space-6);
	}

	.subtype {
		position: relative;
		padding: var(--space-4);
		margin: 0 calc(var(--space-4) * -1);
		border-radius: 2px;
		transition:
			background-color 150ms ease,
			box-shadow 150ms ease,
			transform 150ms ease;
	}

	.subtype:hover {
		background-color: var(--paper-warm);
		box-shadow: var(--shadow-hover);
		transform: translateY(-1px);
	}

	.subtype-link {
		display: block;
		color: inherit;
		text-decoration: none;
	}

	/* Stretched link covers the whole tile, so the description below
	   is clickable too. No interactive children compete here. */
	.subtype-link::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.subtype-eyebrow {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
		padding-bottom: var(--space-1);
		border-bottom: 1px solid var(--rule);
	}

	.subtype-tag {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
		color: var(--ink-faint);
	}

	.subtype-label {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 500;
		margin: 0;
		color: var(--ink);
	}

	.subtype:hover .subtype-label {
		color: var(--accent);
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

	.subtype-tags {
		list-style: none;
		padding: 0;
		margin: var(--space-3) 0 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-2);
		/* Lift tag links above the subtype-link::after overlay so they
		   are independently clickable. */
		position: relative;
		z-index: 2;
	}

	.tag-filter {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2) var(--space-3);
		margin: 0 0 var(--space-6) 0;
	}

	.tag-filter-label {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		color: var(--ink-faint);
	}

	.tag-filter-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
	}

	.tag-chip {
		appearance: none;
		background: transparent;
		border: 0;
		padding: 0 var(--space-2);
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.06em;
		color: var(--ink-soft);
		cursor: pointer;
		line-height: 1.6;
		border-bottom: 1px solid var(--rule);
	}

	.tag-chip:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-soft);
	}

	.tag-chip.active {
		color: var(--ink);
		border-bottom-color: var(--ink);
	}

	.tag-chip-count {
		display: inline-block;
		margin-left: 0.35em;
		font-variant: tabular-nums;
		color: var(--ink-faint);
	}

	.tag-chip.active .tag-chip-count {
		color: var(--ink-soft);
	}

	.tag-more,
	.tag-clear {
		appearance: none;
		background: transparent;
		border: 0;
		padding: 0;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-xs);
		color: var(--ink-faint);
		cursor: pointer;
		line-height: 1.6;
	}

	.tag-more:hover,
	.tag-clear:hover {
		color: var(--accent);
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

	.orbits {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		margin: 0 0 var(--space-5) 0;
	}

	.orbit-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.orbit-children {
		margin: 0 0 0 var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		border-left: 1px solid var(--rule);
		padding-left: var(--space-5);
	}

	/* Highlight-don't-prune. In orbits mode, a kind/tag filter
	   dims the cards that don't match instead of removing them
	   — preserving the gravitational shape. Only the card itself
	   dims; descendant cards are still rendered at full strength
	   so a matching child under a non-matching parent stays
	   visible. */
	.orbit-group.dimmed > :global(article) {
		opacity: 0.35;
		transition: opacity 120ms ease-out;
	}
	.orbit-group.dimmed > :global(article:hover),
	.orbit-group.dimmed > :global(article:focus-within) {
		opacity: 1;
	}
</style>
