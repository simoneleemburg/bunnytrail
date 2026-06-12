import { graph } from '$lib/server/graph';
import type { ClusterScope } from '$lib/cluster';

export interface SymbolEntry {
	id: string;
	href: string;
	name: string;
	sigil: string;
	summary: string | null;
	kind: string | null;
}

export interface SymbolGroup {
	/** Cluster id, or null for universal/unscoped entities. */
	cluster: string | null;
	/** Display label for the group heading. Null in single-cluster (scoped) view — no heading shown. */
	label: string | null;
	entries: SymbolEntry[];
}

/**
 * Symbology index — every entity in the world that carries a `sigil:`
 * glyph in its frontmatter.
 *
 * When `scope` is null (all-clusters view), entities are grouped by
 * cluster so Foundation and Aurethia symbols are visually separated.
 * Groups are omitted when they contain no sigil-bearing entities.
 *
 * When `scope` is a cluster id, only entities in that cluster are
 * returned, in a single ungrouped list (one group with no heading).
 */
export function loadSymbologyPage(scope: ClusterScope): {
	scope: ClusterScope;
	groups: SymbolGroup[];
} {
	const toEntry = (e: {
		id: string;
		meta: { name: string; sigil?: unknown; summary?: string; kind?: string };
	}): SymbolEntry => ({
		id: e.id,
		href: `/${e.id}`,
		name: e.meta.name,
		sigil: e.meta.sigil as string,
		summary: e.meta.summary ?? null,
		kind: e.meta.kind ?? null
	});

	const hasSigil = (e: { meta: { sigil?: unknown } }): boolean =>
		typeof e.meta.sigil === 'string' && (e.meta.sigil as string).trim() !== '';

	const byGlyphThenName = (a: SymbolEntry, b: SymbolEntry): number =>
		a.sigil.localeCompare(b.sigil) || a.name.localeCompare(b.name);

	if (scope !== null) {
		// Scoped view: single flat list, no group headings needed.
		const entries = graph
			.all()
			.filter((e) => hasSigil(e) && e.id.startsWith(`${scope}/`))
			.map(toEntry)
			.sort(byGlyphThenName);
		return { scope, groups: [{ cluster: scope, label: null, entries }] };
	}

	// All-clusters view: one group per cluster + universal folders,
	// ordered clusters-first then universals, both alphabetical.
	const clusters = graph.clusters();
	const universals = graph.universalFolders();
	const allRoots = [...clusters, ...universals];

	const groups: SymbolGroup[] = allRoots
		.map((root): SymbolGroup | null => {
			const entries = graph
				.all()
				.filter((e) => hasSigil(e) && e.id.startsWith(`${root}/`))
				.map(toEntry)
				.sort(byGlyphThenName);
			if (entries.length === 0) return null;
			return {
				cluster: root,
				label: graph.folderLabels(root).plural,
				entries
			};
		})
		.filter((g): g is SymbolGroup => g !== null);

	// Catch any entities not under a known cluster or universal root.
	const knownRootSet = new Set(allRoots);
	const orphaned = graph
		.all()
		.filter((e) => {
			if (!hasSigil(e)) return false;
			const root = e.id.split('/')[0];
			return !knownRootSet.has(root);
		})
		.map(toEntry)
		.sort(byGlyphThenName);
	if (orphaned.length > 0) {
		groups.push({ cluster: null, label: 'Other', entries: orphaned });
	}

	return { scope, groups };
}

/**
 * SvelteKit load function for the standalone /symbology route.
 * Always uses the global (all-clusters) scope.
 */
export async function load() {
	await graph.ready();
	return loadSymbologyPage(null);
}

export type SymbologyData = Awaited<ReturnType<typeof load>>;
