import { graph } from '$lib/server/graph';
import { renderEntityBody, renderSummary } from '$lib/server/markdown';
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
 *     `places/celestial-bodies/planets/bayurinda/` containing `nuunlau` and
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
	const typeMetaForKind = graph.typeMetaRaw(type);
	const folderKind = typeof typeMetaForKind?.kind === 'string' ? typeMetaForKind.kind : null;

	// If this folder declares a `kind:` in its `_type.yaml`, treat it
	// as a *supertype* folder. The folder's own self-page entity
	// (whose id equals the folder path) becomes the page's header
	// prose (its `summary` overrides the type description); all
	// entities whose kind descends from `folderKind` get pulled in
	// alongside the folder's direct children. The self-page itself
	// is filtered out of the entity grid — it *is* the page.
	const selfPage = folderKind ? (graph.get(type) ?? null) : null;
	const descendantKindEntities = folderKind
		? graph.byKindRecursive(folderKind).filter((e) => e.id !== type)
		: [];

	// Direct children of the folder, sorted by name. The self-page
	// (which lives at the folder root) is excluded from the grid.
	const entities = graph
		.byType(type)
		.filter((e) => e.id !== type)
		.sort((a, b) => a.meta.name.localeCompare(b.meta.name));

	const resolveLink = (path: string) => graph.resolveLink(path);
	const languageCodes = graph.languageCodes();
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true }) : null;

	// On supertype folders, render the self-page's `index.md` body
	// using the same pipeline entity pages use, so wikilinks and
	// language tags resolve identically. The view drops it in
	// between the page description and the entity grids.
	const selfBodyHtml =
		selfPage && selfPage.body.trim()
			? renderEntityBody(selfPage, resolveLink, languageCodes)
			: null;

	// The bucket is the path segment(s) between the type root and
	// the entity slug: `places/regions/bayurinda/nuunlau` under
	// type `places/regions` gives bucket `bayurinda`. An entity
	// whose id doesn't live under the current type (e.g. a
	// kind-gathered entity from another folder) returns `''`,
	// meaning "no folder grouping here". Same logic is used by
	// the page-level folder chips and the folder-container
	// grouping below.
	const pathBucket = (id: EntityId): string => {
		if (!id.startsWith(`${type}/`)) return '';
		const rest = id.slice(type.length + 1);
		const lastSlash = rest.lastIndexOf('/');
		return lastSlash < 0 ? '' : rest.slice(0, lastSlash);
	};

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
	const cards = entities.map((e) => toCard(e, cardSummaryHtml, undefined, pathBucket(e.id)));

	// Descendants: every entity under this type at any depth (recurses
	// through subtypes). Used by flat view-mode so a user browsing
	// `/culture` can see all languages inlined with direct culture
	// entities. Sorted by name; subtype-membership is conveyed by the
	// `type` label on each card.
	const descendants = graph
		.byTypeRecursive(type)
		.filter((e) => e.type !== type)
		.map((e) => toCard(e, cardSummaryHtml, labelForType(e.type), pathBucket(e.id)));

	// Supertype gather: entities whose `kind` descends from this
	// folder's declared `kind`, but which live in some other folder
	// in the type tree (e.g. planets and moons under `/places` when
	// the page is `places/celestial-bodies`). Each one shows its
	// home type as the eyebrow so the reader knows where it lives.
	const kindGathered = descendantKindEntities
		.filter((e) => !graph.byTypeRecursive(type).some((local) => local.id === e.id))
		.map((e) => toCard(e, cardSummaryHtml, labelForType(e.type), pathBucket(e.id)));

	const flatAll = [...cards, ...descendants, ...kindGathered].sort((a, b) =>
		a.name.localeCompare(b.name)
	);

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
		return { container: toCard(e, cardSummaryHtml, undefined, pathBucket(e.id)), children };
	};
	let containers = entities
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
	// anywhere in the container tree. On supertype folders, also
	// includes the kind-gathered entities from other folders — they
	// have no container relationship here, but they're conceptually
	// part of this page's collection.
	let standalone = [...cards.filter((c) => !containedIds.has(c.id)), ...kindGathered];

	// Folder-container grouping. Some types organise entities by
	// dropping them into purely-structural directories under the
	// type root (e.g. `content/places/regions/bayurinda/nuunlau/`,
	// where `bayurinda/` is just a grouping folder, not an entity).
	// For nested view we wrap any entity-container OR standalone
	// entity whose path-parent is one of these folders in a
	// synthetic folder-container node, so the user sees the same
	// "Within Bayurinda" grouping the filesystem implies.
	//
	// `pathBucket` (defined near the top of this function) maps an
	// id to its bucket. An empty bucket means the entity lives
	// directly under the type and needs no wrapping.

	// Group same-type containers + standalone cards into buckets by
	// path-parent folder.
	const containerBuckets = new Map<string, ContainerNode[]>();
	const loneBuckets = new Map<string, Card[]>();
	const rootContainers: ContainerNode[] = [];
	const rootStandalone: Card[] = [];

	for (const node of containers) {
		const b = pathBucket(node.container.id);
		if (b === '') {
			rootContainers.push(node);
		} else {
			if (!containerBuckets.has(b)) containerBuckets.set(b, []);
			containerBuckets.get(b)!.push(node);
		}
	}
	for (const card of standalone) {
		const b = pathBucket(card.id);
		if (b === '') {
			rootStandalone.push(card);
		} else {
			if (!loneBuckets.has(b)) loneBuckets.set(b, []);
			loneBuckets.get(b)!.push(card);
		}
	}

	// Build a synthetic folder-container for each bucket. Children
	// are the entity-containers (with their own nested structure
	// intact) plus the standalone entities (wrapped as leaf nodes).
	// Suffix-match resolves the folder slug to an entity elsewhere
	// in the graph (e.g. the planet of the same name), surfacing
	// its name on the heading; falling back to a prettified slug.
	const allBuckets = new Set<string>([...containerBuckets.keys(), ...loneBuckets.keys()]);
	const folderContainers: ContainerNode[] = [...allBuckets]
		.sort()
		.map((bucket) => {
			const folderId = `${type}/${bucket}`;
			const slug = bucket.slice(bucket.lastIndexOf('/') + 1);
			const resolved = graph.resolveLink(slug);
			const linked = resolved && resolved !== folderId ? graph.get(resolved) : null;
			const name =
				linked?.meta.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
			const synth: Card = {
				id: folderId,
				slug,
				name,
				summary: null,
				summaryHtml: null,
				tags: [],
				era: null,
				kind: null,
				sigil: null,
				typeLabel: null,
				folderPath: bucket,
				synthetic: true,
				crossLinkId: linked?.id ?? null
			};
			const bucketContainers = containerBuckets.get(bucket) ?? [];
			const bucketLone = (loneBuckets.get(bucket) ?? []).map(
				(card): ContainerNode => ({ container: card, children: [] })
			);
			return {
				container: synth,
				children: [...bucketContainers, ...bucketLone].sort((a, b) =>
					a.container.name.localeCompare(b.container.name)
				)
			};
		});

	// Final shape: root-level entity-containers first, then folder
	// containers (sorted alphabetically). Standalone grid drops to
	// the entities that *don't* live inside any folder.
	containers = [...rootContainers, ...folderContainers];
	standalone = rootStandalone;

	// Page-level folder list: every distinct *top-level* path-bucket
	// (the first path segment under the type root) present in the
	// entity set, with its display name and (optional) cross-link
	// to an entity of the same slug elsewhere in the graph. The
	// view renders these as a chip row alongside kind chips so the
	// user can narrow to a single folder regardless of view-mode.
	// Counts include every descendant in that folder subtree, so
	// `Bayurinda 3` covers Nuunlau, Bayurinda Archipelago, and
	// Bal Rochan-inside-Nuunlau alike. Nested sub-folders are not
	// exposed as separate chips — the chip row mirrors top-level
	// structural folders only, to keep filtering coarse and
	// readable. Authors who want finer slicing can compose with
	// kind/tag chips.
	const folderCounts = new Map<string, number>();
	for (const e of graph.byTypeRecursive(type)) {
		const b = pathBucket(e.id);
		if (b === '') continue;
		const top = b.includes('/') ? b.slice(0, b.indexOf('/')) : b;
		// Skip buckets that correspond to known subtypes — those
		// already get their own "collection" tile, and a folder
		// chip for them would duplicate that affordance. We only
		// want chips for purely-structural folders (no
		// `_type.yaml`).
		if (graph.hasType(`${type}/${top}` as EntityType)) continue;
		folderCounts.set(top, (folderCounts.get(top) ?? 0) + 1);
	}
	const folders = [...folderCounts.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([path, count]) => {
			const slug = path;
			const resolved = graph.resolveLink(slug);
			const linked = resolved && resolved !== `${type}/${path}` ? graph.get(resolved) : null;
			const name =
				linked?.meta.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
			return {
				path,
				name,
				count,
				crossLinkId: linked?.id ?? null
			};
		});

	// Orbits tree: walks `member-of` and `orbits` edges across types,
	// producing the gravitational shape — systems containing stars +
	// planets, planets containing moons. Roots are entities whose
	// outgoing structural edges go nowhere (no parent in this
	// graph). We only emit trees that include at least one entity of
	// the current type's recursive set, so the view shows up only
	// where it has something to say. (For `/places/celestial-bodies`,
	// that means systems show up because they contain celestial
	// bodies; for `/places/systems`, the system entities themselves
	// are roots.)
	const orbits = buildOrbitsTree(type, cardSummaryHtml);

	return {
		kind: 'type' as const,
		type,
		label: info.labels,
		// On a supertype folder, prefer the self-page summary as the
		// header prose — it speaks in the compendium's voice rather
		// than the type description's editorial register.
		description: selfPage?.meta.summary ?? info.description,
		// Rendered HTML of the supertype self-page's body, if any.
		// The view drops it in between the description and the
		// subtype/entity grids so the supertype page reads as a
		// proper hub rather than a bare index.
		selfBodyHtml,
		subtypes,
		containers,
		standalone,
		orbits,
		folders,
		// `flat` is the full list in display order — used when the
		// user switches to flat view. Includes descendants of subtypes
		// so e.g. /culture in flat mode shows languages inline.
		flat: flatAll,
		// Wire format for the kind hierarchy: a plain
		// `kind -> parentKind | null` map. The client rebuilds the
		// full `KindTree` via the same `buildKindTree` helper, so
		// chip derivation and ancestor-walking filters use exactly
		// the same logic the loader does.
		kindParents: serialiseKinds()
	};
}

/**
 * Serialise the graph's `KindTree` to a plain object suitable for
 * SvelteKit's `load` boundary. The client rehydrates with
 * `buildKindTree(new Map(Object.entries(kindParents)))`.
 */
function serialiseKinds(): Record<string, string | null> {
	const tree = graph.kinds();
	const out: Record<string, string | null> = {};
	for (const kind of tree.all()) {
		out[kind] = tree.parent(kind);
	}
	return out;
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
		selfBodyHtml: null as string | null,
		subtypes,
		containers: [] as ContainerNode[],
		orbits: [] as OrbitNode[],
		folders: [] as Array<{ path: string; name: string; count: number; crossLinkId: EntityId | null }>,
		// In nested view every entity belongs to one of the
		// top-level-type collection tiles, so the standalone grid is
		// empty — the user sees only the tiles. Flat view drops the
		// tiles and shows everything in one grid instead.
		standalone: [] as typeof allCards,
		flat: allCards,
		kindParents: serialiseKinds()
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
	typeLabel?: string,
	folderPath: string = ''
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
		typeLabel: typeLabel ?? null,
		// Path of the entity's containing folder relative to the
		// type root, e.g. `bayurinda` for
		// `places/regions/bayurinda/nuunlau` under type
		// `places/regions`. Empty string means the entity lives
		// directly under the type root (no folder grouping). Used
		// by the page-level folder chips so the user can narrow
		// the view to entities living under a structural folder.
		folderPath,
		// Synthetic folder containers (no entity backing them) set
		// `synthetic: true` so the view can render them as a folder
		// heading rather than an entity card. `crossLinkId`, when
		// present, is the canonical id of an entity elsewhere in
		// the graph whose slug matches the folder slug — surfaced
		// as a "→ X" jump from the folder heading.
		synthetic: false as boolean,
		crossLinkId: null as EntityId | null
	};
}

/**
 * Display order for siblings inside an orbit group. Sort precedence:
 *
 *   1. **Explicit `order`** on the relation edge — the body's
 *      canonical slot in its system (innermost = 0, then outward).
 *      Entities with an explicit order always sort before entities
 *      without one.
 *   2. **Alphabetical** by name, for siblings without an explicit
 *      order. (We used to hardcode a star→black-hole→planet→moon
 *      cosmological rank here; that's now the author's job to
 *      express via `order:` on the relations they care about
 *      ordering. Falling back to alphabetical is honest when no
 *      order has been declared.)
 */
function compareOrbitNodes(a: OrbitNode, b: OrbitNode): number {
	const aHas = a.order !== undefined;
	const bHas = b.order !== undefined;
	if (aHas && bHas) return (a.order as number) - (b.order as number);
	if (aHas) return -1;
	if (bHas) return 1;
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
 *      an ancestor in the type hierarchy. For `/fabric`, systems
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
	// (e.g. on /places, every system root is a places entity).
	// On the home page, the full tree renders — the view
	// is showing you the actual shape of the cosmos, and pruning
	// nodes that "belong somewhere else" doesn't apply because
	// nothing does.
	//
	// On a non-home page (e.g. /culture), the orbits view is
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
