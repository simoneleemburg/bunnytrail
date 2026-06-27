import { error } from '@sveltejs/kit';
import { blog, formatPostDate } from '$lib/server/blog';
import { renderPlainBody } from '$lib/server/markdown';
import { isGateEnabled } from '$lib/server/auth';

/**
 * Tell the prerender crawler exactly which blog slugs to render.
 * Returns empty when the gate is active so posts are served via SSR
 * and protected by the session cookie check in the handle hook.
 */
export async function entries(): Promise<Array<{ slug: string }>> {
	if (isGateEnabled()) return [];
	await blog.ready();
	return blog.all().map((post) => ({ slug: post.slug }));
}

/**
 * A single journal post. The body is rendered with the plain
 * markdown renderer — no wikilink resolution, no collection
 * includes — because the blog lives outside the worldbuilding
 * graph and shouldn't accumulate inbound backlinks from prose
 * here.
 */
export async function load({ params }: { params: { slug: string } }) {
	const post = blog.get(params.slug);
	if (!post) error(404, `No journal post at /blog/${params.slug}`);

	return {
		slug: post.slug,
		title: post.title,
		date: post.date,
		dateLabel: formatPostDate(post.date),
		tags: post.tags,
		html: renderPlainBody(post.body)
	};
}

export type BlogPostData = Awaited<ReturnType<typeof load>>;
