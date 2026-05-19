import { error } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { loadEntityPage } from './_entityPage.load';
import { loadCollectionPage } from './_collectionPage.load';

/**
 * Unified route for everything that lives inside the worldbuilding
 * graph. The `[...path]` rest-segment captures a full entity id or
 * a folder path. We resolve it against the graph and dispatch:
 *
 *   - path matches a known *entity* id     → entity page
 *   - path is a *browseable folder* (has
 *     a `_collection.yaml` or descendant
 *     entities)                            → collection page
 *   - anything else                         → 404
 *
 * An entity and a folder are not mutually exclusive: an entity
 * folder may also contain child entities and a `_collection.yaml`.
 * Entities take precedence — the entity page already shows the
 * folder's children.
 */
export async function load({ params }) {
	await graph.ready();

	const path = params.path;
	if (!path) error(404, 'Missing path');

	const entity = graph.get(path);
	if (entity) {
		return loadEntityPage(entity);
	}

	if (graph.isFolder(path)) {
		return loadCollectionPage(path);
	}

	error(404, `Not found: ${path}`);
}
