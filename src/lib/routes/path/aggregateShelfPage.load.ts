import { graph } from '$lib/server/graph';
import { renderSummary } from '$lib/server/markdown';
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
 *     in, mirroring how the everything index labels by folder.
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
	const clusterPaths = graph.allShelfPaths(shelf);

	const subcollections = clusterPaths
		.map((p) => {
			const rootSegment = p.split('/')[0];
			const folderLabel = graph.folderLabels(p);
			const rootLabels = graph.folderLabels(rootSegment);
			return {
				...buildSubcollectionEntry(p, kindTree),
				plural: rootLabels.plural + ' · ' + folderLabel.plural,
				isCluster: true as const
			};
		})
		.sort((a, b) => a.plural.localeCompare(b.plural));

	const subcollectionTrees = clusterPaths.map((p) =>
		buildSubcollectionTree(p, '', cardSummaryHtml)
	);

	const entities = graph.entitiesByShelfAll(shelf);

	// Root (cluster or universal-folder) label as the type-label on each card.
	const clusterLabel = (id: EntityId): string => {
		const cluster = id.includes('/') ? id.slice(0, id.indexOf('/')) : id;
		return graph.folderLabels(cluster).singular;
	};

	const flat = entities.map((e) => toCard(e, cardSummaryHtml, clusterLabel(e.id)));

	// Sub-shelf tiles — one per distinct second-level folder across all
	// roots (e.g. 'mortals', 'primordials' for 'nature').
	// Each tile links to /<shelf>/<subShelf> which resolves via the
	// aggregate sub-shelf dispatch branch.
	const subShelfNames = graph.subShelvesAll(shelf);
	const subShelves = subShelfNames.map((subShelf) => {
		const subShelfPaths = graph.allSubShelfPaths(shelf, subShelf);
		// Aggregate counts/tags across all cluster instances of this sub-shelf.
		const combined = subShelfPaths.reduce(
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
		// Borrow display labels from first cluster that has this sub-shelf.
		const labelSourcePath = subShelfPaths[0] ?? `${shelf}/${subShelf}`;
		const subLabels = graph.folderLabels(labelSourcePath);
		const subDescription = graph.collection(labelSourcePath)?.meta.description ?? null;
		const tags = [...combined.tagCounts.entries()]
			.map(([label, count]) => ({ label, count }))
			.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
		return {
			type: `${shelf}/${subShelf}`,
			plural: subLabels.plural,
			description: subDescription,
			rank: null as number | null,
			count: combined.count,
			kindCounts: combined.kindCounts,
			tags,
			tagsByKind: {} as Record<string, Array<{ label: string; count: number }>>,
			isCluster: false as const,
			isSubShelf: true as const
		};
	});

	// Borrow display labels from first root (cluster or universal) that has this shelf.
	const labelSourcePath = clusterPaths.find((p) => graph.collection(p)) ?? clusterPaths[0];
	const label = graph.folderLabels(labelSourcePath ?? shelf);
	const description = graph.collection(labelSourcePath)?.meta.description ?? null;

	return {
		kind: 'collection' as const,
		type: shelf,
		label,
		breadcrumbs: [],
		description,
		bodyHtml: null,
		subcollections,
		timelines: [] as Array<{ path: string; href: string; title: string; summary: string | null; firstYear: number | null; lastYear: number | null; dateRange: string | null; firstCalendarDate: import('$lib/calendar').CalendarDate | null; lastCalendarDate: import('$lib/calendar').CalendarDate | null }>,
		subShelves,
		subcollectionTrees,
		containers: [] as ContainerNode[],
		orbits: [] as OrbitNode[],
		folders: [] as Array<{
			path: string;
			name: string;
			count: number;
		}>,
		// Index mode shows sub-shelf tiles rather than a flat entity grid.
		// standalone is empty so no entity cards render in Index view.
		// Flat view uses `flat` for full entity browsing.
		standalone: [] as ReturnType<typeof toCard>[],
		flat,
		collectionNav: { rank: null, rankDisplay: 'arabic' as RankDisplay, prev: null, next: null },
		entityRankDisplay: 'arabic' as RankDisplay,
		subcollectionRankDisplay: 'arabic' as RankDisplay,
		kindParents: serialiseKinds()
	};
}
