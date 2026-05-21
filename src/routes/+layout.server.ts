import { graph } from '$lib/server/graph';

/**
 * Cluster scope for the masthead nav.
 *
 * Top-level folders under `content/` are *clusters* of the universe
 * (currently `aurethia/` and `earth/`). The user picks a cluster (or
 * "all") to scope their browsing; the choice is persisted in a cookie
 * so it survives navigation and reload.
 *
 * `cluster === null` is the "all" / cross-cluster view: shelf links go
 * to virtual aggregate routes like `/characters` that gather entries
 * from every cluster.
 *
 * `cluster === '<cluster>'` scopes shelf links to that cluster:
 * `/aurethia/characters` etc. — real folder routes that already
 * existed before the nav rework.
 */
export async function load({ cookies }) {
	await graph.ready();

	const clusters = graph.clusters();
	const cookieValue = cookies.get('cluster') ?? '';
	const selectedCluster: string | null =
		cookieValue && clusters.includes(cookieValue) ? cookieValue : null;

	// Shelf links: union of immediate sub-shelves found across all
	// clusters. With one cluster this is just that cluster's shelves;
	// with several it's the union, deduplicated.
	const shelves = graph.unionShelves();
	const nav = shelves.map((shelf) => {
		// Display label: the *singular* cluster's collection-yaml title
		// for this shelf, or a title-cased fallback. We prefer the
		// cluster-local title because that's where the editorial
		// description was authored.
		const labelSourcePath =
			graph.clusterShelfPaths(shelf).find((p) => graph.collection(p)) ??
			graph.clusterShelfPaths(shelf)[0];
		const label = graph.folderLabels(labelSourcePath ?? shelf).plural;
		const href = selectedCluster ? `/${selectedCluster}/${shelf}` : `/${shelf}`;
		const count = selectedCluster
			? graph.byFolderRecursive(`${selectedCluster}/${shelf}`).length
			: graph.entitiesByShelfAcrossClusters(shelf).length;
		return { href, label, count };
	});

	const clusterOptions = [
		{ value: '', label: 'All Alteria', selected: selectedCluster === null },
		...clusters.map((r) => ({
			value: r,
			label: graph.folderLabels(r).singular,
			selected: selectedCluster === r
		}))
	];

	return {
		nav,
		clusterOptions,
		selectedCluster
	};
}
