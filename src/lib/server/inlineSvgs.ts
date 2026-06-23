import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assets } from './assets';
import { CONTENT_DIR, GUIDES_DIR, INFLUENCES_DIR } from './globals';
import { graph } from './graph';

/**
 * Inline rendered `<img>` references to SVG files so they paint as
 * fully styled, interactive figures rather than opaque raster
 * embeds, and wrap raster images served from `/api/…` endpoints in
 * a `<figure class="bt-inline-img">` with an expand button that
 * opens a simple full-viewport lightbox.
 *
 * **SVG path** — reads the SVG payload off disk and replaces the
 * `<img>` with:
 *
 *   <figure class="bt-inline-svg">
 *     <button type="button" class="bt-inline-svg__expand"
 *             data-bt-svg-expand aria-label="Open map">⤢</button>
 *     <svg …>…</svg>
 *     <figcaption>{alt}</figcaption>   ← only when alt is non-empty
 *   </figure>
 *
 * **Raster path** — wraps the `<img>` tag with:
 *
 *   <figure class="bt-inline-img">
 *     <button type="button" class="bt-inline-img__expand"
 *             data-bt-img-expand aria-label="View full size">⤢</button>
 *     <img src="…" alt="…">
 *     <figcaption>{alt}</figcaption>   ← only when alt is non-empty
 *   </figure>
 *
 * The `[data-bt-svg-expand]` / `[data-bt-img-expand]` buttons are
 * lightbox triggers handled by `SvgLightbox.svelte` (mounted once
 * from `Layout.svelte`). Buttons are server-rendered no-ops without
 * JS; the handler attaches on mount.
 *
 * Any `<img>` whose `src` is not under `/api/…` is left untouched.
 * If an SVG file can't be read the original `<img>` is left in
 * place so the gap surfaces as a broken-image rather than vanishing.
 */
export async function inlineSvgFigures(html: string): Promise<string> {
	const pattern =
		/<img\b([^>]*?)\ssrc="(\/api\/(?:assets|entity-assets|guide-assets|influence-assets)\/[^"]+)"([^>]*)>/gi;
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

const RASTER_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif']);

function isSvgSrc(src: string): boolean {
	return src.toLowerCase().endsWith('.svg');
}

function isRasterSrc(src: string): boolean {
	const dot = src.lastIndexOf('.');
	if (dot < 0) return false;
	return RASTER_EXTENSIONS.has(src.slice(dot + 1).toLowerCase());
}

async function buildReplacement(
	original: string,
	pre: string,
	src: string,
	post: string
): Promise<string> {
	const alt = extractAttr(`${pre} ${post}`, 'alt');

	if (isSvgSrc(src)) {
		return buildSvgReplacement(original, pre, src, post, alt);
	}
	if (isRasterSrc(src)) {
		return buildRasterReplacement(original, src, alt);
	}
	return original;
}

async function buildSvgReplacement(
	original: string,
	pre: string,
	src: string,
	post: string,
	alt: string | null
): Promise<string> {
	const svg = await loadSvg(src);
	if (!svg) return original; // leave broken <img> visible

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
	const base = figureBasename(src);
	const cls = base ? `bt-inline-svg bt-inline-svg--${base}` : 'bt-inline-svg';
	return `<figure class="${cls}">${expandBtn}${svgStripped}${captionHtml}</figure>`;
}

function buildRasterReplacement(original: string, src: string, alt: string | null): string {
	const captionHtml = alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : '';
	const altAttr = alt !== null ? ` alt="${escapeHtml(alt)}"` : '';
	const expandBtn =
		`<button type="button" class="bt-inline-img__expand" data-bt-img-expand ` +
		`aria-label="View full size"><span aria-hidden="true">⤢</span></button>`;
	const imgTag = `<img src="${src}"${altAttr}>`;
	return `<figure class="bt-inline-img">${expandBtn}${imgTag}${captionHtml}</figure>`;
}

/**
 * Derive the CSS modifier identifier from a figure `src` URL.
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
function figureBasename(src: string): string | null {
	let pathPart: string;

	if (src.startsWith('/api/assets/')) {
		// Flat asset: just the filename minus extension.
		pathPart = src.slice('/api/assets/'.length);
	} else if (src.startsWith('/api/entity-assets/')) {
		pathPart = src.slice('/api/entity-assets/'.length);
	} else if (src.startsWith('/api/guide-assets/')) {
		pathPart = src.slice('/api/guide-assets/'.length);
	} else if (src.startsWith('/api/influence-assets/')) {
		pathPart = src.slice('/api/influence-assets/'.length);
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
	if (src.startsWith('/api/influence-assets/')) {
		const rest = src.slice('/api/influence-assets/'.length);
		const segments = rest.split('/').filter(Boolean);
		// Exactly two segments: <slug>/<filename>
		if (segments.length !== 2) return null;
		if (segments.some((s) => s === '..' || s === '.')) return null;
		const [slug, filename] = segments;
		const influencesRoot = resolve(INFLUENCES_DIR);
		const filePath = resolve(INFLUENCES_DIR, slug, filename);
		if (!filePath.startsWith(influencesRoot + '/')) return null;
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
