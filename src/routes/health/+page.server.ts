import { graph } from '$lib/server/graph';
import type { HealthIssue } from '$lib/types';

/**
 * The full list of health issues raised by the loader, grouped by
 * issue kind. Editorial dashboard — useful for spotting kinds that
 * need registering, prose files without yaml, broken cross-references,
 * and so on.
 *
 * Issue kinds are taken from `HealthIssue['kind']`; the loader is the
 * sole authority on what shows up here. Each group is sorted by
 * entity path for predictable scanning.
 */
export async function load() {
	await graph.ready();

	const issues = graph.issues();

	type Group = {
		kind: HealthIssue['kind'];
		label: string;
		blurb: string;
		items: { entity: string | null; href: string | null; detail: string }[];
	};

	const labels: Record<HealthIssue['kind'], { label: string; blurb: string }> = {
		'broken-link': {
			label: 'Broken links',
			blurb: 'Wikilinks whose target could not be resolved to an entity.'
		},
		orphan: {
			label: 'Orphans',
			blurb: 'Entities not referenced by any other entity. Often fine, sometimes a sign of drift.'
		},
		'missing-md': {
			label: 'Missing prose',
			blurb: 'Entities with structured metadata but no `index.md` body.'
		},
		'missing-yaml': {
			label: 'Missing metadata',
			blurb: 'Folders with `index.md` but no `index.yaml`.'
		},
		'invalid-yaml': {
			label: 'Invalid metadata',
			blurb: 'YAML that loaded but failed validation — most commonly an unregistered `kind:`.'
		}
	};

	const byKind = new Map<HealthIssue['kind'], Group>();
	for (const i of issues) {
		const meta = labels[i.kind];
		if (!byKind.has(i.kind)) {
			byKind.set(i.kind, {
				kind: i.kind,
				label: meta.label,
				blurb: meta.blurb,
				items: []
			});
		}
		byKind.get(i.kind)!.items.push({
			entity: i.entity ?? null,
			// Only link the entity column when the id is a real entity
			// the graph knows about. Some issues (e.g. invalid-yaml from
			// a yaml that failed to register) carry an id that isn't in
			// the entity map; for those we still want to show the path
			// but not link it into a 404.
			href: i.entity && graph.get(i.entity) ? `/${i.entity}` : null,
			detail: i.detail
		});
	}

	for (const g of byKind.values()) {
		g.items.sort((a, b) => (a.entity ?? '').localeCompare(b.entity ?? ''));
	}

	// Stable display order: most-actionable kinds first.
	const order: HealthIssue['kind'][] = [
		'broken-link',
		'invalid-yaml',
		'missing-yaml',
		'missing-md',
		'orphan'
	];
	const groups = order
		.map((k) => byKind.get(k))
		.filter((g): g is Group => g !== undefined);

	return {
		total: issues.length,
		groups
	};
}
