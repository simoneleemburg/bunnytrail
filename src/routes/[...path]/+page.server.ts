import { error } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { loadEntityPage } from './_entityPage.load';
import { loadAggregateShelfPage, loadCollectionPage } from './_collectionPage.load';
import { loadChapterPage } from './_chapterPage.load';
import { loadCraftPage } from './_craftPage.load';
import { loadKindsIndexPage } from '../kinds/_kindsIndexPage.load';
import { loadKindPage } from '../kinds/[kind]/_kindPage.load';

/**
 * Unified route for everything that lives inside the worldbuilding
 * graph. The `[...path]` rest-segment captures a full entity id, a
 * folder path, or an entity sub-page. We resolve it against the
 * graph and dispatch:
 *
 *   - path matches a known *entity* id     → entity page
 *   - path is `<entity-id>/chapters/<slug>`
 *     for a book-shaped entity              → chapter page
 *   - path is `<entity-id>/craft`
 *     for an entity with a craft sheet      → craft page
 *   - path is a *browseable folder* (has
 *     a `_collection.yaml` or descendant
 *     entities)                             → collection page
 *   - path is a single segment naming a
 *     *union shelf* (a shelf-name found
 *     under one or more clusters)           → cross-cluster aggregate
 *                                             shelf page
 *   - anything else                         → 404
 *
 * An entity and a folder are not mutually exclusive: an entity
 * folder may also contain child entities and a `_collection.yaml`.
 * Entities take precedence — the entity page already shows the
 * folder's children. Real folders take precedence over aggregate
 * shelves with the same name.
 */
export async function load({ params }) {
	await graph.ready();

	const path = params.path;
	if (!path) error(404, 'Missing path');

	// Cluster-scoped /kinds: `<cluster>/kinds` and
	// `<cluster>/kinds/<kind-id>`. Filters the global kinds tree /
	// kind page to instances within that cluster. Must run before
	// the entity / folder branches because `<cluster>/kinds` would
	// otherwise be matched as a (non-existent) folder.
	const kindsMatch = path.match(/^([a-z0-9][a-z0-9-]*)\/kinds(?:\/(.+))?$/);
	if (kindsMatch && graph.clusters().includes(kindsMatch[1])) {
		const cluster = kindsMatch[1];
		const kindId = kindsMatch[2];
		if (kindId) {
			return { kind: 'kindPage' as const, ...loadKindPage(kindId, cluster) };
		}
		return { kind: 'kindsIndex' as const, ...loadKindsIndexPage(cluster) };
	}

	const entity = graph.get(path);
	if (entity) {
		return { kind: 'entity' as const, ...loadEntityPage(entity) };
	}

	// Chapter dispatch: split off a trailing `/chapters/<slug>` and
	// see whether the prefix names a book-shaped entity.
	const chapterMatch = path.match(/^(.+)\/chapters\/([a-z0-9][a-z0-9-]*)$/);
	if (chapterMatch) {
		const work = graph.get(chapterMatch[1]);
		if (work && work.chapters.length > 0) {
			const chapter = work.chapters.find((c) => c.slug === chapterMatch[2]);
			if (chapter) {
				return { kind: 'chapter' as const, ...loadChapterPage(work, chapter) };
			}
		}
	}

	// Craft sub-page dispatch: `<entity-id>/craft` for any entity
	// that has a sibling `craft.md`. Surfaces author's-room
	// companion material.
	const craftMatch = path.match(/^(.+)\/craft$/);
	if (craftMatch) {
		const subject = graph.get(craftMatch[1]);
		if (subject && subject.craft !== null) {
			return { kind: 'craft' as const, ...loadCraftPage(subject) };
		}
	}

	if (graph.isFolder(path)) {
		return loadCollectionPage(path);
	}

	// Cross-cluster aggregate: a single segment that names a shelf
	// living under one or more clusters, but isn't itself a real
	// top-level folder.
	if (!path.includes('/') && graph.unionShelves().includes(path)) {
		return loadAggregateShelfPage(path);
	}

	error(404, `Not found: ${path}`);
}
