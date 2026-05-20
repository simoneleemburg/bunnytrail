import { graph } from '$lib/server/graph';
import { renderEntityBody, renderSummary } from '$lib/server/markdown';
import { titleCaseSlug, type Entity } from '$lib/types';

/**
 * Build the view-model for an entity page. Returned shape is consumed
 * by `_EntityPage.svelte`.
 */
export function loadEntityPage(entity: Entity) {
	const id = entity.id;
	const type = entity.type;

	const resolveLink = (path: string) => graph.resolveLink(path);
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();
	const html = renderEntityBody(entity, resolveLink, languageCodes, kindIds);

	const summaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { kindIds }) : null;
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true, kindIds }) : null;

	const langCode = typeof entity.meta.language === 'string' ? entity.meta.language : null;
	const langTargetId = langCode ? languageCodes.get(langCode) : undefined;
	const language = langCode
		? {
				code: langCode,
				href: langTargetId ? `/${langTargetId}` : '#',
				broken: !langTargetId
			}
		: null;

	// Breadcrumb chain: every browseable folder on the path from the
	// content root down to (and including) this entity's containing
	// folder. We render plural folder labels because, per the new
	// kind/collection split, parent folders are narrative
	// collections, not taxonomic kinds — `Places › Celestial Bodies
	// › Planets` reads as "where in the field-notebook you are",
	// not "this is a planet which is a celestial body".
	const breadcrumbs: { label: string; href: string }[] = [];
	if (type) {
		const segs = type.split('/');
		for (let i = 1; i <= segs.length; i++) {
			const prefix = segs.slice(0, i).join('/');
			if (graph.isFolder(prefix)) {
				breadcrumbs.push({
					label: graph.folderLabels(prefix).plural,
					href: `/${prefix}`
				});
			}
		}
	}

	// Kind chip data for the header. We always emit something when
	// the entity has a kind, even an unregistered one — broken
	// chips are useful health signals, just like broken wikilinks.
	const kindId = typeof entity.meta.kind === 'string' ? entity.meta.kind : null;
	const kindObj = kindId ? graph.kind(kindId) : undefined;
	const kindChip = kindId
		? {
				id: kindId,
				label: kindObj?.meta.singular ?? titleCaseSlug(kindId),
				broken: !kindObj
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
	// Grouped by the child's *kind* (taxonomy), not by folder path
	// (topology): a heading like "Planets" or "Moons" reads
	// naturally regardless of where the parent sits. Grouping by
	// folder path would produce headings like "Nebelheim within
	// Nebelheim" whenever a parent's folder name equals its display
	// name, which is the common case for containment hierarchies.
	const childGroups = (() => {
		const byKind = new Map<
			string,
			{
				kindId: string;
				label: { singular: string; plural: string };
				entities: ReturnType<typeof toChildCard>[];
			}
		>();
		for (const child of graph.children(id)) {
			const childKindId = typeof child.meta.kind === 'string' ? child.meta.kind : '';
			const groupKey = childKindId || '__unkinded__';
			if (!byKind.has(groupKey)) {
				const k = childKindId ? graph.kind(childKindId) : undefined;
				const label = childKindId
					? {
							singular: k?.meta.singular ?? titleCaseSlug(childKindId),
							plural: k?.meta.plural ?? titleCaseSlug(childKindId)
						}
					: { singular: 'Entry', plural: 'Entries' };
				byKind.set(groupKey, { kindId: groupKey, label, entities: [] });
			}
			byKind.get(groupKey)!.entities.push(toChildCard(child, cardSummaryHtml));
		}
		for (const g of byKind.values()) {
			g.entities.sort((a, b) => a.name.localeCompare(b.name));
		}
		return [...byKind.values()].sort((a, b) => a.label.plural.localeCompare(b.label.plural));
	})();

	const HIDDEN = new Set([
		'name',
		'summary',
		'aliases',
		'tags',
		'relations',
		'kind',
		'language',
		'code',
		'sigil'
	]);
	const extra: { key: string; value: unknown }[] = [];
	for (const [key, value] of Object.entries(entity.meta)) {
		if (HIDDEN.has(key)) continue;
		// Kind-link fields are surfaced in their own block (kindRefs
		// below), pre-rendered as chip links. Skip them here so the
		// property sidebar doesn't also render the raw `kinds/<id>`
		// strings as plain text.
		if (key in entity.kindRefs) continue;
		if (value === null || value === undefined || value === '') continue;
		extra.push({ key, value });
	}

	// Structured kind-references declared in YAML, pre-rendered for
	// the sidebar chip block. Each field becomes one group; each
	// resolved kind id becomes one chip with the kind's singular
	// label and an href into the /kinds/<id> page. Only resolved
	// references appear here — unregistered ids were dropped (and
	// surfaced on /health) during loading.
	const kindRefs = Object.entries(entity.kindRefs)
		.filter(([, ids]) => ids.length > 0)
		.map(([field, ids]) => ({
			field,
			items: ids.map((kid) => {
				const k = graph.kind(kid);
				return {
					id: kid,
					label: k?.meta.singular ?? titleCaseSlug(kid),
					href: `/kinds/${kid}`
				};
			})
		}))
		.sort((a, b) => a.field.localeCompare(b.field));

	if (!graph.isFolder(type)) {
		// An entity sitting at the content root (no containing folder)
		// is allowed but unusual. Fall back to a generic label.
	}

	return {
		kind: 'entity' as const,
		id,
		type,
		typeLabel: type ? graph.folderLabels(type) : { singular: 'Entry', plural: 'Entries' },
		breadcrumbs,
		kindChip,
		entity: {
			id,
			type,
			slug: entity.slug,
			name: entity.meta.name,
			summary: entity.meta.summary ?? null,
			summaryHtml: summaryHtml(entity.meta.summary),
			aliases: entity.meta.aliases ?? [],
			tags: entity.meta.tags ?? [],
			kind: kindId,
			sigil: typeof entity.meta.sigil === 'string' ? entity.meta.sigil : null
		},
		extra,
		kindRefs,
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

function toChildCard(e: Entity, cardSummaryHtml: (s: string | null | undefined) => string | null) {
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
