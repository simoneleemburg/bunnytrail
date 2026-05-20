import { graph } from '$lib/server/graph';

/**
 * Region scope for the masthead nav.
 *
 * Top-level folders under `content/` are *regions* of the universe
 * (currently just `aurethia/`). The user picks a region (or "all") to
 * scope their browsing; the choice is persisted in a cookie so it
 * survives navigation and reload.
 *
 * `region === null` is the "all" / cross-region view: shelf links go
 * to virtual aggregate routes like `/characters` that gather entries
 * from every region.
 *
 * `region === '<region>'` scopes shelf links to that region:
 * `/aurethia/characters` etc. — real folder routes that already
 * existed before the nav rework.
 */
export async function load({ cookies }) {
	await graph.ready();

	const regions = graph.regions();
	const cookieValue = cookies.get('region') ?? '';
	const selectedRegion: string | null =
		cookieValue && regions.includes(cookieValue) ? cookieValue : null;

	// Shelf links: union of immediate sub-shelves found across all
	// regions. With one region this is just that region's shelves;
	// with several it's the union, deduplicated.
	const shelves = graph.unionShelves();
	const nav = shelves.map((shelf) => {
		// Display label: the *singular* region's collection-yaml title
		// for this shelf, or a title-cased fallback. We prefer the
		// region-local title because that's where the editorial
		// description was authored.
		const labelSourcePath =
			graph.regionShelfPaths(shelf).find((p) => graph.collection(p)) ??
			graph.regionShelfPaths(shelf)[0];
		const label = graph.folderLabels(labelSourcePath ?? shelf).plural;
		const href = selectedRegion ? `/${selectedRegion}/${shelf}` : `/${shelf}`;
		const count = selectedRegion
			? graph.byFolderRecursive(`${selectedRegion}/${shelf}`).length
			: graph.entitiesByShelfAcrossRegions(shelf).length;
		return { href, label, count };
	});

	const regionOptions = [
		{ value: '', label: 'All Alteria', selected: selectedRegion === null },
		...regions.map((r) => ({
			value: r,
			label: graph.folderLabels(r).singular,
			selected: selectedRegion === r
		}))
	];

	return {
		nav,
		regionOptions,
		selectedRegion
	};
}
