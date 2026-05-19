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
 * renders it as a tree. A kind that has a defining `_type.yaml`
 * (i.e. a registered type folder whose `kind:` matches) gets a
 * link to its type-index page; free-floating subkinds (registered
 * via `subkinds:` only, with no folder of their own) render muted
 * and unlinked.
 *
 * This is an editorial overview page — useful for spotting kinds
 * that should be promoted to their own folder, supertypes that
 * have grown enough children to need a hub page, or naming drift
 * between the kind label and its type folder.
 */
export async function load() {
	await graph.ready();

	// Build kind → defining type. A type "defines" a kind when its
	// own `_type.yaml` declares that kind via `kind:`. Subkind
	// declarations (under `subkinds:`) don't count — they register
	// the kind in the tree but don't give it a hub page.
	const kindToType = new Map<string, EntityType>();
	for (const t of graph.types()) {
		const meta = graph.typeMetaRaw(t.type);
		if (typeof meta?.kind === 'string' && meta.kind) {
			kindToType.set(meta.kind, t.type);
		}
	}

	const tree = graph.kinds();

	function build(kind: string): KindNode {
		const type = kindToType.get(kind) ?? null;
		const info = type ? graph.typeInfo(type) : null;
		return {
			kind,
			href: type ? `/${type}` : null,
			label: info ? info.labels.plural : null,
			count: type ? graph.byType(type).length : null,
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
