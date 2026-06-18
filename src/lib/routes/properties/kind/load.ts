import { graph } from '$lib/server/graph';
import type { PropertySchema } from '$lib/types';
import { error } from '@sveltejs/kit';

export interface PropertyEntry {
	entityId: string;
	entityName: string;
	href: string;
	value: unknown;
}

export interface PropertyDetailPageData {
	kindId: string;
	schema: PropertySchema;
	entries: PropertyEntry[];
}

export async function load({ params }: { params: { kind: string } }): Promise<PropertyDetailPageData> {
	await graph.ready();
	const { kind } = params;
	const registry = graph.propertyRegistry();
	const schema = registry.get(kind);

	if (!schema) {
		error(404, `No property '${kind}' found in schema`);
	}

	const entries = graph.propertiesByKind(kind);

	return { kindId: kind, schema, entries };
}
