<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n';
	import type { ChapterPageData } from './chapterPage.load';

	let { data }: { data: ChapterPageData } = $props();

	const ui = $derived(t(page.data.world.language));
	const unitSingular = $derived(data.book?.unitSingular ?? ui.chapter_unit_default);
	const format = $derived(data.book?.format ?? 'book');

	function romanise(n: number): string {
		if (!Number.isFinite(n) || n < 1 || n > 3999) return String(n);
		const pairs: [number, string][] = [
			[1000, 'M'],
			[900, 'CM'],
			[500, 'D'],
			[400, 'CD'],
			[100, 'C'],
			[90, 'XC'],
			[50, 'L'],
			[40, 'XL'],
			[10, 'X'],
			[9, 'IX'],
			[5, 'V'],
			[4, 'IV'],
			[1, 'I']
		];
		let v = Math.floor(n);
		let out = '';
		for (const [k, r] of pairs) {
			while (v >= k) {
				out += r;
				v -= k;
			}
		}
		return out;
	}
</script>

<svelte:head>
	<title>{data.chapter.title} · {data.work.name} · {page.data.world.shortName}</title>
</svelte:head>

<article class="book" data-book-format={format}>
	<nav class="frame frame-top" aria-label={ui.chapter_nav_aria(unitSingular)}>
		<a class="back" href={data.work.href}>↩&#xFE0E; {data.work.name}</a>
		<span class="folio">{romanise(data.chapter.order)}</span>
	</nav>

	<header class="chapter-head">
		<p class="eyebrow">{ui.chapter_eyebrow(unitSingular, romanise(data.chapter.order))}</p>
		<h1 class="title">{data.chapter.title}</h1>
	</header>

	<div class="prose">
		{@html data.html}
	</div>

	<nav class="frame frame-bottom" aria-label={ui.chapter_nav_aria(unitSingular)}>
		<span class="prev">
			{#if data.prev}
				<a href={data.prev.href}>
					<span class="frame-label">{ui.chapter_prev}</span>
					<span class="frame-title">
						← {romanise(data.prev.order)} · {data.prev.title}
					</span>
				</a>
			{/if}
		</span>
		<a class="cover" href={data.work.href}>{ui.chapter_contents}</a>
		<span class="next">
			{#if data.next}
				<a href={data.next.href}>
					<span class="frame-label">{ui.chapter_next}</span>
					<span class="frame-title">
						{romanise(data.next.order)} · {data.next.title} →
					</span>
				</a>
			{/if}
		</span>
	</nav>
</article>

<style>
	/* Book-mode reader. Lifted off the compendium chrome: no
	   sidebar, narrower measure, more leading, display-serif heads,
	   a vellum surface with rule-bordered top and bottom frames
	   that read as the running header / footer of a book page. */
	.book {
		position: relative;
		max-width: var(--book-prose-max);
		margin: 0 auto;
		padding: var(--space-6) var(--space-5) var(--space-7);
		background: var(--book-page);
		border: var(--book-rule);
		border-radius: var(--radius-sm);
		box-shadow:
			0 1px 0 var(--rule),
			0 18px 50px -28px rgba(0, 0, 0, 0.25);
		color: var(--ink);
	}

	/* Default `book` register: clothbound codex. A second inset
	   rule sits just inside the outer border, suggesting the gilt
	   line a binder presses into a book's cover; a faint vertical
	   spine line down the left margin completes the bound-volume
	   read. */
	.book[data-book-format='book']::before {
		content: '';
		position: absolute;
		inset: 6px;
		border: 1px solid var(--rule);
		border-radius: 2px;
		pointer-events: none;
		opacity: 0.55;
	}

	.book[data-book-format='book']::after {
		content: '';
		position: absolute;
		top: var(--space-6);
		bottom: var(--space-6);
		left: 14px;
		width: 1px;
		background: linear-gradient(
			to bottom,
			transparent 0,
			var(--rule) 8%,
			var(--rule) 92%,
			transparent 100%
		);
		opacity: 0.7;
		pointer-events: none;
	}

	@media (max-width: 40rem) {
		.book {
			padding: var(--space-5) var(--space-4) var(--space-6);
		}
	}

	.frame {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-4);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	.frame a {
		color: inherit;
		text-decoration: none;
	}

	.frame a:hover {
		color: var(--accent);
	}

	.frame-top {
		padding-bottom: var(--space-3);
		border-bottom: var(--book-rule);
	}

	.frame-bottom {
		margin-top: var(--space-7);
		padding-top: var(--space-4);
		border-top: var(--book-rule);
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: baseline;
		gap: var(--space-4);
	}

	.frame-bottom .prev,
	.frame-bottom .next {
		display: flex;
		flex-direction: column;
	}

	.frame-bottom .next {
		text-align: right;
	}

	.frame-bottom .cover {
		text-align: center;
	}

	.frame-label {
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}

	.frame-title {
		font-size: var(--text-sm);
		font-variant: normal;
		letter-spacing: 0;
		color: var(--ink-soft);
	}

	.frame-bottom a:hover .frame-title {
		color: var(--accent);
	}

	.folio {
		/* The numeral on the running-head right; visually a folio
		   number, but Roman to match the chapter eyebrow. */
		font-family: var(--font-display);
	}

	.chapter-head {
		text-align: center;
		margin: var(--space-6) 0 var(--space-6);
	}

	.eyebrow {
		margin: 0 0 var(--space-2);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
	}

	.title {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 500;
		font-size: var(--text-2xl);
		line-height: var(--leading-tight);
		color: var(--ink);
	}

	.prose {
		font-family: var(--font-serif);
		font-size: var(--text-base);
		line-height: var(--book-leading);
		color: var(--ink);
	}

	.prose :global(p) {
		margin: 0 0 var(--space-5);
		text-indent: 1.4em;
	}

	/* The first paragraph of a chapter: no indent, drop cap. */
	.prose :global(p:first-of-type) {
		text-indent: 0;
	}

	.prose :global(p:first-of-type::first-letter) {
		font-family: var(--font-display);
		float: left;
		font-size: 3.4em;
		line-height: 0.85;
		padding: 0.1em 0.08em 0 0;
		color: var(--accent);
	}

	.prose :global(h2) {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		text-align: center;
		margin: var(--space-6) 0 var(--space-4);
		color: var(--ink);
	}

	.prose :global(blockquote) {
		margin: var(--space-5) var(--space-5);
		font-style: italic;
		color: var(--ink-soft);
		border-left: 2px solid var(--rule);
		padding-left: var(--space-4);
	}

	.prose :global(hr) {
		border: 0;
		text-align: center;
		margin: var(--space-6) 0;
	}

	.prose :global(hr::after) {
		content: '❦';
		color: var(--ink-faint);
		font-size: 1.2em;
	}

	/* Scrolls register: older, hand-set feel. Used for entities
	   declared as `book: { format: scrolls }` in YAML. Drives the
	   archaic font family on heads + body + folio, warms the page
	   tone, swaps the drop cap for a small-caps opening (a drop
	   cap is a printer's flourish; scrolls predate the printing
	   press), and uses a row of asterisms for the rule.

	   Edges: the rectangular border and radius are dropped; a
	   horizontal SVG mask with a wavering edge gives the top and
	   bottom a torn-parchment silhouette, and a soft brown drop
	   shadow grounds the sheet on the surrounding page. */
	.book[data-book-format='scrolls'] {
		/* A touch lighter than the surrounding parchment so the
		   sheet reads as a separate, lifted surface rather than the
		   same paper. The shadow stack below uses near-black at low
		   alpha — a brown-tinted shadow disappears into the warm
		   site background, while a cool dark cast actually reads as
		   depth.
		   Worlds can override --bt-scroll-bg to tune the base colour.
		   Texture is applied via ::before (see below) so it doesn't
		   interact with mask-image or the drop-shadow filter. */
		background: var(--bt-scroll-bg, #fbf3d8);
		border: none;
		border-radius: 0;
		/* Torn parchment on all four sides. The SVG mask is a
		   single closed path that wavers along top, right, bottom
		   and left edges; `preserveAspectRatio='none'` lets it
		   stretch to the page's actual aspect ratio. The page
		   itself takes the mask's silhouette, and the layered
		   `drop-shadow` filter casts shadows that follow that
		   irregular outline rather than the original rectangle. */
		mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 800' preserveAspectRatio='none'><path d='M14 16 C 60 4, 110 24, 170 12 S 280 2, 340 18 S 450 26, 510 8 S 588 14, 586 22 C 596 80, 580 150, 590 220 S 598 360, 584 430 S 596 560, 586 640 S 594 740, 584 786 C 540 798, 480 778, 420 790 S 310 800, 250 786 S 130 778, 70 794 S 12 786, 16 778 C 6 720, 22 640, 10 560 S 4 420, 18 340 S 6 200, 14 130 S 4 60, 14 16 Z' fill='black'/></svg>");
		mask-size: 100% 100%;
		mask-repeat: no-repeat;
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.18)) drop-shadow(0 8px 12px rgba(0, 0, 0, 0.16))
			drop-shadow(0 24px 40px rgba(0, 0, 0, 0.22));
		padding-top: var(--space-7);
		padding-bottom: calc(var(--space-7) + var(--space-3));
		padding-left: calc(var(--space-6) + var(--space-2));
		padding-right: calc(var(--space-6) + var(--space-2));
	}

	/* Texture overlay. Worlds set --bt-scroll-texture to an SVG data URL
	   (or any CSS image). mix-blend-mode:multiply tints rather than covers,
	   so the base colour still shows through. pointer-events:none keeps
	   text selection and link clicks intact.
	   isolation:isolate creates the blending context so both the ::before
	   texture layer and the .prose multiply blend stay scoped to the scroll
	   sheet — not the page background. */
	.book[data-book-format='scrolls'] {
		isolation: isolate;
	}
	.book[data-book-format='scrolls']::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		mix-blend-mode: multiply;
		background-image: var(--bt-scroll-texture, none);
		background-size: var(--bt-scroll-texture-size, 500px 500px);
		z-index: 0;
	}
	/* Blend the prose ink into the cloth texture so letterforms pick up
	   the weave's warmth and variation. multiply here means the near-black
	   ink composites against the amber+cloth layer beneath it — where a
	   dark fibre crosses a glyph the glyph deepens slightly, where the
	   cloth is open the ink stays its own warm dark. Subtle on screen;
	   more noticeable on the dark-fibre stanza lines of verse blocks.
	   Worlds can suppress this with --bt-scroll-ink-blend: normal. */
	.book[data-book-format='scrolls'] .prose {
		mix-blend-mode: var(--bt-scroll-ink-blend, multiply);
		position: relative;
		z-index: 1;
	}

	.book[data-book-format='scrolls'] .title,
	.book[data-book-format='scrolls'] .folio {
		font-family: var(--font-archaic);
		font-weight: 400;
	}

	.book[data-book-format='scrolls'] .title {
		font-size: var(--text-3xl);
		letter-spacing: 0.01em;
	}

	.book[data-book-format='scrolls'] .eyebrow,
	.book[data-book-format='scrolls'] .frame {
		font-family: var(--font-archaic-sc);
		font-variant: normal;
		letter-spacing: 0.06em;
	}

	.book[data-book-format='scrolls'] .prose {
		font-family: var(--font-archaic);
		font-size: 1.0625rem;
		line-height: 1.7;
	}

	/* No drop cap on scrolls. */
	.book[data-book-format='scrolls'] .prose :global(p:first-of-type::first-letter) {
		font-family: inherit;
		float: none;
		font-size: inherit;
		line-height: inherit;
		padding: 0;
		color: inherit;
	}

	.book[data-book-format='scrolls'] .prose :global(h2) {
		font-family: var(--font-archaic);
		font-variant: normal;
		letter-spacing: 0.02em;
		font-style: italic;
	}

	.book[data-book-format='scrolls'] .prose :global(blockquote) {
		font-family: var(--font-archaic);
		font-style: italic;
		border-left-color: rgba(60, 40, 10, 0.25);
	}

	.book[data-book-format='scrolls'] .prose :global(hr::after) {
		content: '· · ·';
		letter-spacing: 0.6em;
	}

</style>
