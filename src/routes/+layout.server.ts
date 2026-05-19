import { graph } from '$lib/server/graph';

export async function load() {
	await graph.ready();

	// Top-level nav lists only top-level types; subtypes are
	// reached via their parent type-index (which lists them as
	// sections).
	const nav = graph.topLevelTypes().map((t) => ({
		href: `/${t.type}`,
		label: t.labels.plural,
		count: t.count
	}));

	// Meta links sit after the type-folder links. `Kinds` is the
	// global kind-hierarchy overview — handy for spotting kinds
	// that should be promoted to their own folder or supertypes
	// that have grown enough to need a hub.
	nav.push({ href: '/kinds', label: 'Kinds', count: 0 });

	return { nav };
}
