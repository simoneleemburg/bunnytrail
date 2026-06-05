import { blog, excerpt, formatPostDate } from '$lib/server/blog';

/**
 * Index of all journal posts, newest first. Only the fields the
 * list view needs — the full body is omitted (it ships per-post
 * via the single-post route), but a short plain-text excerpt is
 * computed so readers can preview each entry from the index.
 */
export async function load() {
	const posts = blog.all().map((p) => ({
		slug: p.slug,
		title: p.title,
		date: p.date,
		dateLabel: formatPostDate(p.date),
		tags: p.tags,
		excerpt: excerpt(p.body)
	}));
	return { posts };
}

export type BlogIndexData = Awaited<ReturnType<typeof load>>;
