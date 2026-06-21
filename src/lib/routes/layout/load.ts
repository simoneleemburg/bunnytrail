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
	const clusterAwarePaths = ['kinds', 'symbology'];
	const ctx: ScopeContext = { clusters, unionShelves, clusterAwarePaths };
	// During prerender, every URL is just a path — querystrings are
	// not part of the prerender input set, and SvelteKit forbids
	// reading `url.searchParams` to make sure we don't accidentally
	// depend on them. The scope falls back to whatever the path
	// implies, which is what we want for static output.
	const searchParams = building ? new URLSearchParams() : url.searchParams;
	const selectedCluster = readScope(url.pathname, searchParams, ctx);
	const activeEra = building ? null : (searchParams.get('era') ?? null);

	// In All scope, shelf links go to cross-cluster aggregates; we
	// don't paint ?scope=all on these because aggregate URLs already
	// *are* All-scope URLs by construction.
	// In a cluster scope, shelf links go to that cluster's shelves —
	// and we filter the nav to only those shelves the cluster
	// actually has on disk, so we never link to a 404.
	const nav = unionShelves
		.filter((shelf) => {
			if (!selectedCluster) return true;
			// Keep if the selected cluster has the shelf directly.
			if (graph.isFolder(`${selectedCluster}/${shelf}`)) return true;
			// Also keep if the shelf only exists under universal folders —
			// those are always visible regardless of cluster scope.
			return graph.clusterShelfPaths(shelf).length === 0;
		})
		.map((shelf) => {
			const shelfPaths = graph.allShelfPaths(shelf);
			const labelSourcePath = shelfPaths.find((p) => graph.collection(p)) ?? shelfPaths[0];
			const label = graph.folderLabels(labelSourcePath ?? shelf).plural;
			// In cluster scope: link to the cluster's own shelf when it
			// exists there; otherwise fall through to the aggregate/direct
			// path (universal-only shelves like `fabric` link directly to
			// their real folder).
			// In All scope: if the shelf exists in exactly one root send
			// the nav link directly to that root's shelf — no need for the
			// aggregate route that would just show one tile anyway.
			const clusterHasShelf = selectedCluster && graph.isFolder(`${selectedCluster}/${shelf}`);
			const href = clusterHasShelf
				? `/${selectedCluster}/${shelf}`
				: shelfPaths.length === 1
					? `/${shelfPaths[0]}`
					: `/${shelf}`;
			const count = clusterHasShelf
				? graph.byFolderRecursive(`${selectedCluster}/${shelf}`).length
				: graph.entitiesByShelfAll(shelf).length;
			return { href, label, count };
		});

	// Universal-substrate shelves (e.g. `foundation/fabric`) that do NOT
	// already appear in the union-shelf set above are shown as direct links
	// to their real folder path. Any universal shelf whose name also
	// appears under a cluster is already represented by the aggregate nav
	// entry above and doesn't need a second link.
	const universalNav = graph
		.universalShelves()
		.filter(({ shelf }) => !unionShelves.includes(shelf))
		.map(({ root, shelf }) => {
			const path = `${root}/${shelf}`;
			return {
				href: `/${path}`,
				label: graph.folderLabels(path).plural,
				count: graph.byFolderRecursive(path).length
			};
		});

	const worldConfig = world.config();
	// Optional bespoke wordmark SVG. When `ornament.wordmark` is declared
	// in world.md, the masthead inlines the named asset in place of the
	// text wordmark + glyph pseudo-element. The link still carries an
	// aria-label with the world name, so the SVG itself is decorative.
	const wordmark = worldConfig.ornament.wordmark
		? await assets.get(worldConfig.ornament.wordmark)
		: null;

	// Ornament SVGs: inline the declared asset files (if any) so
	// every page can render an SVG fleuron without its own loader
	// having to call assets.get(). Null when no svg filename was
	// declared in world.md, or the file doesn't exist on disk.
	const ornamentSvg = worldConfig.ornament.svg ? await assets.get(worldConfig.ornament.svg) : null;
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

	// Pre-built CSS snippets injected into <svelte:head> by Layout.svelte.
	// Built here (server side) so the Svelte template never needs a
	// template literal containing CSS — which can confuse the Svelte parser.
	// JSON.stringify gives us a properly quoted CSS <string> value.
	const ornamentGlyphStyle = worldConfig.ornament.glyph
		? `:root { --ornament-glyph: ${JSON.stringify(worldConfig.ornament.glyph)}; }`
		: null;

	// When world.md declares ornament.world_mark, inject both the
	// --wordmark-mark token and `display: inline` for .wordmark-mark
	// so the glyph appears without any theme.css involvement. Without
	// world_mark the element stays hidden (display: none default in
	// Layout.svelte), preserving the plain text wordmark baseline.
	const worldMarkStyle = worldConfig.ornament.worldMark
		? `:root { --wordmark-mark: ${JSON.stringify(worldConfig.ornament.worldMark)}; } .wordmark-mark { display: inline; }`
		: null;

	// Separator glyph between the folder nav links and the Kinds link.
	// Resolved here so the template never has a hardcoded glyph.
	const navSep = worldConfig.ornament.navSep ?? '·';

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
		kindsHref: selectedCluster ? `/${selectedCluster}/kinds` : '/kinds',
		clusterOptions,
		selectedCluster,
		activeEra,
		world: worldConfig,
		wordmark,
		ornament,
		ornamentGlyphStyle,
		worldMarkStyle,
		navSep,
		scopeContext: { clusters, unionShelves, clusterAwarePaths } satisfies ScopeContext
	};
}

export type LayoutData = Awaited<ReturnType<typeof load>>;
