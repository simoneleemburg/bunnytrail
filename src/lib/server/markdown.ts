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
 * Single combined `[[…]]` rewriter, shared by body and summary
 * rendering.
 *
 * The `inner` content of `[[inner]]` (or `[[inner|label]]`) may
 * optionally end in `#anchor` to deep-link into the target page;
 * a leading `#anchor` with no path (`[[#section|label]]`) is a
 * same-page anchor link. The path part (before any `#`) is then
 * classified in this order:
 *
 *   1. If the path begins with `kinds/`, it is a kind wikilink.
 *      Emit `[label](/kinds/<id>)` (or a broken-link sentinel
 *      when the kind isn't registered). Anchors are passed
 *      through, just like entity wikilinks.
 *   2. If the path contains a `/`, it is an entity wikilink path.
 *      Resolve via `resolveLink` (exact + suffix match) and emit
 *      either a `[label](/id#anchor)` markdown link or a
 *      broken-link sentinel.
 *   3. Otherwise, if the inner is shaped like a language code
 *      (2–8 lowercase letters, no anchor) and a registered language
 *      exists, emit a `<sup class="lang-tag">` superscript anchor.
 *   4. Otherwise, if the path is a sluglike token (lowercase + digits
 *      + hyphens), treat it as a bare-slug wikilink and resolve it
 *      the same way as (2). This is what makes `[[nuunlau]]` work
 *      after wikilink-shortening.
 *   5. Otherwise, fall back to a broken language-tag sentinel so
 *      unknown short codes (e.g. `[[nbl]]`) still surface visibly.
 *
 * Wikilinks are rewritten to `[label](/id)` so marked handles them
 * with the rest of the paragraph; language tags are emitted as raw
 * HTML, which marked passes through.
 *
 * `stripLinks: true` is for callers that already wrap the rendered
 * HTML in an outer `<a>` (entity cards). Wikilinks become their
 * label text, and language-tag superscripts shed their inner anchor
 * so the result has no nested anchors.
 */
function rewriteBrackets(
	text: string,
	resolveLink: LinkResolver,
	languageCodes: Map<string, EntityId>,
	kindIds: ReadonlySet<string>,
	stripLinks = false
): string {
	return text.replace(
		/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
		(whole, inner: string, label: string | undefined) => {
			const wikiPath = /^[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)+$/;
			const slugOnly = /^[a-z][a-z0-9-]*$/;
			const langShape = /^[a-z]{2,8}$/;
			const anchorFrag = /^[a-z0-9][a-z0-9-]*$/;

			// Split off optional `#anchor`. A leading `#` means same-page.
			const hashIdx = inner.indexOf('#');
			const path = hashIdx >= 0 ? inner.slice(0, hashIdx) : inner;
			const anchor = hashIdx >= 0 ? inner.slice(hashIdx + 1) : '';
			const anchorSuffix = anchor && anchorFrag.test(anchor) ? `#${anchor}` : '';

			const fallbackLabel = (forPath: string): string => {
				const slug = forPath.slice(forPath.lastIndexOf('/') + 1);
				return slug.replace(/-/g, ' ') || anchor.replace(/-/g, ' ');
			};

			const renderWikilink = (forPath: string): string => {
				const textOut = label ?? fallbackLabel(forPath);
				if (stripLinks) return textOut;
				const resolved = resolveLink(forPath);
				if (resolved) return `[${textOut}](/${resolved}${anchorSuffix})`;
				return `[${textOut}](/${forPath}${anchorSuffix} "broken-link")`;
			};

			// Kind links are routed at /kinds/<id>; we mark them broken
			// when the id isn't in the registry, the same way entity
			// wikilinks mark themselves broken when unresolved.
			const renderKindLink = (kindId: string): string => {
				const textOut = label ?? fallbackLabel(kindId);
				if (stripLinks) return textOut;
				const href = `/kinds/${kindId}${anchorSuffix}`;
				if (kindIds.has(kindId)) return `[${textOut}](${href})`;
				return `[${textOut}](${href} "broken-link")`;
			};

			const renderSameAnchor = (): string => {
				const textOut = label ?? anchor.replace(/-/g, ' ');
				if (stripLinks) return textOut;
				if (!anchorSuffix) return `[${textOut}](/${path} "broken-link")`;
				return `[${textOut}](${anchorSuffix})`;
			};

			const renderLangTag = (code: string, id: EntityId): string => {
				if (stripLinks) {
					return `<sup class="lang-tag" title="language: ${code}">${code}</sup>`;
				}
				return `<sup class="lang-tag"><a href="/${id}" title="language: ${code}">${code}</a></sup>`;
			};

			const renderBrokenLangTag = (code: string): string =>
				`<sup class="lang-tag" data-broken="true" title="unknown language code: ${code}">${code}</sup>`;

			// (0) Same-page anchor: `[[#section|label]]`. Path is empty.
			if (path === '' && anchor) {
				return renderSameAnchor();
			}
			// (1) `kinds/<id>` → kind wikilink.
			if (path.startsWith('kinds/')) {
				const kindId = path.slice('kinds/'.length);
				if (kindId && slugOnly.test(kindId.split('/').pop() ?? '')) {
					return renderKindLink(kindId);
				}
			}
			// (2) Path has a slash → unambiguous entity wikilink path.
			if (wikiPath.test(path)) {
				return renderWikilink(path);
			}
			// (3) Lang-code shape with no anchor and registered → lang tag.
			if (!anchor && langShape.test(inner) && languageCodes.has(inner)) {
				return renderLangTag(inner, languageCodes.get(inner)!);
			}
			// (4) Sluglike path → try as a bare wikilink (suffix-match).
			if (slugOnly.test(path) && resolveLink(path)) {
				return renderWikilink(path);
			}
			// (5) Lang-code shape but unknown (no anchor) → broken lang tag.
			if (!anchor && langShape.test(inner)) {
				return renderBrokenLangTag(inner);
			}
			// (6) Sluglike but unresolved → broken wikilink (loud).
			if (slugOnly.test(path)) {
				return renderWikilink(path);
			}
			// Anything else (e.g. spaces, uppercase) — leave as-is.
			return whole;
		}
	);
}

/**
 * Render a markdown body to HTML, converting:
 *
 *   • `[[type/slug]]`, `[[type/sub/slug]]`, `[[…/slug|label]]` —
 *     entity wikilinks. The path is resolved through `resolveLink`,
 *     which performs exact + suffix matching so wikilinks survive
 *     entity moves along the filesystem tree. Bare-slug wikilinks
 *     (e.g. `[[nuunlau]]`) are also supported, as long as the slug
 *     resolves unambiguously. Unresolved links get a
 *     `data-broken="true"` attribute so the UI can style them.
 *   • `[[<code>]]` — inline language tags, where `<code>` is a short
 *     lowercase code defined on an entity in the `languages` type
 *     (e.g. `[[ot]]` for the Old Tongue). Rendered as a small
 *     superscript anchor next to the preceding word. Unknown codes
 *     are still rendered but marked with `data-broken="true"`.
 *
 * If `[[xxx]]` is shaped like both a lang code and a bare slug, the
 * lang code wins when it is registered; otherwise the resolver is
 * tried.
 *
 * Headings (`#`, `##`, `###`, …) get auto-generated `id` attributes
 * derived from their text content, so cross-page anchor links like
 * `/places/celestial/planets/bayurinda#on-the-name` actually scroll to the section.
 * Duplicate slugs within one body are disambiguated with `-2`, `-3`,
 * etc.
 */
export function renderBody(
	body: string,
	resolveLink: LinkResolver,
	languageCodes: Map<string, EntityId> = new Map(),
	kindIds: ReadonlySet<string> = new Set()
): string {
	const rewritten = rewriteBrackets(body, resolveLink, languageCodes, kindIds);

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
	languageCodes: Map<string, EntityId> = new Map(),
	kindIds: ReadonlySet<string> = new Set()
): string {
	return renderBody(entity.body, resolveLink, languageCodes, kindIds);
}

/**
 * Render a one-line summary as inline HTML.
 *
 * Summaries are single-line, no-block-element strings used in
 * page subtitles and entity cards. They may contain markdown
 * italics, em-dashes, `[label](/href)` links, `[[type/slug]]` or
 * `[[bare-slug]]` wikilinks, and `[[code]]` language tags. They MAY NOT contain
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
	options: { stripLinks?: boolean; kindIds?: ReadonlySet<string> } = {}
): string {
	const { stripLinks = false, kindIds = new Set<string>() } = options;

	const rewritten = rewriteBrackets(summary, resolveLink, languageCodes, kindIds, stripLinks);

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
