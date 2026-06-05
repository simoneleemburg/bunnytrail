import { error } from '@sveltejs/kit';
import { influences } from '$lib/server/influences';
import { graph } from '$lib/server/graph';
import { renderBody } from '$lib/server/markdown';

function resolveImageSrc(slug: string, image: string): string | null {
	if (/^https?:\/\//.test(image) || image.startsWith('//')) return image;
	if (!image.includes('/') && !image.includes('..')) {
		return `/api/influence-assets/${slug}/${image}`;
	}
	return null;
}

/**
 * Single influence detail page — journal register, full prose,
 * illustrations with personal comments, and wikilinks resolving
 * into the world.
 */
export async function load({ params }: { params: { slug: string } }) {
	await influences.ready();
	await graph.ready();

	const influence = influences.get(params.slug);
	if (!influence) error(404, `No influence at /influences/${params.slug}`);

	const resolveLink = influences.wrapResolver((path) => graph.resolveLink(path, undefined));
	const kindLookup = (id: string) => graph.get(id)?.meta.kind;
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();

	// Render body with wikilinks + influence-assets endpoint for bare images.
	const bodyHtml = influence.body.trim()
		? renderBody(
				influence.body,
				resolveLink,
				languageCodes,
				kindIds,
				undefined,
				influence.slug,
				kindLookup,
				'influence-assets'
			)
		: null;

	// Resolve each illustration's image src.
	const illustrations = influence.illustrations.map((ill) => ({
		imageSrc: resolveImageSrc(influence.slug, ill.image),
		comment: ill.comment
	}));

	return {
		slug: influence.slug,
		title: influence.title,
		creator: influence.creator,
		kind: influence.kind,
		year: influence.year,
		epigraph: influence.epigraph,
		illustrations,
		bodyHtml
	};
}

export type InfluenceDetailData = Awaited<ReturnType<typeof load>>;
