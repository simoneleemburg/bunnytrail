import { marked } from 'marked';
import type { Entity, EntityId } from '$lib/types';

/**
 * A function that resolves a wikilink path (as written in prose) to
 * a canonical entity id, or `null` if the link cannot be resolved
 * (missing or ambiguous). See `resolveWikilink` in `loader.ts`.
 */
export type LinkResolver = (rawPath: string) => EntityId | null;

/**
 * A function that returns the kind id of an entity given its full id,
 * or `undefined` if the entity has no kind set (or doesn't exist).
 * Used to attach `data-bt-kind` / `bt-link--kind-<id>` hooks to
 * resolved wikilinks so worlds can theme links by entity type
 * (e.g. "all axioma in gold"). Optional everywhere — when omitted,
 * links still get the slug hook but no kind hook.
 */
export type KindLookup = (id: EntityId) => string | undefined;

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
 *   2.5. Source is a multi-segment relative path (contains `/`) with
 *      an image extension → rewrite to
 *      `/api/entity-assets/<path>`. The entity-assets endpoint
 *      enforces graph-membership on the folder portion. This is the
 *      preferred form for files co-located in the content tree (e.g.
 *      `foundation/fabric/primitives/mundus/mundus-map.svg`).
 *   3. Source is a flat filename with an image extension and
 *      `imageBaseDir` is set → rewrite to
 *      `/api/<imageBaseEndpoint>/<imageBaseDir>/<filename>`.
 *      `imageBaseEndpoint` defaults to `'entity-assets'`; pass
 *      `'guide-assets'` for guide sibling images.
 *   4. Anything else → leave alone (will 404 visibly, surfacing the
 *      typo).
 *
 * Only the `src` attribute is touched. Other attributes (alt, title,
 * width) round-trip unchanged.
 */
function rewriteImageSrcs(
	html: string,
	imageBaseDir?: string,
	imageBaseEndpoint: 'entity-assets' | 'guide-assets' | 'influence-assets' = 'entity-assets'
): string {
	return html.replace(/<img\b([^>]*?)\ssrc="([^"]+)"([^>]*)>/gi, (whole, pre, src, post) => {
		const rewritten = rewriteImageSrc(src, imageBaseDir, imageBaseEndpoint);
		if (rewritten === src) return whole;
		return `<img${pre} src="${rewritten}"${post}>`;
	});
}

function rewriteImageSrc(
	src: string,
	imageBaseDir?: string,
	imageBaseEndpoint: 'entity-assets' | 'guide-assets' | 'influence-assets' = 'entity-assets'
): string {
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

	// (2.5) Multi-segment content-relative path (e.g.
	//   `foundation/fabric/primitives/mundus/mundus-map.svg`).
	// Routes directly to the entity-assets endpoint, which enforces
	// graph membership on the folder portion and rejects unknown paths.
	// No `imageBaseDir` needed — the path is self-contained.
	if (trimmed.includes('/') && isImageExt(trimmed)) {
		return `/api/entity-assets/${trimmed}`;
	}

	// (3) Bare filename, sibling of the rendering entity/collection or guide.
	if (!trimmed.includes('/') && isImageExt(trimmed) && imageBaseDir) {
		return `/api/${imageBaseEndpoint}/${imageBaseDir}/${trimmed}`;
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
 * Render a ```gallery fenced block's contents into a
 * `<div class="bt-gallery">` of bare `<img>` tags — one per
 * non-blank source line, each written as ordinary
 * `![alt](src)` markdown image syntax.
 *
 * Deliberately does not build `<figure>` chrome itself: the
 * `<img>` tags it emits still flow through `rewriteImageSrcs`
 * (sibling/asset path resolution) and then `inlineSvgFigures`
 * (per-image `.bt-inline-img` figure, caption, lightbox trigger)
 * exactly as a lone image would. `.bt-gallery` only supplies the
 * side-by-side layout around the resulting figures.
 *
 * Lines that aren't image syntax (or are blank) are dropped,
 * keeping the block strictly a photo group rather than a general
 * container — authors who want mixed prose alongside photos
 * should write it outside the fence.
 */
function renderGalleryBlock(text: string): string {
	const items = text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '')
		.map((line) => marked.parseInline(line, { async: false }) as string)
		.filter((html) => /<img\b/i.test(html));
	if (items.length === 0) return '';
	return `<div class="bt-gallery">${items.join('')}</div>\n`;
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
			const wikiPath = /^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9-]+)+$/;
			const slugOnly = /^[a-z0-9][a-z0-9-]*$/;
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
	imageBaseDir?: string,
	kindLookup?: KindLookup,
	imageBaseEndpoint: 'entity-assets' | 'guide-assets' | 'influence-assets' = 'entity-assets'
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
	// `formula` fenced blocks render as a styled display element rather
	// than a <pre><code> block.
	// `verse` fenced blocks render as a `<div class="bt-verse">` with
	// each source line as a `<span>` and blank lines as a
	// `<span class="bt-verse-break">` separator. This gives authors
	// precise spacing control without relying on `<p>` margins or
	// trailing-double-space `<br>` hacks. Wikilinks inside verse blocks
	// have already been rewritten to markdown link syntax by
	// `rewriteBrackets` above, so `marked.parseInline` converts them to
	// proper `<a>` tags here. All other language tags fall through to
	// marked's default renderer.
	// `gallery` fenced blocks render a `<div class="bt-gallery">`
	// containing one `<img>` per source line, letting authors group
	// related photos (e.g. two witnesses to the same event) so they
	// paint side by side instead of stacking. Each line is ordinary
	// `![alt](src)` image syntax — nothing new to learn. The block
	// deliberately emits bare `<img>` tags rather than pre-built
	// `<figure>`s: `rewriteImageSrcs` below still resolves each `src`
	// exactly as it would for a lone image, and `inlineSvgFigures`
	// (run by every route after this) wraps each one in its own
	// `.bt-inline-img` figure with a caption and lightbox trigger —
	// the gallery only supplies the side-by-side layout around them.
	const defaultCode = renderer.code.bind(renderer);
	renderer.code = (token) => {
		if (token.lang === 'formula') {
			return `<div class="bt-formula">${escapeHtml(token.text)}</div>\n`;
		}
		if (token.lang === 'verse') {
			const lines = token.text.split('\n');
			const spans = lines.map((line) => {
				if (line.trim() === '') {
					return '<span class="bt-verse-break" aria-hidden="true"></span>';
				}
				// Preserve author-intentional leading spaces as non-breaking
				// spaces so indentation survives the inline parser's whitespace
				// normalisation. Each leading ASCII space → \u00a0.
				const preserved = line.replace(/^ +/, (m) => '\u00a0'.repeat(m.length));
				// Parse inline markdown (bold, italic, wikilinks already
				// rewritten to [text](url) by rewriteBrackets).
				const inlineHtml = marked.parseInline(preserved, { async: false }) as string;
				return `<span class="bt-verse-line">${inlineHtml}</span>`;
			});
			return `<div class="bt-verse">${spans.join('')}</div>\n`;
		}
		if (token.lang === 'gallery') {
			return renderGalleryBlock(token.text);
		}
		return defaultCode(token);
	};

	const html = marked.parse(rewritten, { async: false, renderer }) as string;
	// Authors sometimes scaffold prose with raw HTML chrome (`<dl>`,
	// `<figure>`, etc.) — typically in guides, occasionally in long
	// entity bodies. marked passes the contents of those blocks
	// through verbatim, so any wikilinks inside them survive
	// `rewriteBrackets` (which turns `[[slug]]` into markdown-link
	// syntax) but never become real anchors. This second pass walks
	// the leaf chrome tags (`<dt>`, `<dd>`, `<figcaption>`,
	// `<summary>`) and converts any remaining `[text](url)` and
	// `[text](url "broken-link")` patterns into proper `<a>` tags.
	const rescued = rescueLinksInHtmlChrome(html);
	// `marked` renders `[text](url "title")` as `<a href="url" title="title">…</a>`.
	// Convert our sentinel title into a data attribute the UI can style.
	const linkified = rescued.replace(/title="broken-link"/g, 'data-broken="true"');
	const decorated = decorateEntityLinks(linkified, resolveLink, kindLookup);
	return rewriteImageSrcs(decorated, imageBaseDir, imageBaseEndpoint);
}

const HTML_CHROME_TAGS = ['dt', 'dd', 'figcaption', 'summary'] as const;
const MARKDOWN_LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

/**
 * Convert any orphaned `[text](url)` patterns found inside leaf HTML
 * chrome tags into proper `<a>` tags. See the call site in
 * `renderBody` for the rationale.
 *
 * Only operates on tags whose contents are typically authored as
 * markdown-with-links rather than as already-baked HTML — picking
 * `<a>` or `<code>` here would corrupt code samples and existing
 * anchors. Keep the list conservative.
 */
function rescueLinksInHtmlChrome(html: string): string {
	let out = html;
	for (const tag of HTML_CHROME_TAGS) {
		const blockRe = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(</${tag}>)`, 'gi');
		out = out.replace(blockRe, (_whole, open: string, inner: string, close: string) => {
			const converted = inner.replace(
				MARKDOWN_LINK_RE,
				(_m, label: string, href: string, title: string | undefined) => {
					if (title === 'broken-link') {
						return `<a href="${href}" data-broken="true">${label}</a>`;
					}
					const titleAttr = title ? ` title="${title}"` : '';
					return `<a href="${href}"${titleAttr}>${label}</a>`;
				}
			);
			return open + converted + close;
		});
	}
	return out;
}

// Match an internal anchor whose href looks like an entity id —
// a single leading slash, then a slug-shaped path with at least
// one segment. Captures:
//   1. opening tag prefix (`<a href="`)
//   2. raw href (slug path, no leading slash)
//   3. optional anchor (`#fragment`)
//   4. closing `>` of the open tag plus everything up through `</a>`
// The regex deliberately rejects external URLs (no `://`), root-only
// hrefs (`/`), and same-page anchors (`#…`). Hash-only routes inside
// the engine (`/kinds/<id>`, `/guides/<slug>`) are also excluded —
// those aren't entity ids and `kindLookup` would whiff on them.
const ENTITY_LINK_RE = /(<a\s+href=")\/([a-z0-9][a-z0-9/-]*?)(#[a-z0-9-]+)?("[^>]*>[\s\S]*?<\/a>)/g;

// Routes the engine owns (not entity ids). Links into these still
// get the universal `bt-link` class but no slug/kind data attrs,
// because the path segments aren't entity slugs.
const ENGINE_ROUTE_PREFIXES = ['kinds/', 'guides/', 'blog/', 'api/', 'authors/', 'health'];

/**
 * Walk every internal `<a href="/…">` produced by the wikilink
 * rewriter and tack on `bt-`-prefixed CSS hooks so worlds can theme
 * links by the entity they target. Three hooks are emitted on
 * resolved entity links:
 *
 *   class="bt-link bt-link--kind-<kind>"
 *   data-bt-slug="<slug>"      // last path segment (always)
 *   data-bt-kind="<kind>"      // when kindLookup returns one
 *
 * Engine routes (`/kinds/…`, `/guides/…`, etc.) get the universal
 * `bt-link` class but no slug/kind hooks — their path segments
 * aren't entity ids. Same-page anchors and external links are
 * untouched.
 *
 * Idempotent: if an `<a>` already has a `class="…"` attribute we
 * append; otherwise we add one. Existing `data-broken` attrs on
 * unresolved wikilinks survive untouched (they live on the same
 * tag and we only rewrite the `href` portion).
 *
 * Pure string rewriting on the rendered HTML avoids:
 *   - having to plumb graph access into `rewriteBrackets`
 *     (resolver closures would need to grow), and
 *   - mutating the markdown link syntax to carry attribute
 *     payloads (markdown doesn't support that).
 */
function decorateEntityLinks(
	html: string,
	resolveLink: LinkResolver,
	kindLookup: KindLookup | undefined
): string {
	return html.replace(
		ENTITY_LINK_RE,
		(whole, openPrefix: string, rawPath: string, anchor: string | undefined, tail: string) => {
			const isEngineRoute = ENGINE_ROUTE_PREFIXES.some(
				(p) => rawPath === p.replace(/\/$/, '') || rawPath.startsWith(p)
			);
			const hooks: string[] = [];
			const classes = ['bt-link'];

			if (!isEngineRoute) {
				// `resolveLink` here is the same resolver used during
				// rewriteBrackets, so a path that resolved before still
				// resolves now. We re-resolve rather than parse the
				// href because the rewriter writes the canonical id
				// into the href, which is what resolveLink would
				// return as a no-op.
				const resolved = resolveLink(rawPath) ?? rawPath;
				const slug = resolved.slice(resolved.lastIndexOf('/') + 1);
				if (slug) hooks.push(`data-bt-slug="${slug}"`);
				const kind = kindLookup?.(resolved);
				if (kind) {
					hooks.push(`data-bt-kind="${kind}"`);
					classes.push(`bt-link--kind-${kind}`);
				}
			}

			// The captured `tail` starts at the closing `"` of the
			// href attribute and runs through `</a>`. Insert hooks
			// just after that closing quote, before any other
			// attributes (class, data-broken, title) that marked may
			// have emitted.
			const classAttr = ` class="${classes.join(' ')}"`;
			const hookAttrs = hooks.length ? ` ${hooks.join(' ')}` : '';
			// If the tag already has a `class=` (e.g. inserted by a
			// future renderer or by hand-authored HTML), merge into
			// it instead of duplicating. Today no upstream pass
			// attaches classes to wikilinks, but this keeps us safe
			// against drift.
			const existingClassRe = / class="([^"]*)"/;
			const existingClassMatch = tail.match(existingClassRe);
			let newTail: string;
			if (existingClassMatch) {
				const merged = `${classes.join(' ')} ${existingClassMatch[1]}`;
				newTail = tail.replace(existingClassRe, ` class="${merged}"`);
				// hooks still need to be inserted (they're data-*, not class)
				newTail = newTail.replace(/^"/, `"${hookAttrs}`);
			} else {
				newTail = tail.replace(/^"/, `"${classAttr}${hookAttrs}`);
			}

			const anchorOut = anchor ?? '';
			return `${openPrefix}/${rawPath}${anchorOut}${newTail}`;
		}
	);
}

/** Convenience for entity bodies. */
export function renderEntityBody(
	entity: Entity,
	resolveLink: LinkResolver,
	languageCodes: Map<string, EntityId> = new Map(),
	kindIds: ReadonlySet<string> = new Set(),
	resolveCollection?: CollectionResolver,
	kindLookup?: KindLookup
): string {
	return renderBody(
		entity.body,
		resolveLink,
		languageCodes,
		kindIds,
		resolveCollection,
		entity.id,
		kindLookup
	);
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
export function renderPlainBody(body: string, resolveLink?: LinkResolver): string {
	const rewritten = resolveLink ? rewriteBrackets(body, resolveLink, new Map(), new Set()) : body;
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
	const defaultCode = renderer.code.bind(renderer);
	renderer.code = (token) => {
		if (token.lang === 'formula') {
			return `<div class="bt-formula">${escapeHtml(token.text)}</div>\n`;
		}
		if (token.lang === 'verse') {
			const lines = token.text.split('\n');
			const spans = lines.map((line) => {
				if (line.trim() === '') {
					return '<span class="bt-verse-break" aria-hidden="true"></span>';
				}
				const preserved = line.replace(/^ +/, (m) => '\u00a0'.repeat(m.length));
				const inlineHtml = marked.parseInline(preserved, { async: false }) as string;
				return `<span class="bt-verse-line">${inlineHtml}</span>`;
			});
			return `<div class="bt-verse">${spans.join('')}</div>\n`;
		}
		if (token.lang === 'gallery') {
			return renderGalleryBlock(token.text);
		}
		return defaultCode(token);
	};
	return marked.parse(rewritten, { async: false, renderer }) as string;
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
	options: { stripLinks?: boolean; kindIds?: ReadonlySet<string>; kindLookup?: KindLookup } = {}
): string {
	const { stripLinks = false, kindIds = new Set<string>(), kindLookup } = options;

	const rewritten = rewriteBrackets(summary, resolveLink, languageCodes, kindIds, stripLinks);

	let html = marked.parseInline(rewritten, { async: false }) as string;
	html = html.replace(/title="broken-link"/g, 'data-broken="true"');

	if (stripLinks) {
		// Replace any remaining <a …>label</a> (from markdown links in
		// the source) with just the label. parseInline preserves these,
		// and we can't wrap an <a> in another <a>.
		html = html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1');
	} else {
		html = decorateEntityLinks(html, resolveLink, kindLookup);
	}

	return html;
}
