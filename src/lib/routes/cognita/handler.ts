import { redirect } from '@sveltejs/kit';

/**
 * Permanent redirect from the legacy hardcoded /cognita route to
 * the content-authored /guides/cognita. Keeps old bookmarks and
 * external links alive.
 */
export const GET = () => {
	redirect(301, '/guides/cognita');
};
