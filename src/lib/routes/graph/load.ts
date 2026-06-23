import { graph } from '$lib/server/graph';
import { relationLabel, type RelationLabels } from '$lib/types';

export interface GraphNode {
	id: string;
	name: string;
	kind: string | null;
	/** Resolved singular label for the kind, e.g. "Cosmological Concept". */
	kindLabel: string | null;
	/** First path segment — the cluster this entity belongs to. */
	cluster: string;
	/**
	 * True when this node is a qualifier intermediary — it appears in the graph
	 * as a waypoint between a member and a group (via holds-qualifier / qualifier-in
	 * synthetic edges). The ego graph expands through these nodes by one
	 * additional hop so the full member→qualifier→group chain is always visible.
	 */
	isQualifierNode: boolean;
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
 * Relations that carry a `qualifier` field are exploded into two synthetic
 * edges — `holds-qualifier` (source → qualifier entity) and `qualifier-in` (qualifier
 * entity → target) — and the direct edge is suppressed. This makes
 * the qualifier entity a visible waypoint in the graph.
 *
 * Wikilink edges are intentionally excluded — they are too numerous
 * and would make the graph unreadable.
 */
export async function load() {
	await graph.ready();

	// ── Nodes ──────────────────────────────────────────────────────
	// We need to know which node ids are qualifier intermediaries before
	// building the node list, so collect them in the edge pass below.
	const qualifierNodeIds = new Set<string>();

	// ── Typed edges (no wikilinks) ─────────────────────────────────
	const edgeSet = new Set<string>(); // deduplicate by "source|target|kind"
	const edges: GraphEdge[] = [];

	// Maps each entity id to the set of target ids it reaches via a qualifier.
	// Keyed by the *source* entity so the ego graph can restrict qualifier-in
	// expansion to only targets that the center entity itself relates to.
	const qualifierTargets: Record<string, string[]> = {};

	// Inverse of qualifierTargets: maps each target id to the source entities
	// that reach it via a qualifier. Used to expand the ego graph when the
	// center is the *target* of a qualified relation (e.g. Earth seeing Human).
	const qualifierSources: Record<string, string[]> = {};

	// Pre-resolved labels for holds-qualifier edges: `entityId|qualifierId` →
	// { outLabel, inLabel } of the *original* relation kind. Lets the graph
	// display "Originated on" instead of "Holds qualifier" on the dashed edge.
	// When one entity uses the same qualifier for multiple relation kinds the
	// labels are joined with " / ".
	const qualifierEdgeLabels: Record<string, { outLabel: string; inLabel: string }> = {};
	const registry = graph.relationRegistry();

	function addEdge(source: string, target: string, kind: string) {
		const key = `${source}|${target}|${kind}`;
		if (edgeSet.has(key)) return;
		edgeSet.add(key);
		edges.push({ source, target, kind });
	}

	for (const entity of graph.all()) {
		for (const e of graph.outEdges(entity.id)) {
			if (e.kind === 'wikilink') continue;
			if (e.qualifier) {
				// Two-hop: source →[holds-qualifier]→ qualifier →[qualifier-in]→ target
				// Suppress the direct edge entirely.
				qualifierNodeIds.add(e.qualifier);
				addEdge(e.from, e.qualifier, 'holds-qualifier');
				addEdge(e.qualifier, e.to, 'qualifier-in');
				// Record which targets this specific entity reaches via qualifiers.
				if (!qualifierTargets[e.from]) qualifierTargets[e.from] = [];
				qualifierTargets[e.from].push(e.to);
				// Inverse: record which sources reach this target via a qualifier.
				if (!qualifierSources[e.to]) qualifierSources[e.to] = [];
				qualifierSources[e.to].push(e.from);
				// Record the resolved label for this (entity, qualifier) pair so the
				// graph can show the original relation label instead of "Holds qualifier".
				const labelKey    = `${e.from}|${e.qualifier}`;
				const qualInKey   = `${e.qualifier}|${e.to}`;
				const outLabel = relationLabel(e.kind, 'out', registry);
				const inLabel  = relationLabel(e.kind, 'in',  registry);
				const mergeInto = (key: string) => {
					if (qualifierEdgeLabels[key]) {
						const prev = qualifierEdgeLabels[key];
						if (!prev.outLabel.includes(outLabel)) prev.outLabel += ` / ${outLabel}`;
						if (!prev.inLabel.includes(inLabel))   prev.inLabel  += ` / ${inLabel}`;
					} else {
						qualifierEdgeLabels[key] = { outLabel, inLabel };
					}
				};
				mergeInto(labelKey);
				mergeInto(qualInKey);
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
			isQualifierNode: qualifierNodeIds.has(e.id)
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

	// ── Relation labels (for ego-graph edge labels) ───────────────
	// Serialise only the out/in label pair — domain constraints are not
	// needed client-side.
	const relationLabels: Record<string, RelationLabels> = {};
	for (const [id, schema] of registry) {
		relationLabels[id] = { outLabel: schema.outLabel, inLabel: schema.inLabel };
	}

	return { nodes, edges, kindParents, kindLabels, ontologyOf, ontologyTitles, qualifierTargets, qualifierSources, qualifierEdgeLabels, relationLabels };
}

export type GraphData = Awaited<ReturnType<typeof load>>;
