import { redirect } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';

/**
 * Set the user's region scope for the masthead nav.
 *
 * Accepts a form POST with two fields:
 *   - `region`: the region id, or empty string for "all"
 *   - `redirect`: the URL the user was on when they switched
 *
 * Sets the cookie, then redirects to the *equivalent* page in the
 * new scope rather than back to the original URL. This is the
 * difference between "I changed my mind about scope" (the user's
 * intent) and "I want to navigate" (what a passive redirect would
 * accidentally do): if you switch to Aurethia while on
 * `/characters`, you expect to land on `/aurethia/characters`, not
 * to remain on the cross-region aggregate.
 *
 * Translation rules:
 *   - "All" + path starts with `<region>/<shelf>...` → strip the
 *     region prefix, landing on the cross-region equivalent.
 *   - "<region>" + path starts with `<other-region>/...` → swap
 *     the region prefix.
 *   - "<region>" + path is a single-segment union shelf → prepend
 *     the region.
 *   - Anything that doesn't fit a known pattern → fall back to the
 *     region's root (or `/` for "All").
 */
export async function POST({ request, cookies }) {
	await graph.ready();

	const data = await request.formData();
	const region = String(data.get('region') ?? '');
	const back = String(data.get('redirect') ?? '/');

	if (region) {
		cookies.set('region', region, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			sameSite: 'lax',
			httpOnly: false
		});
	} else {
		cookies.delete('region', { path: '/' });
	}

	const target = translatePath(back, region);

	// 303 See Other: follow the redirect with a GET, regardless of
	// the original method. SvelteKit's `redirect()` does the right
	// thing here.
	throw redirect(303, target);
}

function translatePath(back: string, newRegion: string): string {
	// Split off query/hash so we can preserve them. The region
	// scope only affects path; query state (filters, view mode) is
	// orthogonal and worth keeping when the equivalent page exists.
	const [pathOnly, ...rest] = back.split(/(?=[?#])/);
	const suffix = rest.join('');

	const segments = pathOnly.split('/').filter(Boolean);
	const regions = graph.regions();
	const unionShelves = graph.unionShelves();

	const firstIsRegion = segments.length > 0 && regions.includes(segments[0]);
	const firstIsUnionShelf =
		segments.length > 0 && !firstIsRegion && unionShelves.includes(segments[0]);

	if (newRegion === '') {
		// Switching to "All Alteria".
		if (firstIsRegion) {
			const tail = segments.slice(1);
			// Bare region root → home. Single-segment shelf → its
			// aggregate. Anything deeper is a region-specific entity
			// or sub-collection that has no cross-region twin; go to
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

	// Switching to a specific region.
	if (firstIsRegion) {
		// Already in some region; swap the prefix and keep the rest.
		const tail = segments.slice(1);
		return '/' + [newRegion, ...tail].join('/') + suffix;
	}
	if (firstIsUnionShelf) {
		// On a cross-region aggregate; descend into the chosen
		// region's version of the same shelf.
		return '/' + [newRegion, ...segments].join('/') + suffix;
	}
	// Generic page (home, /everything, /kinds, /tags, /health,
	// /cognita, …): leave the URL alone. The selector still has
	// effect — the masthead nav re-renders with the new scope on
	// the next page load — but we don't synthesise a destination.
	return pathOnly + suffix;
}
