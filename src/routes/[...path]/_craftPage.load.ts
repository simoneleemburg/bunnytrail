import { graph } from '$lib/server/graph';
import { makeCollectionResolver, renderBody, renderSummary } from '$lib/server/markdown';
import type { Entity } from '$lib/types';

/**
 * Build the view-model for an entity's craft sub-page — the
 * author's-room companion document loaded from a sibling
 * `craft.md`.
 *
 * Craft sheets are deliberately framed as authoring material, not
 * in-world fact: they describe how an entity is written rather
 * than what someone meeting it would observe. Wikilinks inside
 * craft prose still resolve and render as links (so the writer
 * can connect their own notes), but they don't contribute to
 * backlinks — see the loader's note on `Entity.craft`.
 *
 * Caller has already verified `entity.craft !== null`.
 */
export function loadCraftPage(entity: Entity) {
	const resolveLink = (path: string) => graph.resolveLink(path, graph.clusterOf(entity.id));
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();
	const resolveCollection = makeCollectionResolver({
		getCollection: (p) => graph.collection(p),
		folderLabels: (p) => graph.folderLabels(p),
		resolveLink,
		languageCodes,
		kindIds
	});

	const html = renderBody(
		entity.craft ?? '',
		resolveLink,
		languageCodes,
		kindIds,
		resolveCollection
	);

	const summaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { kindIds }) : null;

	return {
		entity: {
			id: entity.id,
			href: `/${entity.id}`,
			name: entity.meta.name,
			summaryHtml: summaryHtml(entity.meta.summary)
		},
		html
	};
}

export type CraftPageData = ReturnType<typeof loadCraftPage>;
