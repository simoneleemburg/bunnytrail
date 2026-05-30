import { error } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { renderSummary } from '$lib/server/markdown';

export async function load({ params }: { params: { tag: string } }) {
	await graph.ready();

	const tag = decodeURIComponent(params.tag);

	// Match exact-case as the graph stores tags. Tags in content/ are
	// authored lowercase-with-hyphens, so this is what we expect.
	const matches = graph.search('', { tag });
	if (matches.length === 0) error(404, `No entries tagged "${tag}".`);

	const resolveLink = (path: string) => graph.resolveLink(path);
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true, kindIds }) : null;

	// Group matches by type so the page reads like a /[type] listing
	// repeated per type. Within each group, sort by name.
	const byType = new Map<
		string,
		{
			type: string;
			label: { singular: string; plural: string };
			entities: ReturnType<typeof toCard>[];
		}
	>();

	for (const entity of matches) {
		const type = entity.type;
		if (!byType.has(type)) {
			const labels = type ? graph.folderLabels(type) : { singular: 'Entry', plural: 'Entries' };
			byType.set(type, { type, label: labels, entities: [] });
		}
		byType.get(type)!.entities.push(toCard(entity, cardSummaryHtml));
	}
	for (const group of byType.values()) {
		group.entities.sort((a, b) => a.name.localeCompare(b.name));
	}

	// Sort groups by type-name for a stable presentation.
	const groups = [...byType.values()].sort((a, b) => a.label.plural.localeCompare(b.label.plural));

	return {
		tag,
		count: matches.length,
		groups
	};
}

export type TagPageData = Awaited<ReturnType<typeof load>>;

function toCard(
	entity: ReturnType<typeof graph.all>[number],
	cardSummaryHtml: (s: string | null | undefined) => string | null
) {
	return {
		id: entity.id,
		slug: entity.slug,
		name: entity.meta.name,
		summary: entity.meta.summary ?? null,
		summaryHtml: cardSummaryHtml(entity.meta.summary),
		tags: entity.meta.tags ?? [],
		era: entity.meta.era ?? null,
		kind: typeof entity.meta.kind === 'string' ? entity.meta.kind : null,
		sigil: typeof entity.meta.sigil === 'string' ? entity.meta.sigil : null
	};
}
