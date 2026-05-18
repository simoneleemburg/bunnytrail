import { graph } from '$lib/server/graph';
import { renderSummary } from '$lib/server/markdown';
import type { Entity, EntityType } from '$lib/types';

type Card = ReturnType<typeof toCard>;
export type ContainerNode = { container: Card; children: ContainerNode[] };

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
 *     this is restricted to standalone entities of this exact type
 *     (no parent, no children); in flat mode it is every entity
 *     under this type at any depth, *including* descendants of
 *     subtypes, so e.g. /culture flat mode inlines languages with
 *     direct culture entities.
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

	// Descendants: every entity under this type at any depth (recurses
	// through subtypes). Used by flat view-mode so a user browsing
	// `/culture` can see all languages inlined with direct culture
	// entities. Sorted by name; subtype-membership is conveyed by the
	// `type` label on each card.
	const descendants = graph
		.byTypeRecursive(type)
		.filter((e) => e.type !== type)
		.map((e) => toCard(e, cardSummaryHtml, labelForType(e.type)));
	const flatAll = [...cards, ...descendants].sort((a, b) =>
		a.name.localeCompare(b.name)
	);

	// Containers: a recursive tree of entities of *this exact type*
	// that physically nest other entities of the same type beneath
	// them on disk. Roots are entities whose parent is not itself an
	// entity of this same type (so e.g. for `/places`, Bayurinda is a
	// root because its parent is the type folder, but Nuunlau is not
	// — it appears as a child of Bayurinda, and Bal Rochan appears as
	// a child of Nuunlau). Each node carries the same card payload as
	// `flat` plus a `children` array for further nesting.
	const containedIds = new Set<string>();
	const buildNode = (e: Entity): ContainerNode => {
		containedIds.add(e.id);
		const children = e.children
			.map((cid) => graph.get(cid))
			.filter((c): c is Entity => !!c && c.type === type)
			.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
			.map(buildNode);
		return { container: toCard(e, cardSummaryHtml), children };
	};
	const containers = entities
		.filter((e) => {
			if (e.children.length === 0) return false;
			// Only roots: parent must not be a same-type entity. (If
			// there's no parent at all, or the parent has a different
			// type, this node is a root.)
			if (!e.parent) return true;
			const parent = graph.get(e.parent);
			return !parent || parent.type !== type;
		})
		.map(buildNode)
		// After buildNode runs we know if a "container" still has any
		// same-type descendants worth showing.
		.filter((n) => n.children.length > 0);

	// `standalone` = entities of this exact type not appearing
	// anywhere in the container tree.
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
		// user switches to flat view. Includes descendants of subtypes
		// so e.g. /culture in flat mode shows languages inline.
		flat: flatAll
	};
}

export type TypeIndexData = ReturnType<typeof loadTypeIndex>;

function labelForType(type: EntityType): string {
	try {
		return graph.typeInfo(type).labels.singular;
	} catch {
		return type;
	}
}

function toCard(
	e: Entity,
	cardSummaryHtml: (s: string | null | undefined) => string | null,
	typeLabel?: string
) {
	return {
		id: e.id,
		slug: e.slug,
		name: e.meta.name,
		summary: e.meta.summary ?? null,
		summaryHtml: cardSummaryHtml(e.meta.summary),
		tags: e.meta.tags ?? [],
		era: e.meta.era ?? null,
		kind: typeof e.meta.kind === 'string' ? e.meta.kind : null,
		typeLabel: typeLabel ?? null
	};
}
