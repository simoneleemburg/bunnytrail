<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { TimelinePageData } from './timelinePage.load.ts';

	let { data }: { data: TimelinePageData } = $props();

	const pt = $derived(data.parentTimeline);
	const ptYears = $derived(
		pt?.firstYear != null
			? pt.firstYear === pt.lastYear || pt.lastYear == null
				? `${pt.firstYear}`
				: `${pt.firstYear}–${pt.lastYear}`
			: null
	);
</script>

{#if pt}
	<!-- Sub-timeline header: parent widget left, title+chips right, aligned at top of spine -->
	<div class="sub-header">
		<a class="parent-link" href={pt.href} aria-label="Back to {pt.label}">
			<span class="parent-link__label">{pt.label}</span>
			{#if ptYears}
				<span class="parent-link__eyebrow">{ptYears}</span>
			{/if}
			<div class="parent-link__spine" aria-hidden="true">
				<span class="parent-link__pip parent-link__pip--top"></span>
				<span class="parent-link__line"></span>
				<span class="parent-link__pip parent-link__pip--bottom"></span>
			</div>
		</a>
		<div class="sub-header__right">
			<h1 class="sub-header__title">{data.title}</h1>
			{#if data.targets.length > 0}
				<div class="timeline-targets">
					{#each data.targets as t (t.href)}
						<a class="timeline-target" href={t.href}>{t.label}</a>
					{/each}
				</div>
			{/if}
			{#if data.summaryHtml}
				<p class="sub-header__subtitle">{@html data.summaryHtml}</p>
			{/if}
		</div>
	</div>
{:else}
	<!-- Top-level timeline: same two-column layout, non-interactive spine widget -->
	{#if data.breadcrumbs.length >= 2}
		{@const upCrumb = data.breadcrumbs[data.breadcrumbs.length - 2]}
		<a class="tl-up-link" href={upCrumb.href}>
			<span class="up-arrow" aria-hidden="true">↑</span>{upCrumb.label}
		</a>
	{/if}
	<div class="sub-header">
		<!-- Non-interactive spine: same chrome, no link/hover -->
		<div class="spine-widget" aria-hidden="true">
			{#if data.firstYear !== null}
				<span class="parent-link__eyebrow">
					{data.firstYear}{data.lastYear !== null && data.lastYear !== data.firstYear ? `–${data.lastYear}` : ''}
				</span>
			{/if}
			<div class="parent-link__spine">
				<span class="parent-link__pip parent-link__pip--top"></span>
				<span class="parent-link__line"></span>
				<span class="parent-link__pip parent-link__pip--bottom"></span>
			</div>
		</div>
		<div class="sub-header__right">
			<h1 class="sub-header__title">{data.title}</h1>
			{#if data.targets.length > 0}
				<div class="timeline-targets">
					{#each data.targets as t (t.href)}
						<a class="timeline-target" href={t.href}>{t.label}</a>
					{/each}
				</div>
			{/if}
			{#if data.summaryHtml}
				<p class="sub-header__subtitle">{@html data.summaryHtml}</p>
			{/if}
		</div>
	</div>
{/if}

{#if data.bodyHtml}
	<div class="timeline-prose">
		<!-- trusted: server-rendered markdown from the engine pipeline -->
		{@html data.bodyHtml}
	</div>
{/if}

{#if data.entries.length === 0 && data.childTimelines.length === 0}
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

		{#each data.childTimelines as child (child.path)}
			<div class="child-timeline">
				<!-- Branch connector: horizontal arm off the spine -->
				<div class="child-timeline__connector" aria-hidden="true"></div>
				<a class="child-timeline__card" href={child.href}>
					<span class="child-timeline__title">{child.title}</span>
					{#if child.firstYear !== null}
						<span class="child-timeline__years">
							{child.firstYear}{child.lastYear !== null && child.lastYear !== child.firstYear ? `–${child.lastYear}` : ''}
						</span>
					{/if}
					{#if child.targets.length > 0}
						<span class="child-timeline__targets">
							{#each child.targets as t, i (t.href)}
								{#if i > 0}<span aria-hidden="true"> · </span>{/if}{t.label}
							{/each}
						</span>
					{/if}
				</a>
			</div>
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
		max-width: var(--prose-max);
		margin: 0 auto;
		--spine-x: calc(1rem + var(--space-4));
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

	/* Spine line segment — ::after, same coordinate space as the dot.
	   Extends bottom by the inter-entry gap so segments butt together
	   into one continuous line with no breaks between entries. */
	.timeline-entry::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: calc(-1 * var(--space-2));
		left: var(--spine-x);
		width: 2px;
		transform: translateX(-50%);
		background-color: var(--accent-deep);
		opacity: 0.4;
		z-index: 0;
	}

	/* Last entry: don't extend past the last dot — stop at bottom of entry. */
	.timeline-entry:last-child::after {
		bottom: 0;
	}

	/* Dot — ::before, same coordinate space as ::after line. */
	.timeline-entry::before {
		content: '';
		position: absolute;
		top: calc(var(--space-4) + 0.35em); /* align with year cap-height */
		left: var(--spine-x);
		transform: translateX(-50%);
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
		transform: translateX(-50%) scale(1.15);
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

	/* ── Child timeline branch ────────────────────────────────────── */
	.child-timeline {
		position: relative;
	}

	/* Vertical spine continuation */
	.child-timeline__connector {
		position: absolute;
		left: calc(var(--spine-x) - 1rem);
		top: 0;
		bottom: 0;
		width: 2px;
		transform: translateX(-50%);
		background-color: var(--accent-deep);
		opacity: 0.25;
	}

	/* Horizontal arm — short tick at the top of the branch showing where
	   the sub-timeline card connects to the spine */
	.child-timeline__connector::after {
		content: '';
		position: absolute;
		top: var(--space-3);
		left: 1px;
		width: var(--space-4);
		height: 2px;
		background-color: var(--accent-deep);
		opacity: 1;
		border-left: 2px solid color-mix(in srgb, var(--accent-deep) 40%, transparent);
		transition: background-color 150ms ease, border-left-color 150ms ease;
	}

	/* The card itself — border-left aligns with the master spine */
	.child-timeline__card {
		display: inline-flex;
		flex-direction: column;
		gap: var(--space-1);
		text-decoration: none;
		color: inherit;
		/* -1px so the 2px border-left straddles the spine centre (same
		   as the connector which uses translateX(-50%) on a 2px bar) */
		margin-left: calc(var(--spine-x) - 1px);
		border-left: 2px solid color-mix(in srgb, var(--accent-deep) 40%, transparent);
		padding: var(--space-2) var(--space-3);
		border-radius: 0 6px 6px 0;
		transition: background-color 150ms ease, border-left-color 150ms ease;
	}

	.child-timeline__card:hover {
		background-color: var(--paper-warm);
		border-left-color: var(--accent);
	}

	.child-timeline__title {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		color: var(--ink);
	}

	.child-timeline__card:hover .child-timeline__title {
		color: var(--accent);
	}

	.child-timeline__years {
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		color: var(--ink-faint);
		letter-spacing: 0.04em;
	}

	.child-timeline__targets {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-xs);
		color: var(--ink-soft);
	}

	/* ── Sub-timeline parent header ───────────────────────────────── */
	.sub-header {
		display: flex;
		align-items: baseline;
		gap: var(--space-6);
		max-width: var(--prose-max);
		margin: 0 auto var(--space-8);
		padding-top: var(--space-7);
	}

	/* Right column holds both title and subtitle so subtitle is indented with title */
	.sub-header__right {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.sub-header__subtitle {
		font-family: var(--font-serif);
		font-style: italic;
		color: var(--ink-soft);
		font-size: var(--text-lg);
		margin: 0;
	}

	.sub-header__subtitle :global(p) {
		margin: 0;
	}

	/* Parent timeline link: eyebrow + spine + name, stacked */
	.parent-link {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		text-decoration: none;
		color: inherit;
		flex-shrink: 0;
	}

	.parent-link__label {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		color: var(--ink-faint);
		display: inline-block;
		transition: color 200ms ease, transform 200ms ease;
	}

	.parent-link:hover .parent-link__label {
		color: var(--accent-warm);
		transform: scale(1.15);
	}

	.parent-link__eyebrow {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		color: var(--ink-faint);
		display: inline-block;
		transition: color 200ms ease, transform 200ms ease;
	}

	.parent-link:hover .parent-link__eyebrow {
		color: var(--accent-warm);
		transform: scale(1.15);
	}

	.parent-link__spine {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
	}

	.parent-link__pip {
		display: block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background-color: var(--accent);
		opacity: 0.45;
		transition: opacity 200ms ease, transform 200ms ease;
	}

	.parent-link:hover .parent-link__pip {
		opacity: 1;
		transform: scale(1.25);
	}

	.parent-link__line {
		display: block;
		width: 2px;
		height: 2.5rem;
		background: linear-gradient(
			to bottom,
			var(--accent-deep),
			var(--accent-deep)
		);
		opacity: 0.35;
		transition: height 200ms ease, opacity 200ms ease;
	}

	.parent-link:hover .parent-link__line {
		height: 3rem;
		opacity: 0.6;
	}

	.sub-header__title {
		font-family: var(--font-display);
		font-size: var(--text-5xl, 3rem);
		font-weight: 400;
		line-height: 1.1;
		margin: 0 0 var(--space-2);
		color: var(--ink);
	}

	/* ── Target entity links (stacked under title) ────────────────── */
	.timeline-targets {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
	}

	/* ── Up-link for top-level timelines ─────────────────────────── */
	.tl-up-link {
		display: flex;
		justify-content: center;
		align-items: baseline;
		gap: 0.35em;
		margin-bottom: var(--space-6);
		font-family: var(--font-serif);
		font-variant-caps: all-small-caps;
		font-size: var(--text-sm);
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	.tl-up-link:hover {
		color: var(--accent-warm);
	}

	.tl-up-link .up-arrow {
		font-variant: normal;
		letter-spacing: 0;
	}

	/* Non-interactive spine widget (no link, no hover) */
	.spine-widget {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.timeline-target {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		font-weight: 600;
		color: var(--accent);
		text-decoration: none;
		transition: color 200ms ease;
	}

	.timeline-target:hover {
		color: var(--accent-deep);
	}

	.sub-header__subtitle {
		font-family: var(--font-serif);
		font-style: italic;
		color: var(--ink-soft);
		font-size: var(--text-lg);
		margin: 0;
	}

	.sub-header__subtitle :global(p) {
		margin: 0;
	}
</style>
