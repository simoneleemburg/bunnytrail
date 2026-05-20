<script lang="ts">
	import type { CollectionPageData, ContainerNode, OrbitNode } from './_collectionPage.load';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Tag from '$lib/components/Tag.svelte';
	import { buildKindTree } from '$lib/types';

	let { data }: { data: CollectionPageData } = $props();

	// Display caps for tags. Subcollection tiles get a tight cap to keep
	// the tile compact; the page-level filter starts collapsed at
	// FILTER_TOP_N and reveals the rest behind a "show all" toggle.
	const SUBCOLLECTION_TAG_CAP = 6;
	const FILTER_TOP_N = 8;

	// Four orthogonal UI states:
	//   • view-mode: nested (containers shown with children), flat,
	//     or orbits (gravitational tree)
	//   • kind-filter: shows only entities of a given `kind` field
	//   • folder-filter: scopes the visible set to a single child
	//     folder of the current page
	//   • tag-filter: multi-select, AND semantics — an entity must
	//     have *every* selected tag to remain visible
	//
	// All four apply at the same time and reset on navigation
	// (per-page local state only).
	type ViewMode = 'nested' | 'flat' | 'orbits';
	let viewMode = $state<ViewMode>('nested');
	let activeKind = $state<string | null>(null);
	let activeFolder = $state<string | null>(null);
	let activeTags = $state<Set<string>>(new Set());
	let showAllTags = $state(false);

	const hasContainers = $derived(data.containers.length > 0);
	const hasSubcollections = $derived(data.subcollections.length > 0);
	const hasOrbits = $derived(data.orbits.length > 0);
	const hasViewToggle = $derived(hasContainers || hasSubcollections || hasOrbits);

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

	// Rehydrate the kind hierarchy from the loader's parent-map.
	// Same builder the server used, so chip derivation and filter
	// matching agree with `byKindRecursive`.
	const kindTree = $derived.by(() =>
		buildKindTree(new Map(Object.entries(data.kindParents ?? {})))
	);

	/**
	 * Kind chips visible on this page. Two sources, deduped:
	 *
	 *   • **Leaf chips** — every distinct `kind` value present on
	 *     the visible entities. Count = entities directly carrying
	 *     that kind. These are the existing chips.
	 *   • **Supertype chips** — for each leaf kind that lives inside
	 *     the kind hierarchy, every ancestor up the tree gains a
	 *     chip too, *as long as that ancestor has descendants in
	 *     the visible set*. Count = total entities whose kind is
	 *     the ancestor itself or any descendant of it.
	 *
	 * Free-form kinds (not registered in `_type.yaml`) have no
	 * ancestors and therefore behave exactly as before. The chip
	 * for a supertype is tagged `supertype: true` so the view can
	 * style it distinctly.
	 */
	const kindCounts = $derived.by(() => {
		// Direct counts per kind value carried by visible entities.
		const direct = new Map<string, number>();
		for (const e of filterEntitySet) {
			const k = e.kind ?? '—';
			direct.set(k, (direct.get(k) ?? 0) + 1);
		}
		// For each direct kind in the tree, accumulate ancestor totals.
		const supertypeTotals = new Map<string, number>();
		for (const [kind, count] of direct) {
			if (!kindTree.has(kind)) continue;
			for (const ancestor of kindTree.ancestors(kind)) {
				supertypeTotals.set(ancestor, (supertypeTotals.get(ancestor) ?? 0) + count);
			}
		}
		// A kind that is both a *direct* kind on the page (some entity
		// declares it explicitly) and an *ancestor* of other direct
		// kinds: merge so the chip shows the total visible
		// descendants, and mark it as a supertype iff it has any
		// non-direct descendants beneath it. The chip thus answers
		// "how many entities on this page are <kind> or a more
		// specific subkind?".
		const merged = new Map<string, { count: number; supertype: boolean }>();
		for (const [k, c] of direct) {
			merged.set(k, { count: c, supertype: false });
		}
		for (const [k, c] of supertypeTotals) {
			const existing = merged.get(k);
			merged.set(k, {
				count: (existing?.count ?? 0) + c,
				supertype: true
			});
		}
		return [...merged.entries()].sort(([a], [b]) => a.localeCompare(b));
	});

	function matchesKind(card: { kind: string | null }): boolean {
		if (activeKind === null) return true;
		const k = card.kind ?? '—';
		if (k === activeKind) return true;
		// Walk ancestors so a supertype chip selects every
		// descendant. Free-form kinds have no ancestors so this
		// short-circuits cleanly.
		if (!kindTree.has(k)) return false;
		return kindTree.ancestors(k).includes(activeKind);
	}

	function matchesTags(card: { tags: string[] }): boolean {
		if (activeTags.size === 0) return true;
		for (const t of activeTags) {
			if (!card.tags.includes(t)) return false;
		}
		return true;
	}

	function matchesFolder(card: { folderPath?: string; id: string }): boolean {
		if (activeFolder === null) return true;
		const fp = card.folderPath ?? '';
		// Match exact bucket or any nested bucket. Containers
		// living directly at the folder root (e.g. Nuunlau under
		// `bayurinda/`) carry folderPath = `bayurinda`; Bal Rochan
		// inside Nuunlau carries `bayurinda/nuunlau`. Both should
		// pass the `bayurinda` filter.
		return fp === activeFolder || fp.startsWith(`${activeFolder}/`);
	}

	function matchesFilters(card: {
		kind: string | null;
		tags: string[];
		folderPath?: string;
		id: string;
	}): boolean {
		return matchesKind(card) && matchesTags(card) && matchesFolder(card);
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

	// Folder chips re-counted under the active kind+tag filters,
	// so the row mirrors what the user can actually see. A folder
	// with zero matches under the current selection is hidden —
	// except the currently-active folder, which has to stay
	// clickable to deselect. The folder set itself comes from the
	// loader; we just narrow it. Top-level bucketing (everything
	// under `bayurinda/...` rolls up into `bayurinda`) matches the
	// loader's chip-construction logic.
	const visibleFolders = $derived.by(() => {
		const baseCounts = new Map<string, number>();
		for (const e of filterEntitySet) {
			const fp = e.folderPath ?? '';
			if (fp === '') continue;
			const top = fp.includes('/') ? fp.slice(0, fp.indexOf('/')) : fp;
			if (!matchesKind(e) || !matchesTags(e)) continue;
			baseCounts.set(top, (baseCounts.get(top) ?? 0) + 1);
		}
		return data.folders
			.map((f) => ({ ...f, count: baseCounts.get(f.path) ?? 0 }))
			.filter((f) => f.count > 0 || activeFolder === f.path);
	});

	// Subcollection tiles only show in nested mode. Their counts, visibility
	// and displayed tags all follow the active kind + tag filters: a
	// subcollection with zero matching entities is hidden entirely.
	//
	// `sub.kindCounts` and `sub.tagsByKind` arrive pre-rolled by the loader:
	// every supertype in the kind tree carries the total of itself plus
	// every descendant. So picking the supertype `celestial-body` reads
	// the correct aggregate count directly, no client-side walking needed.
	const visibleSubcollections = $derived.by(() => {
		if (viewMode !== 'nested') return [];
		return data.subcollections
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
					displayTags: displayTags.slice(0, SUBCOLLECTION_TAG_CAP)
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

{#if data.bodyHtml}
	<div class="collection-body">{@html data.bodyHtml}</div>
{/if}

{#if data.flat.length === 0}
	<p class="empty">
		<em>No {data.label.plural.toLowerCase()} have been recorded yet.</em>
	</p>
{:else}
	{#if kindCounts.length > 1 || hasViewToggle || visibleFolders.length > 0}
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
					{#each kindCounts as [kind, info] (kind)}
						<button
							type="button"
							class="filter"
							class:active={activeKind === kind}
							class:supertype={info.supertype}
							title={info.supertype ? `${kind} (supertype — ${info.count} total)` : kind}
							onclick={() => (activeKind = kind)}
						>
							{kind}{#if info.supertype}<span class="count">{info.count}</span>{/if}
						</button>
					{/each}
				</div>
			{/if}
			{#if visibleFolders.length > 0}
				<div class="filter-group" role="group" aria-label="Filter by folder">
					<button
						type="button"
						class="filter"
						class:active={activeFolder === null}
						onclick={() => (activeFolder = null)}
					>
						All folders
					</button>
					{#each visibleFolders as folder (folder.path)}
						<button
							type="button"
							class="filter folder-chip"
							class:active={activeFolder === folder.path}
							title={folder.path}
							onclick={() => (activeFolder = folder.path)}
						>
							{folder.name}<span class="count">{folder.count}</span>
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

	{#if visibleSubcollections.length > 0}
		<section class="subcollections" aria-label="Subcollections">
			<ul class="subcollection-list">
				{#each visibleSubcollections as sub (sub.type)}
					<li class="subcollection">
						<a class="subcollection-link" href={`/${sub.type}`}>
							<div class="subcollection-eyebrow">
								<span class="subcollection-tag">Collection</span>
								<span class="subcollection-count">{sub.visibleCount}</span>
							</div>
							<h3 class="subcollection-label">{sub.plural}</h3>
						</a>
						{#if sub.description}
							<p class="subcollection-description">{sub.description}</p>
						{/if}
						{#if sub.displayTags.length > 0}
							<ul class="subcollection-tags">
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
		<div class="container-group" class:synthetic={node.container.synthetic}>
			{#if node.container.synthetic}
				<div class="folder-heading">
					<h2>
						<a href={`/${node.container.id}`}>{node.container.name}</a>
					</h2>
					{#if node.container.crossLinkId}
						<a class="cross-link" href={`/${node.container.crossLinkId}`}> see entity → </a>
					{/if}
				</div>
			{:else if node.containerMatches}
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
		{@const dimmed = (activeKind !== null || activeTags.size > 0) && !matchesFilters(node.entity)}
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

	.collection-body {
		max-width: var(--prose-max);
		color: var(--ink);
		margin: 0 0 var(--space-6) 0;
	}

	.collection-body :global(h2) {
		font-size: var(--text-xl);
		margin-top: var(--space-6);
	}

	.collection-body :global(h3) {
		font-size: var(--text-lg);
		margin-top: var(--space-5);
	}

	.collection-body :global(p),
	.collection-body :global(ul),
	.collection-body :global(ol) {
		margin: 0 0 var(--space-4);
	}

	.collection-body :global(ul),
	.collection-body :global(ol) {
		padding-left: var(--space-5);
	}

	.collection-body :global(blockquote) {
		margin: var(--space-5) 0;
	}

	.collection-body :global(details.collection-include) {
		margin: var(--space-5) 0;
		border-left: 2px solid var(--ink-faint, var(--ink-soft));
		padding: var(--space-2) var(--space-4);
		background: var(--surface-soft, transparent);
	}

	.collection-body :global(details.collection-include > summary) {
		cursor: pointer;
		font-style: italic;
		color: var(--ink-soft);
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		list-style: none;
		user-select: none;
	}

	.collection-body :global(details.collection-include > summary::-webkit-details-marker) {
		display: none;
	}

	.collection-body :global(.collection-include-marker) {
		display: inline-block;
		font-size: 0.85em;
		color: var(--ink-soft);
		transition: transform 120ms ease-out;
	}

	.collection-body :global(details.collection-include[open] > summary .collection-include-marker) {
		transform: rotate(90deg);
	}

	.collection-body :global(details.collection-include > summary:hover .collection-include-title),
	.collection-body :global(details.collection-include > summary:hover .collection-include-marker) {
		color: var(--ink);
	}

	.collection-body :global(.collection-include-title) {
		font-style: italic;
	}

	.collection-body :global(details.collection-include > summary:hover .collection-include-title) {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.collection-body :global(.collection-include-link) {
		font-size: var(--text-sm);
		font-style: normal;
	}

	.collection-body :global(.collection-include-body) {
		margin-top: var(--space-3);
	}

	.collection-body :global(.collection-include-body > *:last-child) {
		margin-bottom: 0;
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

	/* Supertype chips group every descendant kind. The italic +
	   leading caret signals "this is a category, not a leaf"; the
	   count beside it shows how many entities the chip gathers. */
	.filter.supertype {
		font-style: italic;
	}

	.filter.supertype::before {
		content: '↑ ';
		font-style: normal;
		color: var(--ink-faint);
		margin-right: 0.1em;
	}

	.filter.supertype.active::before {
		color: var(--ink-soft);
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

	.subcollections {
		margin: 0 0 var(--space-7) 0;
	}

	.subcollection-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--space-4) var(--space-6);
	}

	.subcollection {
		position: relative;
		padding: var(--space-4);
		margin: 0 calc(var(--space-4) * -1);
		border-radius: 2px;
		transition:
			background-color 150ms ease,
			box-shadow 150ms ease,
			transform 150ms ease;
	}

	.subcollection:hover {
		background-color: var(--paper-warm);
		box-shadow: var(--shadow-hover);
		transform: translateY(-1px);
	}

	.subcollection-link {
		display: block;
		color: inherit;
		text-decoration: none;
	}

	/* Stretched link covers the whole tile, so the description below
	   is clickable too. No interactive children compete here. */
	.subcollection-link::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.subcollection-eyebrow {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
		padding-bottom: var(--space-1);
		border-bottom: 1px solid var(--rule);
	}

	.subcollection-tag {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
		color: var(--ink-faint);
	}

	.subcollection-label {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 500;
		margin: 0;
		color: var(--ink);
	}

	.subcollection:hover .subcollection-label {
		color: var(--accent);
	}

	.subcollection-count {
		font-size: var(--text-xs);
		font-variant: tabular-nums small-caps;
		color: var(--ink-faint);
	}

	.subcollection-description {
		margin: var(--space-2) 0 0 0;
		font-size: var(--text-sm);
		color: var(--ink-soft);
		line-height: var(--leading-normal);
	}

	.subcollection-tags {
		list-style: none;
		padding: 0;
		margin: var(--space-3) 0 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-2);
		/* Lift tag links above the subcollection-link::after overlay so they
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

	.folder-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		/* No bottom rule — the first child card's own top rule
		   already provides the dividing line, and stacking them
		   reads as a double-rule clash. */
		padding-bottom: var(--space-1);
	}

	.folder-heading h2 {
		margin: 0;
		font-size: var(--text-lg);
		font-variant: small-caps;
		letter-spacing: 0.06em;
		font-weight: 600;
	}

	.folder-heading h2 a {
		color: var(--ink);
		text-decoration: none;
	}

	.folder-heading h2 a:hover {
		color: var(--accent);
	}

	.folder-heading .cross-link {
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	.folder-heading .cross-link:hover {
		color: var(--accent);
	}

	/* Folder containers tighten their child-list indent — they're a
	   scoping device, not a hierarchical nesting like entity-in-entity. */
	.container-group.synthetic > .child-list {
		margin-left: 0;
		border-left: none;
		padding-left: 0;
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
