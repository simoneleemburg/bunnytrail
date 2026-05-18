import { graph } from '$lib/server/graph';
import { loadEverythingIndex } from '../[...path]/_typeIndex.load';

/**
 * Global all-content index. Reuses the same loader + view-model
 * shape as the type-scoped indexes, with top-level types in the
 * "collection tiles" slot.
 */
export async function load() {
	await graph.ready();
	return loadEverythingIndex();
}
