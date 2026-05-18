import { marked } from 'marked';
import type { Entity, EntityId } from '$lib/types';

/**
 * Slugify a heading's text content into an anchor-safe id.
 *
 * Lowercase, ASCII-fold diacritics, collapse non-alphanumerics to
 * single hyphens, trim. Pure; collision handling is the caller's
 * job (see `renderBody`).
 */
function slugifyHeading(text: string): string {
	return text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '') // strip diacritics
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Render a markdown body to HTML, converting:
 *
 *   • `[[type/slug]]` and `[[type/slug|label]]` — entity wikilinks.
 *     Links to entities not in the graph get a `data-broken="true"`
 *     attribute so the UI can style them.
 *   • `[[<code>]]` — inline language tags, where `<code>` is a short
 *     lowercase code defined on an entity in the `languages` type
 *     (e.g. `[[ot]]` for the Old Tongue). Rendered as a small
 *     superscript anchor next to the preceding word. Unknown codes
 *     are still rendered but marked with `data-broken="true"`.
 *
 * Headings (`#`, `##`, `###`, …) get auto-generated `id` attributes
 * derived from their text content, so cross-page anchor links like
 * `/places/bayurinda#on-the-name` actually scroll to the section.
 * Duplicate slugs within one body are disambiguated with `-2`, `-3`,
 * etc.
 */
export function renderBody(
	body: string,
	knownIds: Set<EntityId>,
	languageCodes: Map<string, EntityId> = new Map()
): string {
	// Process inline language tags first. The regex deliberately
	// requires no slash, so the wikilink regex below cannot collide.
	// Codes are 2–8 lowercase letters.
	const withLangTags = body.replace(/\[\[([a-z]{2,8})\]\]/g, (whole, code: string) => {
		const id = languageCodes.get(code);
		if (id) {
			const [type, slug] = id.split('/');
			return `<sup class="lang-tag"><a href="/${type}/${slug}" title="language: ${code}">${code}</a></sup>`;
		}
		return `<sup class="lang-tag" data-broken="true" title="unknown language code: ${code}">${code}</sup>`;
	});

	// Rewrite entity wikilinks to plain markdown links before handing
	// off to marked, so that we get correct paragraph / list handling
	// for free.
	const rewritten = withLangTags.replace(
		/\[\[([a-z]+)\/([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g,
		(_, type: string, slug: string, label?: string) => {
			const id = `${type}/${slug}`;
			const text = label ?? slug.replace(/-/g, ' ');
			const broken = knownIds.has(id) ? '' : ' "broken-link"';
			return `[${text}](/${type}/${slug}${broken})`;
		}
	);

	// Per-render heading-id state. Tracked here (not at module scope)
	// so concurrent renders of different entities can't collide.
	const headingSlugCounts = new Map<string, number>();
	const renderer = new marked.Renderer();
	renderer.heading = ({ depth, text }) => {
		// `text` is the heading's raw markdown source; render its inline
		// markdown (emphasis, links, etc.) so the visible content matches
		// what marked would have produced by default.
		const inlineHtml = marked.parseInline(text, { async: false }) as string;
		const base = slugifyHeading(text);
		let id = base;
		if (base) {
			const prev = headingSlugCounts.get(base) ?? 0;
			if (prev > 0) id = `${base}-${prev + 1}`;
			headingSlugCounts.set(base, prev + 1);
		}
		const idAttr = id ? ` id="${id}"` : '';
		return `<h${depth}${idAttr}>${inlineHtml}</h${depth}>\n`;
	};

	const html = marked.parse(rewritten, { async: false, renderer }) as string;
	// `marked` renders `[text](url "title")` as `<a href="url" title="title">…</a>`.
	// Convert our sentinel title into a data attribute the UI can style.
	return html.replace(/title="broken-link"/g, 'data-broken="true"');
}

/** Convenience for entity bodies. */
export function renderEntityBody(
	entity: Entity,
	knownIds: Set<EntityId>,
	languageCodes: Map<string, EntityId> = new Map()
): string {
	return renderBody(entity.body, knownIds, languageCodes);
}
