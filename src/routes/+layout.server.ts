import { graph } from '$lib/server/graph';
import { readScope, type ScopeContext } from '$lib/cluster';

/**
 * Cluster scope for the masthead nav.
 *
 * Top-level folders under `content/` are *clusters* of the universe
 * (currently `aurethia/` and `earth/`). The user's current scope is
 * derived from the URL itself — see `$lib/cluster.ts` for the rules.
 * No cookie; the URL is the source of truth.
 *
 * `selectedCluster === null` is the "All Alteria" view: shelf links
 * go to virtual aggregate routes like `/characters` that gather
 * entries from every cluster.
 *
 * `selectedCluster === '<cluster>'` scopes shelf links to that
 * cluster: `/aurethia/characters` etc. — real folder routes.
 */
export async function load({ url }) {
	await graph.ready();

	const clusters = graph.clusters();
	const unionShelves = graph.unionShelves();
	// Top-level paths that have a cluster-scoped variant under
	// /<cluster>/. /kinds is synthesized (not a content folder), so
	// the union-shelf list doesn't include it.
	const clusterAwarePaths = ['kinds'];
	const ctx: ScopeContext = { clusters, unionShelves, clusterAwarePaths };
	const selectedCluster = readScope(url.pathname, url.searchParams, ctx);

	// In All scope, shelf links go to cross-cluster aggregates; we
	// don't paint ?scope=all on these because aggregate URLs already
	// *are* All-scope URLs by construction.
	// In a cluster scope, shelf links go to that cluster's shelves.
	const nav = unionShelves.map((shelf) => {
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
		...clusters.map((c) => ({
			value: c,
			label: graph.folderLabels(c).singular,
			selected: selectedCluster === c
		}))
	];

	return {
		nav,
		// Kinds is its own destination (taxonomy), separate from the
		// content shelves above. In a cluster scope it points at the
		// per-cluster filtered view.
		kindsHref: selectedCluster ? `/${selectedCluster}/kinds` : '/kinds',
		clusterOptions,
		selectedCluster,
		// Surface the scope context to the client so the navigation
		// hook can rewrite outgoing links without re-deriving it.
		scopeContext: { clusters, unionShelves, clusterAwarePaths } satisfies ScopeContext
	};
}
