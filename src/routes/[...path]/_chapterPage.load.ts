import { graph } from '$lib/server/graph';
import { makeCollectionResolver, renderBody, renderSummary } from '$lib/server/markdown';
import type { Chapter, Entity } from '$lib/types';

/**
 * Build the view-model for a single chapter page (book-mode
 * sub-page of an entity). Chapters are not entities themselves;
 * they live under `<entity>/chapters/<NN-slug>.md`. The route
 * surface for a chapter is `/<entity-id>/chapters/<chapter-slug>`.
 */
export function loadChapterPage(entity: Entity, chapter: Chapter) {
	const resolveLink = (path: string) => graph.resolveLink(path);
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();
	const resolveCollection = makeCollectionResolver({
		getCollection: (p) => graph.collection(p),
		folderLabels: (p) => graph.folderLabels(p),
		resolveLink,
		languageCodes,
		kindIds
	});

	const html = renderBody(chapter.body, resolveLink, languageCodes, kindIds, resolveCollection);

	const summaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { kindIds }) : null;

	const idx = entity.chapters.findIndex((c) => c.slug === chapter.slug);
	const prev = idx > 0 ? entity.chapters[idx - 1] : null;
	const next = idx >= 0 && idx < entity.chapters.length - 1 ? entity.chapters[idx + 1] : null;

	const chapterHref = (slug: string) => `/${entity.id}/chapters/${slug}`;

	return {
		work: {
			id: entity.id,
			href: `/${entity.id}`,
			name: entity.meta.name,
			summaryHtml: summaryHtml(entity.meta.summary)
		},
		book: entity.book,
		chapter: {
			slug: chapter.slug,
			order: chapter.order,
			title: chapter.title
		},
		html,
		prev: prev
			? { slug: prev.slug, order: prev.order, title: prev.title, href: chapterHref(prev.slug) }
			: null,
		next: next
			? { slug: next.slug, order: next.order, title: next.title, href: chapterHref(next.slug) }
			: null,
		toc: entity.chapters.map((c) => ({
			slug: c.slug,
			order: c.order,
			title: c.title,
			href: chapterHref(c.slug),
			current: c.slug === chapter.slug
		}))
	};
}

export type ChapterPageData = ReturnType<typeof loadChapterPage>;
