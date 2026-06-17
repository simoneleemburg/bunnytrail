import { graph } from '$lib/server/graph';
import { titleCaseSlug } from '$lib/types';
import type { ClusterScope } from '$lib/cluster';

export interface KindNode {
	kind: string;
	/** `/kinds/<kind>` (or `/<cluster>/kinds/<kind>` in scope) for registered kinds, null for unregistered. */
	href: string | null;
	/** Display label, from the registry. */
	label: string | null;
	/** Total entity count for this kind family (kind + descendants), filtered to scope when set. */
	count: number | null;
	children: KindNode[];
}

/**
 * A section of the kinds index page. When the world has kind groups,
 * each group produces one section with a heading. Ungrouped root kinds
 * (those with `group === null`) produce a final section with
 * `groupId === null` and no heading.
 */
export interface KindGroupSection {
	/** Group id, or null for ungrouped root kinds. */
	groupId: string | null;
	/** Display title for the group heading, or null when ungrouped. */
	groupTitle: string | null;
	roots: KindNode[];
}

export interface KindsIndexPageData {
	/**
	 * When any kind groups are registered, kinds are partitioned into
	 * sections. When no groups exist the list has a single section with
	 * `groupId === null` (backwards-compat shape).
	 */
	sections: KindGroupSection[];
	unregistered: { kind: string; count: number }[];
}

/**
 * Build the kind-hierarchy view-model. When `scope` is a cluster
 * id, the tree is filtered to kinds with at least one instance
 * in that cluster (via family rollup, so ancestors of attested
 * kinds are preserved automatically). Counts reflect the scope.
 *
 * When `scope` is null, returns the full taxonomy with
 * cross-cluster counts. The unregistered section follows the same
 * scoping rule.
 */
export function loadKindsIndexPage(scope: ClusterScope): KindsIndexPageData {
	const registry = graph.kindRegistry();
	const groupRegistry = graph.kindGroupRegistry();

	const inScope = (id: string): boolean => (scope === null ? true : id.startsWith(`${scope}/`));
	const hrefFor = (kind: string): string =>
		scope === null ? `/kinds/${kind}` : `/${scope}/kinds/${kind}`;

	function build(kind: string): KindNode | null {
		const k = registry.get(kind);
		const family = kindFamily(kind);
		const count = graph
			.all()
			.filter(
				(e) => typeof e.meta.kind === 'string' && family.has(e.meta.kind) && inScope(e.id)
			).length;

		// In a scope, drop kinds with no attestation in the family.
		// At the root of a scoped tree, family-rollup ensures
		// ancestors of attested kinds survive (their own descendants
		// keep family-count > 0). A leaf with 0 hits disappears.
		if (scope !== null && count === 0) return null;

		return {
			kind,
			href: hrefFor(kind),
			label: k?.meta.plural ?? null,
			count,
			children: graph
				.childKinds(kind)
				.map((c) => c.id)
				.sort()
				.map(build)
				.filter((n): n is KindNode => n !== null)
		};
	}

	const allTopLevel = graph.topLevelKinds().map((k) => k.id).sort();

	// Partition top-level kinds into group sections.
	// Build a map from groupId → sorted kind ids.
	const grouped = new Map<string | null, string[]>();
	for (const kindId of allTopLevel) {
		const k = registry.get(kindId);
		const g = k?.group ?? null;
		if (!grouped.has(g)) grouped.set(g, []);
		grouped.get(g)!.push(kindId);
	}

	// Determine section order: groups in insertion order (alphabetical
	// since kinds are sorted), ungrouped kinds last.
	const sections: KindGroupSection[] = [];

	// First emit grouped sections (sorted by group id for stability).
	const sortedGroupIds = [...grouped.keys()]
		.filter((g): g is string => g !== null)
		.sort();

	for (const groupId of sortedGroupIds) {
		const kindIds = grouped.get(groupId) ?? [];
		const roots = kindIds.map(build).filter((n): n is KindNode => n !== null);
		if (scope !== null && roots.length === 0) continue;

		const groupObj = groupRegistry.get(groupId);
		const groupTitle = groupObj?.title ?? titleCaseSlug(groupId);

		sections.push({ groupId, groupTitle, roots });
	}

	// Ungrouped kinds go last, no heading.
	const ungroupedIds = grouped.get(null) ?? [];
	const ungroupedRoots = ungroupedIds.map(build).filter((n): n is KindNode => n !== null);
	if (scope === null || ungroupedRoots.length > 0) {
		sections.push({ groupId: null, groupTitle: null, roots: ungroupedRoots });
	}

	// Free-form kinds: every distinct `kind:` value carried by an
	// entity that isn't registered. In scope mode, only count
	// in-scope entities.
	const unregisteredCounts = new Map<string, number>();
	for (const e of graph.all()) {
		const k = e.meta.kind;
		if (typeof k !== 'string' || !k) continue;
		if (registry.has(k)) continue;
		if (!inScope(e.id)) continue;
		unregisteredCounts.set(k, (unregisteredCounts.get(k) ?? 0) + 1);
	}
	const unregistered = [...unregisteredCounts.entries()]
		.map(([kind, count]) => ({ kind, count }))
		.sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));

	return { sections, unregistered };
}

function kindFamily(kind: string): Set<string> {
	const seen = new Set<string>([kind]);
	const queue = [kind];
	while (queue.length) {
		const cur = queue.shift()!;
		for (const c of graph.childKinds(cur)) {
			if (!seen.has(c.id)) {
				seen.add(c.id);
				queue.push(c.id);
			}
		}
	}
	return seen;
}
