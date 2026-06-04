import { error, redirect } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { loadEntityPage } from './entityPage.load';
import { loadCollectionPage } from './collectionPage.load';
import { loadAggregateShelfPage } from './aggregateShelfPage.load';
import { loadAggregateSubShelfPage } from './aggregateSubShelfPage.load';
import { loadChapterPage } from './chapterPage.load';
import { loadCraftPage } from './craftPage.load';
import { loadKindsIndexPage } from '../kinds/kindsIndexPage.load';
import { loadKindPage } from '../kinds/kind/kindPage.load';

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
export async function load({ params }: { params: { path: string } }) {
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
		return { kind: 'entity' as const, ...(await loadEntityPage(entity)) };
	}

	// Chapter dispatch: split off a trailing `/chapters/<slug>` and
	// see whether the prefix names a book-shaped entity.
	const chapterMatch = path.match(/^(.+)\/chapters\/([a-z0-9][a-z0-9-]*)$/);
	if (chapterMatch) {
		const work = graph.get(chapterMatch[1]);
		if (work && work.chapters.length > 0) {
			const chapter = work.chapters.find((c) => c.slug === chapterMatch[2]);
			if (chapter) {
				return { kind: 'chapter' as const, ...(await loadChapterPage(work, chapter)) };
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
			return { kind: 'craft' as const, ...(await loadCraftPage(subject)) };
		}
	}

	if (graph.isFolder(path)) {
		return await loadCollectionPage(path);
	}

	// Cross-cluster aggregate: a single segment that names a shelf
	// living under one or more clusters, but isn't itself a real
	// top-level folder.
	if (!path.includes('/') && graph.unionShelves().includes(path)) {
		return loadAggregateShelfPage(path);
	}

	// Cross-cluster aggregate sub-shelf: two-segment path where the
	// first segment is a union shelf and the second is a sub-shelf
	// found under it across clusters (e.g. `people/characters`).
	// Must come after the real-folder check so genuine content paths
	// take precedence, but before the final 404.
	const slashIdx = path.indexOf('/');
	if (slashIdx !== -1 && !path.includes('/', slashIdx + 1)) {
		const seg0 = path.slice(0, slashIdx);
		const seg1 = path.slice(slashIdx + 1);
		if (
			graph.unionShelves().includes(seg0) &&
			graph.subShelvesAcrossClusters(seg0).includes(seg1)
		) {
			return loadAggregateSubShelfPage(seg0, seg1);
		}
	}

	// If the path has a cluster prefix but nothing was found, redirect
	// to the cluster root rather than showing a bare 404. This covers
	// cluster-switch navigations where the equivalent page doesn't
	// exist in the target cluster (e.g. switching to "earth" while on
	// /aurethia/places/bayurinda). Guard path !== seg0 to avoid
	// redirecting a bare cluster root to itself if it has no content.
	const seg0 = path.split('/')[0];
	if (path !== seg0 && graph.clusters().includes(seg0)) {
		redirect(302, `/${seg0}`);
	}

	error(404, `Not found: ${path}`);
}

export type PathPageData = Awaited<ReturnType<typeof load>>;
