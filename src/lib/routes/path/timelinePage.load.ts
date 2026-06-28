import { graph } from '$lib/server/graph';
import { renderBody, renderSummary } from '$lib/server/markdown';
import { inlineSvgFigures } from '$lib/server/inlineSvgs';

export interface TimelineEntryCard {
	/** Folder path, e.g. `leemburg/verhalen/jan-arend-jr/1954`. */
	path: string;
	year: number;
	/** Rendered summary HTML (from `meta.summary`), or null. */
	summaryHtml: string | null;
	href: string;
}

export interface ChildTimelineCard {
	path: string;
	href: string;
	title: string;
	/** Rendered summary HTML, or null. */
	summaryHtml: string | null;
	firstYear: number | null;
	lastYear: number | null;
	/** Resolved target entity links for the header chip row. */
	targets: { label: string; href: string }[];
}

export interface TimelinePageData {
	kind: 'timeline';
	/** Display name: `meta.name` → containing entity name → slug. */
	title: string;
	/** Rendered summary HTML (from `meta.summary`), or null. */
	summaryHtml: string | null;
	/** The folder path of the timeline itself. */
	timelinePath: string;
	/** Breadcrumb chain back to the containing entity (or folder). */
	breadcrumbs: { label: string; href: string }[];
	/** All entries, sorted ascending by year. */
	entries: TimelineEntryCard[];
	/** Raw timeline body HTML (from the line `_time.md`), or null. */
	bodyHtml: string | null;
	/** Resolved target entity links (label + href), one per target. */
	targets: { label: string; href: string }[];
	/** Direct child timelines nested under this timeline's folder. */
	childTimelines: ChildTimelineCard[];
}

export async function loadTimelinePage(timelinePath: string): Promise<TimelinePageData> {
	await graph.ready();
	const timeline = graph.timeline(timelinePath)!;

	const resolveLink = (path: string) => graph.resolveLink(path, graph.clusterOf(timelinePath));
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();

	// Render the line _time.md body.
	const bodyHtml = timeline.body.trim()
		? await inlineSvgFigures(
				renderBody(timeline.body, resolveLink, languageCodes, kindIds, undefined, timelinePath)
			)
		: null;

	// Build entry cards — only summary, not full body.
	const entries: TimelineEntryCard[] = timeline.entries.map((entry) => {
		const summaryHtml = entry.summary
			? renderSummary(entry.summary, resolveLink, languageCodes, { kindIds })
			: null;
		return {
			path: entry.path,
			year: entry.year,
			summaryHtml,
			href: `/${timelinePath}/${entry.year}`
		};
	});

	// Discover direct child timelines (nested sub-timelines).
	// childFolders() only walks entities/collections so we scan the timelines
	// map directly: any timeline whose path is exactly `<timelinePath>/<slug>`
	// (one extra segment, no deeper) is a direct child.
	const childPrefix = `${timelinePath}/`;
	const childTimelines: ChildTimelineCard[] = [...graph.timelines().entries()]
		.filter(([p]) => {
			if (!p.startsWith(childPrefix)) return false;
			const rest = p.slice(childPrefix.length);
			return rest.length > 0 && !rest.includes('/');
		})
		.map(([p, child]) => {
			const childLeaf = p.slice(p.lastIndexOf('/') + 1);
			const childEntity = graph.get(p);
			const childTitle =
				child.meta.name ?? childEntity?.meta.name ?? childLeaf.replace(/-/g, ' ');
			const childSummaryHtml = child.meta.summary
				? renderSummary(child.meta.summary, resolveLink, languageCodes, { kindIds })
				: null;
			return {
				path: p,
				href: `/${p}`,
				title: childTitle,
				summaryHtml: childSummaryHtml,
				firstYear: child.entries.length > 0 ? child.entries[0].year : null,
				lastYear:
					child.entries.length > 0 ? child.entries[child.entries.length - 1].year : null,
				targets: child.targets
					.map((id) => {
						const e = graph.get(id);
						return e ? { label: e.meta.name, href: `/${id}` } : null;
					})
					.filter((t): t is { label: string; href: string } => t !== null)
			};
		});

	// Summary HTML.
	const summaryHtml = timeline.meta.summary
		? renderSummary(timeline.meta.summary, resolveLink, languageCodes, { kindIds })
		: null;

	// Title: meta.name → entity name → leaf slug.
	const leaf = timelinePath.includes('/')
		? timelinePath.slice(timelinePath.lastIndexOf('/') + 1)
		: timelinePath;
	const containingEntity = graph.get(timelinePath);
	const title =
		timeline.meta.name ?? containingEntity?.meta.name ?? leaf.replace(/-/g, ' ');

	// Breadcrumbs: walk folder ancestors.
	const breadcrumbs: { label: string; href: string }[] = [];
	if (timelinePath) {
		const segs = timelinePath.split('/');
		for (let i = 1; i <= segs.length; i++) {
			const prefix = segs.slice(0, i).join('/');
			if (graph.isFolder(prefix)) {
				breadcrumbs.push({
					label: graph.folderLabels(prefix).plural,
					href: `/${prefix}`
				});
			}
		}
		// If the path itself is an entity, replace the final breadcrumb
		// with a link to the entity page.
		if (containingEntity) {
			// Remove the last breadcrumb (same as the entity) if present.
			if (breadcrumbs.length > 0) {
				breadcrumbs[breadcrumbs.length - 1] = {
					label: containingEntity.meta.name,
					href: `/${timelinePath}`
				};
			} else {
				breadcrumbs.push({
					label: containingEntity.meta.name,
					href: `/${timelinePath}`
				});
			}
		}
	}

	return {
		kind: 'timeline',
		title,
		summaryHtml,
		timelinePath,
		breadcrumbs,
		entries,
		bodyHtml,
		targets: timeline.targets
			.map((id) => {
				const e = graph.get(id);
				return e ? { label: e.meta.name, href: `/${id}` } : null;
			})
			.filter((t): t is { label: string; href: string } => t !== null),
		childTimelines
	};
}
