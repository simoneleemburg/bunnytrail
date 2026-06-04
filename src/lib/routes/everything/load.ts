import { graph } from '$lib/server/graph';
import { loadEverythingIndex } from '../path/everythingIndex.load';

/**
 * Global all-content index. Reuses the same loader + view-model
 * shape as the per-folder collection page, with top-level folders
 * in the "collection tiles" slot.
 */
export async function load() {
	await graph.ready();
	return loadEverythingIndex();
}


export type EverythingData = Awaited<ReturnType<typeof load>>;
