import { graph } from '$lib/server/graph';
import { sources } from '$lib/server/sources';

/**
 * Index of all source projects — the feeder works being absorbed
 * into the world. Out-of-world catalogue, sibling to the Notebook.
 *
 * Each project's optional `entity:` pointer is resolved against
 * the graph here so the view can render a link without re-querying.
 * The graph is needed both for the resolution and (eventually) for
 * any cross-reference the view chooses to draw; we await both
 * singletons explicitly because /sources doesn't share a layout
 * with the rest of the worldbuilding pages.
 */
export async function load() {
	await graph.ready();
	await sources.ready();

	const projects = sources.all().map((p) => {
		const entity = p.entity ? (graph.get(p.entity) ?? null) : null;
		// Resolve the cluster slug to its display label via the
		// graph (the same source the masthead nav uses). Unknown
		// slugs fall through to the raw value so a typo is visible
		// rather than silently dropped.
		const clusterLabel = p.cluster ? graph.folderLabels(p.cluster).singular : null;
		return {
			slug: p.slug,
			title: p.title,
			yearStart: p.yearStart,
			genre: p.genre,
			size: p.size,
			integration: p.integration,
			catchline: p.catchline,
			cluster: p.cluster ? { slug: p.cluster, label: clusterLabel ?? p.cluster } : null,
			entity: entity
				? {
						id: entity.id,
						name: entity.meta.name,
						summary: entity.meta.summary ?? null,
						sigil: entity.meta.sigil ?? null,
						kind: entity.meta.kind ?? null
					}
				: null
		};
	});

	return { projects };
}

export type SourcesData = Awaited<ReturnType<typeof load>>;
