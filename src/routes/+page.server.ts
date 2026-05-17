import { graph } from '$lib/server/graph';
import { ENTITY_TYPE_LABELS, type EntityType } from '$lib/types';

export async function load() {
	await graph.ready();
	const all = graph.all();

	const counts: { type: EntityType; label: string; count: number }[] = [];
	for (const [type, labels] of Object.entries(ENTITY_TYPE_LABELS) as [
		EntityType,
		(typeof ENTITY_TYPE_LABELS)[EntityType]
	][]) {
		const count = graph.byType(type).length;
		if (count > 0) counts.push({ type, label: labels.plural, count });
	}

	return {
		counts,
		totalEntities: all.length,
		tags: graph.tags().slice(0, 12),
		issues: graph.issues().length
	};
}
