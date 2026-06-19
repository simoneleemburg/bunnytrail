import { graph } from '$lib/server/graph';
import type { PropertySchema } from '$lib/types';

export interface PropertyIndexEntry {
	id: string;
	label: string;
	count: number;
	schema: PropertySchema;
	href: string;
}

export interface PropertiesIndexPageData {
	entries: PropertyIndexEntry[];
	/** True when world.md has a properties: block */
	hasSchema: boolean;
}

export async function load(): Promise<PropertiesIndexPageData> {
	await graph.ready();
	const registry = graph.propertyRegistry();
	const hasSchema = registry.size > 0;

	const entries: PropertyIndexEntry[] = [];
	for (const [id, schemas] of registry) {
		// Use the first declaration's label as the display label for the index row.
		// All declarations for a key should use the same label by convention.
		const primarySchema = schemas[0];
		entries.push({
			id,
			label: primarySchema.label,
			count: graph.propertiesByKind(id).length,
			schema: primarySchema,
			href: `/properties/${id}`
		});
	}

	// Sort by count descending, then label alphabetically
	entries.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

	return { entries, hasSchema };
}
