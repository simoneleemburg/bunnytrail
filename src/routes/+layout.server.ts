import { graph } from '$lib/server/graph';

export async function load() {
	await graph.ready();

	// Top-level nav lists only top-level folders; subfolders are
	// reached via their parent collection page (which shows them as
	// tiles).
	const nav = graph.topLevelFolders().map((p) => ({
		href: `/${p}`,
		label: graph.folderLabels(p).plural,
		count: graph.byFolderRecursive(p).length
	}));

	return { nav };
}
