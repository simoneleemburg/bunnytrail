import { blog } from '$lib/server/blog';

/**
 * The blog tree lives outside the worldbuilding graph, so it gets
 * its own ready gate. Every blog page (list and single-post) reads
 * from the `blog` singleton; this layout ensures it's loaded once
 * before any of them render. The watcher is already started from
 * `hooks.server.ts` and picks up `content_meta/blog/` from there.
 */
export async function load() {
	await blog.ready();
	return {};
}

export type BlogLayoutData = Awaited<ReturnType<typeof load>>;
