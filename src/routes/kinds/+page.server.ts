import { graph } from '$lib/server/graph';

export interface KindNode {
	kind: string;
	/** `/kinds/<kind>` for registered kinds, null for unregistered. */
	href: string | null;
	/** Display label, from the registry. */
	label: string | null;
	/** Total entity count for this kind family (kind + descendants). */
	count: number | null;
	children: KindNode[];
}

/**
 * Global kind hierarchy overview. Walks the kind registry
 * (`content_meta/kinds/`) and renders it as a tree, linking each node to its
 * `/kinds/<kind>` page. Unregistered kinds (free-form `kind:`
 * values authors have used without registering) appear in a
 * separate section.
 *
 * Editorial overview page — useful for spotting kinds that should
 * be promoted to the registry, or naming drift between content and
 * the taxonomy.
 */
export async function load() {
	await graph.ready();

	const registry = graph.kindRegistry();

	function build(kind: string): KindNode {
		const k = registry.get(kind);
		const family = kindFamily(kind);
		const count = graph.all().filter((e) => typeof e.meta.kind === 'string' && family.has(e.meta.kind))
			.length;
		return {
			kind,
			href: `/kinds/${kind}`,
			label: k?.meta.plural ?? null,
			count,
			children: graph
				.childKinds(kind)
				.map((c) => c.id)
				.sort()
				.map(build)
		};
	}

	const roots = graph
		.topLevelKinds()
		.map((k) => k.id)
		.sort()
		.map(build);

	// Free-form kinds: every distinct `kind:` value carried by an
	// entity that isn't registered. Counts are entity counts.
	const unregisteredCounts = new Map<string, number>();
	for (const e of graph.all()) {
		const k = e.meta.kind;
		if (typeof k !== 'string' || !k) continue;
		if (registry.has(k)) continue;
		unregisteredCounts.set(k, (unregisteredCounts.get(k) ?? 0) + 1);
	}
	const unregistered = [...unregisteredCounts.entries()]
		.map(([kind, count]) => ({ kind, count }))
		.sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));

	return { roots, unregistered };
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
