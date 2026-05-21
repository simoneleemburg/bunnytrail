import { redirect } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';

/**
 * Set the user's cluster scope for the masthead nav.
 *
 * Accepts a form POST with two fields:
 *   - `cluster`: the cluster id, or empty string for "all"
 *   - `redirect`: the URL the user was on when they switched
 *
 * Sets the cookie, then redirects to the *equivalent* page in the
 * new scope rather than back to the original URL. This is the
 * difference between "I changed my mind about scope" (the user's
 * intent) and "I want to navigate" (what a passive redirect would
 * accidentally do): if you switch to Aurethia while on
 * `/characters`, you expect to land on `/aurethia/characters`, not
 * to remain on the cross-cluster aggregate.
 *
 * Translation rules:
 *   - "All" + path starts with `<cluster>/<shelf>...` → strip the
 *     cluster prefix, landing on the cross-cluster equivalent.
 *   - "<cluster>" + path starts with `<other-cluster>/...` → swap
 *     the cluster prefix.
 *   - "<cluster>" + path is a single-segment union shelf → prepend
 *     the cluster.
 *   - Anything that doesn't fit a known pattern → fall back to the
 *     cluster's root (or `/` for "All").
 */
export async function POST({ request, cookies }) {
	await graph.ready();

	const data = await request.formData();
	const cluster = String(data.get('cluster') ?? '');
	const back = String(data.get('redirect') ?? '/');

	if (cluster) {
		cookies.set('cluster', cluster, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			sameSite: 'lax',
			httpOnly: false
		});
	} else {
		cookies.delete('cluster', { path: '/' });
	}

	const target = translatePath(back, cluster);

	// 303 See Other: follow the redirect with a GET, regardless of
	// the original method. SvelteKit's `redirect()` does the right
	// thing here.
	throw redirect(303, target);
}

function translatePath(back: string, newCluster: string): string {
	// Split off query/hash so we can preserve them. The cluster
	// scope only affects path; query state (filters, view mode) is
	// orthogonal and worth keeping when the equivalent page exists.
	const [pathOnly, ...rest] = back.split(/(?=[?#])/);
	const suffix = rest.join('');

	const segments = pathOnly.split('/').filter(Boolean);
	const clusters = graph.clusters();
	const unionShelves = graph.unionShelves();

	const firstIsCluster = segments.length > 0 && clusters.includes(segments[0]);
	const firstIsUnionShelf =
		segments.length > 0 && !firstIsCluster && unionShelves.includes(segments[0]);

	if (newCluster === '') {
		// Switching to "All Alteria".
		if (firstIsCluster) {
			const tail = segments.slice(1);
			// Bare cluster root → home. Single-segment shelf → its
			// aggregate. Anything deeper is a cluster-specific entity
			// or sub-collection that has no cross-cluster twin; go to
			// the aggregate of the top shelf if it exists, else home.
			if (tail.length === 0) return '/' + suffix;
			if (tail.length === 1 && unionShelves.includes(tail[0])) {
				return '/' + tail[0] + suffix;
			}
			if (unionShelves.includes(tail[0])) {
				return '/' + tail[0] + suffix;
			}
			return '/' + suffix;
		}
		return pathOnly + suffix;
	}

	// Switching to a specific cluster.
	if (firstIsCluster) {
		// Already in some cluster; swap the prefix and keep the rest.
		const tail = segments.slice(1);
		return '/' + [newCluster, ...tail].join('/') + suffix;
	}
	if (firstIsUnionShelf) {
		// On a cross-cluster aggregate; descend into the chosen
		// cluster's version of the same shelf.
		return '/' + [newCluster, ...segments].join('/') + suffix;
	}
	// Generic page (home, /everything, /kinds, /tags, /health,
	// /cognita, …): leave the URL alone. The selector still has
	// effect — the masthead nav re-renders with the new scope on
	// the next page load — but we don't synthesise a destination.
	return pathOnly + suffix;
}
