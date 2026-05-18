import { graph } from '$lib/server/graph';
import { renderSummary } from '$lib/server/markdown';
import type { Entity, EntityType } from '$lib/types';

/**
 * Build the view-model for a type-index page. Caller has already
 * verified that `type` is a known type via `graph.hasType`.
 *
 * A type-index lists three kinds of things, top to bottom:
 *
 *   • **Subtypes section** — links to direct subtypes (entities
 *     under a `_type.yaml` child folder). These get their own
 *     index page; we only advertise them here.
 *   • **Containers section** — entities that physically nest other
 *     entities of the same type beneath them on disk (e.g.
 *     `places/bayurinda/` containing `nuunlau` and
 *     `bayurinda-archipelago`). Each container is shown with its
 *     nested children inline. Only used in nested view-mode.
 *   • **Entity grid** — the flat list of entities. In nested mode
 *     this is restricted to standalone entities (no parent, no
 *     children); in flat mode it is every entity of this type at
 *     any depth.
 *
 * The kind-filter at the top of the page applies to everything,
 * regardless of view-mode.
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

	// All entities of this exact type get flattened to cards once;
	// the view decides which slots they appear in based on view-mode.
	const cards = entities.map((e) => toCard(e, cardSummaryHtml));

	// Containers: entities of *this exact type* that themselves
	// contain child entities (of any type, including this one).
	// Children are filtered to entities of the same type — a
	// container at /places only displays its place-children, not
	// e.g. a hypothetical character that happens to live in its
	// folder.
	const containers = entities
		.filter((e) => e.children.length > 0)
		.map((e) => ({
			container: toCard(e, cardSummaryHtml),
			children: e.children
				.map((cid) => graph.get(cid))
				.filter((c): c is Entity => !!c && c.type === type)
				.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
				.map((c) => toCard(c, cardSummaryHtml))
		}))
		.filter((c) => c.children.length > 0);

	// In nested mode the flat grid only shows entities that aren't
	// already accounted for in the containers section — i.e. they
	// neither have a parent of this same type nor are themselves a
	// container.
	const containedIds = new Set<string>();
	for (const c of containers) {
		containedIds.add(c.container.id);
		for (const child of c.children) containedIds.add(child.id);
	}
	const standalone = cards.filter((c) => !containedIds.has(c.id));

	return {
		kind: 'type' as const,
		type,
		label: info.labels,
		description: info.description,
		subtypes,
		containers,
		standalone,
		// `flat` is the full list in display order — used when the
		// user switches to flat view.
		flat: cards
	};
}

export type TypeIndexData = ReturnType<typeof loadTypeIndex>;

function toCard(
	e: Entity,
	cardSummaryHtml: (s: string | null | undefined) => string | null
) {
	return {
		id: e.id,
		slug: e.slug,
		name: e.meta.name,
		summary: e.meta.summary ?? null,
		summaryHtml: cardSummaryHtml(e.meta.summary),
		tags: e.meta.tags ?? [],
		era: e.meta.era ?? null,
		kind: typeof e.meta.kind === 'string' ? e.meta.kind : null
	};
}
