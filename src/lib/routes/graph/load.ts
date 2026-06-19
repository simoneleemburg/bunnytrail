import { graph } from '$lib/server/graph';

export interface GraphNode {
	id: string;
	name: string;
	kind: string | null;
	/** Resolved singular label for the kind, e.g. "Cosmological Concept". */
	kindLabel: string | null;
	/** First path segment — the cluster this entity belongs to. */
	cluster: string;
	/**
	 * True when this node is a role intermediary — it appears in the graph
	 * as a waypoint between a member and a group (via holds-role / role-in
	 * synthetic edges). The ego graph expands through these nodes by one
	 * additional hop so the full member→role→group chain is always visible.
	 */
	isRoleNode: boolean;
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
 * Relations that carry a `role` field are exploded into two synthetic
 * edges — `holds-role` (source → role entity) and `role-in` (role
 * entity → target) — and the direct edge is suppressed. This makes
 * the role entity a visible waypoint in the graph.
 *
 * Wikilink edges are intentionally excluded — they are too numerous
 * and would make the graph unreadable.
 */
export async function load() {
	await graph.ready();

	// ── Nodes ──────────────────────────────────────────────────────
	// We need to know which node ids are role intermediaries before
	// building the node list, so collect them in the edge pass below.
	const roleNodeIds = new Set<string>();

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
			if (e.role) {
				// Two-hop: source →[holds-role]→ role →[role-in]→ target
				// Suppress the direct edge entirely.
				roleNodeIds.add(e.role);
				addEdge(e.from, e.role, 'holds-role');
				addEdge(e.role, e.to, 'role-in');
			} else {
				addEdge(e.from, e.to, e.kind);
			}
		}
	}

	// ── Nodes ──────────────────────────────────────────────────────
	const nodes: GraphNode[] = graph.all().map((e) => {
		const kindId = typeof e.meta.kind === 'string' ? e.meta.kind : null;
		const kindObj = kindId ? graph.kind(kindId) : null;
		return {
			id: e.id,
			name: e.meta.name,
			kind: kindId,
			kindLabel: kindObj?.meta.singular ?? kindId,
			cluster: e.id.split('/')[0] ?? '',
			isRoleNode: roleNodeIds.has(e.id)
		};
	});

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

	// ── Class edges ────────────────────────────────────────────────
	// entity.meta.class = <classEntityId> → edge: entity → class, kind "instance-of"
	for (const entity of graph.all()) {
		const classId = entity.meta.class;
		if (typeof classId !== 'string') continue;
		if (!nodeIds.has(classId)) continue;
		addEdge(entity.id, classId, 'instance-of');
	}

	// ── Kind hierarchy (for client-side transitive filtering) ─────
	// Wire format: kindId → parentId | null (same as CollectionPage)
	const kindParents: Record<string, string | null> = {};
	const kindLabels: Record<string, string> = {};
	for (const [id, k] of graph.kindRegistry()) {
		kindParents[id] = k.parent;
		kindLabels[id] = k.meta.singular ?? id;
	}

	// ── Ontologies (for filter bar section headers) ───────────────
	// Wire format: kindId → ontologyId | null
	// Also: ontologyId → ontology title (for rendering section headers)
	const ontologyOf: Record<string, string | null> = {};
	for (const [id, k] of graph.kindRegistry()) {
		ontologyOf[id] = k.group;
	}
	const ontologyTitles: Record<string, string> = {};
	for (const [id, g] of graph.ontologyRegistry()) {
		ontologyTitles[id] = g.title ?? id;
	}

	return { nodes, edges, kindParents, kindLabels, ontologyOf, ontologyTitles };
}

export type GraphData = Awaited<ReturnType<typeof load>>;
