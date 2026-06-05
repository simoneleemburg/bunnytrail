import { graph } from '$lib/server/graph';
import { loadKindsIndexPage } from './kindsIndexPage.load';

export type { KindNode } from './kindsIndexPage.load';

/**
 * Global kind hierarchy overview (cross-cluster). Walks the kind
 * registry (`content_meta/kinds/`) and renders it as a tree, linking
 * each node to its `/kinds/<kind>` page. Unregistered kinds (free-form
 * `kind:` values authors have used without registering) appear in a
 * separate section.
 *
 * The cluster-scoped variant lives at `/<cluster>/kinds` and is
 * dispatched from `[...path]/+page.server.ts`. Both call into
 * `loadKindsIndexPage`.
 */
export async function load() {
	await graph.ready();
	return loadKindsIndexPage(null);
}

export type KindsIndexData = Awaited<ReturnType<typeof load>>;
