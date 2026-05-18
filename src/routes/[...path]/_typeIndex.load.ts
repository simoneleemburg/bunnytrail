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
		.map((sub) => {
			// Include entities at any depth under the subtype, since
			// the user is browsing "everything of this kind".
			const subEntities = graph.byTypeRecursive(sub.type);
			// Distribution of `kind` values across the subtype's
			// entities, so the page-level kind filter can hide /
			// re-count subtype tiles in sync with the rest.
			const kindCounts: Record<string, number> = {};
			// Tag aggregation: overall counts, plus per-kind counts
			// so the tile can show kind-filtered tags when the page
			// kind filter is active. Each map: tag -> entity count.
			const tagCounts = new Map<string, number>();
			const tagsByKind: Record<string, Map<string, number>> = {};
			for (const e of subEntities) {
				const k = typeof e.meta.kind === 'string' ? e.meta.kind : '—';
				kindCounts[k] = (kindCounts[k] ?? 0) + 1;
				const kindMap = (tagsByKind[k] ??= new Map<string, number>());
				for (const t of e.meta.tags ?? []) {
					tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
					kindMap.set(t, (kindMap.get(t) ?? 0) + 1);
				}
			}
			return {
				type: sub.type,
				singular: sub.labels.singular,
				plural: sub.labels.plural,
				description: sub.description,
				count: subEntities.length,
				kindCounts,
				tags: rankTags(tagCounts),
				tagsByKind: Object.fromEntries(Object.entries(tagsByKind).map(([k, m]) => [k, rankTags(m)]))
			};
		})
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
	const flatAll = [...cards, ...descendants].sort((a, b) => a.name.localeCompare(b.name));

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

/**
 * View-model for the global "everything" index — every entity in
 * the graph, filterable by type/kind/tag and switchable between a
 * nested view (top-level types as collection tiles + standalone
 * entities) and a flat view (one big grid).
 *
 * Reuses the same `TypeIndexData` shape as type-scoped indexes, so
 * the same `TypeIndex.svelte` component can render both. Differences
 * from a type-scoped load:
 *
 *   • `subtypes` is filled with every top-level type (Beings,
 *     Characters, …), so the collection tiles become "browse by
 *     type" rather than "browse by subtype within this type".
 *   • `containers` is always empty: container-style nesting only
 *     makes sense within a single type's namespace.
 *   • Every card carries its `typeLabel` so the grid shows what
 *     kind of entity each one is.
 */
export function loadEverythingIndex() {
	const resolveLink = (path: string) => graph.resolveLink(path);
	const languageCodes = graph.languageCodes();
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true }) : null;

	// Top-level types become the "collection" tiles. Each tile gets
	// recursive entities under that type (so e.g. Culture covers
	// languages too) and the same tag-rollup the per-type loader
	// builds for its subtypes.
	const subtypes = graph
		.topLevelTypes()
		.filter((t) => graph.byTypeRecursive(t.type).length > 0)
		.map((t) => {
			const subEntities = graph.byTypeRecursive(t.type);
			const kindCounts: Record<string, number> = {};
			const tagCounts = new Map<string, number>();
			const tagsByKind: Record<string, Map<string, number>> = {};
			for (const e of subEntities) {
				const k = typeof e.meta.kind === 'string' ? e.meta.kind : '—';
				kindCounts[k] = (kindCounts[k] ?? 0) + 1;
				const kindMap = (tagsByKind[k] ??= new Map<string, number>());
				for (const tag of e.meta.tags ?? []) {
					tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
					kindMap.set(tag, (kindMap.get(tag) ?? 0) + 1);
				}
			}
			return {
				type: t.type,
				singular: t.labels.singular,
				plural: t.labels.plural,
				description: t.description,
				count: subEntities.length,
				kindCounts,
				tags: rankTags(tagCounts),
				tagsByKind: Object.fromEntries(Object.entries(tagsByKind).map(([k, m]) => [k, rankTags(m)]))
			};
		})
		.sort((a, b) => a.plural.localeCompare(b.plural));

	// Every entity in the graph, each tagged with its type label so
	// the card eyebrow shows what *kind of thing* it is.
	const allCards = graph
		.all()
		.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
		.map((e) => toCard(e, cardSummaryHtml, labelForType(e.type)));

	return {
		kind: 'type' as const,
		// `type` is conventionally a path here; the everything page has
		// no type path. The view doesn't use it directly when subtypes
		// are top-level types; keeping the field present so the type
		// matches.
		type: '' as EntityType,
		label: { singular: 'Entry', plural: 'Everything' },
		description: 'Every entry in Alteria, in one place. Filter or flatten to taste.',
		subtypes,
		containers: [] as ContainerNode[],
		// In nested view every entity belongs to one of the
		// top-level-type collection tiles, so the standalone grid is
		// empty — the user sees only the tiles. Flat view drops the
		// tiles and shows everything in one grid instead.
		standalone: [] as typeof allCards,
		flat: allCards
	};
}

function labelForType(type: EntityType): string {
	try {
		return graph.typeInfo(type).labels.singular;
	} catch {
		return type;
	}
}

/**
 * Convert a tag-count map into a sorted array. Sort is by count
 * descending, breaking ties alphabetically — so the most-used tags
 * lead, with stable order for equally-common ones.
 */
function rankTags(counts: Map<string, number>): Array<{ label: string; count: number }> {
	return [...counts.entries()]
		.map(([label, count]) => ({ label, count }))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
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
