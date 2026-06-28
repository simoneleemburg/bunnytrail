<script lang="ts">
	import type { TimelineDotPageData } from './timelineDotPage.load.ts';

	interface Props {
		data: TimelineDotPageData;
	}

	let { data }: Props = $props();
</script>

<div class="dot-nav">
	<a class="dot-nav__timeline-link" href={data.timelineHref}>{data.timelineTitle}</a>

	<div class="dot-nav__strip" role="navigation" aria-label="Timeline navigation">
		<div class="dot-nav__line" aria-hidden="true"></div>

		{#if data.prev}
			<a class="dot-nav__neighbour dot-nav__neighbour--prev" href={data.prev.href} aria-label="Go to {data.prev.year}">
				<span class="dot-nav__neighbour-year">{data.prev.year}</span>
				<span class="dot-nav__pip"></span>
			</a>
		{:else}
			<span class="dot-nav__neighbour dot-nav__neighbour--prev dot-nav__neighbour--empty" aria-hidden="true"></span>
		{/if}

		<div class="dot-nav__current">
			<span class="dot-nav__current-year">{data.year}</span>
			<span class="dot-nav__pip dot-nav__pip--current"></span>
		</div>

		{#if data.next}
			<a class="dot-nav__neighbour dot-nav__neighbour--next" href={data.next.href} aria-label="Go to {data.next.year}">
				<span class="dot-nav__neighbour-year">{data.next.year}</span>
				<span class="dot-nav__pip"></span>
			</a>
		{:else}
			<span class="dot-nav__neighbour dot-nav__neighbour--next dot-nav__neighbour--empty" aria-hidden="true"></span>
		{/if}
	</div>
</div>

{#if data.summaryHtml}
	<p class="dot-summary">
		<!-- trusted: server-rendered summary from the engine pipeline -->
		{@html data.summaryHtml}
	</p>
{/if}

{#if data.bodyHtml}
	<div class="dot-body">
		<!-- trusted: server-rendered markdown from the engine pipeline -->
		{@html data.bodyHtml}
	</div>
{/if}

<style>
	/* ── Wrapper ───────────────────────────────────────────────────── */
	.dot-nav {
		max-width: var(--prose-w, 48rem);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
	}

	.dot-nav__timeline-link {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		text-decoration: none;
	}
	.dot-nav__timeline-link:hover {
		color: var(--accent-warm);
	}

	/* ── Strip ─────────────────────────────────────────────────────── */
	/* Three columns: the outer two are equal and flexible, the centre
	   is intrinsic width. This keeps the current year anchored at the
	   true centre regardless of whether neighbours exist. */
	.dot-nav__strip {
		position: relative;
		width: 100%;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: end;
		padding-bottom: 10px; /* room for pip below the baseline */
	}

	/* Horizontal spine — full width, aligned to the pip row */
	.dot-nav__line {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 10px; /* matches strip padding-bottom */
		height: 2px;
		background: linear-gradient(
			to right,
			transparent 0%,
			var(--accent-deep) 8%,
			var(--accent-deep) 92%,
			transparent 100%
		);
		opacity: 0.35;
		/* Align to pip centre: pips are 10px tall, half = 5px */
		transform: translateY(calc(50% - 5px));
	}

	/* ── Neighbour dots (prev / next) ──────────────────────────────── */
	.dot-nav__neighbour {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		text-decoration: none;
		color: inherit;
		transition: transform 200ms ease;
		position: relative;
		z-index: 1;
	}

	.dot-nav__neighbour--prev {
		justify-self: start;
		padding-left: 10%;
	}

	.dot-nav__neighbour--next {
		justify-self: end;
		padding-right: 10%;
	}

	.dot-nav__neighbour--empty {
		pointer-events: none;
	}

	.dot-nav__neighbour:not(.dot-nav__neighbour--empty):hover {
		transform: none; /* no vertical lift — pip grows instead */
	}

	.dot-nav__neighbour-year {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
		transition: color 200ms ease;
	}

	.dot-nav__neighbour:hover .dot-nav__neighbour-year {
		color: var(--accent-warm);
	}

	/* ── Current dot ───────────────────────────────────────────────── */
	.dot-nav__current {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		position: relative;
		z-index: 1;
	}

	.dot-nav__current-year {
		font-family: var(--font-display);
		font-size: var(--text-5xl, 3.5rem);
		line-height: 1;
		color: var(--ink);
	}

	/* ── Pips ──────────────────────────────────────────────────────── */
	.dot-nav__pip {
		display: block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background-color: var(--accent);
		opacity: 0.45;
		transition: opacity 200ms ease, transform 200ms ease;
		position: relative;
		z-index: 1;
	}

	.dot-nav__neighbour:hover .dot-nav__pip {
		opacity: 1;
		transform: scale(1.25);
	}

	.dot-nav__pip--current {
		width: 14px;
		height: 14px;
		opacity: 1;
	}

	/* ── Summary ───────────────────────────────────────────────────── */
	.dot-summary {
		max-width: var(--prose-w, 48rem);
		margin: 0 auto var(--space-6);
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-base);
		color: var(--ink-soft);
		text-align: center;
	}

	/* ── Body prose ────────────────────────────────────────────────── */
	.dot-body {
		max-width: var(--prose-w, 48rem);
		margin: var(--space-8) auto 0;
	}
</style>
