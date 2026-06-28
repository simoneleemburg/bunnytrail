/**
 * Shared infrastructure for all collection-page loaders.
 *
 * Everything in here is internal to `src/lib/routes/path/` — it
 * does not need to appear in `package.json` exports. Loaders import
 * what they need; the Svelte component consumes the exported types
 * via `CollectionPageData` (re-exported from `collectionPage.load.ts`).
 */

import { graph, byRankThenName } from '$lib/server/graph';
import { buildKindTree, type Entity, type EntityId, type KindTree } from '$lib/types';

// ---------------------------------------------------------------------------
// Public types consumed by CollectionPage.svelte and the loaders
// ---------------------------------------------------------------------------

export type Card = ReturnType<typeof toCard>;
export type ContainerNode = { container: Card; children: ContainerNode[] };
export type OrbitNode = { entity: Card; children: OrbitNode[]; order?: number };

/**
 * Wire shape for Tree view: every subcollection on the page expanded
 * into a forest of container nodes, each tree following the
 * filesystem-nesting of entities under that subcollection.
 *
 * Unlike `containers` (the page-folder container builder, which only
 * descends into entities whose `type === path`), this walks the full
 * hierarchy under the subcollection root. A node may have children
 * that live several folders deep, as long as their filesystem parent
 * chain stays inside the subcollection.
 *
 * Two heading flavours:
 *
 *   • `headlineEntity` is set when the subcollection is also an
 *     entity (e.g. `places/celestial/aureth-system` is both a folder
 *     and an entity). The section heading shows that entity's name +
 *     summary; the tree underneath holds its descendants directly,
 *     skipping the headline entity itself (it's already in the
 *     heading).
 *   • `headlineEntity` is null when the subcollection is a pure
 *     folder. The section heading shows `plural` (the folder's
 *     pluralised label) + `description`; the tree underneath holds
 *     every root entity inside the folder.
 */
export type SubcollectionTree = {
	path: string;
	plural: string;
	description: string | null;
	headlineEntity: Card | null;
	roots: ContainerNode[];
};

/**
 * Structural ("gravitational") relation kinds that build the orbits
 * tree. Both encode the same shape: child *belongs to* / *orbits*
 * parent. We treat them uniformly when walking the tree.
 */
export const ORBIT_KINDS = new Set(['member-of', 'orbits']);

// ---------------------------------------------------------------------------
// toCard — entity → wire card shape
// ---------------------------------------------------------------------------

export function toCard(
	e: Entity,
	cardSummaryHtml: (s: string | null | undefined) => string | null,
	typeLabel?: string,
	folderPath: string = ''
) {
	// Resolve the class field to a name and href for display.
	// class replaces kind as the primary filter discriminator when set.
	const classId = typeof e.meta.class === 'string' ? e.meta.class : null;
	const classEntity = classId ? graph.get(classId) : null;
	const className = classEntity?.meta.name ?? null;
	const classHref = classId ? `/${classId}` : null;

	return {
		id: e.id,
		slug: e.slug,
		name: e.meta.name,
		summary: e.meta.summary ?? null,
		summaryHtml: cardSummaryHtml(e.meta.summary),
		tags: e.meta.tags ?? [],
		era: e.meta.era ?? null,
		kind: typeof e.meta.kind === 'string' ? e.meta.kind : null,
		classId,
		className,
		classHref,
		sigil: typeof e.meta.sigil === 'string' ? e.meta.sigil : null,
		rank: typeof e.meta.rank === 'number' ? e.meta.rank : null,
		typeLabel: typeLabel ?? null,
		folderPath,
		synthetic: false as boolean,
		crossLinkId: null as EntityId | null
	};
}

// ---------------------------------------------------------------------------
// rankTags — tag-count map → sorted array
// ---------------------------------------------------------------------------

/**
 * Convert a tag-count map into a sorted array. Sort is by count
 * descending, breaking ties alphabetically.
 */
export function rankTags(counts: Map<string, number>): Array<{ label: string; count: number }> {
	return [...counts.entries()]
		.map(([label, count]) => ({ label, count }))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// labelForFolder — singular label for a folder path
// ---------------------------------------------------------------------------

export function labelForFolder(path: string): string {
	if (!path) return '';
	return graph.folderLabels(path).singular;
}

// ---------------------------------------------------------------------------
// serialiseKinds — kind registry → plain wire object
// ---------------------------------------------------------------------------

/**
 * Serialise the kind registry to a plain object: `kind -> parent | null`.
 */
export function serialiseKinds(): Record<string, string | null> {
	const out: Record<string, string | null> = {};
	for (const k of graph.kindRegistry().values()) {
		out[k.id] = k.parent;
	}
	return out;
}

// ---------------------------------------------------------------------------
// buildLoaderKindTree — adapt server kind registry to KindTree
// ---------------------------------------------------------------------------

/**
 * Build a `KindTree` from the server-side kind registry. The registry
 * is the single source of truth for kind parentage; this just adapts
 * it to the shape `buildKindTree` expects.
 */
export function buildLoaderKindTree(): KindTree {
	const declarations = new Map<string, string | null>();
	for (const k of graph.kindRegistry().values()) {
		declarations.set(k.id, k.parent);
	}
	return buildKindTree(declarations);
}

// ---------------------------------------------------------------------------
// buildSubcollectionEntry — subcollection tile view-model
// ---------------------------------------------------------------------------

/**
 * Per-subcollection kind/tag counts, rolled up so that every supertype
 * in the kind tree reports the total of itself plus every descendant.
 *
 * The page-level chip row already walks ancestors when computing visible
 * chips, but subcollection tiles used to key off raw `kindCounts[k]` and
 * `tagsByKind[k]`, which only contained *direct* kind values. Filtering
 * by a supertype (e.g. `place`, `celestial-body`) therefore read as zero
 * matches and hid every tile. Doing the roll-up here keeps the client
 * dumb: every chip the user might pick — leaf or supertype — has a
 * pre-computed entry.
 *
 * `kindCounts` after roll-up: `kind -> total entities whose declared
 *   kind is `kind` or any descendant of it`.
 * `tagsByKind` after roll-up: `kind -> ranked tags across the same set`.
 */
export function buildSubcollectionEntry(path: string, tree: KindTree) {
	const subEntities = graph.byFolderRecursive(path);
	const labels = graph.folderLabels(path);
	const description = graph.collection(path)?.meta.description ?? null;

	// Count timeline entries (dots) under this path so that collections
	// whose only content is _time.md files are not treated as empty.
	let timelineEntryCount = 0;
	for (const [tlPath, tl] of graph.timelines()) {
		if (tlPath === path || tlPath.startsWith(path + '/')) {
			timelineEntryCount += tl.entries.length;
		}
	}

	const kindCounts: Record<string, number> = {};
	const tagCounts = new Map<string, number>();
	const tagsByKind: Record<string, Map<string, number>> = {};
	// era ref → count of entities carrying that era (explicit or defaulted).
	const eraCounts: Record<string, number> = {};
	// Track whether any entity has no era at all (always-visible entities).
	let noEraCount = 0;

	for (const e of subEntities) {
		const direct = typeof e.meta.kind === 'string' ? e.meta.kind : '—';
		// When the entity has a class, use the class entity's id as an
		// additional filter key (below kind in the hierarchy). This makes
		// "Human", "Nguwari" etc. appear as filter chips alongside their
		// parent kind chips.
		const classId = typeof e.meta.class === 'string' ? e.meta.class : null;
		// Keys this entity contributes to: the direct kind plus every
		// ancestor in the kind tree. Free-form kinds (not registered)
		// contribute to themselves only.
		const kindKeys = tree.has(direct) ? [direct, ...tree.ancestors(direct)] : [direct];
		// Class key is prepended so it acts as the leaf discriminator.
		const allKeys = classId ? [classId, ...kindKeys] : kindKeys;
		for (const k of allKeys) {
			kindCounts[k] = (kindCounts[k] ?? 0) + 1;
			const kindTagMap = (tagsByKind[k] ??= new Map<string, number>());
			for (const t of e.meta.tags ?? []) {
				kindTagMap.set(t, (kindTagMap.get(t) ?? 0) + 1);
			}
		}
		// Page-level tag list is independent of kind, so count once.
		for (const t of e.meta.tags ?? []) {
			tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
		}
		// Era counts: each era ref the entity belongs to gets a tally.
		if (e.meta.era && e.meta.era.length > 0) {
			for (const ref of e.meta.era) {
				eraCounts[ref] = (eraCounts[ref] ?? 0) + 1;
			}
		} else {
			noEraCount++;
		}
	}

	const col = graph.collection(path);
	return {
		type: path,
		plural: labels.plural,
		description,
		rank: typeof col?.meta.rank === 'number' ? col.meta.rank : null,
		count: subEntities.length + timelineEntryCount,
		kindCounts,
		tags: rankTags(tagCounts),
		tagsByKind: Object.fromEntries(Object.entries(tagsByKind).map(([k, m]) => [k, rankTags(m)])),
		eraCounts,
		noEraCount,
		// Always present; aggregate loaders override this to `true` for cluster tiles.
		isCluster: false as boolean
	};
}

// ---------------------------------------------------------------------------
// buildSubcollectionTree — Tree-view forest for one subcollection
// ---------------------------------------------------------------------------

/**
 * Build a per-subcollection container tree for Tree view: every entity
 * under `subPath`, recursively, arranged by filesystem-nesting.
 *
 * Roots are entities under `subPath` whose filesystem parent lives
 * *outside* the subcollection (or is null). Children of each node are
 * the entity's `children`, restricted to those still under `subPath`.
 *
 * `pagePath` is the page folder we're rendering — it determines the
 * `folderPath` bucket on each emitted card (path between page folder
 * and entity slug, matching the rest of the loader's card output).
 */
export function buildSubcollectionTree(
	subPath: string,
	pagePath: string,
	cardSummaryHtml: (s: string | null | undefined) => string | null
): SubcollectionTree {
	const labels = graph.folderLabels(subPath);
	const collection = graph.collection(subPath);
	const description = collection?.meta.description ?? null;

	// Subcollection's headline entity, if any: an entity sitting at
	// `subPath` itself (e.g. `places/celestial/aureth-system` exists
	// both as folder and as entity). When present, that entity's
	// own card is the section header — and its *children* become
	// the tree roots, so we don't render the entity twice.
	const headlineSource = graph.get(subPath as EntityId) ?? null;

	const inSubcollection = (id: string) => id === subPath || id.startsWith(`${subPath}/`);

	// `pathBucket` here is the multi-segment path between pagePath
	// and the entity's slug — same shape the rest of the loader
	// uses, so cards round-trip through the same render code.
	const pathBucket = (id: EntityId): string => {
		if (!pagePath) return '';
		if (!id.startsWith(`${pagePath}/`)) return '';
		const rest = id.slice(pagePath.length + 1);
		const lastSlash = rest.lastIndexOf('/');
		return lastSlash < 0 ? '' : rest.slice(0, lastSlash);
	};

	const seen = new Set<EntityId>();
	const buildNode = (e: Entity): ContainerNode => {
		seen.add(e.id);
		const children = e.children
			.map((cid) => graph.get(cid))
			.filter((c): c is Entity => !!c && inSubcollection(c.id) && !seen.has(c.id))
			.sort(byRankThenName)
			.map(buildNode);
		return {
			container: toCard(e, cardSummaryHtml, undefined, pathBucket(e.id)),
			children
		};
	};

	let rootEntities: Entity[];
	if (headlineSource) {
		// Headline entity is the section header — its filesystem
		// children become the roots beneath it.
		seen.add(headlineSource.id);
		rootEntities = headlineSource.children
			.map((cid) => graph.get(cid))
			.filter((c): c is Entity => !!c && inSubcollection(c.id));
	} else {
		// Pure folder: walk every entity under subPath and pick
		// those whose parent is null or sits outside subPath.
		rootEntities = graph
			.byFolderRecursive(subPath)
			.filter((e) => !e.parent || !inSubcollection(e.parent));
	}

	const roots = rootEntities.sort(byRankThenName).map(buildNode);

	return {
		path: subPath,
		plural: labels.plural,
		description,
		headlineEntity: headlineSource
			? toCard(headlineSource, cardSummaryHtml, undefined, pathBucket(headlineSource.id))
			: null,
		roots
	};
}

// ---------------------------------------------------------------------------
// compareOrbitNodes — orbit sibling sort order
// ---------------------------------------------------------------------------

/**
 * Display order for siblings inside an orbit group. Sort precedence:
 *   1. Explicit `order` on the relation edge (innermost first).
 *   2. Alphabetical by name for siblings without explicit order.
 */
export function compareOrbitNodes(a: OrbitNode, b: OrbitNode): number {
	const aHas = a.order !== undefined;
	const bHas = b.order !== undefined;
	if (aHas && bHas) return (a.order as number) - (b.order as number);
	if (aHas) return -1;
	if (bHas) return 1;
	return a.entity.name.localeCompare(b.entity.name);
}

// ---------------------------------------------------------------------------
// buildOrbitsTree — gravitational member-of/orbits tree
// ---------------------------------------------------------------------------

/**
 * Build the gravitational tree visible from a collection page,
 * walking `member-of` and `orbits` edges.
 *
 * Strategy:
 * 1. **Universe.** Collect every entity that participates in any
 *    orbit edge (in or out). These are the only nodes the orbits
 *    view ever cares about.
 * 2. **Roots.** A root is an entity in the universe whose own
 *    orbit-targets are all *outside* the universe (e.g. a system
 *    that doesn't `member-of` anything tracked).
 * 3. **Tree.** Recursively build each root by following inbound
 *    orbit edges. Cycles are guarded by a `seen` set.
 * 4. **Prune empty roots.** If a root's tree touches no entity on
 *    the current page (`byFolderRecursive(pagePath)`), drop it.
 * 5. **Borrowed view vs home view.** If every kept root is itself
 *    on the page, the page *is* the orbit home (e.g. /places/celestial)
 *    and the full tree is returned. Otherwise the page is a
 *    *borrower* of the structure (e.g. /kinds/planet showing only
 *    planets within the wider system) and internals not on the
 *    page are pruned out, lifting their on-page descendants up.
 */
export function buildOrbitsTree(
	pagePath: string,
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
		return out.every((edge) => !universe.has(edge.to));
	};

	const build = (
		id: EntityId,
		order: number | undefined,
		seen: Set<EntityId>
	): OrbitNode | null => {
		const entity = graph.get(id);
		if (!entity) return null;
		if (seen.has(id)) return null;
		const nextSeen = new Set(seen).add(id);
		const childEdges = graph.inEdges(id).filter((edge) => ORBIT_KINDS.has(edge.kind));
		const children = childEdges
			.map((edge) => build(edge.from, edge.order, nextSeen))
			.filter((c): c is OrbitNode => c !== null)
			.sort(compareOrbitNodes);
		return {
			entity: toCard(entity, cardSummaryHtml, labelForFolder(entity.type)),
			children,
			order
		};
	};

	const roots = [...universe]
		.filter(isRoot)
		.map((id) => build(id, undefined, new Set()))
		.filter((n): n is OrbitNode => n !== null)
		.sort(compareOrbitNodes);

	const pageEntityIds = new Set(graph.byFolderRecursive(pagePath).map((e) => e.id));
	const treeTouches = (node: OrbitNode): boolean => {
		if (pageEntityIds.has(node.entity.id)) return true;
		return node.children.some(treeTouches);
	};
	const keptRoots = roots.filter(treeTouches);

	const isOrbitHome = keptRoots.every((root) => pageEntityIds.has(root.entity.id));
	if (isOrbitHome) return keptRoots;

	const pruneInternals = (children: OrbitNode[]): OrbitNode[] => {
		const out: OrbitNode[] = [];
		for (const child of children) {
			const promotedChildren = pruneInternals(child.children);
			if (pageEntityIds.has(child.entity.id)) {
				out.push({ entity: child.entity, children: promotedChildren, order: child.order });
			} else {
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
