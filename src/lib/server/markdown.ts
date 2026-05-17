import { marked } from 'marked';
import type { Entity, EntityId } from '$lib/types';

/**
 * Render a markdown body to HTML, converting `[[type/slug]]` and
 * `[[type/slug|label]]` wikilinks into anchor tags. Links to entities not in
 * the graph get a `data-broken="true"` attribute so the UI can style them.
 */
export function renderBody(body: string, knownIds: Set<EntityId>): string {
	// Rewrite wikilinks to plain markdown links before handing off to marked,
	// so that we get correct paragraph / list handling for free.
	const rewritten = body.replace(
		/\[\[([a-z]+)\/([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g,
		(_, type: string, slug: string, label?: string) => {
			const id = `${type}/${slug}`;
			const text = label ?? slug.replace(/-/g, ' ');
			const broken = knownIds.has(id) ? '' : ' "broken-link"';
			return `[${text}](/${type}/${slug}${broken})`;
		}
	);

	const html = marked.parse(rewritten, { async: false }) as string;
	// `marked` renders `[text](url "title")` as `<a href="url" title="title">…</a>`.
	// Convert our sentinel title into a data attribute the UI can style.
	return html.replace(/title="broken-link"/g, 'data-broken="true"');
}

/** Convenience for entity bodies. */
export function renderEntityBody(entity: Entity, knownIds: Set<EntityId>): string {
	return renderBody(entity.body, knownIds);
}
