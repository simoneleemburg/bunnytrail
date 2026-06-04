import { graph } from '$lib/server/graph';
import { renderSummary } from '$lib/server/markdown';
import { world } from '$lib/server/world';
import { type RankDisplay } from '$lib/types';
import {
	buildLoaderKindTree,
	buildSubcollectionEntry,
	buildSubcollectionTree,
	labelForFolder,
	serialiseKinds,
	toCard,
	type ContainerNode,
	type OrbitNode
} from './collectionPage.helpers';

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
		.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
		.map((e) => toCard(e, cardSummaryHtml, labelForFolder(e.type)));

	return {
		kind: 'collection' as const,
		type: '',
		label: { singular: 'Entry', plural: 'Everything' },
		breadcrumbs: [],
		description: `Every entry in ${world.config().name}, in one place. Filter or flatten to taste.`,
		bodyHtml: null,
		subcollections,
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
		standalone: [] as typeof allCards,
		flat: allCards,
		collectionNav: { rank: null, rankDisplay: 'arabic' as RankDisplay, prev: null, next: null },
		entityRankDisplay: 'arabic' as RankDisplay,
		subcollectionRankDisplay: 'arabic' as RankDisplay,
		kindParents: serialiseKinds()
	};
}
