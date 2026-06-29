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
	prev: { year: number; href: string; crossThread: { title: string; href: string } | null } | null;
	/** Navigation to the next dot (higher year), or null. */
	next: { year: number; href: string; crossThread: { title: string; href: string } | null } | null;
	/** Link back to the timeline line page. */
	timelineHref: string;
	/** Breadcrumb chain. */
	breadcrumbs: { label: string; href: string }[];
	/**
	 * The thread context path that was supplied via `?thread=`. When
	 * present, prev/next are scoped to all entries within that timeline
	 * and its nested descendants. When absent, prev/next are scoped to
	 * the immediate containing timeline only.
	 */
	thread: string | null;
	/** Display name of the thread timeline (for the back-nav). Null when thread is null. */
	threadTitle: string | null;
	/**
	 * When the current dot belongs to a nested timeline (timelinePath !== thread),
	 * this is the sub-timeline's display title and href for the contextual label.
	 * Null when thread is null or when the dot is on the thread timeline itself.
	 */
	subThread: { title: string; href: string } | null;
	/**
	 * When the thread is scoped exactly to a sub-timeline (thread === timelinePath)
	 * and the parent path is also a known timeline, this provides a link to the
	 * last entry in the parent thread that precedes the current year.
	 * Only present when there is no prev within the current thread.
	 */
	parentThreadBack: { label: string; href: string } | null;
	/**
	 * Mirror of parentThreadBack for the forward direction: first parent-thread
	 * entry after the current year. Only present when there is no next within
	 * the current thread.
	 */
	parentThreadForward: { label: string; href: string } | null;
}

/**
 * Collect all `TimelineEntry` objects from a timeline and every nested
 * timeline whose path starts with `<threadPath>/`, then return them
 * sorted ascending by year. Entries from the same year are ordered by
 * entry path for determinism.
 */
function threadEntries(threadPath: string): TimelineEntry[] {
	const childPrefix = `${threadPath}/`;
	const all: TimelineEntry[] = [];
	for (const [p, tl] of graph.timelines()) {
		if (p !== threadPath && !p.startsWith(childPrefix)) continue;
		all.push(...tl.entries);
	}
	all.sort((a, b) => a.year - b.year || a.path.localeCompare(b.path));
	return all;
}

/** Resolve a human-readable display title for any timeline path. */
function resolveTimelineTitle(path: string): string {
	const tl = graph.timeline(path);
	if (!tl) return path.slice(path.lastIndexOf('/') + 1).replace(/-/g, ' ');
	const leaf = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
	const entity = graph.get(path);
	return tl.meta.name ?? entity?.meta.name ?? leaf.replace(/-/g, ' ');
}

export async function loadTimelineDotPage(
	timelinePath: string,
	year: number,
	thread: string | null = null
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

	// Determine prev/next.
	// When a thread context is given and valid, scope to all entries in
	// that timeline and its nested descendants (interleaved by year).
	// Otherwise fall back to the immediate containing timeline.
	const validThread =
		thread && graph.isTimeline(thread) ? thread : null;
	const sorted: TimelineEntry[] = validThread
		? threadEntries(validThread)
		: timeline.entries;
	// Find this entry in the scoped list by its full path.
	const thisPath = `${timelinePath}/${year}`;
	const idx = sorted.findIndex((e) => e.path === thisPath);
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

	const threadTitle = validThread ? resolveTimelineTitle(validThread) : null;
	const subThread =
		validThread && timelinePath !== validThread
			? { title: timelineTitle, href: `/${timelinePath}` }
			: null;

	/** Given an entry, returns the timeline path it belongs to. */
	function neighbourTimeline(e: TimelineEntry): string {
		return e.path.slice(0, e.path.lastIndexOf('/'));
	}

	/** Build a crossThread descriptor when a neighbour is on a different timeline. */
	function crossThread(
		neighbour: TimelineEntry | null
	): { title: string; href: string } | null {
		if (!neighbour || !validThread) return null;
		const ntl = neighbourTimeline(neighbour);
		if (ntl === timelinePath) return null;
		return { title: resolveTimelineTitle(ntl), href: `/${ntl}` };
	}

	// Parent-thread nav: shown when the current thread IS the sub-timeline itself
	// (thread === timelinePath), there is no prev within this thread (i.e. this is
	// the first entry), and the parent folder is also a known timeline.
	// Links to the last entry in the parent thread before the current year.
	let parentThreadBack: { label: string; href: string } | null = null;
	let parentThreadForward: { label: string; href: string } | null = null;
	if (validThread && validThread === timelinePath) {
		const parentPath = timelinePath.includes('/')
			? timelinePath.slice(0, timelinePath.lastIndexOf('/'))
			: null;
		if (parentPath && graph.isTimeline(parentPath)) {
			const parentTitle = resolveTimelineTitle(parentPath);
			const qs = `?thread=${encodeURIComponent(parentPath)}`;
			const parentEntries = threadEntries(parentPath);
			if (prev === null) {
				// First entry in this sub-thread — offer back-nav to last parent entry before this year.
				const predecessor = [...parentEntries].reverse().find((e) => e.year < year);
				if (predecessor) {
					parentThreadBack = { label: parentTitle, href: `/${predecessor.path}${qs}` };
				}
			}
			if (next === null) {
				// Last entry in this sub-thread — offer forward-nav to first parent entry after this year.
				const successor = parentEntries.find((e) => e.year > year);
				if (successor) {
					parentThreadForward = { label: parentTitle, href: `/${successor.path}${qs}` };
				}
			}
		}
	}

	return {
		kind: 'timeline-dot',
		timelinePath,
		timelineTitle,
		year,
		summaryHtml,
		bodyHtml,
		prev: prev
			? { year: prev.year, href: `/${prev.path}`, crossThread: crossThread(prev) }
			: null,
		next: next
			? { year: next.year, href: `/${next.path}`, crossThread: crossThread(next) }
			: null,
		timelineHref: `/${timelinePath}`,
		breadcrumbs,
		thread: validThread,
		threadTitle,
		subThread,
		parentThreadBack,
		parentThreadForward
	};
}
