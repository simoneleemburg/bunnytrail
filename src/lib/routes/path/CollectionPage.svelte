<script lang="ts">
	import { page } from '$app/state';
	import type { CollectionPageData, ContainerNode, OrbitNode } from './collectionPage.load';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Tag from '$lib/components/Tag.svelte';
	import { buildKindTree, toRoman } from '$lib/types';
	import { translateUrl } from '$lib/cluster';

	let { data }: { data: CollectionPageData } = $props();

	const ornamentSvg = $derived(page.data.ornament?.svg ?? null);
	const collectionNav = $derived(data.collectionNav);

	// Show a "focus on <cluster>" hint when the page's content
	// clearly belongs to one cluster but we're in All scope
	// (e.g. /earth/history?scope=all, /aurethia/places?scope=all).
	const focusCluster = $derived.by(() => {
		if (page.data.selectedCluster !== null) return null;
		const seg0 = data.type.split('/')[0];
		const ctx = page.data.scopeContext;
		if (!ctx?.clusters.includes(seg0)) return null;
		return seg0;
	});
	const focusHref = $derived.by(() => {
		if (!focusCluster) return null;
		return translateUrl(page.url, focusCluster, page.data.scopeContext);
	});
	const focusClusterLabel = $derived.by(() => {
		if (!focusCluster) return null;
		return (
			page.data.clusterOptions?.find(
				(o: { value: string; label: string }) => o.value === focusCluster
			)?.label ?? focusCluster
		);
	});

	const rankGlyph = $derived(
		collectionNav.rank != null && collectionNav.rankDisplay !== 'none'
			? (collectionNav.rankDisplay === 'roman' ? toRoman(collectionNav.rank) : String(collectionNav.rank))
			: null
	);

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
	type ViewMode = 'index' | 'tree' | 'flat' | 'orbits';
	let viewMode = $state<ViewMode>('index');
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
		return [...merged.entries()]
			.filter(([kind, info]) => {
				// Hide chips that wouldn't narrow anything: a chip whose
				// count equals the total visible set is a no-op filter
				// (e.g. "place" on /places, "celestial-body" on
				// /places/celestial). The currently-selected chip is
				// kept regardless so the user can click it to clear.
				if (kind === activeKind) return true;
				return info.count < filterEntitySet.length;
			})
			.sort(([a], [b]) => a.localeCompare(b));
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
		let matchingTotal = 0;
		for (const e of filterEntitySet) {
			if (!matchesKind(e)) continue;
			// Count under combined active-tag filter too — so the user
			// sees what each tag *adds* to the current selection.
			if (!matchesTags(e)) continue;
			matchingTotal++;
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
			.filter(([label, count]) => {
				// Hide tags that wouldn't narrow anything: a tag carried
				// by every visible entity is a no-op filter. Active tags
				// always stay so the user can deselect them.
				if (activeTags.has(label)) return true;
				return count < matchingTotal;
			})
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
		if (viewMode !== 'index') return [];
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
		if (viewMode === 'orbits' || viewMode === 'tree') return [];
		const source = viewMode === 'flat' ? data.flat : data.standalone;
		return source.filter(matchesFilters);
	});

	const visibleContainers = $derived.by(() => {
		if (viewMode !== 'index') return [];
		return data.containers.map(filterNode).filter((n): n is RenderNode => n !== null);
	});

	// Tree mode: each subcollection becomes a section with its own
	// container tree. Trees follow the *filesystem* hierarchy
	// (built server-side), not the page-folder containers used by
	// Index mode, so they descend all the way down.
	//
	// Section is kept when either the headline entity matches the
	// active filters, or any node in the tree matches. A pure-folder
	// subcollection with no surviving roots is dropped entirely.
	const visibleSubcollectionTrees = $derived.by(() => {
		if (viewMode !== 'tree') return [];
		return data.subcollectionTrees
			.map((sub) => {
				const roots = sub.roots.map(filterNode).filter((n): n is RenderNode => n !== null);
				const headlineMatches = sub.headlineEntity ? matchesFilters(sub.headlineEntity) : false;
				return { ...sub, roots, headlineMatches };
			})
			.filter((sub) =>
				sub.headlineEntity ? sub.headlineMatches || sub.roots.length > 0 : sub.roots.length > 0
			);
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
	<title>{data.label.plural} · {page.data.world.shortName}</title>
</svelte:head>

<div class="collection-header">
	<PageHeader
		title={data.label.plural}
		subtitle={data.description ?? undefined}
		breadcrumbs={data.breadcrumbs}
		focusHref={focusHref ?? undefined}
		focusClusterLabel={focusClusterLabel ?? undefined}
	/>
</div>

<!--
	Collection fleuron: visual signal that this page is a *collection
	landing*, not an entity page. Short rule + ornamental glyph + short
	rule. Glyph resolves to --ornament-glyph (e.g. ✶ in Alteria) so
	each world stamps its own mark. When the token is empty the
	divider collapses to a centred hairline.

	Four cases:
	  prose + toolbar  → fleuron, prose, toolbar (gradient rule), grid
	  prose + no toolbar → fleuron, prose, fleuron, grid   (second fleuron added after prose below)
	  no prose + toolbar → toolbar (gradient rule), grid
	  no prose + no toolbar → fleuron, grid
-->
{#if data.bodyHtml || !hasViewToggle}
	<div class="bt-fleuron" aria-hidden="true">
		<span class="bt-fleuron__rule"></span>
		{#if rankGlyph != null}
			<span class="bt-fleuron__glyph bt-fleuron__glyph--rank">{rankGlyph}</span>
		{:else if ornamentSvg}
			<span class="bt-fleuron__glyph bt-fleuron__glyph--svg">{@html ornamentSvg}</span>
		{:else}
			<span class="bt-fleuron__glyph"></span>
		{/if}
		<span class="bt-fleuron__rule"></span>
	</div>
	{#if collectionNav.prev || collectionNav.next}
		<nav class="rank-nav" aria-label="Collection navigation">
			{#if collectionNav.prev}
				<a class="rank-nav__item rank-nav__item--prev" href="/{collectionNav.prev.path}" aria-label="Previous: {collectionNav.prev.title}">
					<span class="rank-nav__arrow" aria-hidden="true">←</span>
					<span>back</span>
				</a>
			{:else}
				<span class="rank-nav__item rank-nav__item--prev rank-nav__item--empty"></span>
			{/if}
			{#if collectionNav.next}
				<a class="rank-nav__item rank-nav__item--next" href="/{collectionNav.next.path}" aria-label="Next: {collectionNav.next.title}">
					<span>next</span>
					<span class="rank-nav__arrow" aria-hidden="true">→</span>
				</a>
			{:else}
				<span class="rank-nav__item rank-nav__item--next rank-nav__item--empty"></span>
			{/if}
		</nav>
	{/if}
{/if}

{#if data.bodyHtml}
	<div class="collection-body prose">{@html data.bodyHtml}</div>
	{#if !hasViewToggle}
		<div class="bt-fleuron" aria-hidden="true">
			<span class="bt-fleuron__rule"></span>
			{#if ornamentSvg}
				<span class="bt-fleuron__glyph bt-fleuron__glyph--svg">{@html ornamentSvg}</span>
			{:else}
				<span class="bt-fleuron__glyph"></span>
			{/if}
			<span class="bt-fleuron__rule"></span>
		</div>
	{/if}
{/if}

{#if data.flat.length === 0}
	<p class="empty">
		<em>No {data.label.plural.toLowerCase()} have been recorded yet.</em>
	</p>
{:else}
	{#if hasViewToggle}
		<!-- Toolbar above the two-column body. Result count anchors
		     the left edge as a quiet tally; the view-toggle on the
		     right switches the *shape* of the index (Index/Tree/Flat
		     /Orbits) — fundamentally different from the filter
		     dimensions in the sidebar, so it lives here as a "page
		     mode" control instead of being mixed in with kind /
		     folder / tag filters. -->
		<div class="toolbar">
			<span class="toolbar-count">
				{filterEntitySet.length}
				{filterEntitySet.length === 1 ? 'entry' : 'entries'}
			</span>
			<div class="filter-group view-toggle" role="group" aria-label="View mode">
				<button
					type="button"
					class="filter"
					class:active={viewMode === 'index'}
					onclick={() => (viewMode = 'index')}
				>
					Index
				</button>
				{#if hasSubcollections}
					<button
						type="button"
						class="filter"
						class:active={viewMode === 'tree'}
						onclick={() => (viewMode = 'tree')}
					>
						Tree
					</button>
				{/if}
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
		</div>
	{/if}

	<div class="layout">
		<div class="content">
			{#if visibleSubcollections.length > 0}
				<section class="subcollections" aria-label="Subcollections">
					<ul class="subcollection-list">
						{#each visibleSubcollections as sub (sub.type)}
			<li class="subcollection">
				<a class="subcollection-link" class:bt-meta-link={sub.isCluster} href={`/${sub.type}`}>
					<div class="subcollection-eyebrow">
						<span class="subcollection-tag">{sub.isCluster ? 'Cluster' : 'Collection'}</span>
										{#if sub.rank != null && data.subcollectionRankDisplay !== 'none'}
											<span class="subcollection-count">{data.subcollectionRankDisplay === 'roman' ? toRoman(sub.rank) : sub.rank}</span>
										{/if}
									</div>
									<h3 class="subcollection-label">{sub.plural}</h3>
						</a>
					{#if sub.description && !sub.isCluster}
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

	{#if viewMode === 'index' && data.subShelves.length > 0}
		<section class="subcollections sub-shelves" aria-label="Sub-shelves">
			<ul class="subcollection-list">
				{#each data.subShelves as sub (sub.type)}
					<li class="subcollection">
						<a class="subcollection-link" href={`/${sub.type}`}>
							<div class="subcollection-eyebrow">
								<span class="subcollection-tag">Collection</span>
							</div>
							<h3 class="subcollection-label">{sub.plural}</h3>
						</a>
						{#if sub.description}
							<p class="subcollection-description">{sub.description}</p>
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
				rank={node.container.rank}
				rankDisplay={data.entityRankDisplay}
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

	{#if visibleSubcollectionTrees.length > 0}
		<section class="subcollection-trees" aria-label="Subcollection trees">
			{#each visibleSubcollectionTrees as sub (sub.path)}
				<section class="subcollection-tree" aria-label={sub.headlineEntity?.name ?? sub.plural}>
					{#if sub.headlineEntity}
					<EntityCard
						id={sub.headlineEntity.id}
						name={sub.headlineEntity.name}
						type={data.label.singular}
						kind={sub.headlineEntity.kind}
						summaryHtml={sub.headlineEntity.summaryHtml}
						tags={sub.headlineEntity.tags}
					era={sub.headlineEntity.era}
					sigil={sub.headlineEntity.sigil}
					rank={sub.headlineEntity.rank}
					rankDisplay={data.entityRankDisplay}
				/>
					{:else}
						<header class="subcollection-tree-heading">
							<h2>
								<a href={`/${sub.path}`}>{sub.plural}</a>
							</h2>
							{#if sub.description}
								<p class="subcollection-tree-description">{sub.description}</p>
							{/if}
						</header>
					{/if}
					{#if sub.roots.length > 0}
						<div class="subcollection-tree-children">
							{#each sub.roots as root (root.container.id)}
								{@render containerTree(root)}
							{/each}
						</div>
					{/if}
				</section>
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
		rank={node.entity.rank}
		rankDisplay={data.entityRankDisplay}
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
			rank={entity.rank}
			rankDisplay={data.entityRankDisplay}
			/>
		{/each}
		</div>
	{/if}
	</div><!-- /.content -->

		<!-- Filter sidebar: three sectioned groups (Kind, Folder,
		     Tags), each with a small-caps eyebrow label and a
		     stack of pill chips. Mirrors the entity-page sidebar
		     register so collection and entity pages read as the
		     same family. Sticks below the masthead while scrolling
		     a long index. -->
		{#if kindCounts.length > 1 || visibleFolders.length > 0 || availableTags.length > 0}
			<aside class="sidebar" aria-label="Filters">
				{#if kindCounts.length > 1}
					<section class="filter-section" aria-label="Filter by kind">
						<h3 class="filter-eyebrow">Kind</h3>
						<div class="filter-stack" role="group">
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
					</section>
				{/if}

				{#if visibleFolders.length > 0}
					<section class="filter-section" aria-label="Filter by folder">
						<h3 class="filter-eyebrow">Folder</h3>
						<div class="filter-stack" role="group">
							<button
								type="button"
								class="filter"
								class:active={activeFolder === null}
								onclick={() => (activeFolder = null)}
							>
								All
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
					</section>
				{/if}

				{#if availableTags.length > 0}
					<section class="filter-section" aria-label="Filter by tag">
						<h3 class="filter-eyebrow">Tags</h3>
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
					</section>
				{/if}
			</aside>
		{/if}
	</div><!-- /.layout -->
{/if}

<style>
	.rank-nav {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		max-width: var(--prose-max);
		margin: 0 auto var(--space-6);
		gap: var(--space-4);
	}

	.rank-nav__item {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4em;
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	a.rank-nav__item:hover {
		color: var(--accent-warm);
	}

	.rank-nav__item--empty {
		pointer-events: none;
	}

	.rank-nav__arrow {
		font-variant: normal;
		letter-spacing: 0;
	}

	.rank-nav__item--prev { text-align: left; }
	.rank-nav__item--next { text-align: right; margin-left: auto; }

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: var(--space-5) var(--space-6);
	}

	.empty {
		color: var(--ink-faint);
	}

	/* Collection page subtitle: centre the description rather than
	   inherit PageHeader's left-aligned subtitle. Collection
	   descriptions are typically short taglines, not multi-line
	   prose, so centring reads as editorial chapter copy rather
	   than an awkwardly-floated paragraph. */
	.collection-header :global(.subtitle) {
		text-align: center;
		max-width: 32rem;
	}

	.collection-body {
		max-width: var(--prose-max);
		color: var(--ink);
		margin: 0 auto var(--space-6);
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

	/* Toolbar above the two-column body. Result count anchors the
	   left edge as a quiet tally; the view-toggle pill row anchors
	   the right. The toolbar carries the bottom rule that used to
	   sit on the old `.filters` row, signalling "header above /
	   index below". */
	.toolbar {
		--layout-max: min(88rem, calc(100vw - 2 * var(--space-8)));
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3) var(--space-5);
		margin: 0 0 var(--space-5) 0;
		padding-bottom: var(--space-3);
		position: relative;
		width: var(--layout-max);
		margin-inline: calc((100% - var(--layout-max)) / 2);
	}

	/* Gradient divider below the toolbar — fades in from both edges
	   (transparent → var(--rule) → transparent, with the solid
	   stretch running from 20% to 80%) so it reads as drawn-on
	   calligraphy rather than hard UI chrome. */
	.toolbar::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 1px;
		background: linear-gradient(
			to right,
			transparent 0%,
			var(--rule) 20%,
			var(--rule) 80%,
			transparent 100%
		);
	}

	.toolbar-count {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	/* Two-column body: content stream on the left, filter sidebar
	   pinned to the right edge of the page wrapper.

	   Unlike the entity page, the collection content is a card grid
	   (auto-fill, minmax(18rem, 1fr)) — capping it at prose-max
	   would only ever fit two cards. So the content track is
	   flexible and capped wider via --layout-max so three or more
	   cards can sit side-by-side at common laptop widths.

	   The layout intentionally breaks out of <main>'s --page-max
	   cap (negative inline margin) so the sidebar can sit out at
	   the right edge of a wider editorial column.

	   Below 60rem the sidebar stacks above the content. */
	.layout {
		--layout-max: min(88rem, calc(100vw - 2 * var(--space-8)));
		display: grid;
		grid-template-columns: minmax(0, 1fr) 15rem;
		gap: var(--space-6);
		align-items: start;
		width: var(--layout-max);
		margin-inline: calc((100% - var(--layout-max)) / 2);
	}

	.content {
		min-width: 0;
	}

	@media (max-width: 60rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-6);
		}
	}

	/* Filter sidebar: column of sectioned filter groups. Sticks
	   below the masthead while scrolling — long indexes get a
	   persistent filter rail. The sticky offset matches the
	   masthead's resting height plus a hair of breathing room. */
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		font-size: var(--text-sm);
		position: sticky;
		top: calc(var(--space-6) + 4rem);
	}

	@media (max-width: 60rem) {
		.sidebar {
			position: static;
		}
	}

	.filter-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	/* Eyebrow label above each filter group, matching the entity
	   sidebar's group-label register so the two pages share the
	   same small-caps grammar. */
	.filter-eyebrow {
		margin: 0 0 var(--space-1) 0;
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		font-weight: 500;
	}

	/* Vertical chip stack: one pill per line, left-aligned. The
	   pills keep their pill geometry from the inline row but each
	   sits on its own row so a long list scans top-down rather
	   than wrapping awkwardly inside the narrow sidebar. */
	.filter-stack {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
	}

	.filter-group {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	.view-toggle {
		gap: var(--space-2) var(--space-3);
	}

	/* View switcher (INDEX/TREE/FLAT/ORBITS) is UI chrome, not an
	   editorial label — opt out of the small-caps register the
	   kind/tag filters use. */
	.view-toggle .filter {
		font-family: var(--font-display);
		font-variant-caps: normal;
		letter-spacing: 0.01em;
		text-transform: none;
	}

	.filter {
		appearance: none;
		background: transparent;
		border: 0;
		padding: 0.18em 0.7em;
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		color: var(--ink-soft);
		cursor: pointer;
		line-height: 1.6;
		border-radius: 999px;
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}

	.filter:hover {
		color: var(--accent);
		background-color: var(--paper-warm);
	}

	.filter.active {
		color: var(--page);
		background-color: var(--accent);
	}

	.filter.active:hover {
		background-color: var(--accent-soft);
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

	.filter.supertype:hover::before {
		color: var(--accent);
	}

	.filter.supertype.active::before {
		color: var(--page);
		opacity: 0.75;
	}

	.count {
		display: inline-block;
		margin-left: 0.35em;
		padding: 0 0.4em;
		font-size: var(--text-xs);
		color: var(--ink-faint);
		font-variant: tabular-nums;
		border-radius: 999px;
	}

	.filter.active .count {
		background-color: rgba(255, 255, 255, 0.2);
		color: var(--page);
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
		border-radius: 8px;
		transition:
			background-color 200ms ease,
			box-shadow 200ms ease,
			transform 200ms ease;
	}

	.subcollection:hover {
		background-color: var(--paper-warm);
		box-shadow:
			0 1px 1px rgba(120, 90, 60, 0.04),
			0 4px 14px -8px rgba(120, 90, 60, 0.1);
		transform: translateY(-1px);
	}

	.subcollection-link {
		display: block;
		color: inherit;
		text-decoration: none;
		padding-left: var(--space-3);
		border-left: 2px solid var(--accent-warm);
	}

	.subcollection-link.bt-meta-link {
		border-left-color: var(--accent-meta);
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
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-warm) 50%,
			currentColor 58%,
			currentColor 100%
		);
		background-size: 250% 100%;
		background-position: 130% 0;
		background-clip: text;
		-webkit-background-clip: text;
	}

	.subcollection:hover .subcollection-label {
		animation: subcollection-title-gleam 600ms ease-out;
		color: var(--accent);
	}

	@keyframes subcollection-title-gleam {
		0% {
			background-position: 130% 0;
			-webkit-text-fill-color: currentColor;
		}
		15%,
		85% {
			-webkit-text-fill-color: transparent;
		}
		100% {
			background-position: -30% 0;
			-webkit-text-fill-color: currentColor;
		}
	}

	/* Cluster variant — meta-link colours instead of warm gold. */
	.subcollection:has(.bt-meta-link) .subcollection-label {
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-meta) 50%,
			currentColor 58%,
			currentColor 100%
		);
	}

	.subcollection:has(.bt-meta-link):hover .subcollection-label {
		animation: subcollection-title-gleam--meta 600ms ease-out;
		color: var(--accent-meta);
	}

	@keyframes subcollection-title-gleam--meta {
		0% {
			background-position: 130% 0;
			-webkit-text-fill-color: currentColor;
		}
		15%,
		85% {
			-webkit-text-fill-color: transparent;
		}
		100% {
			background-position: -30% 0;
			-webkit-text-fill-color: currentColor;
		}
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
		text-align: justify;
		text-wrap: pretty;
		hyphens: auto;
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

	/* Match EntityCard: drop the per-tag hairline on tile cards;
	   the tile itself has its own hover affordance. */
	.subcollection-tags :global(.tag) {
		border-bottom-color: transparent;
	}

	.subcollection-tags :global(a.tag:hover) {
		border-bottom-color: var(--accent-warm);
	}

	.tag-filter-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-2);
	}

	.tag-chip {
		appearance: none;
		background: transparent;
		border: 0;
		padding: 0.18em 0.7em;
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		color: var(--ink-soft);
		cursor: pointer;
		line-height: 1.6;
		border-radius: 999px;
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}

	.tag-chip:hover {
		color: var(--accent);
		background-color: var(--paper-warm);
	}

	.tag-chip.active {
		color: var(--page);
		background-color: var(--accent);
	}

	.tag-chip.active:hover {
		background-color: var(--accent-soft);
	}

	.tag-chip-count {
		display: inline-block;
		margin-left: 0.4em;
		padding: 0 0.35em;
		font-variant: tabular-nums;
		color: var(--ink-faint);
		border-radius: 999px;
	}

	.tag-chip.active .tag-chip-count {
		background-color: rgba(255, 255, 255, 0.2);
		color: var(--page);
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

	/* Tree view: each subcollection becomes its own section, with
	   a heading that links to the subcollection's page (or its
	   headline entity if the subcollection has one). Sections are
	   separated by a faint top rule so the eye groups each tree
	   independently. */
	.subcollection-trees {
		display: flex;
		flex-direction: column;
		gap: var(--space-7);
		margin: 0 0 var(--space-5) 0;
	}

	.subcollection-tree {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.subcollection-tree + .subcollection-tree {
		border-top: 1px solid var(--rule);
		padding-top: var(--space-6);
	}

	.subcollection-tree-heading {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding-left: var(--space-3);
		border-left: 2px solid var(--accent-warm);
	}

	.subcollection-tree-heading h2 {
		margin: 0;
		font-family: var(--font-serif);
		font-size: var(--text-xl);
		font-weight: 500;
		letter-spacing: 0.01em;
	}

	.subcollection-tree-heading h2 a {
		color: var(--ink);
		text-decoration: none;
	}

	.subcollection-tree-heading h2 a:hover {
		color: var(--accent);
	}

	.subcollection-tree-description {
		margin: 0;
		color: var(--ink-soft);
		font-style: italic;
	}

	/* The descendants under a headline-entity card sit slightly
	   indented so the visual hierarchy reads "this entity, and
	   what lives inside it". Pure-folder sections skip the indent
	   (their heading is just a label, not a container). */
	.subcollection-tree:has(.subcollection-tree-heading) .subcollection-tree-children {
		margin: 0;
	}

	.subcollection-tree-children {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-left: var(--space-4);
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
		font-variant-caps: all-small-caps;
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
		font-variant-caps: all-small-caps;
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
		font-variant-caps: all-small-caps;
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
