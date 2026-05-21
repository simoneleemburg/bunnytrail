import { blog, formatPostDate } from '$lib/server/blog';
import type { PageServerLoad } from './$types';

/**
 * Index of all notebook posts, newest first. Only the fields the
 * list view needs — `body` is omitted to keep payload small; the
 * single-post route fetches it directly.
 */
export const load: PageServerLoad = async () => {
	const posts = blog.all().map((p) => ({
		slug: p.slug,
		title: p.title,
		date: p.date,
		dateLabel: formatPostDate(p.date),
		tags: p.tags
	}));
	return { posts };
};
