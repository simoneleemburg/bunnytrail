import { graph } from '$lib/server/graph';
import { makeCollectionResolver, renderBody, renderSummary } from '$lib/server/markdown';
import type { Entity, EntityId } from '$lib/types';

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
 * Build the view-model for a collection-folder page. Caller has
 * already verified that `path` is a browseable folder via
 * `graph.isFolder`.
 *
 * A collection page lists, top to bottom:
 *
 *   • **Child-folder tiles** — immediate subfolders rendered as
 *     collection tiles with counts, kind distribution, and top tags.
 *   • **Containers** — entities directly under this folder that
 *     filesystem-nest other entities (e.g. a planet folder that
 *     contains its archipelagos). Each container shows its nested
 *     children inline. Used in nested view-mode.
 *   • **Entity grid** — the flat list of direct entities (nested
 *     mode) or every descendant entity at any depth (flat mode).
 *   • **Orbits** — the structural `member-of` / `orbits` tree, when
 *     this folder contains entities that participate in it.
 *
 * The kind-filter at the top of the page applies to everything,
 * regardless of view-mode. Kind labels are pulled from the central
 * registry (`content_meta/kinds/`).
 */
export function loadCollectionPage(path: string) {
	const label = graph.folderLabels(path);
	const collection = graph.collection(path);
	const description = collection?.meta.description ?? null;

	// Direct entities of this folder, sorted by name.
	const entities = graph.byFolder(path).sort((a, b) => a.meta.name.localeCompare(b.meta.name));

	const resolveLink = (p: string) => graph.resolveLink(p);
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();
	const resolveCollection = makeCollectionResolver({
		getCollection: (p) => graph.collection(p),
		folderLabels: (p) => graph.folderLabels(p),
		resolveLink,
		languageCodes,
		kindIds
	});

	// Optional long-form prose from `_collection.md`. Rendered the
	// same way entity bodies are — wikilinks, kind-links, and
	// language tags all resolve. Sits between the one-liner
	// description and the filter chips on the collection page.
	const bodyHtml = collection?.body
		? renderBody(collection.body, resolveLink, languageCodes, kindIds, resolveCollection)
		: null;
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true, kindIds }) : null;

	// The bucket is the path segment(s) between this folder and an
	// entity's slug: `places/regions/bayurinda/nuunlau` under folder
	// `places/regions` gives bucket `bayurinda`. An entity outside
	// this folder returns `''`. Used by folder chips and
	// folder-container grouping.
	const pathBucket = (id: EntityId): string => {
		if (!id.startsWith(`${path}/`)) return '';
		const rest = id.slice(path.length + 1);
		const lastSlash = rest.lastIndexOf('/');
		return lastSlash < 0 ? '' : rest.slice(0, lastSlash);
	};

	// Child folders → "subcollection" tiles. The same wire shape the page
	// has always used, so the existing view renders unchanged.
	const childPaths = graph.childFolders(path);
	const subcollections = childPaths
		.map((sub) => {
			const subEntities = graph.byFolderRecursive(sub);
			const subLabels = graph.folderLabels(sub);
			const subDescription = graph.collection(sub)?.meta.description ?? null;
			const kindCounts: Record<string, number> = {};
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
				type: sub,
				plural: subLabels.plural,
				description: subDescription,
				count: subEntities.length,
				kindCounts,
				tags: rankTags(tagCounts),
				tagsByKind: Object.fromEntries(Object.entries(tagsByKind).map(([k, m]) => [k, rankTags(m)]))
			};
		})
		.sort((a, b) => a.plural.localeCompare(b.plural));

	// Cards for direct entities, retaining their bucket for folder
	// chips / synthetic folder containers.
	const cards = entities.map((e) => toCard(e, cardSummaryHtml, undefined, pathBucket(e.id)));

	// Descendants: every entity under this folder at any depth that
	// is *not* a direct child. Each shows its containing folder
	// label as the eyebrow.
	const descendants = graph
		.byFolderRecursive(path)
		.filter((e) => e.type !== path)
		.map((e) => toCard(e, cardSummaryHtml, labelForFolder(e.type), pathBucket(e.id)));

	const flatAll = [...cards, ...descendants].sort((a, b) => a.name.localeCompare(b.name));

	// Containers: a recursive tree of direct entities that
	// filesystem-nest other entities of this same folder beneath
	// them. Roots are entities whose parent is not itself a direct
	// child of this folder.
	const containedIds = new Set<string>();
	const buildNode = (e: Entity): ContainerNode => {
		containedIds.add(e.id);
		const children = e.children
			.map((cid) => graph.get(cid))
			.filter((c): c is Entity => !!c && c.type === path)
			.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
			.map(buildNode);
		return { container: toCard(e, cardSummaryHtml, undefined, pathBucket(e.id)), children };
	};
	let containers = entities
		.filter((e) => {
			if (e.children.length === 0) return false;
			if (!e.parent) return true;
			const parent = graph.get(e.parent);
			return !parent || parent.type !== path;
		})
		.map(buildNode)
		.filter((n) => n.children.length > 0);

	// Standalone = direct entities not appearing inside any container.
	let standalone = cards.filter((c) => !containedIds.has(c.id));

	// Folder-container grouping: structural subfolders that aren't
	// themselves child collections get wrapped as synthetic
	// container nodes so the user sees the filesystem grouping
	// implicitly. Subfolders that are listed in `childPaths` (the
	// subcollection tiles) are excluded — their entities already get a
	// dedicated tile.
	const childFolderSet = new Set(childPaths);
	const containerBuckets = new Map<string, ContainerNode[]>();
	const loneBuckets = new Map<string, Card[]>();
	const rootContainers: ContainerNode[] = [];
	const rootStandalone: Card[] = [];

	const skipBucket = (b: string): boolean => {
		if (!b) return true;
		const top = b.includes('/') ? b.slice(0, b.indexOf('/')) : b;
		return childFolderSet.has(`${path}/${top}`);
	};

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

	const allBuckets = new Set<string>([...containerBuckets.keys(), ...loneBuckets.keys()]);
	const folderContainers: ContainerNode[] = [...allBuckets]
		.filter((b) => !skipBucket(b))
		.sort()
		.map((bucket) => {
			const folderId = `${path}/${bucket}`;
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

	containers = [...rootContainers, ...folderContainers];
	standalone = rootStandalone;

	// Page-level folder chips: top-level path buckets present in the
	// recursive entity set, with display names and optional
	// cross-links. Buckets that correspond to child-collections are
	// skipped — they already have tiles.
	const folderCounts = new Map<string, number>();
	for (const e of graph.byFolderRecursive(path)) {
		const b = pathBucket(e.id);
		if (b === '') continue;
		const top = b.includes('/') ? b.slice(0, b.indexOf('/')) : b;
		if (childFolderSet.has(`${path}/${top}`)) continue;
		folderCounts.set(top, (folderCounts.get(top) ?? 0) + 1);
	}
	const folders = [...folderCounts.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([p, count]) => {
			const slug = p;
			// If the folder slug resolves to an entity (e.g. `bayurinda`
			// → `places/regions/bayurinda`), prefer that entity's
			// display name over a title-cased slug. Otherwise fall
			// back to title-casing.
			const resolved = graph.resolveLink(slug);
			const linked = resolved && resolved !== `${path}/${p}` ? graph.get(resolved) : null;
			const name =
				linked?.meta.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
			return {
				path: p,
				name,
				count
			};
		});

	const orbits = buildOrbitsTree(path, cardSummaryHtml);

	return {
		kind: 'collection' as const,
		type: path,
		label,
		description,
		bodyHtml,
		subcollections,
		containers,
		standalone,
		orbits,
		folders,
		flat: flatAll,
		// Kind hierarchy from the central registry: a plain
		// `kind -> parentKind | null` map. The client rebuilds it
		// with `buildKindTree`.
		kindParents: serialiseKinds()
	};
}

/**
 * Serialise the kind registry to a plain object: `kind -> parent | null`.
 */
function serialiseKinds(): Record<string, string | null> {
	const out: Record<string, string | null> = {};
	for (const k of graph.kindRegistry().values()) {
		out[k.id] = k.parent;
	}
	return out;
}

export type CollectionPageData = ReturnType<typeof loadCollectionPage>;

/**
 * View-model for the global "everything" index — every entity in
 * the graph, filterable by folder/kind/tag and switchable between
 * a nested view (top-level folders as tiles + standalone entities)
 * and a flat view (one big grid).
 *
 * Reuses the same data shape as the per-folder collection page so
 * the `_CollectionPage.svelte` component renders both. Differences:
 *
 *   • `subcollections` is filled with every top-level folder.
 *   • `containers` is always empty (container nesting is local).
 *   • Every card carries its `typeLabel` so the grid shows what
 *     kind of folder each one lives in.
 */
export function loadEverythingIndex() {
	const resolveLink = (p: string) => graph.resolveLink(p);
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true, kindIds }) : null;

	const topPaths = graph.topLevelFolders();
	const subcollections = topPaths
		.filter((p) => graph.byFolderRecursive(p).length > 0)
		.map((p) => {
			const subEntities = graph.byFolderRecursive(p);
			const labels = graph.folderLabels(p);
			const desc = graph.collection(p)?.meta.description ?? null;
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
				type: p,
				plural: labels.plural,
				description: desc,
				count: subEntities.length,
				kindCounts,
				tags: rankTags(tagCounts),
				tagsByKind: Object.fromEntries(Object.entries(tagsByKind).map(([k, m]) => [k, rankTags(m)]))
			};
		})
		.sort((a, b) => a.plural.localeCompare(b.plural));

	const allCards = graph
		.all()
		.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
		.map((e) => toCard(e, cardSummaryHtml, labelForFolder(e.type)));

	return {
		kind: 'collection' as const,
		type: '',
		label: { singular: 'Entry', plural: 'Everything' },
		description: 'Every entry in Alteria, in one place. Filter or flatten to taste.',
		bodyHtml: null,
		subcollections,
		containers: [] as ContainerNode[],
		orbits: [] as OrbitNode[],
		folders: [] as Array<{
			path: string;
			name: string;
			count: number;
		}>,
		standalone: [] as typeof allCards,
		flat: allCards,
		kindParents: serialiseKinds()
	};
}

function labelForFolder(path: string): string {
	if (!path) return '';
	return graph.folderLabels(path).singular;
}

/**
 * Convert a tag-count map into a sorted array. Sort is by count
 * descending, breaking ties alphabetically.
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
		folderPath,
		synthetic: false as boolean,
		crossLinkId: null as EntityId | null
	};
}

/**
 * Display order for siblings inside an orbit group. Sort precedence:
 *   1. Explicit `order` on the relation edge (innermost first).
 *   2. Alphabetical by name for siblings without explicit order.
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
function buildOrbitsTree(
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
