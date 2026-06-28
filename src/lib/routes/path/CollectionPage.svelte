<script lang="ts">
	import './CollectionPage.css';
	import { page } from '$app/state';
	import { t } from '$lib/i18n';
	import type { CollectionPageData, ContainerNode, OrbitNode } from './collectionPage.load';
	import CollectionCard from '$lib/components/CollectionCard.svelte';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { buildKindTree, toRoman } from '$lib/types';
	import { translateUrl } from '$lib/cluster';

	let { data }: { data: CollectionPageData } = $props();

	const ui = $derived(t(page.data.world.language));
	const ornamentSvg = $derived(page.data.ornament?.svg ?? null);
	const collectionNav = $derived(data.collectionNav);

	// Show a "focus on <cluster>" hint when the page's content
	// clearly belongs to one cluster but we're in All scope
	// (e.g. /earth/history?scope=all, /aurethia/places?scope=all).
	// BUT: when the path is a cluster-scoped sub-shelf page that has
	// an aggregate equivalent (e.g. /aurethia/people/characters →
	// /people/characters), show a "← View all characters" back-link
	// instead.
	const focusCluster = $derived.by(() => {
		if (page.data.selectedCluster !== null) return null;
		const seg0 = data.type.split('/')[0];
		const ctx = page.data.scopeContext;
		if (!ctx?.clusters.includes(seg0)) return null;
		return seg0;
	});

	// Detect the aggregate equivalent: cluster-prefixed URL with a tail
	// whose first segment is a union shelf. Fires in both scopes:
	// - all-clusters scope (?scope=all): e.g. /aurethia/people?scope=all → /people
	// - focused scope: e.g. /aurethia/people → /people
	const viewAllHref = $derived.by(() => {
		const urlSegs = page.url.pathname.split('/').filter(Boolean);
		// Need at least 2 segments: [cluster, shelf] or [cluster, shelf, subShelf]
		if (urlSegs.length < 2) return null;
		const ctx = page.data.scopeContext;
		// First segment must be a cluster
		if (!ctx?.clusters.includes(urlSegs[0])) return null;
		const tail = urlSegs.slice(1); // e.g. ['people'] or ['people','characters']
		if (tail.length > 2) return null;
		if (!ctx?.unionShelves.includes(tail[0])) return null;
		return `/${tail.join('/')}`;
	});
	const viewAllLabel = $derived.by(() => {
		if (!viewAllHref) return null;
		// Use the page's plural label (e.g. "Characters") from the data.
		const label = data.label?.plural ?? null;
		if (!label) return null;
		return ui.collection_view_all(label);
	});

	// Only show the cluster focus hint when there's no aggregate sub-shelf link.
	const focusHref = $derived.by(() => {
		if (!focusCluster) return null;
		return translateUrl(page.url, focusCluster, page.data.scopeContext);
	});
	const focusClusterLabel = $derived.by(() => {
		if (!focusCluster) return null;
		const clusterName =
			page.data.clusterOptions?.find(
				(o: { value: string; label: string }) => o.value === focusCluster
			)?.label ?? focusCluster;
		return ui.collection_focus_on(clusterName);
	});

	const rankGlyph = $derived(
		collectionNav.rank != null && collectionNav.rankDisplay !== 'none'
			? collectionNav.rankDisplay === 'roman'
				? toRoman(collectionNav.rank)
				: String(collectionNav.rank)
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

	const activeEra = $derived((page.data as { activeEra?: string | null }).activeEra ?? null);

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

	// Map from classId → class entity name, built from data.flat.
	// Used so filter chips show "Human" instead of
	// "foundation/nature/mortals/human".
	const classLabels = $derived.by(() => {
		const m = new Map<string, string>();
		for (const e of data.flat) {
			if (e.classId && e.className) m.set(e.classId, e.className);
		}
		return m;
	});

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
		// Direct counts per filter key. When an entity has a class, the
		// class entity id is the leaf discriminator (e.g. the Human entity
		// id); otherwise fall back to kind. This makes "Human", "Nguwari"
		// etc. appear as filter chips instead of just "person".
		const direct = new Map<string, number>();
		for (const e of filterEntitySet) {
			const k = e.classId ?? e.kind ?? '—';
			direct.set(k, (direct.get(k) ?? 0) + 1);
		}
		// For each direct kind (non-class) in the tree, accumulate ancestor totals.
		const supertypeTotals = new Map<string, number>();
		for (const [kind, count] of direct) {
			if (!kindTree.has(kind)) continue;
			for (const ancestor of kindTree.ancestors(kind)) {
				supertypeTotals.set(ancestor, (supertypeTotals.get(ancestor) ?? 0) + count);
			}
		}
		// Also accumulate ancestor totals for entities whose class maps to
		// a kind in the hierarchy (class entities are not in the kindTree,
		// but their owner's kind is — we look it up from the card).
		for (const e of filterEntitySet) {
			if (!e.classId) continue;
			const k = e.kind ?? '—';
			if (!kindTree.has(k)) continue;
			for (const ancestor of kindTree.ancestors(k)) {
				supertypeTotals.set(ancestor, (supertypeTotals.get(ancestor) ?? 0) + 1);
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

	function matchesKind(card: { kind: string | null; classId?: string | null }): boolean {
		if (activeKind === null) return true;
		// Class id is the leaf key when present.
		const leafKey = card.classId ?? card.kind ?? '—';
		if (leafKey === activeKind) return true;
		// Walk kind ancestors so a supertype chip selects every descendant.
		// Class entities aren't in the kindTree, so we walk ancestors of
		// the entity's kind instead.
		const kindKey = card.kind ?? '—';
		if (!kindTree.has(kindKey)) return false;
		return kindTree.ancestors(kindKey).includes(activeKind);
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

	function matchesEra(card: { era?: string[] | null }): boolean {
		if (activeEra === null) return true; // no filter active
		if (!card.era || card.era.length === 0) return true; // no era = always visible
		return card.era.includes(activeEra);
	}

	function matchesFilters(card: {
		kind: string | null;
		classId?: string | null;
		tags: string[];
		folderPath?: string;
		id: string;
		era?: string[] | null;
	}): boolean {
		return matchesKind(card) && matchesTags(card) && matchesFolder(card) && matchesEra(card);
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
				// Era filter: hide the tile when the active era has zero
				// matching entities AND no era-less (always-visible) entities.
				if (activeEra !== null && filteredCount > 0) {
					const eraCount = (sub.eraCounts?.[activeEra] ?? 0) + (sub.noEraCount ?? 0);
					if (eraCount === 0) filteredCount = 0;
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
		viewAllHref={viewAllHref ?? undefined}
		viewAllLabel={viewAllLabel ?? undefined}
	/>
</div>

<!--
	Collection fleuron: visual signal that this page is a *collection
	landing*, not an entity page. Short rule + ornamental glyph + short
	rule. Glyph resolves to --ornament-glyph (e.g. ✶ in Alteria) so
	each world stamps its own mark. When the token is empty the
	divider collapses to a centred hairline.

	Five cases:
	  prose + toolbar        → fleuron, rank nav, prose, toolbar (gradient rule), grid
	  prose + no toolbar     → fleuron, rank nav, prose, fleuron, grid   (second fleuron added after prose below)
	  no prose + toolbar     → toolbar (gradient rule), grid
	  no prose + no toolbar  → fleuron, rank nav, grid
	  no prose + toolbar + rank nav → fleuron, rank nav, toolbar (gradient rule), grid
-->
{#if data.bodyHtml || !hasViewToggle || collectionNav.prev || collectionNav.next}
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
		<nav class="rank-nav" aria-label={ui.collection_nav_aria}>
			{#if collectionNav.prev}
				<a
					class="rank-nav__item rank-nav__item--prev"
				href="/{collectionNav.prev.path}"
				aria-label={ui.collection_nav_prev_aria(collectionNav.prev.title)}
			>
				<span class="rank-nav__arrow" aria-hidden="true">←</span>
				<span>{ui.collection_nav_prev_label}</span>
				</a>
			{:else}
				<span class="rank-nav__item rank-nav__item--prev rank-nav__item--empty"></span>
			{/if}
			{#if collectionNav.next}
				<a
					class="rank-nav__item rank-nav__item--next"
				href="/{collectionNav.next.path}"
				aria-label={ui.collection_nav_next_aria(collectionNav.next.title)}
			>
				<span>{ui.collection_nav_next_label}</span>
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

{#if data.flat.length === 0 && data.timelines.length === 0}
	<p class="empty">
		<em>{ui.collection_empty(data.label.plural)}</em>
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
				{ui.collection_entries(filterEntitySet.length)}
			</span>
			<div class="filter-group view-toggle" role="group" aria-label={ui.collection_viewmode_aria}>
				<button
					type="button"
					class="filter"
				class:active={viewMode === 'index'}
				onclick={() => (viewMode = 'index')}
			>
				{ui.collection_view_index}
			</button>
				{#if hasSubcollections}
					<button
						type="button"
						class="filter"
					class:active={viewMode === 'tree'}
					onclick={() => (viewMode = 'tree')}
				>
					{ui.collection_view_tree}
				</button>
				{/if}
				<button
					type="button"
					class="filter"
				class:active={viewMode === 'flat'}
				onclick={() => (viewMode = 'flat')}
			>
				{ui.collection_view_flat}
			</button>
				{#if hasOrbits}
					<button
						type="button"
						class="filter"
					class:active={viewMode === 'orbits'}
					onclick={() => (viewMode = 'orbits')}
				>
					{ui.collection_view_orbits}
				</button>
				{/if}
			</div>
		</div>
	{/if}

	<div class="layout">
		<div class="content">
		{#if visibleSubcollections.length > 0 || data.timelines.length > 0}
			<section class="subcollections" aria-label={ui.collection_subcollections_aria}>
				<ul class="subcollection-list">
					{#each visibleSubcollections as sub (sub.type)}
						<CollectionCard
							href={`/${sub.type}`}
							label={sub.plural}
							eyebrow={sub.isCluster ? ui.collection_eyebrow_cluster : ui.collection_eyebrow_collection}
							description={sub.description}
							rank={sub.rank}
							rankDisplay={data.subcollectionRankDisplay}
							tags={sub.displayTags}
							isCluster={sub.isCluster}
						/>
					{/each}
					{#each data.timelines as tl (tl.path)}
						<li class="timeline-tile">
							<a class="timeline-tile__link" href={tl.href}>
								<!-- Mini timeline: vertical spine with first/last dots -->
								<div class="timeline-tile__spine" aria-hidden="true">
									<div class="timeline-tile__line"></div>
									{#if tl.firstYear !== null}
										<div class="timeline-tile__dot timeline-tile__dot--first"></div>
									{/if}
									{#if tl.lastYear !== null && tl.lastYear !== tl.firstYear}
										<div class="timeline-tile__dot timeline-tile__dot--last"></div>
									{/if}
								</div>
								<div class="timeline-tile__body">
									<div class="timeline-tile__eyebrow">
										{#if tl.firstYear !== null && tl.lastYear !== null && tl.firstYear !== tl.lastYear}
											{tl.firstYear} – {tl.lastYear}
										{:else if tl.firstYear !== null}
											{tl.firstYear}
										{:else}
											&nbsp;
										{/if}
									</div>
									<h3 class="timeline-tile__label">{tl.title}</h3>
								</div>
							</a>
							{#if tl.summary}
								<p class="timeline-tile__description">{tl.summary}</p>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if viewMode === 'index' && data.subShelves.length > 0}
			<section class="subcollections sub-shelves" aria-label={ui.collection_subshelves_aria}>
				<ul class="subcollection-list">
					{#each data.subShelves as sub (sub.type)}
						<CollectionCard
							href={`/${sub.type}`}
							label={sub.plural}
							eyebrow={ui.collection_eyebrow_collection}
							description={sub.description}
						/>
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
								<a class="cross-link" href={`/${node.container.crossLinkId}`}>{ui.collection_see_entity}</a>
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
				<section class="containers" aria-label={ui.collection_containers_aria}>
					{#each visibleContainers as group (group.container.id)}
						{@render containerTree(group)}
					{/each}
				</section>
			{/if}

			{#if visibleSubcollectionTrees.length > 0}
				<section class="subcollection-trees" aria-label={ui.collection_subtrees_aria}>
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
				<section class="orbits" aria-label={ui.collection_orbits_aria}>
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
							classLabel={entity.className}
							classHref={entity.classHref}
						/>
					{/each}
				</div>
			{/if}
		</div>
		<!-- /.content -->

		<!-- Filter sidebar: three sectioned groups (Kind, Folder,
		     Tags), each with a small-caps eyebrow label and a
		     stack of pill chips. Mirrors the entity-page sidebar
		     register so collection and entity pages read as the
		     same family. Sticks below the masthead while scrolling
		     a long index. -->
		{#if kindCounts.length > 1 || visibleFolders.length > 0 || availableTags.length > 0}
			<aside class="sidebar" aria-label={ui.collection_filters_aria}>
				{#if kindCounts.length > 1}
				<section class="filter-section" aria-label={ui.collection_filter_kind_aria}>
					<h3 class="filter-eyebrow">{ui.collection_filter_kind_label}</h3>
						<div class="filter-stack" role="group">
							<button
								type="button"
								class="filter"
						class:active={activeKind === null}
							onclick={() => (activeKind = null)}
						>
							{ui.collection_filter_all} <span class="count">{filterEntitySet.length}</span>
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
									{classLabels.get(kind) ?? kind}{#if info.supertype}<span class="count">{info.count}</span>{/if}
								</button>
							{/each}
						</div>
					</section>
				{/if}

				{#if visibleFolders.length > 0}
				<section class="filter-section" aria-label={ui.collection_filter_folder_aria}>
					<h3 class="filter-eyebrow">{ui.collection_filter_folder_label}</h3>
						<div class="filter-stack" role="group">
							<button
								type="button"
								class="filter"
						class:active={activeFolder === null}
							onclick={() => (activeFolder = null)}
						>
							{ui.collection_filter_all}
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
				<section class="filter-section" aria-label={ui.collection_filter_tag_aria}>
					<h3 class="filter-eyebrow">{ui.collection_filter_tag_label}</h3>
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
									{ui.collection_filter_more(hiddenTagCount)}
								</button>
								</li>
							{/if}
							{#if showAllTags && availableTags.length > FILTER_TOP_N}
								<li>
							<button type="button" class="tag-more" onclick={() => (showAllTags = false)}>
									{ui.collection_filter_fewer}
								</button>
								</li>
							{/if}
							{#if activeTags.size > 0}
								<li>
									<button type="button" class="tag-clear" onclick={clearTags}>{ui.collection_filter_clear}</button>
								</li>
							{/if}
						</ul>
					</section>
				{/if}
			</aside>
		{/if}
	</div>
	<!-- /.layout -->
{/if}
