import { graph } from '$lib/server/graph';

export async function load() {
	await graph.ready();

	// Top-level folders become the home-page "browse by collection"
	// tiles. Each carries a recursive count and (when authored) its
	// `_collection.yaml` description.
	const counts = graph
		.topLevelFolders()
		.map((p) => {
			const labels = graph.folderLabels(p);
			return {
				type: p,
				label: labels.plural,
				description: graph.collection(p)?.meta.description ?? null,
				count: graph.byFolderRecursive(p).length
			};
		})
		.filter((t) => t.count > 0);

	return {
		counts,
		totalEntities: graph.all().length,
		kindCount: graph.kindRegistry().size,
		tags: graph.tags().slice(0, 12),
		issues: graph.issues().length
	};
}
