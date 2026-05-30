import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assets } from './assets';
import { CONTENT_DIR } from './globals';
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
 *   <figure class="alteria-inline-svg">
 *     <svg …>…</svg>
 *     <figcaption>{alt}</figcaption>   ← only when alt is non-empty
 *   </figure>
 *
 * The wrapper class — `alteria-inline-svg` — is styled by the
 * world's own stylesheet at `<world>/assets/inline-svg.css`
 * (served via `/api/assets/inline-svg.css`, linked from
 * `app.html`). That file is world-coupled because it knows the
 * class names the world's bake scripts emit on the SVGs.
 *
 * Non-SVG images and any `<img>` whose `src` we don't recognise are
 * left untouched — they keep working as ordinary raster embeds.
 *
 * If the SVG file can't be read (deleted, renamed, broken), the
 * original `<img>` tag is left in place so the gap surfaces as a
 * standard broken-image rather than vanishing silently.
 */
export async function inlineSvgFigures(html: string): Promise<string> {
	const pattern = /<img\b([^>]*?)\ssrc="(\/api\/(?:assets|entity-assets)\/[^"]+\.svg)"([^>]*)>/gi;
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
	return `<figure class="alteria-inline-svg">${svg}${captionHtml}</figure>`;
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
