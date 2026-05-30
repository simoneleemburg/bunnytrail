import { error } from '@sveltejs/kit';
import { blog, formatPostDate } from '$lib/server/blog';
import { renderPlainBody } from '$lib/server/markdown';
import type { PageServerLoad } from './$types';

/**
 * A single notebook post. The body is rendered with the plain
 * markdown renderer — no wikilink resolution, no collection
 * includes — because the blog lives outside the worldbuilding
 * graph and shouldn't accumulate inbound backlinks from prose
 * here.
 */
export const load: PageServerLoad = async ({ params }) => {
	const post = blog.get(params.slug);
	if (!post) error(404, `No notebook post at /blog/${params.slug}`);

	return {
		slug: post.slug,
		title: post.title,
		date: post.date,
		dateLabel: formatPostDate(post.date),
		tags: post.tags,
		html: renderPlainBody(post.body)
	};
};
