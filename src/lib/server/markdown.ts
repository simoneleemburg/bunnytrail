import { marked } from 'marked';
import type { Entity, EntityId } from '$lib/types';

/**
 * A function that resolves a wikilink path (as written in prose) to
 * a canonical entity id, or `null` if the link cannot be resolved
 * (missing or ambiguous). See `resolveWikilink` in `loader.ts`.
 */
export type LinkResolver = (rawPath: string) => EntityId | null;

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
 *   • `[[type/slug]]`, `[[type/sub/slug]]`, `[[…/slug|label]]` —
 *     entity wikilinks. The path is resolved through `resolveLink`,
 *     which performs exact + suffix matching so wikilinks survive
 *     entity moves along the filesystem tree. Unresolved links get
 *     a `data-broken="true"` attribute so the UI can style them.
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
	resolveLink: LinkResolver,
	languageCodes: Map<string, EntityId> = new Map()
): string {
	// Process inline language tags first. The regex deliberately
	// requires no slash, so the wikilink regex below cannot collide.
	// Codes are 2–8 lowercase letters.
	const withLangTags = body.replace(/\[\[([a-z]{2,8})\]\]/g, (whole, code: string) => {
		const id = languageCodes.get(code);
		if (id) {
			return `<sup class="lang-tag"><a href="/${id}" title="language: ${code}">${code}</a></sup>`;
		}
		return `<sup class="lang-tag" data-broken="true" title="unknown language code: ${code}">${code}</sup>`;
	});

	// Rewrite entity wikilinks to plain markdown links before handing
	// off to marked, so that we get correct paragraph / list handling
	// for free. Accepts paths of any depth (e.g.
	// `[[culture/languages/tholingian]]`).
	const rewritten = withLangTags.replace(
		/\[\[([a-z][a-z0-9-]*(?:\/[a-z0-9-]+)+)(?:\|([^\]]+))?\]\]/g,
		(_, path: string, label?: string) => {
			const resolved = resolveLink(path);
			const slug = path.slice(path.lastIndexOf('/') + 1);
			const text = label ?? slug.replace(/-/g, ' ');
			if (resolved) {
				return `[${text}](/${resolved})`;
			}
			return `[${text}](/${path} "broken-link")`;
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
	resolveLink: LinkResolver,
	languageCodes: Map<string, EntityId> = new Map()
): string {
	return renderBody(entity.body, resolveLink, languageCodes);
}

/**
 * Render a one-line summary as inline HTML.
 *
 * Summaries are single-line, no-block-element strings used in
 * page subtitles and entity cards. They may contain markdown
 * italics, em-dashes, `[label](/href)` links, `[[type/slug]]`
 * wikilinks, and `[[code]]` language tags. They MAY NOT contain
 * block-level constructs (paragraphs, lists, headings); those
 * are silently flattened by `parseInline`.
 *
 * Pass `stripLinks: true` for contexts where the summary is
 * already inside an anchor (e.g. EntityCard, which wraps the
 * whole card in `<a>`); links become their plain-text label, and
 * language-tag superscripts shed their inner anchor too, to
 * avoid invalid nested-anchor HTML.
 */
export function renderSummary(
	summary: string,
	resolveLink: LinkResolver,
	languageCodes: Map<string, EntityId> = new Map(),
	options: { stripLinks?: boolean } = {}
): string {
	const { stripLinks = false } = options;

	// Same two-pass rewrite as renderBody: language tags first, then
	// entity wikilinks to plain markdown links.
	const withLangTags = summary.replace(/\[\[([a-z]{2,8})\]\]/g, (_, code: string) => {
		const id = languageCodes.get(code);
		if (id) {
			if (stripLinks) {
				return `<sup class="lang-tag" title="language: ${code}">${code}</sup>`;
			}
			return `<sup class="lang-tag"><a href="/${id}" title="language: ${code}">${code}</a></sup>`;
		}
		return `<sup class="lang-tag" data-broken="true" title="unknown language code: ${code}">${code}</sup>`;
	});

	const rewritten = withLangTags.replace(
		/\[\[([a-z][a-z0-9-]*(?:\/[a-z0-9-]+)+)(?:\|([^\]]+))?\]\]/g,
		(_, path: string, label?: string) => {
			const slug = path.slice(path.lastIndexOf('/') + 1);
			const text = label ?? slug.replace(/-/g, ' ');
			if (stripLinks) return text;
			const resolved = resolveLink(path);
			if (resolved) return `[${text}](/${resolved})`;
			return `[${text}](/${path} "broken-link")`;
		}
	);

	let html = marked.parseInline(rewritten, { async: false }) as string;
	html = html.replace(/title="broken-link"/g, 'data-broken="true"');

	if (stripLinks) {
		// Replace any remaining <a …>label</a> (from markdown links in
		// the source) with just the label. parseInline preserves these,
		// and we can't wrap an <a> in another <a>.
		html = html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
	}

	return html;
}
