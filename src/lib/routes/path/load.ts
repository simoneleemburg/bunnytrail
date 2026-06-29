import { error, redirect } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { readMode } from '$lib/cluster';
import { loadEntityPage } from './entityPage.load';
import { loadCollectionPage } from './collectionPage.load';
import { loadAggregateShelfPage } from './aggregateShelfPage.load';
import { loadAggregateSubShelfPage } from './aggregateSubShelfPage.load';
import { loadChapterPage } from './chapterPage.load';
import { loadCraftPage } from './craftPage.load';
import { loadTimelinePage } from './timelinePage.load';
import { loadTimelineDotPage } from './timelineDotPage.load';
import { loadKindsIndexPage } from '../kinds/kindsIndexPage.load';
import { loadKindPage } from '../kinds/kind/kindPage.load';
import { loadSymbologyPage } from '../symbology/load';

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
export async function load({ params, url }: { params: { path: string }; url: URL }) {
	await graph.ready();

	const path = params.path;
	if (!path) error(404, 'Missing path');

	// During prerendering SvelteKit forbids accessing url.searchParams.
	// Mode and scope are query-string concerns only — prerendered pages
	// always render in the default ('visitor') mode with no scope.
	let searchParams: URLSearchParams;
	try {
		searchParams = url.searchParams;
	} catch {
		searchParams = new URLSearchParams();
	}
	const mode = readMode(searchParams);

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

	// Cluster-scoped /symbology: `<cluster>/symbology` or
	// `<universal>/symbology`. Filters the global sigil index to
	// entities within that root. Must run before entity/folder branches.
	const symbologyMatch = path.match(/^([a-z0-9][a-z0-9-]*)\/symbology$/);
	if (
		symbologyMatch &&
		(graph.clusters().includes(symbologyMatch[1]) ||
			graph.universalFolders().includes(symbologyMatch[1]))
	) {
		return { kind: 'symbology' as const, ...loadSymbologyPage(symbologyMatch[1]) };
	}

	const entity = graph.get(path);
	if (entity) {
		return { kind: 'entity' as const, ...(await loadEntityPage(entity, mode)) };
	}

	// Timeline dot dispatch: `<timeline-path>/<slug>` where the path is a
	// known timeline and the last segment is either an integer year or a
	// named-folder slug (for calendar-date entries).
	const lastSlash = path.lastIndexOf('/');
	if (lastSlash !== -1) {
		const possibleSlug = path.slice(lastSlash + 1);
		const timelinePath = path.slice(0, lastSlash);
		if (graph.isTimeline(timelinePath)) {
			const thread = searchParams.get('thread') ?? null;
			const dotData = await loadTimelineDotPage(timelinePath, possibleSlug, thread);
			if (dotData) return dotData;
		}
	}

	// Timeline line dispatch: the path itself is a known timeline.
	if (graph.isTimeline(path)) {
		return await loadTimelinePage(path);
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
	// found under it across clusters or universal folders (e.g.
	// `people/characters`, `nature/mortals`).
	// Must come after the real-folder check so genuine content paths
	// take precedence, but before the final 404.
	const slashIdx = path.indexOf('/');
	if (slashIdx !== -1 && !path.includes('/', slashIdx + 1)) {
		const seg0 = path.slice(0, slashIdx);
		const seg1 = path.slice(slashIdx + 1);
		if (graph.unionShelves().includes(seg0) && graph.subShelvesAll(seg0).includes(seg1)) {
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

/**
 * Enumerate every path that this catch-all route handles so that
 * SvelteKit's prerenderer knows which pages to generate.
 *
 * Covers: entity ids, browseable folder paths, chapter sub-pages,
 * craft sub-pages, cluster-scoped /kinds and /symbology, and
 * cross-cluster aggregate shelf / sub-shelf paths.
 */
export async function entries(): Promise<{ path: string }[]> {
	await graph.ready();

	const paths = new Set<string>();

	// Every entity
	for (const entity of graph.all()) {
		paths.add(entity.id);
		// Chapter sub-pages
		for (const chapter of entity.chapters) {
			paths.add(`${entity.id}/chapters/${chapter.slug}`);
		}
		// Craft sub-page
		if (entity.craft !== null) {
			paths.add(`${entity.id}/craft`);
		}
	}

	// Every browseable folder
	for (const entity of graph.all()) {
		// Walk ancestor folder segments
		const segs = entity.id.split('/');
		for (let i = 1; i < segs.length; i++) {
			const folder = segs.slice(0, i).join('/');
			if (graph.isFolder(folder)) paths.add(folder);
		}
	}

	// Cluster-scoped /kinds and /kinds/<id>, /symbology
	for (const cluster of graph.clusters()) {
		paths.add(`${cluster}/kinds`);
		paths.add(`${cluster}/symbology`);
		for (const kind of graph.kindIds()) {
			paths.add(`${cluster}/kinds/${kind}`);
		}
	}
	// Universal-folder /symbology
	for (const uf of graph.universalFolders()) {
		paths.add(`${uf}/symbology`);
	}

	// Cross-cluster aggregate shelves and sub-shelves
	for (const shelf of graph.unionShelves()) {
		paths.add(shelf);
		for (const sub of graph.subShelvesAll(shelf)) {
			paths.add(`${shelf}/${sub}`);
		}
	}

	// Timeline pages: line at the timeline path itself, dots at <path>/<slug>
	for (const [timelinePath, timeline] of graph.timelines()) {
		paths.add(timelinePath);
		for (const entry of timeline.entries) {
			// Use the entry's folder name (last segment of path) as the slug,
			// not entry.year — named-folder calendar-date entries have non-numeric slugs.
			const slug = entry.path.includes('/')
				? entry.path.slice(entry.path.lastIndexOf('/') + 1)
				: entry.path;
			paths.add(`${timelinePath}/${slug}`);
		}
	}

	return [...paths].map((p) => ({ path: p }));
}
