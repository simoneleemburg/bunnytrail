import { graph, byRankThenName } from '$lib/server/graph';
import { inlineSvgFigures } from '$lib/server/inlineSvgs';
import { makeCollectionResolver, renderBody, renderSummary } from '$lib/server/markdown';
import { type Entity, type EntityId, type RankDisplay } from '$lib/types';
import {
	buildLoaderKindTree,
	buildOrbitsTree,
	buildSubcollectionEntry,
	buildSubcollectionTree,
	labelForFolder,
	serialiseKinds,
	toCard,
	type ContainerNode,
	type OrbitNode,
	type SubcollectionTree
} from './collectionPage.helpers';

export type { ContainerNode, OrbitNode, SubcollectionTree } from './collectionPage.helpers';

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

	// Breadcrumb chain: every browseable ancestor folder above this
	// collection, from root down. Mirrors the entity-page logic.
	// For a top-level cluster page (single segment, e.g. "aurethia")
	// we produce no breadcrumbs so PageHeader falls back to its
	// built-in up-arrow pointing home — the cluster page is the
	// natural top of its own tree and "home" is the right parent.
	const breadcrumbs: { label: string; href: string }[] = [];
	const segs = path.split('/');
	if (segs.length > 1) {
		// Walk ancestor segments (all but the last, which is this page).
		for (let i = 1; i < segs.length; i++) {
			const prefix = segs.slice(0, i).join('/');
			if (graph.isFolder(prefix)) {
				breadcrumbs.push({
					label: graph.folderLabels(prefix).plural,
					href: `/${prefix}`
				});
			}
		}
	}

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

	// Child folders → "subcollection" tiles.
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
	const loneBuckets = new Map<string, ReturnType<typeof toCard>[]>();
	const rootContainers: ContainerNode[] = [];
	const rootStandalone: ReturnType<typeof toCard>[] = [];

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
			const synth: ReturnType<typeof toCard> = {
				id: folderId,
				slug,
				name,
				summary: null,
				summaryHtml: null,
				tags: [],
				era: null,
				kind: null,
				classId: null,
				className: null,
				classHref: null,
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

	// Timeline tiles: immediate child folders of this collection that
	// carry a _time.md (are known timelines). Shown alongside
	// subcollection tiles so they're discoverable from browse pages.
	const timelines = [...graph.timelines().values()]
		.filter((tl) => {
			if (!tl.path.startsWith(`${path}/`)) return false;
			const rest = tl.path.slice(path.length + 1);
			return !rest.includes('/');
		})
		.map((tl) => ({
			path: tl.path,
			href: `/${tl.path}`,
			title: tl.meta.name ?? graph.get(tl.path)?.meta.name ?? tl.path.slice(tl.path.lastIndexOf('/') + 1).replace(/-/g, ' '),
			summary: tl.meta.summary ?? null,
			...graph.timelineYearRange(tl.path)
		}))
		.sort((a, b) => a.title.localeCompare(b.title));

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
		breadcrumbs,
		description,
		bodyHtml,
		subcollections,
		timelines,
		subShelves: [] as Array<{
			type: string;
			plural: string;
			description: string | null;
			rank: number | null;
			count: number;
			kindCounts: Record<string, number>;
			tags: Array<{ label: string; count: number }>;
			tagsByKind: Record<string, Array<{ label: string; count: number }>>;
			isCluster: false;
			isSubShelf: true;
		}>,
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

export type CollectionPageData = Awaited<ReturnType<typeof loadCollectionPage>>;
