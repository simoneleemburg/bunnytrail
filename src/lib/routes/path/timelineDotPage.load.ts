import { graph } from '$lib/server/graph';
import { renderBody, renderSummary } from '$lib/server/markdown';
import { inlineSvgFigures } from '$lib/server/inlineSvgs';
import type { TimelineEntry } from '$lib/types';

export interface TimelineDotPageData {
	kind: 'timeline-dot';
	/** Path of the containing timeline (line), e.g. `leemburg/verhalen/jan-arend-jr`. */
	timelinePath: string;
	/** Display name of the timeline (for the nav header). */
	timelineTitle: string;
	/** The year of this dot. */
	year: number;
	/** Rendered HTML summary (may be null). */
	summaryHtml: string | null;
	/** Rendered HTML body of this entry (may be empty string). */
	bodyHtml: string;
	/** Navigation to the previous dot (lower year), or null. */
	prev: { year: number; href: string } | null;
	/** Navigation to the next dot (higher year), or null. */
	next: { year: number; href: string } | null;
	/** Link back to the timeline line page. */
	timelineHref: string;
	/** Breadcrumb chain. */
	breadcrumbs: { label: string; href: string }[];
}

export async function loadTimelineDotPage(
	timelinePath: string,
	year: number
): Promise<TimelineDotPageData | null> {
	await graph.ready();
	const timeline = graph.timeline(timelinePath);
	if (!timeline) return null;

	const entry = timeline.entries.find((e) => e.year === year);
	if (!entry) return null;

	const resolveLink = (path: string) => graph.resolveLink(path, graph.clusterOf(timelinePath));
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();

	const bodyHtml = entry.body.trim()
		? await inlineSvgFigures(
				renderBody(entry.body, resolveLink, languageCodes, kindIds, undefined, entry.path)
			)
		: '';

	const summaryHtml = entry.summary?.trim()
		? renderSummary(entry.summary, resolveLink, languageCodes, { kindIds })
		: null;

	// Determine prev/next within this timeline.
	const sorted = timeline.entries;
	const idx = sorted.findIndex((e) => e.year === year);
	const prev = idx > 0 ? sorted[idx - 1] : null;
	const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;

	// Timeline display title.
	const leaf = timelinePath.includes('/')
		? timelinePath.slice(timelinePath.lastIndexOf('/') + 1)
		: timelinePath;
	const containingEntity = graph.get(timelinePath);
	const timelineTitle =
		timeline.meta.name ?? containingEntity?.meta.name ?? leaf.replace(/-/g, ' ');

	// Breadcrumbs: entity → timeline → (year page is the current page).
	const breadcrumbs: { label: string; href: string }[] = [];
	if (containingEntity) {
		breadcrumbs.push({
			label: containingEntity.meta.name,
			href: `/${timelinePath}`
		});
	}
	breadcrumbs.push({
		label: timelineTitle,
		href: `/${timelinePath}`
	});

	return {
		kind: 'timeline-dot',
		timelinePath,
		timelineTitle,
		year,
		summaryHtml,
		bodyHtml,
	prev: prev ? { year: prev.year, href: `/${timelinePath}/${prev.year}` } : null,
	next: next ? { year: next.year, href: `/${timelinePath}/${next.year}` } : null,
	timelineHref: `/${timelinePath}`,
		breadcrumbs
	};
}
