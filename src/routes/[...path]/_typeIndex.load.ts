import { graph } from '$lib/server/graph';
import { renderSummary } from '$lib/server/markdown';
import type { Entity, EntityId, EntityType } from '$lib/types';

type Card = ReturnType<typeof toCard>;
export type ContainerNode = { container: Card; children: ContainerNode[] };
export type OrbitNode = { entity: Card; children: OrbitNode[]; order?: number };

/**
 * Structural ("gravitational") relation kinds that build the orbits
 * tree. Both encode the same shape: child *belongs to* / *orbits*
 * parent. We treat them uniformly when walking the tree.
 */
const ORBIT_KINDS = new Set(['member-of', 'orbits']);
/**
 * Build the view-model for a type-index page. Caller has already
 * verified that `type` is a known type via `graph.hasType`.
 *
 * A type-index lists three kinds of things, top to bottom:
 *
 *   • **Subtypes section** — links to direct subtypes (entities
 *     under a `_type.yaml` child folder). These get their own
 *     index page; we only advertise them here.
 *   • **Containers section** — entities that physically nest other
 *     entities of the same type beneath them on disk (e.g.
 *     `places/bayurinda/` containing `nuunlau` and
 *     `bayurinda-archipelago`). Each container is shown with its
 *     nested children inline. Only used in nested view-mode.
 *   • **Entity grid** — the flat list of entities. In nested mode
 *     this is restricted to standalone entities of this exact type
 *     (no parent, no children); in flat mode it is every entity
 *     under this type at any depth, *including* descendants of
 *     subtypes, so e.g. /culture flat mode inlines languages with
 *     direct culture entities.
 *
 * The kind-filter at the top of the page applies to everything,
 * regardless of view-mode.
 */
export function loadTypeIndex(type: EntityType) {
	const info = graph.typeInfo(type);
	const entities = graph.byType(type).sort((a, b) => a.meta.name.localeCompare(b.meta.name));

	const resolveLink = (path: string) => graph.resolveLink(path);
	const languageCodes = graph.languageCodes();
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true }) : null;

	const subtypes = graph
		.subtypesOf(type)
		.map((sub) => {
			// Include entities at any depth under the subtype, since
			// the user is browsing "everything of this kind".
			const subEntities = graph.byTypeRecursive(sub.type);
			// Distribution of `kind` values across the subtype's
			// entities, so the page-level kind filter can hide /
			// re-count subtype tiles in sync with the rest.
			const kindCounts: Record<string, number> = {};
			// Tag aggregation: overall counts, plus per-kind counts
			// so the tile can show kind-filtered tags when the page
			// kind filter is active. Each map: tag -> entity count.
			const tagCounts = new Map<string, number>();
			const tagsByKind: Record<string, Map<string, number>> = {};
			for (const e of subEntities) {
				const k = typeof e.meta.kind === 'string' ? e.meta.kind : '—';
				kindCounts[k] = (kindCounts[k] ?? 0) + 1;
				const kindMap = (tagsByKind[k] ??= new Map<string, number>());
				for (const t of e.meta.tags ?? []) {
					tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
					kindMap.set(t, (kindMap.get(t) ?? 0) + 1);
				}
			}
			return {
				type: sub.type,
				singular: sub.labels.singular,
				plural: sub.labels.plural,
				description: sub.description,
				count: subEntities.length,
				kindCounts,
				tags: rankTags(tagCounts),
				tagsByKind: Object.fromEntries(Object.entries(tagsByKind).map(([k, m]) => [k, rankTags(m)]))
			};
		})
		.sort((a, b) => a.plural.localeCompare(b.plural));

	// All entities of this exact type get flattened to cards once;
	// the view decides which slots they appear in based on view-mode.
	const cards = entities.map((e) => toCard(e, cardSummaryHtml));

	// Descendants: every entity under this type at any depth (recurses
	// through subtypes). Used by flat view-mode so a user browsing
	// `/culture` can see all languages inlined with direct culture
	// entities. Sorted by name; subtype-membership is conveyed by the
	// `type` label on each card.
	const descendants = graph
		.byTypeRecursive(type)
		.filter((e) => e.type !== type)
		.map((e) => toCard(e, cardSummaryHtml, labelForType(e.type)));
	const flatAll = [...cards, ...descendants].sort((a, b) => a.name.localeCompare(b.name));

	// Containers: a recursive tree of entities of *this exact type*
	// that physically nest other entities of the same type beneath
	// them on disk. Roots are entities whose parent is not itself an
	// entity of this same type (so e.g. for `/places`, Bayurinda is a
	// root because its parent is the type folder, but Nuunlau is not
	// — it appears as a child of Bayurinda, and Bal Rochan appears as
	// a child of Nuunlau). Each node carries the same card payload as
	// `flat` plus a `children` array for further nesting.
	const containedIds = new Set<string>();
	const buildNode = (e: Entity): ContainerNode => {
		containedIds.add(e.id);
		const children = e.children
			.map((cid) => graph.get(cid))
			.filter((c): c is Entity => !!c && c.type === type)
			.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
			.map(buildNode);
		return { container: toCard(e, cardSummaryHtml), children };
	};
	const containers = entities
		.filter((e) => {
			if (e.children.length === 0) return false;
			// Only roots: parent must not be a same-type entity. (If
			// there's no parent at all, or the parent has a different
			// type, this node is a root.)
			if (!e.parent) return true;
			const parent = graph.get(e.parent);
			return !parent || parent.type !== type;
		})
		.map(buildNode)
		// After buildNode runs we know if a "container" still has any
		// same-type descendants worth showing.
		.filter((n) => n.children.length > 0);

	// `standalone` = entities of this exact type not appearing
	// anywhere in the container tree.
	const standalone = cards.filter((c) => !containedIds.has(c.id));

	// Orbits tree: walks `member-of` and `orbits` edges across types,
	// producing the gravitational shape — systems containing stars +
	// planets, planets containing moons. Roots are entities whose
	// outgoing structural edges go nowhere (no parent in this
	// graph). We only emit trees that include at least one entity of
	// the current type's recursive set, so the view shows up only
	// where it has something to say. (For `/places`, that means
	// systems show up because they contain planets; for `/cosmology`,
	// systems show up because they *are* cosmology entities.)
	const orbits = buildOrbitsTree(type, cardSummaryHtml);

	return {
		kind: 'type' as const,
		type,
		label: info.labels,
		description: info.description,
		subtypes,
		containers,
		standalone,
		orbits,
		// `flat` is the full list in display order — used when the
		// user switches to flat view. Includes descendants of subtypes
		// so e.g. /culture in flat mode shows languages inline.
		flat: flatAll
	};
}

export type TypeIndexData = ReturnType<typeof loadTypeIndex>;

/**
 * View-model for the global "everything" index — every entity in
 * the graph, filterable by type/kind/tag and switchable between a
 * nested view (top-level types as collection tiles + standalone
 * entities) and a flat view (one big grid).
 *
 * Reuses the same `TypeIndexData` shape as type-scoped indexes, so
 * the same `TypeIndex.svelte` component can render both. Differences
 * from a type-scoped load:
 *
 *   • `subtypes` is filled with every top-level type (Beings,
 *     Characters, …), so the collection tiles become "browse by
 *     type" rather than "browse by subtype within this type".
 *   • `containers` is always empty: container-style nesting only
 *     makes sense within a single type's namespace.
 *   • Every card carries its `typeLabel` so the grid shows what
 *     kind of entity each one is.
 */
export function loadEverythingIndex() {
	const resolveLink = (path: string) => graph.resolveLink(path);
	const languageCodes = graph.languageCodes();
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true }) : null;

	// Top-level types become the "collection" tiles. Each tile gets
	// recursive entities under that type (so e.g. Culture covers
	// languages too) and the same tag-rollup the per-type loader
	// builds for its subtypes.
	const subtypes = graph
		.topLevelTypes()
		.filter((t) => graph.byTypeRecursive(t.type).length > 0)
		.map((t) => {
			const subEntities = graph.byTypeRecursive(t.type);
			const kindCounts: Record<string, number> = {};
			const tagCounts = new Map<string, number>();
			const tagsByKind: Record<string, Map<string, number>> = {};
			for (const e of subEntities) {
				const k = typeof e.meta.kind === 'string' ? e.meta.kind : '—';
				kindCounts[k] = (kindCounts[k] ?? 0) + 1;
				const kindMap = (tagsByKind[k] ??= new Map<string, number>());
				for (const tag of e.meta.tags ?? []) {
					tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
					kindMap.set(tag, (kindMap.get(tag) ?? 0) + 1);
				}
			}
			return {
				type: t.type,
				singular: t.labels.singular,
				plural: t.labels.plural,
				description: t.description,
				count: subEntities.length,
				kindCounts,
				tags: rankTags(tagCounts),
				tagsByKind: Object.fromEntries(Object.entries(tagsByKind).map(([k, m]) => [k, rankTags(m)]))
			};
		})
		.sort((a, b) => a.plural.localeCompare(b.plural));

	// Every entity in the graph, each tagged with its type label so
	// the card eyebrow shows what *kind of thing* it is.
	const allCards = graph
		.all()
		.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
		.map((e) => toCard(e, cardSummaryHtml, labelForType(e.type)));

	return {
		kind: 'type' as const,
		// `type` is conventionally a path here; the everything page has
		// no type path. The view doesn't use it directly when subtypes
		// are top-level types; keeping the field present so the type
		// matches.
		type: '' as EntityType,
		label: { singular: 'Entry', plural: 'Everything' },
		description: 'Every entry in Alteria, in one place. Filter or flatten to taste.',
		subtypes,
		containers: [] as ContainerNode[],
		orbits: [] as OrbitNode[],
		// In nested view every entity belongs to one of the
		// top-level-type collection tiles, so the standalone grid is
		// empty — the user sees only the tiles. Flat view drops the
		// tiles and shows everything in one grid instead.
		standalone: [] as typeof allCards,
		flat: allCards
	};
}

function labelForType(type: EntityType): string {
	try {
		return graph.typeInfo(type).labels.singular;
	} catch {
		return type;
	}
}

/**
 * Convert a tag-count map into a sorted array. Sort is by count
 * descending, breaking ties alphabetically — so the most-used tags
 * lead, with stable order for equally-common ones.
 */
function rankTags(counts: Map<string, number>): Array<{ label: string; count: number }> {
	return [...counts.entries()]
		.map(([label, count]) => ({ label, count }))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function toCard(
	e: Entity,
	cardSummaryHtml: (s: string | null | undefined) => string | null,
	typeLabel?: string
) {
	return {
		id: e.id,
		slug: e.slug,
		name: e.meta.name,
		summary: e.meta.summary ?? null,
		summaryHtml: cardSummaryHtml(e.meta.summary),
		tags: e.meta.tags ?? [],
		era: e.meta.era ?? null,
		kind: typeof e.meta.kind === 'string' ? e.meta.kind : null,
		sigil: typeof e.meta.sigil === 'string' ? e.meta.sigil : null,
		typeLabel: typeLabel ?? null
	};
}

/**
 * Display order for siblings inside an orbit group. Sort precedence:
 *
 *   1. **Explicit `order`** on the relation edge — the body's
 *      canonical slot in its system (innermost = 0, then outward).
 *      Entities with an explicit order always sort before entities
 *      without one.
 *   2. **Cosmological role** — centre outward — for entities that
 *      *don't* carry an explicit order. Star, black-hole, planet,
 *      moon, then anything else.
 *   3. **Alphabetical** by name, as the final tie-break.
 */
const ORBIT_KIND_ORDER: readonly string[] = ['star', 'black-hole', 'planet', 'moon'];

function orbitKindRank(kind: string | null): number {
	if (!kind) return ORBIT_KIND_ORDER.length;
	const idx = ORBIT_KIND_ORDER.indexOf(kind);
	return idx === -1 ? ORBIT_KIND_ORDER.length : idx;
}

function compareOrbitNodes(a: OrbitNode, b: OrbitNode): number {
	const aHas = a.order !== undefined;
	const bHas = b.order !== undefined;
	if (aHas && bHas) return (a.order as number) - (b.order as number);
	if (aHas) return -1;
	if (bHas) return 1;
	const rankDiff = orbitKindRank(a.entity.kind) - orbitKindRank(b.entity.kind);
	if (rankDiff !== 0) return rankDiff;
	return a.entity.name.localeCompare(b.entity.name);
}

/**
 * Walk `member-of` and `orbits` edges to produce the gravitational
 * tree visible from a type-index page.
 *
 * Strategy:
 *   1. Find every entity that participates in any structural edge
 *      (either side). This is the "orbital universe".
 *   2. Within that universe, an entity is a *root* if its outgoing
 *      structural edges all point outside the universe — i.e. it
 *      has no structural parent. Stars, systems, and free-floating
 *      planets are roots.
 *   3. Recursively descend each root by following *incoming*
 *      structural edges (the children — "what orbits/is-a-member-of
 *      me").
 *   4. Keep only trees that touch the current type. We test this by
 *      asking whether any entity in the tree has the page's type as
 *      an ancestor in the type hierarchy. For `/cosmology`, systems
 *      themselves match; for `/places`, planets match.
 */
function buildOrbitsTree(
	pageType: EntityType,
	cardSummaryHtml: (s: string | null | undefined) => string | null
): OrbitNode[] {
	const universe = new Set<EntityId>();
	for (const e of graph.all()) {
		const structuralOut = graph.outEdges(e.id).filter((edge) => ORBIT_KINDS.has(edge.kind));
		const structuralIn = graph.inEdges(e.id).filter((edge) => ORBIT_KINDS.has(edge.kind));
		if (structuralOut.length > 0 || structuralIn.length > 0) universe.add(e.id);
	}

	if (universe.size === 0) return [];

	const isRoot = (id: EntityId): boolean => {
		const out = graph.outEdges(id).filter((edge) => ORBIT_KINDS.has(edge.kind));
		// A root has no structural parent in the universe. If every
		// structural-out edge points to something the universe doesn't
		// contain (which shouldn't happen given how we built it, but
		// defensively), still treat it as a root.
		return out.every((edge) => !universe.has(edge.to));
	};

	const build = (id: EntityId, order: number | undefined, seen: Set<EntityId>): OrbitNode | null => {
		const entity = graph.get(id);
		if (!entity) return null;
		if (seen.has(id)) return null; // cycle guard
		const nextSeen = new Set(seen).add(id);
		const childEdges = graph.inEdges(id).filter((edge) => ORBIT_KINDS.has(edge.kind));
		const children = childEdges
			.map((edge) => build(edge.from, edge.order, nextSeen))
			.filter((c): c is OrbitNode => c !== null)
			.sort(compareOrbitNodes);
		return {
			entity: toCard(entity, cardSummaryHtml, labelForType(entity.type)),
			children,
			order
		};
	};

	const roots = [...universe]
		.filter(isRoot)
		.map((id) => build(id, undefined, new Set()))
		.filter((n): n is OrbitNode => n !== null)
		.sort(compareOrbitNodes);

	// Keep only trees that touch the page's type. The page-type's
	// recursive set defines "this page is about these entities";
	// trees that have no overlap aren't relevant here.
	const pageEntityIds = new Set(graph.byTypeRecursive(pageType).map((e) => e.id));
	const treeTouches = (node: OrbitNode): boolean => {
		if (pageEntityIds.has(node.entity.id)) return true;
		return node.children.some(treeTouches);
	};
	const keptRoots = roots.filter(treeTouches);

	// Detect whether this page is the *home* of the orbits graph:
	// the page where every root entity belongs to the page's type
	// (e.g. on /cosmology, every system root is a cosmology
	// entity). On the home page, the full tree renders — the view
	// is showing you the actual shape of the cosmos, and pruning
	// nodes that "belong somewhere else" doesn't apply because
	// nothing does.
	//
	// On a non-home page (e.g. /places), the orbits view is
	// borrowing the structural shape to organise the page's
	// entities. There, internal nodes that aren't of the page's
	// type get pruned with promotion — their children flow up to
	// the parent's level. Root entities stay regardless of type
	// because they're the scaffolding that labels what the page's
	// entities belong to.
	const isOrbitHome = keptRoots.every((root) => pageEntityIds.has(root.entity.id));

	if (isOrbitHome) return keptRoots;

	const pruneInternals = (children: OrbitNode[]): OrbitNode[] => {
		const out: OrbitNode[] = [];
		for (const child of children) {
			const promotedChildren = pruneInternals(child.children);
			if (pageEntityIds.has(child.entity.id)) {
				out.push({ entity: child.entity, children: promotedChildren, order: child.order });
			} else {
				// Drop this node; promote its already-pruned children.
				// Note: a promoted child's `order` was authored
				// relative to its dropped parent's siblings; at the
				// promoted level it may collide or lose meaning. In
				// practice this only happens when an internal
				// non-page-type node has page-type descendants, which
				// the current content doesn't exercise. If it ever
				// does, the right fix is to strip `order` on
				// promotion — losing the canonical order is honest
				// when the level it belongs to has been removed.
				out.push(...promotedChildren);
			}
		}
		return out.sort(compareOrbitNodes);
	};

	return keptRoots.map((root) => ({
		entity: root.entity,
		children: pruneInternals(root.children),
		order: root.order
	}));
}
