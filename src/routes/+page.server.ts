import { graph } from '$lib/server/graph';

export async function load() {
	await graph.ready();

	const counts = graph
		.types()
		.filter((t) => t.count > 0)
		.map((t) => ({
			type: t.type,
			label: t.labels.plural,
			description: t.description,
			count: t.count
		}));

	return {
		counts,
		totalEntities: graph.all().length,
		kindCount: graph.kinds().all().length,
		tags: graph.tags().slice(0, 12),
		issues: graph.issues().length
	};
}
