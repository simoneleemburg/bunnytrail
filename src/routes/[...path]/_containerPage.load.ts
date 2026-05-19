import { graph } from '$lib/server/graph';
import { renderSummary } from '$lib/server/markdown';
import type { Entity } from '$lib/types';

/**
 * View-model for a "container folder" — a directory under a type
 * that has no `index.yaml` of its own, but holds entities one level
 * deeper. The classic case: `/places/regions/bayurinda/` exists only
 * to group the regions of Bayurinda; it has no entity, but
 * `nuunlau/` and `bayurinda-archipelago/` are entities sitting
 * inside it.
 *
 * The page heading shows the prettified folder name. If an entity
 * elsewhere in the graph happens to share the folder's slug (e.g.
 * `places/celestial-bodies/planets/bayurinda`), a "→ [Bayurinda]"
 * cross-link is offered as an eyebrow, so the user can jump to the
 * thing the folder is about. The cross-link is conventional, not
 * enforced — if the slug doesn't match any entity, the page still
 * renders, just without the eyebrow.
 *
 * Children are direct entities one path-segment deeper, grouped by
 * their entity type and rendered as cards (the same card shape that
 * type-index pages use).
 */
export function loadContainerPage(path: string) {
	const resolveLink = (p: string) => graph.resolveLink(p);
	const languageCodes = graph.languageCodes();
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true }) : null;

	const slug = path.slice(path.lastIndexOf('/') + 1);
	const prefix = `${path}/`;

	// Direct entities: id begins with `prefix` and the remaining
	// suffix is a single path segment. Anything deeper belongs to a
	// nested folder and is reached transitively from the direct
	// children's own pages.
	const direct: Entity[] = [];
	for (const e of graph.all()) {
		if (!e.id.startsWith(prefix)) continue;
		const rest = e.id.slice(prefix.length);
		if (rest.includes('/')) continue;
		direct.push(e);
	}

	// Convention: the folder name often matches a real entity
	// elsewhere (e.g. `places/regions/bayurinda` ↔ the planet
	// `places/celestial-bodies/planets/bayurinda`). Surface that as
	// a "see also" cross-link via suffix-match.
	const crossLink = (() => {
		const resolved = resolveLink(slug);
		if (!resolved || resolved === path) return null;
		const e = graph.get(resolved);
		if (!e) return null;
		return { id: e.id, name: e.meta.name, typeLabel: graph.typeInfo(e.type).labels.singular };
	})();

	// Group by entity type so a mixed-type container reads cleanly.
	const byType = new Map<
		string,
		{
			type: string;
			label: { singular: string; plural: string };
			entities: ReturnType<typeof toCard>[];
		}
	>();
	for (const child of direct) {
		const t = child.type;
		if (!byType.has(t)) {
			byType.set(t, { type: t, label: graph.typeInfo(t).labels, entities: [] });
		}
		byType.get(t)!.entities.push(toCard(child, cardSummaryHtml));
	}
	for (const g of byType.values()) {
		g.entities.sort((a, b) => a.name.localeCompare(b.name));
	}
	const groups = [...byType.values()].sort((a, b) =>
		a.label.plural.localeCompare(b.label.plural)
	);

	// Prettified title from slug: "bayurinda" → "Bayurinda". If a
	// cross-link entity shares the slug, prefer its authored name —
	// it'll typically read better than the prettified slug
	// (capitalisation, accents, multi-word names).
	const title =
		crossLink?.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

	// Parent path is the type folder this container lives directly
	// inside (e.g. `places/regions` for `/places/regions/bayurinda`).
	// We surface its plural label as the page eyebrow — "Regions of"
	// — so the title reads as a natural phrase: "Regions of /
	// Bayurinda". When the parent isn't a registered type (which
	// shouldn't happen in practice — folders only exist directly
	// under types) we leave the eyebrow empty.
	const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
	let parentLabel: string | null = null;
	if (parentPath && graph.hasType(parentPath as Parameters<typeof graph.typeInfo>[0])) {
		parentLabel = graph.typeInfo(parentPath as Parameters<typeof graph.typeInfo>[0]).labels.plural;
	}

	return {
		kind: 'container' as const,
		path,
		slug,
		title,
		eyebrow: parentLabel ? `${parentLabel} of` : null,
		crossLink,
		groups,
		totalCount: direct.length
	};
}

export type ContainerPageData = ReturnType<typeof loadContainerPage>;

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
		kind: typeof e.meta.kind === 'string' ? e.meta.kind : null
	};
}
