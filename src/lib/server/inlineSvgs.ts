import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assets } from './assets';
import { CONTENT_DIR, GUIDES_DIR } from './globals';
import { graph } from './graph';

/**
 * Inline rendered `<img>` references to SVG files so they paint as
 * fully styled, interactive figures rather than opaque raster
 * embeds.
 *
 * Operates on HTML already produced by `renderBody`, which has
 * rewritten author-side `![alt](foo.svg)` and `![alt](assets/foo.svg)`
 * into `<img src="/api/entity-assets/…">` and `<img src="/api/assets/…">`
 * respectively. This pass walks those `<img>` tags, reads the SVG
 * payload off disk, and replaces them with:
 *
 *   <figure class="bt-inline-svg">
 *     <button type="button" class="bt-inline-svg__expand"
 *             data-bt-svg-expand aria-label="View full size">⤢</button>
 *     <svg …>…</svg>
 *     <figcaption>{alt}</figcaption>   ← only when alt is non-empty
 *   </figure>
 *
 * The `[data-bt-svg-expand]` button is the lightbox trigger; a
 * single global listener (mounted in `Layout.svelte` via the
 * `SvgLightbox` component) picks it up, clones the sibling SVG,
 * and renders it full-viewport in a `<dialog>`. The button is
 * server-rendered so it works without JS as a no-op (the browser's
 * default action is nothing); progressive enhancement attaches
 * the lightbox handler on mount.
 *
 * The wrapper carries two classes: the generic `bt-inline-svg`
 * (styled by the engine: figure chrome, lightbox handler hooks,
 * container query for `cqw`) and a per-figure modifier
 * `bt-inline-svg--<base>` where `<base>` is the SVG filename minus
 * extension. The engine auto-bundles every `<base>.css` next to a
 * `<base>.svg` in the world's assets dir into
 * `/api/assets/inline-svg.css`, wrapping each file's rules in
 * `.bt-inline-svg--<base> { ... }` so they only apply inside the
 * matching figure. World authors don't need to write `svg.<map>`
 * scoping selectors.
 *
 * Non-SVG images and any `<img>` whose `src` we don't recognise are
 * left untouched — they keep working as ordinary raster embeds.
 *
 * If the SVG file can't be read (deleted, renamed, broken), the
 * original `<img>` tag is left in place so the gap surfaces as a
 * standard broken-image rather than vanishing silently.
 */
export async function inlineSvgFigures(html: string): Promise<string> {
	const pattern = /<img\b([^>]*?)\ssrc="(\/api\/(?:assets|entity-assets|guide-assets)\/[^"]+\.svg)"([^>]*)>/gi;
	const matches: Array<{ whole: string; pre: string; src: string; post: string; index: number }> =
		[];
	for (const m of html.matchAll(pattern)) {
		matches.push({
			whole: m[0],
			pre: m[1],
			src: m[2],
			post: m[3],
			index: m.index ?? 0
		});
	}
	if (matches.length === 0) return html;

	const replacements = await Promise.all(
		matches.map((m) => buildReplacement(m.whole, m.pre, m.src, m.post))
	);

	// Walk the string once, splicing in replacements at their match offsets.
	let out = '';
	let cursor = 0;
	for (let i = 0; i < matches.length; i++) {
		const m = matches[i];
		out += html.slice(cursor, m.index) + replacements[i];
		cursor = m.index + m.whole.length;
	}
	out += html.slice(cursor);
	return out;
}

async function buildReplacement(
	original: string,
	pre: string,
	src: string,
	post: string
): Promise<string> {
	const svg = await loadSvg(src);
	if (!svg) return original; // leave broken <img> visible

	const alt = extractAttr(`${pre} ${post}`, 'alt');
	const captionHtml = alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : '';
	const expandBtn =
		`<button type="button" class="bt-inline-svg__expand" data-bt-svg-expand ` +
		`aria-label="Open map"><span aria-hidden="true">⤢</span></button>`;

	// Strip <title> elements so the browser doesn't render a native
	// tooltip over the figure — the figcaption already carries the
	// description and the expand button has its own aria-label.
	const svgStripped = svg.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '');

	// Modifier class derived from the SVG basename. Pairs 1:1 with
	// the world's per-figure CSS file: `<base>.css` is bundled into
	// `inline-svg.css` wrapped in `.bt-inline-svg--<base> { ... }`,
	// so its rules only apply inside the matching figure. Author
	// CSS no longer needs manual `svg.<map>` scoping selectors.
	const base = svgBasename(src);
	const cls = base ? `bt-inline-svg bt-inline-svg--${base}` : 'bt-inline-svg';
	return `<figure class="${cls}">${expandBtn}${svgStripped}${captionHtml}</figure>`;
}

/**
 * Derive the CSS modifier identifier from an SVG `src` URL.
 *
 * For `/api/assets/<base>.svg`          → `<base>`
 *   (flat assets dir, no collision risk)
 *
 * For `/api/entity-assets/<path>/<base>.svg`
 *   → `<path-with-slashes-as-hyphens>-<base>`
 *   e.g. `/api/entity-assets/foundation/fabric/primitives/mundus/map.svg`
 *        → `foundation-fabric-primitives-mundus-map`
 *   Multiple entity folders can each have a `map.svg`; this keeps
 *   their CSS classes distinct.
 *
 * For `/api/guide-assets/<slug>/<base>.svg`
 *   → `<slug>-<base>`
 *   e.g. `/api/guide-assets/cognita/clusters-map.svg`
 *        → `cognita-clusters-map`
 *
 * Returns null if the resulting identifier isn't CSS-class-safe
 * (`[A-Za-z0-9_-]+`).
 */
function svgBasename(src: string): string | null {
	let pathPart: string;

	if (src.startsWith('/api/assets/')) {
		// Flat asset: just the filename minus extension.
		pathPart = src.slice('/api/assets/'.length);
	} else if (src.startsWith('/api/entity-assets/')) {
		pathPart = src.slice('/api/entity-assets/'.length);
	} else if (src.startsWith('/api/guide-assets/')) {
		pathPart = src.slice('/api/guide-assets/'.length);
	} else {
		return null;
	}

	// Drop the extension.
	const dot = pathPart.lastIndexOf('.');
	if (dot < 0) return null;
	const withoutExt = pathPart.slice(0, dot);

	// Replace path separators with hyphens.
	const identifier = withoutExt.replace(/\//g, '-');

	return /^[A-Za-z0-9_-]+$/.test(identifier) ? identifier : null;
}

async function loadSvg(src: string): Promise<string | null> {
	if (src.startsWith('/api/assets/')) {
		const name = src.slice('/api/assets/'.length);
		if (name.includes('/') || name.includes('..')) return null;
		return await assets.get(name);
	}
	if (src.startsWith('/api/entity-assets/')) {
		const rest = src.slice('/api/entity-assets/'.length);
		const segments = rest.split('/').filter(Boolean);
		if (segments.length < 2) return null;
		if (segments.some((s) => s === '..' || s === '.')) return null;
		const filename = segments[segments.length - 1];
		const folder = segments.slice(0, -1).join('/');
		// Same guard as the HTTP handler: only known folders.
		await graph.ready();
		if (graph.get(folder) === undefined && graph.collection(folder) === undefined) return null;
		const filePath = resolve(CONTENT_DIR, folder, filename);
		const root = resolve(CONTENT_DIR);
		if (!filePath.startsWith(root + '/')) return null;
		try {
			return await readFile(filePath, 'utf-8');
		} catch {
			return null;
		}
	}
	if (src.startsWith('/api/guide-assets/')) {
		const rest = src.slice('/api/guide-assets/'.length);
		const segments = rest.split('/').filter(Boolean);
		// Exactly two segments: <slug>/<filename>
		if (segments.length !== 2) return null;
		if (segments.some((s) => s === '..' || s === '.')) return null;
		const [slug, filename] = segments;
		const guidesRoot = resolve(GUIDES_DIR);
		const filePath = resolve(GUIDES_DIR, slug, filename);
		if (!filePath.startsWith(guidesRoot + '/')) return null;
		try {
			return await readFile(filePath, 'utf-8');
		} catch {
			return null;
		}
	}
	return null;
}

/** Extract a quoted attribute value out of an `<img>` tag's attribute fragment. */
function extractAttr(attrs: string, name: string): string | null {
	const re = new RegExp(`\\b${name}="([^"]*)"`, 'i');
	const m = attrs.match(re);
	return m ? m[1] : null;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
