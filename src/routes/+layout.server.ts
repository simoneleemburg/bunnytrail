import { graph } from '$lib/server/graph';

export async function load() {
	await graph.ready();

	const nav = graph.types().map((t) => ({
		href: `/${t.type}`,
		label: t.labels.plural,
		count: t.count
	}));

	return { nav };
}
