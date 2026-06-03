import { graph, byRankThenName } from '$lib/server/graph';
import { inlineSvgFigures } from '$lib/server/inlineSvgs';
import { makeCollectionResolver, renderBody, renderSummary } from '$lib/server/markdown';
import { world } from '$lib/server/world';
import { buildKindTree, type Entity, type EntityId, type KindTree, type RankDisplay } from '$lib/types';

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
function buildSubcollectionEntry(path: string, tree: KindTree) {
	const subEntities = graph.byFolderRecursive(path);
	const labels = graph.folderLabels(path);
	const description = graph.collection(path)?.meta.description ?? null;

	const kindCounts: Record<string, number> = {};
	const tagCounts = new Map<string, number>();
	const tagsByKind: Record<string, Map<string, number>> = {};

	for (const e of subEntities) {
		const direct = typeof e.meta.kind === 'string' ? e.meta.kind : '—';
		// Keys this entity contributes to: the direct kind plus every
		// ancestor in the kind tree. Free-form kinds (not registered)
		// contribute to themselves only.
		const kindKeys = tree.has(direct) ? [direct, ...tree.ancestors(direct)] : [direct];
		for (const k of kindKeys) {
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
	}

	const col = graph.collection(path);
	return {
		type: path,
		plural: labels.plural,
		description,
		rank: typeof col?.meta.rank === 'number' ? col.meta.rank : null,
		count: subEntities.length,
		kindCounts,
		tags: rankTags(tagCounts),
		tagsByKind: Object.fromEntries(Object.entries(tagsByKind).map(([k, m]) => [k, rankTags(m)]))
	};
}

/**
 * Build a `KindTree` from the server-side kind registry. The registry
 * is the single source of truth for kind parentage; this just adapts
 * it to the shape `buildKindTree` expects.
 */
function buildLoaderKindTree(): KindTree {
	const declarations = new Map<string, string | null>();
	for (const k of graph.kindRegistry().values()) {
		declarations.set(k.id, k.parent);
	}
	return buildKindTree(declarations);
}

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
function buildSubcollectionTree(
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

type Card = ReturnType<typeof toCard>;
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
export async function loadCollectionPage(path: string) {
	const label = graph.folderLabels(path);
	const collection = graph.collection(path);
	const description = collection?.meta.description ?? null;

	// Direct entities of this folder, sorted by rank then name.
	const entities = graph.byFolder(path).sort(byRankThenName);

	// Wikilinks in a collection's prose resolve from the
	// collection's own cluster (the first path segment, if it's a
	// registered cluster). Sub-collections inherit their cluster
	// from their top-level folder; collections sitting under a
	// universal-substrate folder have no cluster context and
	// resolve globally.
	const fromCluster = graph.clusterOf(path);
	const resolveLink = (p: string) => graph.resolveLink(p, fromCluster);
	const kindLookup = (id: string) => graph.get(id)?.meta.kind;
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
		? await inlineSvgFigures(
				renderBody(
					collection.body,
					resolveLink,
					languageCodes,
					kindIds,
					resolveCollection,
					path,
					kindLookup
				)
			)
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
	const kindTree = buildLoaderKindTree();
	const childPaths = graph.childFolders(path);
	const subcollections = childPaths
		.map((sub) => buildSubcollectionEntry(sub, kindTree))
		.sort((a, b) => {
			if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
			if (a.rank !== null) return -1;
			if (b.rank !== null) return 1;
			return a.plural.localeCompare(b.plural);
		});

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

	const flatAll = [...cards, ...descendants].sort((a, b) => {
		const aRank = a.rank;
		const bRank = b.rank;
		if (aRank !== null && bRank !== null) return aRank - bRank;
		if (aRank !== null) return -1;
		if (bRank !== null) return 1;
		return a.name.localeCompare(b.name);
	});

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
			.sort(byRankThenName)
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
			const resolved = graph.resolveLink(slug, fromCluster);
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
			rank: null,
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
			const resolved = graph.resolveLink(slug, fromCluster);
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
	const subcollectionTrees = childPaths.map((sub) =>
		buildSubcollectionTree(sub, path, cardSummaryHtml)
	);

	// Prev/next navigation between sibling collections that have an
	// explicit `rank` in their `_collection` frontmatter. Siblings
	// are the other child folders of the same parent folder.
	// rankDisplay is inherited from the *parent* folder's _collection,
	// mirroring how entity pages inherit it from their containing folder.
	const myRank = typeof collection?.meta.rank === 'number' ? collection.meta.rank : null;
	const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
	const rankDisplay: RankDisplay = graph.collection(parentPath)?.meta.rankDisplay ?? 'arabic';
	const collectionNav: {
		rank: number | null;
		rankDisplay: RankDisplay;
		prev: { path: string; title: string; rank: number } | null;
		next: { path: string; title: string; rank: number } | null;
	} = (() => {
		if (myRank === null) return { rank: null, rankDisplay, prev: null, next: null };
		const siblings = graph
			.childFolders(parentPath)
			.map((p) => ({ path: p, col: graph.collection(p) }))
			.filter(
				(s): s is { path: string; col: NonNullable<ReturnType<typeof graph.collection>> } =>
					!!s.col && typeof s.col.meta.rank === 'number'
			)
			.map((s) => ({
				path: s.path,
				title: s.col.meta.title ?? graph.folderLabels(s.path).plural,
				rank: s.col.meta.rank as number
			}))
			.sort((a, b) => a.rank - b.rank);
		const idx = siblings.findIndex((s) => s.path === path);
		return {
			rank: myRank,
			rankDisplay,
			prev: idx > 0 ? siblings[idx - 1] : null,
			next: idx < siblings.length - 1 ? siblings[idx + 1] : null
		};
	})();

	return {
		kind: 'collection' as const,
		type: path,
		label,
		description,
		bodyHtml,
		subcollections,
		// rankDisplay for entity *cards* on this page — inherited from this
		// collection's own _collection.yaml/md, the same field that drives
		// subcollection tile glyphs.
		entityRankDisplay: (collection?.meta.rankDisplay ?? 'arabic') as RankDisplay,
		subcollectionRankDisplay: (collection?.meta.rankDisplay ?? 'arabic') as RankDisplay,
		subcollectionTrees,
		containers,
		standalone,
		orbits,
		folders,
		flat: flatAll,
		collectionNav,
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

export type CollectionPageData = Awaited<ReturnType<typeof loadCollectionPage>>;

/**
 * View-model for the global "everything" index — every entity in
 * the graph, filterable by folder/kind/tag and switchable between
 * a nested view (top-level folders as tiles + standalone entities)
 * and a flat view (one big grid).
 *
 * Reuses the same data shape as the per-folder collection page so
 * the `CollectionPage.svelte` component renders both. Differences:
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

	const kindTree = buildLoaderKindTree();
	const topPaths = graph.topLevelFolders();
	const populated = topPaths.filter((p) => graph.byFolderRecursive(p).length > 0);
	const subcollections = populated
		.map((p) => buildSubcollectionEntry(p, kindTree))
		.sort((a, b) => a.plural.localeCompare(b.plural));
	const subcollectionTrees = populated.map((p) => buildSubcollectionTree(p, '', cardSummaryHtml));

	const allCards = graph
		.all()
		.sort(byRankThenName)
		.map((e) => toCard(e, cardSummaryHtml, labelForFolder(e.type)));

	return {
		kind: 'collection' as const,
		type: '',
		label: { singular: 'Entry', plural: 'Everything' },
		description: `Every entry in ${world.config().name}, in one place. Filter or flatten to taste.`,
		bodyHtml: null,
		subcollections,
		subcollectionTrees,
		containers: [] as ContainerNode[],
		orbits: [] as OrbitNode[],
		folders: [] as Array<{
			path: string;
			name: string;
			count: number;
		}>,
		standalone: [] as typeof allCards,
		flat: allCards,
		collectionNav: { rank: null, rankDisplay: 'arabic' as RankDisplay, prev: null, next: null },
		entityRankDisplay: 'arabic' as RankDisplay,
		subcollectionRankDisplay: 'arabic' as RankDisplay,
		kindParents: serialiseKinds()
	};
}

function labelForFolder(path: string): string {
	if (!path) return '';
	return graph.folderLabels(path).singular;
}

/**
 * View-model for a *cross-cluster aggregate shelf* — e.g. `/characters`,
 * which gathers entities from every cluster's `<cluster>/characters/`
 * folder and presents them as one collection.
 *
 * Aggregate pages mirror the shape of the per-folder collection page so
 * the existing `CollectionPage.svelte` renders both. Differences:
 *
 *   • Subcollection tiles are the *per-cluster* shelves (e.g.
 *     `aurethia/characters`) rather than child folders, so a reader
 *     can drill from "all characters" into one cluster's set.
 *   • `containers`, `orbits`, and `folders` are empty — those views
 *     describe local structure inside a single folder, not the
 *     cross-cluster union.
 *   • Cards carry their `typeLabel` showing which cluster they live
 *     in, mirroring how the `/everything` index labels by folder.
 *
 * `shelf` is a single-segment shelf name like `characters` or `places`.
 * Caller has already verified it exists under at least one cluster (via
 * `graph.unionShelves()`).
 */
export function loadAggregateShelfPage(shelf: string) {
	const resolveLink = (p: string) => graph.resolveLink(p);
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true, kindIds }) : null;

	const kindTree = buildLoaderKindTree();
	const clusterPaths = graph.clusterShelfPaths(shelf);

	const subcollections = clusterPaths
		.map((p) => buildSubcollectionEntry(p, kindTree))
		.sort((a, b) => a.plural.localeCompare(b.plural));
	const subcollectionTrees = clusterPaths.map((p) =>
		buildSubcollectionTree(p, '', cardSummaryHtml)
	);

	const entities = graph.entitiesByShelfAcrossClusters(shelf);

	// Cluster label as the type-label on each card. With one cluster
	// this just reads "Aurethia" everywhere; with several it lets a
	// reader see at a glance which cluster each entry belongs to.
	const clusterLabel = (id: EntityId): string => {
		const cluster = id.includes('/') ? id.slice(0, id.indexOf('/')) : id;
		return graph.folderLabels(cluster).singular;
	};

	const flat = entities.map((e) => toCard(e, cardSummaryHtml, clusterLabel(e.id)));

	// Use the shelf's display label as if it lived at the content
	// root. We borrow `_collection.yaml` titles from the *first*
	// cluster that defines the shelf, on the grounds that the same
	// shelf name across clusters should mean the same kind of thing.
	const labelSourcePath = clusterPaths.find((p) => graph.collection(p)) ?? clusterPaths[0];
	const label = graph.folderLabels(labelSourcePath ?? shelf);
	// For the cross-cluster aggregate we deliberately *don't* reuse
	// any one cluster's `_collection.yaml` description — that text
	// is written for its own cluster's page and tends to drift
	// cluster-specific. Generate a neutral subtitle from the
	// shelf's display label instead, so the framing reads as a true
	// universe-wide view.
	const description = `${label.plural} across ${world.config().name}`;

	return {
		kind: 'collection' as const,
		type: shelf,
		label,
		description,
		bodyHtml: null,
		subcollections,
		subcollectionTrees,
		containers: [] as ContainerNode[],
		orbits: [] as OrbitNode[],
		folders: [] as Array<{
			path: string;
			name: string;
			count: number;
		}>,
		// Index mode shows `standalone` as cards; we put the union
		// there so the default view of an aggregate page renders
		// the entities directly. Flat view uses `flat` (same data,
		// minus any container-tree adjustments — which we don't have
		// here, so the two are identical).
		standalone: flat,
		flat,
		collectionNav: { rank: null, rankDisplay: 'arabic' as RankDisplay, prev: null, next: null },
		entityRankDisplay: 'arabic' as RankDisplay,
		subcollectionRankDisplay: 'arabic' as RankDisplay,
		kindParents: serialiseKinds()
	};
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
		rank: typeof e.meta.rank === 'number' ? e.meta.rank : null,
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
