import { graph } from '$lib/server/graph';
import { relationLabel } from '$lib/types';
import { error } from '@sveltejs/kit';

export interface RelationEdge {
	sourceId: string;
	sourceName: string;
	sourceKind: string | null;
	sourceHref: string;
	targetId: string;
	targetName: string;
	targetKind: string | null;
	targetHref: string;
}

export interface MissingRelationEntry {
	entityId: string;
	entityName: string;
	entityKind: string;
	href: string;
}

export interface RelationDetailPageData {
	kind: string;
	outLabel: string;
	inLabel: string;
	domain: string[];
	codomain: string[];
	worldDefined: boolean;
	edges: RelationEdge[];
	/** Entities whose kind satisfies the domain but have no relation of this kind. */
	missing: MissingRelationEntry[];
}

export async function load({ params }: { params: { kind: string } }): Promise<RelationDetailPageData> {
	await graph.ready();
	const { kind } = params;
	const registry = graph.relationRegistry();
	const schema = registry.get(kind);

	// Must be either in the world schema or actually used
	const edges = graph.edgesByRelationKind(kind);
	if (!schema && edges.length === 0) {
		error(404, `No relation kind '${kind}' found`);
	}

	const domain = schema?.domain ?? [];
	const codomain = schema?.codomain ?? [];

	const edgeRows: RelationEdge[] = edges
		.map(({ source, target }) => ({
			sourceId: source.id,
			sourceName: source.meta.name,
			sourceKind: typeof source.meta.kind === 'string' ? source.meta.kind : null,
			sourceHref: `/${source.id}`,
			targetId: target.id,
			targetName: target.meta.name,
			targetKind: typeof target.meta.kind === 'string' ? target.meta.kind : null,
			targetHref: `/${target.id}`
		}))
		.sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.targetName.localeCompare(b.targetName));

	// Which domain-kind entities are missing this relation?
	const missing: MissingRelationEntry[] = [];
	if (domain.length > 0) {
		const kindRegistry = graph.kindRegistry();

		// Build ancestor map helper
		function ancestors(kindId: string): Set<string> {
			const result = new Set<string>();
			let cur: string | null = kindId;
			while (cur) {
				result.add(cur);
				cur = kindRegistry.get(cur)?.parent ?? null;
			}
			return result;
		}

		// Entities that already have at least one edge of this kind
		const sourcesWithRelation = new Set(edges.map(e => e.source.id));

		for (const entity of graph.all()) {
			const entityKind = typeof entity.meta.kind === 'string' ? entity.meta.kind : null;
			if (!entityKind) continue;
			const entityAncestors = ancestors(entityKind);
			const satisfiesDomain = domain.some(d => entityAncestors.has(d));
			if (!satisfiesDomain) continue;
			if (sourcesWithRelation.has(entity.id)) continue;
			missing.push({
				entityId: entity.id,
				entityName: entity.meta.name,
				entityKind,
				href: `/${entity.id}`
			});
		}
		missing.sort((a, b) => a.entityName.localeCompare(b.entityName));
	}

	return {
		kind,
		outLabel: schema?.outLabel ?? relationLabel(kind, 'out'),
		inLabel: schema?.inLabel ?? relationLabel(kind, 'in'),
		domain,
		codomain,
		worldDefined: !!schema,
		edges: edgeRows,
		missing
	};
}
