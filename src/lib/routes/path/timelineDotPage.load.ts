import { graph } from '$lib/server/graph';
import { world } from '$lib/server/world';
import { renderBody, renderSummary } from '$lib/server/markdown';
import { inlineSvgFigures } from '$lib/server/inlineSvgs';
import { formatCalendarDateById } from '$lib/calendar';
import type { TimelineEntry } from '$lib/types';

export interface TimelineDotPageData {
	kind: 'timeline-dot';
	/** Path of the containing timeline (line), e.g. `leemburg/verhalen/jan-arend-jr`. */
	timelinePath: string;
	/** Display name of the timeline (for the nav header). */
	timelineTitle: string;
	/** Display label for this dot — formatted calendar date or plain year string. */
	label: string;
	/**
	 * Secondary display-variant label, shown below the heading.
	 * Null when the display variant is identical to the heading label.
	 */
	displayLabel: string | null;
	/** Rendered HTML summary (may be null). */
	summaryHtml: string | null;
	/** Rendered HTML body of this entry (may be empty string). */
	bodyHtml: string;
	/** Navigation to the previous dot (lower year), or null. */
	prev: { label: string; href: string; crossThread: { title: string; href: string } | null } | null;
	/** Navigation to the next dot (higher year), or null. */
	next: { label: string; href: string; crossThread: { title: string; href: string } | null } | null;
	/** Link back to the timeline line page. */
	timelineHref: string;
	/** Breadcrumb chain. */
	breadcrumbs: { label: string; href: string }[];
	thread: string | null;
	threadTitle: string | null;
	subThread: { title: string; href: string } | null;
	parentThreadBack: { label: string; href: string } | null;
	parentThreadForward: { label: string; href: string } | null;
}

/**
 * Collect all `TimelineEntry` objects from a timeline and every nested
 * timeline whose path starts with `<threadPath>/`, sorted ascending by year.
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
	slug: string,
	thread: string | null = null
): Promise<TimelineDotPageData | null> {
	await graph.ready();
	const timeline = graph.timeline(timelinePath);
	if (!timeline) return null;

	const entryPath = `${timelinePath}/${slug}`;
	const entry = timeline.entries.find((e) => e.path === entryPath);
	if (!entry) return null;

	await world.ready();
	const customCalendars = world.config().customCalendars;

	/** Format an entry's sort key as a display label. */
	function entryLabel(e: TimelineEntry, variant: 'heading' | 'display' = 'display'): string {
		if (e.calendarDate && customCalendars?.calendars) {
			return formatCalendarDateById(e.calendarDate, customCalendars.calendars, variant);
		}
		return String(e.year);
	}

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

	const validThread = thread && graph.isTimeline(thread) ? thread : null;
	const sorted: TimelineEntry[] = validThread
		? threadEntries(validThread)
		: timeline.entries;

	const idx = sorted.findIndex((e) => e.path === entryPath);
	const prev = idx > 0 ? sorted[idx - 1] : null;
	const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;

	const leaf = timelinePath.includes('/')
		? timelinePath.slice(timelinePath.lastIndexOf('/') + 1)
		: timelinePath;
	const containingEntity = graph.get(timelinePath);
	const timelineTitle =
		timeline.meta.name ?? containingEntity?.meta.name ?? leaf.replace(/-/g, ' ');

	const breadcrumbs: { label: string; href: string }[] = [];
	if (containingEntity) {
		breadcrumbs.push({ label: containingEntity.meta.name, href: `/${timelinePath}` });
	}
	breadcrumbs.push({ label: timelineTitle, href: `/${timelinePath}` });

	const threadTitle = validThread ? resolveTimelineTitle(validThread) : null;
	const subThread =
		validThread && timelinePath !== validThread
			? { title: timelineTitle, href: `/${timelinePath}` }
			: null;

	function neighbourTimeline(e: TimelineEntry): string {
		return e.path.slice(0, e.path.lastIndexOf('/'));
	}

	function crossThread(neighbour: TimelineEntry | null): { title: string; href: string } | null {
		if (!neighbour || !validThread) return null;
		const ntl = neighbourTimeline(neighbour);
		if (ntl === timelinePath) return null;
		return { title: resolveTimelineTitle(ntl), href: `/${ntl}` };
	}

	function neighbourHref(e: TimelineEntry, threadCtx: string | null): string {
		const qs = threadCtx ? `?thread=${encodeURIComponent(threadCtx)}` : '';
		return `/${e.path}${qs}`;
	}

	const year = entry.year;
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
				const predecessor = [...parentEntries].reverse().find((e) => e.year < year);
				if (predecessor) {
					parentThreadBack = { label: parentTitle, href: `/${predecessor.path}${qs}` };
				}
			}
			if (next === null) {
				const successor = parentEntries.find((e) => e.year > year);
				if (successor) {
					parentThreadForward = { label: parentTitle, href: `/${successor.path}${qs}` };
				}
			}
		}
	}

	const headingLabel = entryLabel(entry, 'heading');
	const displayLabel = entryLabel(entry, 'display');

	return {
		kind: 'timeline-dot',
		timelinePath,
		timelineTitle,
		label: headingLabel,
		displayLabel: displayLabel !== headingLabel ? displayLabel : null,
		summaryHtml,
		bodyHtml,
		prev: prev
			? { label: entryLabel(prev, 'heading'), href: neighbourHref(prev, validThread), crossThread: crossThread(prev) }
			: null,
		next: next
			? { label: entryLabel(next, 'heading'), href: neighbourHref(next, validThread), crossThread: crossThread(next) }
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
