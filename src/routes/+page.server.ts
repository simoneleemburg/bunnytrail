import { graph } from '$lib/server/graph';

/**
 * Recursively walk every browseable folder under `content/`, in
 * deterministic order. Used both for the home-page collection
 * counter ("N collections" in the hero) and for selecting the
 * "Threads" tiles below the top-level grid.
 */
function allFolders(): string[] {
	const out: string[] = [];
	const walk = (parent: string) => {
		for (const child of graph.childFolders(parent)) {
			out.push(child);
			walk(child);
		}
	};
	walk('');
	return out;
}

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

	// "Threads" — cross-cuts through the topology that the author has
	// bothered to give editorial metadata. Selection rule: every
	// sub-collection (not top-level) carrying a `_collection.yaml`,
	// with at least two recursive entities. Sorted by count desc, then
	// alphabetically; capped at six tiles so the section stays a
	// curated row rather than a directory.
	const folders = allFolders();
	const topLevel = new Set(graph.topLevelFolders());
	const threads = folders
		.filter((p) => !topLevel.has(p))
		.filter((p) => graph.collection(p) !== undefined)
		.map((p) => {
			const labels = graph.folderLabels(p);
			return {
				type: p,
				label: labels.plural,
				description: graph.collection(p)?.meta.description ?? null,
				count: graph.byFolderRecursive(p).length
			};
		})
		.filter((t) => t.count >= 2)
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
		.slice(0, 6);

	const entities = graph.all();
	const entitiesWithProse = entities.filter((e) => e.body.trim().length > 0).length;

	const kinds = [...graph.kindRegistry().values()];
	const kindsWithProse = kinds.filter((k) => (k.body ?? '').trim().length > 0).length;

	return {
		counts,
		threads,
		collectionCount: folders.length,
		totalEntities: entities.length,
		entitiesWithProse,
		kindCount: kinds.length,
		kindsWithProse,
		tags: graph.tags().slice(0, 12),
		issues: graph.issues().length
	};
}
