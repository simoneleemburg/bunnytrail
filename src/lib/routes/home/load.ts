import { graph } from '$lib/server/graph';
import { guides } from '$lib/server/guides';
import { sources } from '$lib/server/sources';

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
	await guides.ready();
	await sources.ready();

	// Guide callouts — content-authored tours of the world that live
	// under `content_meta/guides/`. The homepage renders one card per
	// guide; with a single guide this reads as a "start here" panel,
	// with several it becomes a small index.
	const guideCallouts = guides.all().map((g) => ({
		slug: g.slug,
		eyebrow: g.eyebrow,
		title: g.title,
		summary: g.summary,
		href: `/guides/${g.slug}`
	}));

	// Source projects — out-of-world author's-room catalogue of the
	// feeder works being integrated into Alteria. Resolve each
	// optional `entity` pointer eagerly so the view can render an
	// EntityLink without re-querying the graph.
	const sourceProjects = sources.all().map((p) => {
		const entity = p.entity ? (graph.get(p.entity) ?? null) : null;
		return {
			slug: p.slug,
			title: p.title,
			yearStart: p.yearStart,
			genre: p.genre,
			size: p.size,
			integration: p.integration,
			catchline: p.catchline,
			entity: entity
				? {
						id: entity.id,
						name: entity.meta.name,
						summary: entity.meta.summary ?? null,
						sigil: entity.meta.sigil ?? null
					}
				: null
		};
	});

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

	// Entities carrying a chapters/ subfolder — "works" in the
	// generic sense (a record bearing fragments, a future codex,
	// any container with internal pages). The counter surfaces the
	// total chapter count alongside how many works hold them.
	const worksWithChapters = entities.filter((e) => e.chapters.length > 0);
	const totalChapters = worksWithChapters.reduce((n, e) => n + e.chapters.length, 0);

	const kinds = [...graph.kindRegistry().values()];
	const kindsWithProse = kinds.filter((k) => (k.body ?? '').trim().length > 0).length;

	return {
		counts,
		threads,
		collectionCount: folders.length,
		totalEntities: entities.length,
		entitiesWithProse,
		totalChapters,
		workCount: worksWithChapters.length,
		kindCount: kinds.length,
		kindsWithProse,
		tags: graph.tags().slice(0, 12),
		issues: graph.issues().length,
		sourceProjects,
		guides: guideCallouts
	};
}


export type HomeData = Awaited<ReturnType<typeof load>>;
