import { graph } from '$lib/server/graph';

export interface GraphNode {
	id: string;
	name: string;
	kind: string | null;
	/** First path segment — the cluster this entity belongs to. */
	cluster: string;
}

export interface GraphEdge {
	source: string;
	target: string;
	/** Relation kind string, e.g. "member-of", "located-in", "inhabits". */
	kind: string;
}

/**
 * Collect all entities (as nodes) and all typed, non-wikilink edges
 * (as links). Derived "inhabits" edges from population statistics are
 * also included.
 *
 * Wikilink edges are intentionally excluded — they are too numerous
 * and would make the graph unreadable.
 */
export async function load() {
	await graph.ready();

	// ── Nodes ──────────────────────────────────────────────────────
	const nodes: GraphNode[] = graph.all().map((e) => ({
		id: e.id,
		name: e.meta.name,
		kind: typeof e.meta.kind === 'string' ? e.meta.kind : null,
		cluster: e.id.split('/')[0] ?? ''
	}));

	// ── Typed edges (no wikilinks) ─────────────────────────────────
	const edgeSet = new Set<string>(); // deduplicate by "source|target|kind"
	const edges: GraphEdge[] = [];

	function addEdge(source: string, target: string, kind: string) {
		const key = `${source}|${target}|${kind}`;
		if (edgeSet.has(key)) return;
		edgeSet.add(key);
		edges.push({ source, target, kind });
	}

	for (const entity of graph.all()) {
		for (const e of graph.outEdges(entity.id)) {
			if (e.kind === 'wikilink') continue;
			addEdge(e.from, e.to, e.kind);
		}
	}

	// ── Derived "inhabits" edges from population statistics ────────
	// Re-derive here rather than calling speciesPresence() per entity,
	// since we just need the world ↔ species pairs.
	const nodeIds = new Set(nodes.map((n) => n.id));

	for (const entity of graph.all()) {
		const rawStats = entity.meta.statistics;
		if (!Array.isArray(rawStats)) continue;

		for (const item of rawStats) {
			if (!item || typeof item !== 'object') continue;
			const entry = item as Record<string, unknown>;
			if (!('population' in entry) || !Array.isArray(entry.population)) continue;

			for (const popItem of entry.population) {
				if (!popItem || typeof popItem !== 'object') continue;
				const p = popItem as Record<string, unknown>;
				if (!Array.isArray(p.slices)) continue;
				for (const s of p.slices) {
					if (!s || typeof s !== 'object') continue;
					const sl = s as Record<string, unknown>;
					if (typeof sl.species !== 'string') continue;
					// Only add the edge if the species entity actually exists.
					if (!nodeIds.has(sl.species)) continue;
					addEdge(sl.species, entity.id, 'inhabits');
				}
			}
		}
	}

	return { nodes, edges };
}

export type GraphData = Awaited<ReturnType<typeof load>>;
