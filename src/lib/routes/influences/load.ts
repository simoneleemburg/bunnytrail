import { influences } from '$lib/server/influences';
import { graph } from '$lib/server/graph';

/**
 * Resolve an influence image filename or URL to a usable src.
 * Bare filenames become `/api/influence-assets/<slug>/<file>`;
 * external URLs pass through; anything with path separators or
 * traversal is rejected (returns null).
 */
function resolveImageSrc(slug: string, image: string): string | null {
	if (/^https?:\/\//.test(image) || image.startsWith('//')) return image;
	if (!image.includes('/') && !image.includes('..')) {
		return `/api/influence-assets/${slug}/${image}`;
	}
	return null;
}

/**
 * Gallery index of all influences — personal/cultural works and
 * thinkers that fed the worldbuilding. Out-of-world meta-page,
 * sibling to /sources and /blog.
 */
export async function load() {
	await influences.ready();
	await graph.ready();

	const items = influences.all().map((inf) => {
		const illustrations = inf.illustrations.map((ill) => ({
			imageSrc: resolveImageSrc(inf.slug, ill.image),
			comment: ill.comment
		}));
		// First resolved image is used as the gallery tile thumbnail.
		const thumbSrc = illustrations.find((i) => i.imageSrc !== null)?.imageSrc ?? null;

		return {
			slug: inf.slug,
			title: inf.title,
			creator: inf.creator,
			kind: inf.kind,
			year: inf.year,
			epigraph: inf.epigraph,
			thumbSrc,
			illustrations
		};
	});

	// Collect all distinct kinds for gallery filter chips.
	const kinds = [
		...new Set(items.map((i) => i.kind).filter((k): k is string => k !== null))
	].sort();

	return { items, kinds };
}

export type InfluencesData = Awaited<ReturnType<typeof load>>;
