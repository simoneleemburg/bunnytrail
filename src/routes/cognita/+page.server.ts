import { assets } from '$lib/server/assets';
import { error } from '@sveltejs/kit';

export async function load() {
	const mundusMapSvg = await assets.get('mundus-map.svg');
	if (!mundusMapSvg) {
		error(500, 'mundus-map.svg not found');
	}
	return { mundusMapSvg };
}
