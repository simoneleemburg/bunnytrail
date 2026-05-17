import { error } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import type { EntityType } from '$lib/types';

export async function load({ params }) {
	await graph.ready();

	const type = params.type as EntityType;
	if (!graph.hasType(type)) error(404, `Unknown entity type: ${params.type}`);

	const info = graph.typeInfo(type);
	const entities = graph.byType(type).sort((a, b) => a.meta.name.localeCompare(b.meta.name));

	return {
		type,
		label: info.labels,
		description: info.description,
		entities: entities.map((e) => ({
			id: e.id,
			slug: e.slug,
			name: e.meta.name,
			summary: e.meta.summary ?? null,
			tags: e.meta.tags ?? [],
			era: e.meta.era ?? null
		}))
	};
}
