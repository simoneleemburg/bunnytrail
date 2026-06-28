<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { TimelinePageData } from './timelinePage.load.ts';

	let { data }: { data: TimelinePageData } = $props();
</script>

<PageHeader
	title={data.title}
	subtitleHtml={data.summaryHtml}
	breadcrumbs={data.breadcrumbs}
/>

{#if data.bodyHtml}
	<div class="timeline-prose">
		<!-- trusted: server-rendered markdown from the engine pipeline -->
		{@html data.bodyHtml}
	</div>
{/if}

{#if data.entries.length === 0}
	<p class="timeline-empty">No entries yet.</p>
{:else}
	<div class="timeline">
		{#each data.entries as entry (entry.path)}
			<article class="timeline-entry">
				<span class="timeline-year">
					<!-- Stretched link covers the whole tile -->
					<a class="entry-link" href={entry.href}>{entry.year}</a>
				</span>
				{#if entry.summaryHtml}
					<div class="timeline-summary">
						<!-- trusted: server-rendered markdown from the engine pipeline -->
						{@html entry.summaryHtml}
					</div>
				{/if}
			</article>
		{/each}
	</div>
{/if}

<style>
	/* ── Intro prose block ────────────────────────────────────────── */
	.timeline-prose {
		max-width: var(--prose-max);
		margin: 0 auto var(--space-7);
	}

	/* ── Empty state ──────────────────────────────────────────────── */
	.timeline-empty {
		text-align: center;
		color: var(--ink-faint);
		font-style: italic;
		margin: var(--space-8) auto;
	}

	/* ── Vertical timeline spine ──────────────────────────────────── */
	.timeline {
		position: relative;
		max-width: var(--prose-max);
		margin: 0 auto;
	}

	/* Vertical line running the full height of the container,
	   anchored at left: 1rem. Sits behind the entry tiles. */
	.timeline::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 1rem;
		width: 2px;
		background-color: var(--accent-deep);
		opacity: 0.4;
	}

	/* ── Individual entry tile ────────────────────────────────────── */
	.timeline-entry {
		position: relative;
		/* Indent past the spine + dot. Negative horizontal margin
		   lets the warm hover fill bleed out to match EntityCard. */
		padding: var(--space-4) var(--space-4) var(--space-5) 3rem;
		margin: 0 calc(var(--space-4) * -1) var(--space-2);
		border-radius: 8px;
		transition:
			background-color 200ms ease,
			box-shadow 200ms ease,
			transform 200ms ease;
	}

	.timeline-entry:hover {
		background-color: var(--paper-warm);
		box-shadow:
			0 1px 1px rgba(120, 90, 60, 0.04),
			0 4px 14px -8px rgba(120, 90, 60, 0.1);
		transform: translateY(-1px);
	}

	/* Dot on the spine — ::before so it sits relative to the entry
	   and visually "floats" on the spine line. On hover it sharpens
	   to match the warm fill. */
	.timeline-entry::before {
		content: '';
		position: absolute;
		top: calc(var(--space-4) + 0.35em); /* align with year cap-height */
		left: calc(1rem - 5px);
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background-color: var(--accent);
		opacity: 0.7;
		transition: opacity 200ms ease, transform 200ms ease;
		z-index: 1;
	}

	.timeline-entry:hover::before {
		opacity: 1;
		transform: scale(1.15);
	}

	/* ── Year label ───────────────────────────────────────────────── */
	.timeline-year {
		display: block;
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		line-height: 1;
		/* Colour inherits from .entry-link so the gleam animation
		   applies; don't set color here. */
	}

	/* Stretched link covers the entire tile — same technique as
	   EntityCard's .card-link::after. The year text itself is the
	   link anchor; ::after extends the hit-target over the whole
	   article. */
	.entry-link {
		color: var(--ink);
		text-decoration: none;
		/* Gleam gradient — matches EntityCard exactly */
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-warm) 50%,
			currentColor 58%,
			currentColor 100%
		);
		background-size: 250% 100%;
		background-position: 130% 0;
		background-clip: text;
		-webkit-background-clip: text;
	}

	/* Stretch the link over the whole tile */
	.entry-link::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
		border-radius: 8px;
	}

	.timeline-entry:hover .entry-link {
		color: var(--accent);
		animation: year-gleam 600ms ease-out;
	}

	@keyframes year-gleam {
		0% {
			background-position: 130% 0;
			-webkit-text-fill-color: currentColor;
		}
		15%, 85% {
			-webkit-text-fill-color: transparent;
		}
		100% {
			background-position: -30% 0;
			-webkit-text-fill-color: currentColor;
		}
	}

	/* ── Entry summary ────────────────────────────────────────────── */
	.timeline-summary {
		margin-top: var(--space-2);
		font-style: italic;
		color: var(--ink-soft);
		font-size: var(--text-sm);
	}

	.timeline-summary :global(p) {
		margin: 0;
	}
</style>
