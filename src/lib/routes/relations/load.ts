import { graph } from '$lib/server/graph';
import { relationLabel } from '$lib/types';
import type { PropertySchema } from '$lib/types';

export interface RelationIndexEntry {
	kind: string;
	outLabel: string;
	inLabel: string;
	/** Kind ids for valid sources, empty = unconstrained. */
	domain: string[];
	/** Kind ids for valid targets, empty = unconstrained. */
	codomain: string[];
	/** Total number of edges of this kind in the graph. */
	count: number;
	/** true = defined in world.md schema; false = engine fallback or unknown */
	worldDefined: boolean;
	href: string;
}

export interface PropertyIndexEntry {
	id: string;
	label: string;
	count: number;
	schema: PropertySchema;
	href: string;
}

export interface RelationsIndexPageData {
	entries: RelationIndexEntry[];
	/** Relation kinds used in content but absent from world schema (when strict). */
	undefinedKinds: { kind: string; count: number }[];
	/** true when world.md has a relations: block */
	hasSchema: boolean;
	/** Property entries from the world property registry. */
	propertyEntries: PropertyIndexEntry[];
	/** true when world.md has a properties: block */
	hasPropertySchema: boolean;
}

export async function load(): Promise<RelationsIndexPageData> {
	await graph.ready();
	const registry = graph.relationRegistry();
	const hasSchema = registry.size > 0;

	// Count all relation edges by kind
	const counts = new Map<string, number>();
	for (const entity of graph.all()) {
		for (const rel of entity.meta.relations ?? []) {
			counts.set(rel.kind, (counts.get(rel.kind) ?? 0) + 1);
		}
	}

	// Build entries for world-defined kinds (preserving world.md order)
	const entries: RelationIndexEntry[] = [];
	for (const [kind, schema] of registry) {
		entries.push({
			kind,
			outLabel: schema.outLabel,
			inLabel: schema.inLabel,
			domain: schema.domain ?? [],
			codomain: schema.codomain ?? [],
			count: counts.get(kind) ?? 0,
			worldDefined: true,
			href: `/relations/${kind}`
		});
	}

	// Relation kinds used in content but not in world schema
	const undefinedKinds: { kind: string; count: number }[] = [];
	for (const [kind, count] of counts) {
		if (!registry.has(kind)) {
			undefinedKinds.push({ kind, count });
		}
	}
	undefinedKinds.sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));

	// If no world schema, show all relation kinds actually used in content
	if (!hasSchema) {
		for (const kind of [...counts.keys()].sort()) {
			if (kind === 'wikilink') continue;
			entries.push({
				kind,
				outLabel: relationLabel(kind, 'out'),
				inLabel: relationLabel(kind, 'in'),
				domain: [],
				codomain: [],
				count: counts.get(kind) ?? 0,
				worldDefined: false,
				href: `/relations/${kind}`
			});
		}
	}

	// Property data
	const propRegistry = graph.propertyRegistry();
	const hasPropertySchema = propRegistry.size > 0;
	const propertyEntries: PropertyIndexEntry[] = [];
	for (const [id, schema] of propRegistry) {
		propertyEntries.push({
			id,
			label: schema.label,
			count: graph.propertiesByKind(id).length,
			schema,
			href: `/properties/${id}`
		});
	}
	propertyEntries.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

	return { entries, undefinedKinds, hasSchema, propertyEntries, hasPropertySchema };
}
