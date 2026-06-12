import { guides } from '$lib/server/guides';

/**
 * Index of all guides. Each entry carries enough to render a
 * linked card: slug, title, eyebrow, and summary. The body is
 * omitted — it ships per-guide via the single-guide route.
 */
export async function load() {
	await guides.ready();
	const all = guides.all().map((g) => ({
		slug: g.slug,
		title: g.title,
		eyebrow: g.eyebrow,
		summary: g.summary
	}));
	return { guides: all };
}

export type GuidesIndexData = Awaited<ReturnType<typeof load>>;
