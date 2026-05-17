import { error } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { renderEntityBody } from '$lib/server/markdown';
import type { EntityType } from '$lib/types';

export async function load({ params }) {
	await graph.ready();

	const type = params.type as EntityType;
	if (!graph.hasType(type)) error(404, `Unknown entity type: ${params.type}`);

	const id = `${type}/${params.slug}`;
	const entity = graph.get(id);
	if (!entity) error(404, `Not found: ${id}`);

	const known = new Set(graph.all().map((e) => e.id));
	const html = renderEntityBody(entity, known, graph.languageCodes());

	const outEdges = graph.outEdges(id).map((e) => ({
		...e,
		toEntity: pickCard(graph.get(e.to))
	}));
	const inEdges = graph.inEdges(id).map((e) => ({
		...e,
		fromEntity: pickCard(graph.get(e.from))
	}));

	// Hide synthetic top-level keys from the property list sidebar.
	const HIDDEN = new Set(['name', 'summary', 'aliases', 'tags', 'relations', 'kind']);
	const extra: { key: string; value: unknown }[] = [];
	for (const [key, value] of Object.entries(entity.meta)) {
		if (HIDDEN.has(key)) continue;
		if (value === null || value === undefined || value === '') continue;
		extra.push({ key, value });
	}

	return {
		id,
		type,
		typeLabel: graph.typeInfo(type).labels,
		entity: {
			id,
			type,
			slug: entity.slug,
			name: entity.meta.name,
			summary: entity.meta.summary ?? null,
			aliases: entity.meta.aliases ?? [],
			tags: entity.meta.tags ?? [],
			kind: typeof entity.meta.kind === 'string' ? entity.meta.kind : null
		},
		extra,
		html,
		outEdges,
		inEdges
	};
}

function pickCard(e: ReturnType<typeof graph.get>) {
	if (!e) return null;
	return {
		id: e.id,
		type: e.type,
		slug: e.slug,
		name: e.meta.name,
		summary: e.meta.summary ?? null
	};
}
