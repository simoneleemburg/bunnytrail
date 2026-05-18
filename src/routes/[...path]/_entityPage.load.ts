import { error } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { renderEntityBody, renderSummary } from '$lib/server/markdown';
import type { Entity } from '$lib/types';

/**
 * Build the view-model for an entity page. Returned shape is consumed
 * by `_EntityPage.svelte`.
 */
export function loadEntityPage(entity: Entity) {
	const id = entity.id;
	const type = entity.type;

	const resolveLink = (path: string) => graph.resolveLink(path);
	const languageCodes = graph.languageCodes();
	const html = renderEntityBody(entity, resolveLink, languageCodes);

	const summaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes) : null;
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true }) : null;

	const langCode = typeof entity.meta.language === 'string' ? entity.meta.language : null;
	const langTargetId = langCode ? languageCodes.get(langCode) : undefined;
	const language = langCode
		? {
				code: langCode,
				href: langTargetId ? `/${langTargetId}` : '#',
				broken: !langTargetId
			}
		: null;

	const outEdges = graph.outEdges(id).map((e) => ({
		...e,
		toEntity: pickCard(graph.get(e.to), cardSummaryHtml)
	}));
	const inEdges = graph.inEdges(id).map((e) => ({
		...e,
		fromEntity: pickCard(graph.get(e.from), cardSummaryHtml)
	}));

	// Filesystem-derived containment: entities living *inside* this
	// entity's folder. Purely structural (no `located-in` implied).
	// Grouped by leaf type so a parent that contains a mix of
	// entity-types reads cleanly (e.g. "Places within Bayurinda /
	// Characters within Bayurinda").
	const childGroups = (() => {
		const byChildType = new Map<
			string,
			{
				type: string;
				label: { singular: string; plural: string };
				entities: ReturnType<typeof toChildCard>[];
			}
		>();
		for (const child of graph.children(id)) {
			const t = child.type;
			if (!byChildType.has(t)) {
				byChildType.set(t, {
					type: t,
					label: graph.typeInfo(t).labels,
					entities: []
				});
			}
			byChildType.get(t)!.entities.push(toChildCard(child, cardSummaryHtml));
		}
		for (const g of byChildType.values()) {
			g.entities.sort((a, b) => a.name.localeCompare(b.name));
		}
		return [...byChildType.values()].sort((a, b) =>
			a.label.plural.localeCompare(b.label.plural)
		);
	})();

	const HIDDEN = new Set([
		'name',
		'summary',
		'aliases',
		'tags',
		'relations',
		'kind',
		'language',
		'code'
	]);
	const extra: { key: string; value: unknown }[] = [];
	for (const [key, value] of Object.entries(entity.meta)) {
		if (HIDDEN.has(key)) continue;
		if (value === null || value === undefined || value === '') continue;
		extra.push({ key, value });
	}

	if (!graph.hasType(type)) {
		// An entity not inside any declared type — should have been
		// surfaced as an issue at load time; bail with a friendly 404.
		error(404, `Entity ${id} has no resolvable type.`);
	}

	return {
		kind: 'entity' as const,
		id,
		type,
		typeLabel: graph.typeInfo(type).labels,
		entity: {
			id,
			type,
			slug: entity.slug,
			name: entity.meta.name,
			summary: entity.meta.summary ?? null,
			summaryHtml: summaryHtml(entity.meta.summary),
			aliases: entity.meta.aliases ?? [],
			tags: entity.meta.tags ?? [],
			kind: typeof entity.meta.kind === 'string' ? entity.meta.kind : null
		},
		extra,
		html,
		language,
		childGroups,
		outEdges,
		inEdges
	};
}

export type EntityPageData = ReturnType<typeof loadEntityPage>;

function pickCard(
	e: ReturnType<typeof graph.get>,
	cardSummaryHtml: (s: string | null | undefined) => string | null
) {
	if (!e) return null;
	return {
		id: e.id,
		type: e.type,
		slug: e.slug,
		name: e.meta.name,
		summary: e.meta.summary ?? null,
		summaryHtml: cardSummaryHtml(e.meta.summary)
	};
}

function toChildCard(
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
