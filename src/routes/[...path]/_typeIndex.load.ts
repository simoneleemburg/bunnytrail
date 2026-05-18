import { graph } from '$lib/server/graph';
import { renderSummary } from '$lib/server/markdown';
import type { EntityType } from '$lib/types';

/**
 * Build the view-model for a type-index page. Caller has already
 * verified that `type` is a known type via `graph.hasType`.
 *
 * A type-index lists:
 *   • the type's *direct* entities (children of subtypes are listed
 *     on their own subtype-index pages, not duplicated here)
 *   • a "Subtypes" section linking to each direct subtype, with a
 *     count of entities living anywhere under it
 */
export function loadTypeIndex(type: EntityType) {
	const info = graph.typeInfo(type);
	const entities = graph.byType(type).sort((a, b) => a.meta.name.localeCompare(b.meta.name));

	const resolveLink = (path: string) => graph.resolveLink(path);
	const languageCodes = graph.languageCodes();
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true }) : null;

	const subtypes = graph
		.subtypesOf(type)
		.map((sub) => ({
			type: sub.type,
			singular: sub.labels.singular,
			plural: sub.labels.plural,
			description: sub.description,
			// Include entities at any depth under the subtype, since
			// the user is browsing "everything of this kind".
			count: graph.byTypeRecursive(sub.type).length
		}))
		.sort((a, b) => a.plural.localeCompare(b.plural));

	return {
		kind: 'type' as const,
		type,
		label: info.labels,
		description: info.description,
		subtypes,
		entities: entities.map((e) => ({
			id: e.id,
			slug: e.slug,
			name: e.meta.name,
			summary: e.meta.summary ?? null,
			summaryHtml: cardSummaryHtml(e.meta.summary),
			tags: e.meta.tags ?? [],
			era: e.meta.era ?? null,
			kind: typeof e.meta.kind === 'string' ? e.meta.kind : null
		}))
	};
}

export type TypeIndexData = ReturnType<typeof loadTypeIndex>;
