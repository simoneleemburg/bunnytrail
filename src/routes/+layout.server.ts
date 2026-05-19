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

	return { nav };
}
