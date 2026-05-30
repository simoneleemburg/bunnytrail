import { marked } from 'marked';
import type { Entity, EntityId } from '$lib/types';

/**
 * A function that resolves a wikilink path (as written in prose) to
 * a canonical entity id, or `null` if the link cannot be resolved
 * (missing or ambiguous). See `resolveWikilink` in `loader.ts`.
 */
export type LinkResolver = (rawPath: string) => EntityId | null;

/**
 * A function that resolves a `[[collection:<path>]]` directive to
 * the data needed to render an inline fold-out: the collection's
 * display title, its public href, and its body rendered to HTML.
 * Returns `null` if the path does not name a known collection or
 * the collection has no `_collection.md` body to fold out.
 *
 * Callers wire this against `graph.collection(path)`; tests can
 * pass a simple stub. When omitted (or when it returns null) the
 * directive is replaced with a broken-link sentinel so the gap is
 * loud rather than silent.
 */
export type CollectionResolver = (
	rawPath: string
) => { title: string; href: string; bodyHtml: string | null } | null;

/**
 * Expand `[[collection:<path>]]` block directives.
 *
 * The directive is matched as a standalone line — it must sit on
 * its own paragraph in the source, with nothing else on the line.
 * Each match is replaced with a self-contained `<details>` block
 * carrying the collection's title, a link to the collection page,
 * and the collection's body rendered to HTML.
 *
 * When `resolveCollection` is omitted (or returns null) the
 * directive is replaced with a broken-link sentinel that surfaces
 * the missing reference in the rendered prose, matching how
 * unresolved entity wikilinks behave.
 *
 * Collection bodies expanded this way are rendered with the
 * collection resolver disabled, so an included collection cannot
 * itself fold out further includes. This caps the recursion at
 * one level and makes the rendered prose unambiguous.
 */
function expandCollectionIncludes(text: string, resolveCollection?: CollectionResolver): string {
	return text.replace(/^[ \t]*\[\[collection:([^\]\s]+)\]\][ \t]*$/gm, (_, rawPath: string) => {
		const resolved = resolveCollection?.(rawPath) ?? null;
		if (!resolved) {
			return `<p><a href="/${rawPath}" data-broken="true">collection:${rawPath}</a></p>`;
		}
		const { title, href, bodyHtml } = resolved;
		const inner = bodyHtml ?? '';
		return [
			`<details class="collection-include">`,
			`<summary><span class="collection-include-marker" aria-hidden="true">▸</span><span class="collection-include-title">${escapeHtml(title)}</span> <a class="collection-include-link" href="${href}">visit &rarr;</a></summary>`,
			`<div class="collection-include-body">${inner}</div>`,
			`</details>`
		].join('');
	});
}

/**
 * Allow-list of image file extensions that may appear in prose. Used
 * by both the markdown image-src rewriter and the HTTP handlers that
 * serve sibling/asset files. Everything else is left alone (in prose)
 * or 404'd (in the handler).
 */
export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif']);

function isImageExt(name: string): boolean {
	const dot = name.lastIndexOf('.');
	if (dot < 0) return false;
	return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * Rewrite relative image srcs in already-rendered HTML so authors
 * can write `![alt](foo.svg)` (sibling file in the entity/collection
 * folder) or `![alt](assets/foo.svg)` (global assets dir) without
 * worrying about hosting paths.
 *
 * Rules, applied in order:
 *
 *   1. Source has a scheme (`http:`, `https:`, `data:`, …) or starts
 *      with `/` → leave alone. Authors who want absolute URLs get
 *      them.
 *   2. Source starts with `assets/` and the remainder is a flat
 *      filename with an image extension → rewrite to
 *      `/api/assets/<filename>`.
 *   3. Source is a flat filename with an image extension and
 *      `imageBaseDir` is set → rewrite to
 *      `/api/entity-assets/<imageBaseDir>/<filename>`.
 *   4. Anything else → leave alone (will 404 visibly, surfacing the
 *      typo).
 *
 * Only the `src` attribute is touched. Other attributes (alt, title,
 * width) round-trip unchanged.
 */
function rewriteImageSrcs(html: string, imageBaseDir?: string): string {
	return html.replace(/<img\b([^>]*?)\ssrc="([^"]+)"([^>]*)>/gi, (whole, pre, src, post) => {
		const rewritten = rewriteImageSrc(src, imageBaseDir);
		if (rewritten === src) return whole;
		return `<img${pre} src="${rewritten}"${post}>`;
	});
}

function rewriteImageSrc(src: string, imageBaseDir?: string): string {
	// Strip a leading `./` — authors may use it to signal "this folder".
	const trimmed = src.startsWith('./') ? src.slice(2) : src;

	// (1) Absolute URL or root-rooted path: leave alone.
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('//')) {
		return src;
	}
	// Reject path-traversal attempts; pass through so the broken
	// image is visible.
	if (trimmed.includes('..')) return src;

	// (2) `assets/<filename>` → global assets endpoint.
	if (trimmed.startsWith('assets/')) {
		const rest = trimmed.slice('assets/'.length);
		if (rest && !rest.includes('/') && isImageExt(rest)) {
			return `/api/assets/${rest}`;
		}
		return src;
	}

	// (3) Bare filename, sibling of the rendering entity/collection.
	if (!trimmed.includes('/') && isImageExt(trimmed) && imageBaseDir) {
		return `/api/entity-assets/${imageBaseDir}/${trimmed}`;
	}

	return src;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

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
 * `/aurethia/places/celestial/aureth-system/bayurinda#on-the-name` actually scroll to the section.
 * Duplicate slugs within one body are disambiguated with `-2`, `-3`,
 * etc.
 */
export function renderBody(
	body: string,
	resolveLink: LinkResolver,
	languageCodes: Map<string, EntityId> = new Map(),
	kindIds: ReadonlySet<string> = new Set(),
	resolveCollection?: CollectionResolver,
	imageBaseDir?: string
): string {
	const expanded = expandCollectionIncludes(body, resolveCollection);
	const rewritten = rewriteBrackets(expanded, resolveLink, languageCodes, kindIds);

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
	const linkified = html.replace(/title="broken-link"/g, 'data-broken="true"');
	return rewriteImageSrcs(linkified, imageBaseDir);
}

/** Convenience for entity bodies. */
export function renderEntityBody(
	entity: Entity,
	resolveLink: LinkResolver,
	languageCodes: Map<string, EntityId> = new Map(),
	kindIds: ReadonlySet<string> = new Set(),
	resolveCollection?: CollectionResolver
): string {
	return renderBody(entity.body, resolveLink, languageCodes, kindIds, resolveCollection, entity.id);
}

/**
 * Render a markdown body with no wikilink or collection-include
 * processing — plain markdown only.
 *
 * Used for out-of-world prose that lives outside the worldbuilding
 * graph (currently the author's blog under `content_meta/blog/`).
 * `[[anything]]` stays as literal text in the output rather than
 * being rewritten into broken-link sentinels.
 *
 * Heading-id slugification still runs, so cross-post anchor links
 * keep working. `marked` does the rest.
 */
export function renderPlainBody(body: string): string {
	const headingSlugCounts = new Map<string, number>();
	const renderer = new marked.Renderer();
	renderer.heading = ({ depth, text }) => {
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
	return marked.parse(body, { async: false, renderer }) as string;
}

/**
 * Build a `CollectionResolver` from the graph primitives every
 * page-load needs anyway. The resolver titles each disclosure as
 * `<parent plural> of <leaf>` (e.g. "Regions of Nebelheim") so the
 * fold-out's content is unambiguous from inside any entity's prose,
 * and falls back to the leaf label when the collection is at the
 * top level.
 *
 * The included collection's body is rendered with this same resolver
 * unset, capping recursion at one level (see
 * `expandCollectionIncludes`).
 */
export function makeCollectionResolver(deps: {
	getCollection: (path: string) => { body: string | null } | undefined;
	folderLabels: (path: string) => { singular: string; plural: string };
	resolveLink: LinkResolver;
	languageCodes: Map<string, EntityId>;
	kindIds: ReadonlySet<string>;
}): CollectionResolver {
	const { getCollection, folderLabels, resolveLink, languageCodes, kindIds } = deps;
	return (path) => {
		const collection = getCollection(path);
		if (!collection) return null;
		const leaf = folderLabels(path).singular;
		const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
		const parentPlural = parentPath ? folderLabels(parentPath).plural : null;
		const title = parentPlural ? `${parentPlural} of ${leaf}` : leaf;
		const bodyHtml = collection.body
			? renderBody(collection.body, resolveLink, languageCodes, kindIds, undefined, path)
			: null;
		return { title, href: `/${path}`, bodyHtml };
	};
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
