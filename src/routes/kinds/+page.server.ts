import { graph } from '$lib/server/graph';
import type { EntityType } from '$lib/types';

export interface KindNode {
	kind: string;
	/** Type path of the kind's defining `_type.yaml`, if any. */
	href: string | null;
	/** Display label for the linked type, when href is set. */
	label: string | null;
	/** Direct entity count for the linked type, when href is set. */
	count: number | null;
	children: KindNode[];
}

/**
 * Global kind hierarchy overview. Walks the kind forest built from
 * every `_type.yaml`'s `kind:` + `kindParent:` declarations and
 * renders it as a tree. Linked nodes point at the kind's own
 * `/kinds/<kind>` page when the kind is registered in `src/kinds/`;
 * unregistered kinds (e.g. free-floating `subkinds:` entries) render
 * muted and unlinked.
 *
 * This is an editorial overview page — useful for spotting kinds
 * that should be promoted to their own folder, supertypes that
 * have grown enough children to need a hub page, or naming drift
 * between the kind label and its type folder.
 */
export async function load() {
	await graph.ready();

	const tree = graph.kinds();
	const registry = graph.kindRegistry();

	// Type-folder counts indexed by the kind that folder declares,
	// so a linked kind tile can still show "how many entities sit
	// under the canonical type folder" alongside the family-wide
	// count from the registry.
	const kindToType = new Map<string, EntityType>();
	for (const t of graph.types()) {
		const meta = graph.typeMetaRaw(t.type);
		if (typeof meta?.kind === 'string' && meta.kind) {
			kindToType.set(meta.kind, t.type);
		}
	}

	function build(kind: string): KindNode {
		const registered = registry.has(kind);
		const type = kindToType.get(kind) ?? null;
		const info = type ? graph.typeInfo(type) : null;
		const label = registry.get(kind)?.meta.plural ?? info?.labels.plural ?? null;
		const count = type ? graph.byType(type).length : null;
		return {
			kind,
			href: registered ? `/kinds/${kind}` : null,
			label,
			count,
			children: tree
				.children(kind)
				.sort((a, b) => a.localeCompare(b))
				.map(build)
		};
	}

	const roots = tree
		.all()
		.filter((k) => tree.parent(k) === null)
		.sort((a, b) => a.localeCompare(b))
		.map(build);

	// Free-form kinds: every distinct `kind:` value carried by an
	// entity that isn't registered in the kind tree. These are the
	// informal kinds the worldbuilding has grown into — useful to
	// see them in one place so you can decide which deserve to be
	// promoted into the taxonomy and which should stay as
	// folksonomy. Counts here are entity counts, not type counts.
	const unregisteredCounts = new Map<string, number>();
	for (const e of graph.all()) {
		const k = e.meta.kind;
		if (typeof k !== 'string' || !k) continue;
		if (tree.has(k)) continue;
		unregisteredCounts.set(k, (unregisteredCounts.get(k) ?? 0) + 1);
	}
	const unregistered = [...unregisteredCounts.entries()]
		.map(([kind, count]) => ({ kind, count }))
		.sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));

	return { roots, unregistered };
}
