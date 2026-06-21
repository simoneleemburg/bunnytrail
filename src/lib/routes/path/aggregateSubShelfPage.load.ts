import { graph } from '$lib/server/graph';
import { renderSummary } from '$lib/server/markdown';
import { world } from '$lib/server/world';
import { type EntityId, type RankDisplay } from '$lib/types';
import {
	buildLoaderKindTree,
	buildSubcollectionEntry,
	buildSubcollectionTree,
	serialiseKinds,
	toCard,
	type ContainerNode,
	type OrbitNode
} from './collectionPage.helpers';

/**
 * Aggregate view for a sub-shelf across all clusters.
 * E.g. `/people/characters` — shows cluster tiles for
 * "Characters of Aurethia", "Characters of Earth", etc.,
 * followed by any child-folder tiles, then the full entity grid
 * of all entities across clusters.
 *
 * `shelf` is the first segment (e.g. `people`), `subShelf` is the
 * second (e.g. `characters`). Caller has verified both are valid via
 * `graph.subShelvesAcrossClusters(shelf)`.
 */
export function loadAggregateSubShelfPage(shelf: string, subShelf: string) {
	const resolveLink = (p: string) => graph.resolveLink(p);
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true, kindIds }) : null;

	const kindTree = buildLoaderKindTree();
	const clusterPaths = graph.allSubShelfPaths(shelf, subShelf);

	// Cluster/root tiles — one per root (cluster or universal) that has this sub-shelf.
	const clusterSubcollections = clusterPaths
		.map((p) => {
			const rootSegment = p.split('/')[0];
			const folderLabel = graph.folderLabels(p);
			const rootLabels = graph.folderLabels(rootSegment);
			return {
				...buildSubcollectionEntry(p, kindTree),
				plural: folderLabel.plural + ' of ' + rootLabels.plural,
				isCluster: true as const
			};
		})
		.sort((a, b) => a.plural.localeCompare(b.plural));

	const subcollectionTrees = clusterPaths.map((p) =>
		buildSubcollectionTree(p, '', cardSummaryHtml)
	);

	const entities = graph.entitiesBySubShelfAll(shelf, subShelf);

	const clusterLabel = (id: EntityId): string => {
		const cluster = id.includes('/') ? id.slice(0, id.indexOf('/')) : id;
		return graph.folderLabels(cluster).singular;
	};

	const flat = entities.map((e) => toCard(e, cardSummaryHtml, clusterLabel(e.id)));

	// Child-folder tiles: collect distinct child folder names across all
	// cluster sub-shelf paths (e.g. `aurethia/people/characters/nobles` and
	// `earth/people/characters/nobles` → one "Nobles" tile linking to
	// `/people/characters/nobles`). These are regular (non-cluster) collection
	// tiles rendered below the cluster tiles in Index mode.
	const childFolderNames = new Set<string>();
	for (const clusterPath of clusterPaths) {
		for (const childPath of graph.childFolders(clusterPath)) {
			const name = childPath.slice(childPath.lastIndexOf('/') + 1);
			childFolderNames.add(name);
		}
	}
	const childSubcollections = [...childFolderNames]
		.map((name) => {
			// Aggregate across all cluster instances of this child folder.
			const childClusterPaths = clusterPaths
				.map((cp) => `${cp}/${name}`)
				.filter((p) => graph.isFolder(p));
			if (childClusterPaths.length === 0) return null;
			const combined = childClusterPaths.reduce(
				(acc, p) => {
					const entry = buildSubcollectionEntry(p, kindTree);
					acc.count += entry.count;
					for (const [k, v] of Object.entries(entry.kindCounts))
						acc.kindCounts[k] = (acc.kindCounts[k] ?? 0) + v;
					for (const t of entry.tags)
						acc.tagCounts.set(t.label, (acc.tagCounts.get(t.label) ?? 0) + t.count);
					return acc;
				},
				{
					count: 0,
					kindCounts: {} as Record<string, number>,
					tagCounts: new Map<string, number>()
				}
			);
			const labelSourcePath = childClusterPaths[0];
			const childLabels = graph.folderLabels(labelSourcePath);
			const childDescription = graph.collection(labelSourcePath)?.meta.description ?? null;
			const tags = [...combined.tagCounts.entries()]
				.map(([label, count]) => ({ label, count }))
				.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
			return {
				type: labelSourcePath,
				plural: childLabels.plural,
				description: childDescription,
				rank: null as number | null,
				count: combined.count,
				kindCounts: combined.kindCounts,
				tags,
				tagsByKind: {} as Record<string, Array<{ label: string; count: number }>>,
				eraCounts: {} as Record<string, number>,
				noEraCount: 0,
				isCluster: false as const
			};
		})
		.filter((e): e is NonNullable<typeof e> => e !== null)
		.sort((a, b) => a.plural.localeCompare(b.plural));

	// Borrow display labels from first cluster that defines the sub-shelf.
	const labelSourcePath = clusterPaths.find((p) => graph.collection(p)) ?? clusterPaths[0];
	const label = graph.folderLabels(labelSourcePath ?? `${shelf}/${subShelf}`);
	const description = `${label.plural} across ${world.config().name}`;

	// Shelf label for the breadcrumb back-link.
	const shelfClusterPaths = graph.allShelfPaths(shelf);
	const shelfLabelSourcePath =
		shelfClusterPaths.find((p) => graph.collection(p)) ?? shelfClusterPaths[0];
	const shelfLabel = graph.folderLabels(shelfLabelSourcePath ?? shelf);

	return {
		kind: 'collection' as const,
		type: `${shelf}/${subShelf}`,
		label,
		breadcrumbs: [{ label: shelfLabel.plural, href: `/${shelf}` }],
		description,
		bodyHtml: null,
		// Cluster tiles first, then child-folder tiles.
		subcollections: [...clusterSubcollections, ...childSubcollections],
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
		subcollectionTrees,
		containers: [] as ContainerNode[],
		orbits: [] as OrbitNode[],
		folders: [] as Array<{
			path: string;
			name: string;
			count: number;
		}>,
		// Index mode shows cluster tiles + child-folder tiles, then the full
		// entity grid (union across all clusters) below them.
		standalone: flat,
		flat,
		collectionNav: { rank: null, rankDisplay: 'arabic' as RankDisplay, prev: null, next: null },
		entityRankDisplay: 'arabic' as RankDisplay,
		subcollectionRankDisplay: 'arabic' as RankDisplay,
		kindParents: serialiseKinds()
	};
}
