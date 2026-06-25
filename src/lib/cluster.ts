/**
 * Cluster scope helpers — pure functions used on both server (layout
 * load, route dispatch) and client (selector navigation, scope-aware
 * link rewriting).
 *
 * Scope = which cluster the user is currently "in" for nav purposes.
 * Values: a cluster id (e.g. `'mistwood'`) or `null` for the
 * all-clusters scope (labelled by `world.allScopeLabel`).
 *
 * The URL is the source of truth. Precedence:
 *
 *   1. `?scope=<cluster-id>` → that cluster.
 *   2. `?scope=all`          → All.
 *   3. Path starts with `<known-cluster>/...`
 *      or is exactly `/<known-cluster>` → that cluster.
 *   4. Otherwise → All.
 *
 * Why query wins: an entity like `aurethia/characters/freya` has a
 * cluster prefix in its path, but a reader who reached it via the
 * cross-cluster `/characters` aggregate should stay in All scope.
 * `?scope=all` is the bit that records "I got here from the
 * aggregate; don't re-scope me." See WORLDBUILDING.md (clusters
 * section) for the editorial framing.
 */

export type ClusterScope = string | null;

export interface ScopeContext {
	clusters: string[];
	unionShelves: string[];
	/**
	 * Top-level paths that have a per-cluster variant under the
	 * cluster prefix (e.g. `/kinds` ↔ `/<cluster>/kinds`). Treated
	 * like union shelves by `translateUrl`: when switching to a
	 * cluster the prefix is added; when switching to All the
	 * prefix is dropped. These aren't physical folders under
	 * `content/`, so the unionShelves list won't include them.
	 */
	clusterAwarePaths: string[];
}

/**
 * Read the current scope from a URL (path + query string).
 *
 * `path` should be the URL pathname (e.g. `/aurethia/characters/freya`).
 * `searchParams` is the URL's query parameters.
 */
export function readScope(
	path: string,
	searchParams: URLSearchParams,
	ctx: ScopeContext
): ClusterScope {
	const queryScope = searchParams.get('scope');
	if (queryScope === 'all') return null;
	if (queryScope && ctx.clusters.includes(queryScope)) return queryScope;

	const segments = path.split('/').filter(Boolean);
	if (segments.length > 0 && ctx.clusters.includes(segments[0])) {
		return segments[0];
	}
	return null;
}

/**
 * Translate a URL to the equivalent URL in a new cluster scope.
 *
 * Used when the user picks a different value in the cluster selector
 * — we don't want to dump them back at home, we want to land them
 * on the same page in the new scope.
 *
 * `newScope === null` switches to All; a string switches to that
 * cluster.
 *
 * Rules (path):
 *   - All + path is `<cluster>/<shelf>...` → strip the cluster
 *     prefix, landing on the cross-cluster equivalent.
 *   - Cluster + path is `<other-cluster>/...` → swap the prefix.
 *   - Cluster + path is a single-segment union shelf → prepend the
 *     cluster.
 *   - Anything else → leave the path alone (the selector still has
 *     effect via the masthead re-render).
 *
 * Rules (query):
 *   - `?scope=` is always rewritten to match `newScope`. Other
 *     query state is preserved.
 *   - If `newScope === null` and the path already represents an
 *     All-scope URL (no cluster prefix or a union shelf), omit
 *     `?scope=all` — it's redundant.
 *   - If `newScope === null` but the path still has a cluster
 *     prefix that we couldn't strip (deep entity URL), keep
 *     `?scope=all` so the selector reads All.
 */
export function translateUrl(
	url: { pathname: string; search: string; hash: string },
	newScope: ClusterScope,
	ctx: ScopeContext
): string {
	const segments = url.pathname.split('/').filter(Boolean);
	const firstIsCluster = segments.length > 0 && ctx.clusters.includes(segments[0]);
	// Both union shelves (real top-level content folders) and
	// cluster-aware synthesized paths (`/kinds`) behave the same way
	// when scope changes: prefix the cluster or strip it.
	const swapPaths = [...ctx.unionShelves, ...ctx.clusterAwarePaths];
	const firstIsSwapPath = segments.length > 0 && !firstIsCluster && swapPaths.includes(segments[0]);

	let newPath = url.pathname;
	if (newScope === null) {
		// Switching to All.
		if (firstIsCluster) {
			const tail = segments.slice(1);
			if (tail.length === 0) {
				newPath = '/';
			} else if (tail.length === 1 && swapPaths.includes(tail[0])) {
				newPath = '/' + tail[0];
			} else if (ctx.clusterAwarePaths.includes(tail[0])) {
				// Cluster-aware synthesized path like /kinds: the
				// sub-identifier (e.g. `human`) is shared across
				// clusters, so we can strip the prefix cleanly.
				// `/aurethia/kinds/human` → `/kinds/human`.
				newPath = '/' + tail.join('/');
			} else if (ctx.unionShelves.includes(tail[0])) {
				// Deep union-shelf URL: the entity lives at
				// `<cluster>/<shelf>/<slug>`. Stripping would lose
				// information (`/aurethia/places/bayurinda` has no
				// clean cross-cluster twin). Keep the path; mark scope
				// via query.
				newPath = url.pathname;
			} else {
				newPath = url.pathname;
			}
		}
	} else {
		// Switching to a specific cluster.
		if (firstIsCluster) {
			const tail = segments.slice(1);
			newPath = '/' + [newScope, ...tail].join('/');
		} else if (firstIsSwapPath) {
			newPath = '/' + [newScope, ...segments].join('/');
		}
		// else: generic page, leave path alone.
	}

	// Build the query: preserve everything except `scope`, then add
	// `scope` if needed.
	const params = new URLSearchParams(url.search);
	params.delete('scope');
	const needsScopeAll = newScope === null && pathHasClusterPrefix(newPath, ctx);
	const needsScopeCluster = newScope !== null && !pathHasMatchingClusterPrefix(newPath, newScope);
	if (needsScopeAll) params.set('scope', 'all');
	if (needsScopeCluster) params.set('scope', newScope);
	const query = params.toString();

	return newPath + (query ? `?${query}` : '') + url.hash;
}

function pathHasClusterPrefix(path: string, ctx: ScopeContext): boolean {
	const segments = path.split('/').filter(Boolean);
	return segments.length > 0 && ctx.clusters.includes(segments[0]);
}

function pathHasMatchingClusterPrefix(path: string, cluster: string): boolean {
	const segments = path.split('/').filter(Boolean);
	return segments[0] === cluster;
}

/**
 * Paint `?scope=all` onto an in-app URL, used by the client-side
 * navigation hook. Returns the original URL unchanged unless:
 *
 *   - it's a relative or same-origin URL,
 *   - it doesn't already carry a `scope` query parameter,
 *   - its path starts with a known cluster prefix (otherwise it's
 *     already an All-scope URL by virtue of having no prefix).
 *
 * `from` is the current page URL (used to resolve relative paths
 * if needed; here we expect absolute paths already).
 */
export function paintAllScope(targetUrl: URL, ctx: ScopeContext): URL {
	if (targetUrl.searchParams.has('scope')) return targetUrl;
	if (!pathHasClusterPrefix(targetUrl.pathname, ctx)) return targetUrl;
	const out = new URL(targetUrl.href);
	out.searchParams.set('scope', 'all');
	return out;
}

// ── View mode ─────────────────────────────────────────────────────────────

export type ViewMode = 'visitor' | 'dev';

/**
 * Read the current view mode from a URL's query string.
 * Defaults to `'visitor'` when the param is absent or invalid.
 */
export function readMode(searchParams: URLSearchParams): ViewMode {
	const raw = searchParams.get('mode');
	if (raw === 'dev') return 'dev';
	return 'visitor';
}

/**
 * Paint `?mode=dev` onto a URL, preserving all other params.
 * Returns a new URL; the original is not mutated.
 * Omits the param entirely when `mode === 'visitor'` (the default).
 */
export function paintMode(targetUrl: URL, mode: ViewMode): URL {
	const already = targetUrl.searchParams.get('mode') ?? 'visitor';
	const target = mode === 'visitor' ? 'visitor' : 'dev';
	if (already === target) return targetUrl;
	const out = new URL(targetUrl.href);
	if (mode === 'visitor') {
		out.searchParams.delete('mode');
	} else {
		out.searchParams.set('mode', mode);
	}
	return out;
}
