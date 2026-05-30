import { blog, excerpt, formatPostDate } from '$lib/server/blog';
import type { PageServerLoad } from './$types';

/**
 * Index of all notebook posts, newest first. Only the fields the
 * list view needs — the full body is omitted (it ships per-post
 * via the single-post route), but a short plain-text excerpt is
 * computed so readers can preview each entry from the index.
 */
export const load: PageServerLoad = async () => {
	const posts = blog.all().map((p) => ({
		slug: p.slug,
		title: p.title,
		date: p.date,
		dateLabel: formatPostDate(p.date),
		tags: p.tags,
		excerpt: excerpt(p.body)
	}));
	return { posts };
};
