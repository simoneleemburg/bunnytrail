import { building } from '$app/environment';
import { graph } from '$lib/server/graph';
import { world } from '$lib/server/world';
import { assets } from '$lib/server/assets';
import { readScope, type ScopeContext } from '$lib/cluster';

/**
 * Cluster scope for the masthead nav.
 *
 * Top-level folders under `content/` are *clusters* of the universe.
 * The user's current scope is derived from the URL itself — see
 * `$lib/cluster.ts` for the rules. No cookie; the URL is the source
 * of truth.
 *
 * `selectedCluster === null` is the all-clusters view: shelf links
 * go to virtual aggregate routes like `/characters` that gather
 * entries from every cluster. The label for this option is
 * authored in `content_meta/world.md` as `allScopeLabel`.
 *
 * `selectedCluster === '<cluster>'` scopes shelf links to that
 * cluster: `/<cluster>/characters` etc. — real folder routes.
 */
export async function load({ url }: { url: URL }) {
	await graph.ready();
	await world.ready();

	const clusters = graph.clusters();
	const unionShelves = graph.unionShelves();
	// Top-level paths that have a cluster-scoped variant under
	// /<cluster>/. /kinds is synthesized (not a content folder), so
	// the union-shelf list doesn't include it.
	const clusterAwarePaths = ['kinds'];
	const ctx: ScopeContext = { clusters, unionShelves, clusterAwarePaths };
	// During prerender, every URL is just a path — querystrings are
	// not part of the prerender input set, and SvelteKit forbids
	// reading `url.searchParams` to make sure we don't accidentally
	// depend on them. The scope falls back to whatever the path
	// implies, which is what we want for static output.
	const searchParams = building ? new URLSearchParams() : url.searchParams;
	const selectedCluster = readScope(url.pathname, searchParams, ctx);

	// In All scope, shelf links go to cross-cluster aggregates; we
	// don't paint ?scope=all on these because aggregate URLs already
	// *are* All-scope URLs by construction.
	// In a cluster scope, shelf links go to that cluster's shelves —
	// and we filter the nav to only those shelves the cluster
	// actually has on disk, so we never link to a 404.
	const nav = unionShelves
		.filter((shelf) => !selectedCluster || graph.isFolder(`${selectedCluster}/${shelf}`))
		.map((shelf) => {
			const labelSourcePath =
				graph.clusterShelfPaths(shelf).find((p) => graph.collection(p)) ??
				graph.clusterShelfPaths(shelf)[0];
			const label = graph.folderLabels(labelSourcePath ?? shelf).plural;
			const href = selectedCluster ? `/${selectedCluster}/${shelf}` : `/${shelf}`;
			const count = selectedCluster
				? graph.byFolderRecursive(`${selectedCluster}/${shelf}`).length
				: graph.entitiesByShelfAcrossClusters(shelf).length;
			return { href, label, count };
		});

	// Universal-substrate shelves (e.g. `foundation/fabric`) are
	// shared across clusters: same href, same count, always visible.
	// Appended after cluster shelves, inline.
	const universalNav = graph.universalShelves().map(({ root, shelf }) => {
		const path = `${root}/${shelf}`;
		return {
			href: `/${path}`,
			label: graph.folderLabels(path).plural,
			count: graph.byFolderRecursive(path).length
		};
	});

	const worldConfig = world.config();
	// Optional bespoke wordmark SVG. When present, the masthead
	// renders the inline SVG in place of the text wordmark + glyph
	// pseudo-element. The link still carries an aria-label with the
	// world name, so the SVG itself is decorative (aria-hidden).
	const wordmark = await assets.get('wordmark.svg');

	// Ornament SVGs: inline the declared asset files (if any) so
	// every page can render an SVG fleuron without its own loader
	// having to call assets.get(). Null when no svg filename was
	// declared in world.md, or the file doesn't exist on disk.
	const ornamentSvg = worldConfig.ornament.svg
		? await assets.get(worldConfig.ornament.svg)
		: null;
	const guidesOrnamentSvg = worldConfig.ornament.guides.svg
		? await assets.get(worldConfig.ornament.guides.svg)
		: null;

	const ornament = {
		glyph: worldConfig.ornament.glyph,
		svg: ornamentSvg,
		guides: {
			glyph: worldConfig.ornament.guides.glyph,
			svg: guidesOrnamentSvg
		}
	};

	const clusterOptions = [
		{ value: '', label: worldConfig.allScopeLabel, selected: selectedCluster === null },
		...clusters.map((c) => ({
			value: c,
			label: graph.folderLabels(c).singular,
			selected: selectedCluster === c
		}))
	];

	return {
		nav: [...nav, ...universalNav],
		// Kinds is its own destination (taxonomy), separate from the
		// content shelves above. In a cluster scope it points at the
		// per-cluster filtered view.
		kindsHref: selectedCluster ? `/${selectedCluster}/kinds` : '/kinds',
		clusterOptions,
		selectedCluster,
		// World identity (name, tagline, shortName, allScopeLabel),
		// inherited by every page via `$page.data.world`. Sourced from
		// `content_meta/world.md`; falls back to "Bunnytrail" defaults
		// if the file is absent.
		world: worldConfig,
		wordmark,
		ornament,
		// Surface the scope context to the client so the navigation
		// hook can rewrite outgoing links without re-deriving it.
		scopeContext: { clusters, unionShelves, clusterAwarePaths } satisfies ScopeContext
	};
}

export type LayoutData = Awaited<ReturnType<typeof load>>;
