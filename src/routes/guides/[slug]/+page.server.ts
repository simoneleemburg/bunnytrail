import { error } from '@sveltejs/kit';
import { guides } from '$lib/server/guides';
import { graph } from '$lib/server/graph';
import { inlineSvgFigures } from '$lib/server/inlineSvgs';
import { makeCollectionResolver, renderBody, renderSummary } from '$lib/server/markdown';
import type { PageServerLoad } from './$types';

/**
 * A single guide — a tour of the world, or a "start here" landing
 * page. Unlike the blog, guide bodies are rendered with the full
 * wikilink-aware renderer + collection-include support, because
 * guides exist to point readers into the world. They get the
 * inline-SVG post-pass too, so map references render as styled
 * figures.
 *
 * Sibling images (`![alt](foo.png)` next to the guide's index.md)
 * aren't currently supported — the entity-assets endpoint expects
 * a folder known to the graph. Use `![alt](assets/foo.svg)` for
 * map references, which routes through the global assets endpoint.
 */
export const load: PageServerLoad = async ({ params }) => {
	await guides.ready();
	const guide = guides.get(params.slug);
	if (!guide) error(404, `No guide at /guides/${params.slug}`);

	const resolveLink = (path: string) => graph.resolveLink(path, undefined);
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();
	const resolveCollection = makeCollectionResolver({
		getCollection: (p) => graph.collection(p),
		folderLabels: (p) => graph.folderLabels(p),
		resolveLink,
		languageCodes,
		kindIds
	});

	const html = await inlineSvgFigures(
		renderBody(guide.body, resolveLink, languageCodes, kindIds, resolveCollection)
	);
	const summaryHtml = renderSummary(guide.summary, resolveLink, languageCodes, { kindIds });

	return {
		slug: guide.slug,
		title: guide.title,
		eyebrow: guide.eyebrow,
		summaryHtml,
		html
	};
};
