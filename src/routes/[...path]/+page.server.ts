import { error } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { loadEntityPage } from './_entityPage.load';
import { loadTypeIndex } from './_typeIndex.load';

/**
 * Unified route for everything that lives inside the worldbuilding
 * graph. The `[...path]` rest-segment captures a full entity id or
 * type path. We resolve it against the graph and dispatch:
 *
 *   - path matches a known *type* path  → type index page
 *   - path matches a known *entity* id  → entity page
 *   - anything else                     → 404
 *
 * A type and an entity can never have the same path (an entity's id
 * always ends in a slug that isn't a type folder, because type
 * folders are marked by `_type.yaml`).
 */
export async function load({ params }) {
	await graph.ready();

	const path = params.path;
	if (!path) error(404, 'Missing path');

	if (graph.hasType(path)) {
		return loadTypeIndex(path);
	}

	const entity = graph.get(path);
	if (entity) {
		return loadEntityPage(entity);
	}

	error(404, `Not found: ${path}`);
}
