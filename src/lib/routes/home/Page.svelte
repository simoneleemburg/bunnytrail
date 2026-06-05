<script lang="ts">
	import type { HomeData } from './load';
	import { page } from '$app/stores';
	import Tag from '$lib/components/Tag.svelte';

	let { data }: { data: HomeData } = $props();

	const world = $derived($page.data.world);
	const ornament = $derived($page.data.ornament);
</script>

<svelte:head>
	<title>{world.name}</title>
</svelte:head>

<section class="hero">
	<!--
		Crest: optional ornament rendered above the world title.
		Worlds opt in by dropping `assets/crest.svg` in their world
		dir; the engine reads it server-side and inlines the markup
		so theme CSS variables / currentColor flow through. Engine
		ships no default crest — a vanilla world reads as a plain
		editorial title-page.
	-->
	{#if data.crest}
		<div class="crest" aria-hidden="true">{@html data.crest}</div>
	{/if}

	<h1 class="hero-title">{world.name}</h1>

	<!--
		Hero divider: a thin rule with a centred ornament between
		two short hairlines. The centrepiece resolves in three
		tiers:
		  1. If the world's ornament.svg is set in world.md, that
		     SVG is inlined here (recolours via currentColor).
		  2. Otherwise, the CSS `::before` content resolves to
		     --ornament-glyph (from ornament.glyph in world.md).
		  3. If neither is set, the divider collapses to two
		     hairlines with an empty gap — still reads as a rule.
	-->
	<div class="bt-fleuron" aria-hidden="true">
		<span class="bt-fleuron__rule"></span>
		{#if ornament.svg}
			<span class="bt-fleuron__glyph bt-fleuron__glyph--svg">{@html ornament.svg}</span>
		{:else}
			<span class="bt-fleuron__glyph"></span>
		{/if}
		<span class="bt-fleuron__rule"></span>
	</div>

	{#if world.tagline}
		<p class="hero-tagline">{world.tagline}</p>
	{/if}

	{#if data.lede}
		<div class="bt-lede">{@html data.lede}</div>
	{:else}
		<div class="bt-lede">
			<p>
				Author <code>content_meta/world.md</code> to set this world&rsquo;s name, tagline, and
				homepage intro. The body of that file is rendered here as the hero lede.
			</p>
		</div>
	{/if}

	<!--
		Colophon: three stacked lines of tracked small-caps, like a
		title-page tally. Lines fold gracefully when the underlying
		tallies are empty (no chapters in this world, no issues), so
		a fresh world reads as a clean two-liner rather than a list
		of zeros.
	-->
	<p class="colophon">
		{data.totalEntities} entities{#if data.issues > 0}
			&ensp;&middot;&ensp;<a class="issues-link" href="/health"
				>{data.issues} {data.issues === 1 ? 'issue' : 'issues'}</a
			>{/if}
	</p>
</section>

<!-- ── Dashboard: two-column layout. Left = guide/sources/notebook callouts;
     Right = tall influence card. Stacks vertically on mobile (influence
     card rendered last in DOM but hoisted to top via order on mobile). -->
<div class="page-wide">
	<div class="dashboard">
		<div class="dashboard-left">
			{#each data.guides as guide (guide.slug)}
				<a class="guide-callout" href={guide.href}>
					<div class="guide-body">
						{#if ornament.guides?.svg}
							<div class="guide-mark" aria-hidden="true">{@html ornament.guides.svg}</div>
						{/if}
						<p class="guide-eyebrow">{guide.eyebrow}</p>
						<p class="guide-title bt-meta-link">{guide.title}</p>
						<p class="guide-sub">{guide.summary}</p>
					</div>
					<div class="guide-arrow bt-meta-link" aria-hidden="true">→</div>
				</a>
			{/each}

			{#if data.sourceProjects.length > 0}
				<!--
					Source projects: out-of-world catalogue of feeder works being
					integrated into the world. Guide/Notebook-style doorway —
					teases by listing the project names so the visitor knows what's
					on the workbench; the full list (with sizes, integration
					bars, entity links) lives at /sources.
				-->
				<a class="sources-callout" href="/sources">
					<div class="sources-body">
						<p class="sources-eyebrow">Workbench</p>
						<p class="sources-title bt-meta-link">Source projects</p>
						<p class="sources-sub">
							{data.sourceProjects.length} feeder works:
							<span class="sources-names">{(() => {
								const titles = data.sourceProjects.map((p) => p.title);
								const shown = titles.slice(0, 3);
								const rest = titles.length - shown.length;
								return shown.join(', ') + (rest > 0 ? `, and ${rest} more` : '');
							})()}.</span>
						</p>
					</div>
					<div class="sources-arrow bt-meta-link" aria-hidden="true">→</div>
				</a>
			{/if}

			<!--
				Notebook callout: a sibling doorway to the author's-room blog,
				in a cooler register than the world's chrome. Same shape as the
				guide callout so the two read as a paired set, but the rule is
				faint and the surface is the notebook tint to signal that this
				is *about* the world rather than *of* it.
			-->
			<a class="notebook-callout" href="/blog">
				<div class="notebook-body">
					<p class="notebook-eyebrow">Working notes</p>
					<p class="notebook-title bt-meta-link">Notebook</p>
					<p class="notebook-sub">
						Author&rsquo;s-room reflections on building {world.name}. Out-of-world; not part of the
						compendium.
					</p>
				</div>
				<div class="notebook-arrow bt-meta-link" aria-hidden="true">→</div>
			</a>
		</div>

		{#if data.influenceCard}
			<!--
				Influences callout: tall vertical card — image fills top portion,
				text (eyebrow, title, creator, epigraph) below. Links to /influences.
				Right column so it reads as the hero visual alongside the left list.
			-->
			<div class="dashboard-right">
				<a class="influence-card" href="/influences">
					{#if data.influenceCard.imageSrc}
						<div class="influence-card__image">
							<img src={data.influenceCard.imageSrc} alt={data.influenceCard.title} />
						</div>
					{:else}
						<div class="influence-card__image influence-card__image--empty" aria-hidden="true"></div>
					{/if}
				<div class="influence-card__body">
					<p class="influence-card__section">My influences</p>
					{#if data.influenceCard.imageComment}
						<p class="influence-card__eyebrow">{data.influenceCard.imageComment}</p>
					{/if}
				<p class="influence-card__title bt-meta-link">
					{data.influenceCard.title}{#if data.influenceCard.creator}&ensp;&middot;&ensp;<span class="influence-card__creator">{data.influenceCard.creator}</span>{/if}
				</p>
				{#if data.influenceCard.epigraph}
					<p class="influence-card__epigraph">{data.influenceCard.epigraph}</p>
				{/if}
				<p class="influence-card__cta bt-meta-link" aria-hidden="true">
						Browse influences →
					</p>
				</div>
				</a>
			</div>
		{/if}
	</div>

	<section class="types">
		<h2 class="section-heading">Collections</h2>
		<div class="grid">
			{#each data.counts as c (c.type)}
				<a class="type-card" href={`/${c.type}`}>
					<div class="label">{c.label}</div>
					{#if c.description}
						<div class="description">{c.description}</div>
					{/if}
					<div class="count">{c.count}</div>
				</a>
			{/each}
		</div>
	</section>

	{#if data.threads.length > 0}
		<section class="threads">
			<h2 class="section-heading">Starting threads</h2>
			<div class="grid">
				{#each data.threads as t (t.type)}
					<a class="type-card type-card-thread" href={`/${t.type}`}>
						<div class="label">{t.label}</div>
						{#if t.description}
							<div class="description">{t.description}</div>
						{/if}
						<div class="count">{t.count}</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.tags.length > 0}
		<section class="tags-section">
			<h2 class="section-heading">Tags</h2>
			<div class="tag-row">
				{#each data.tags as t (t.tag)}
					<Tag label={t.tag} href={`/tags/${encodeURIComponent(t.tag)}`} />
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.hero {
		margin: var(--space-6) auto var(--space-8);
		max-width: var(--prose-max);
		text-align: center;
	}

	.crest {
		display: flex;
		justify-content: center;
		color: var(--accent-warm);
		margin: 0 0 var(--space-5);
	}

	.hero-title {
		font-family: var(--font-display);
		font-size: clamp(2rem, 10vw, var(--text-4xl));
		font-weight: 400;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		text-indent: 0.18em; /* compensate for the trailing tracking */
		margin: 0;
		line-height: 1.05;
		max-width: 100%;
		background: linear-gradient(
			180deg,
			var(--ink) 0%,
			var(--accent-warm) 55%,
			var(--accent-deep) 100%
		);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.hero-tagline {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.22em;
		color: var(--ink-soft);
		margin: 0 0 var(--space-6);
	}

	.bt-lede {
		font-size: var(--text-lg);
		text-align: left;
		margin: 0 auto;
	}

	.bt-lede p {
		margin: 0 0 var(--space-4);
	}

	.bt-lede p:last-child {
		margin-bottom: 0;
	}

	.bt-lede :global(em) {
		font-style: italic;
		color: var(--ink);
	}

	.bt-lede :global(.closing) {
		margin-top: var(--space-5);
		color: var(--ink);
	}

	/* ── Wide page canvas for dashboard + sections below hero ── */
	.page-wide {
		max-width: 72rem;
		margin-left: auto;
		margin-right: auto;
	}

	/* ── Dashboard: two-column grid.
	   Left column (~1fr): stacked guide/sources/notebook callouts.
	   Right column (~1.5fr): tall influence card.
	   Collapses to single column on mobile; influence card comes first
	   visually on mobile via `order`. */
	.dashboard {
		display: grid;
		grid-template-columns: 1fr 1.5fr;
		gap: var(--space-6);
		margin-bottom: var(--space-8);
		align-items: stretch;
	}

	.dashboard-left {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* Each card in the left column grows equally to fill the column height,
	   so the left stack always matches the influence card on the right. */
	.dashboard-left > * {
		flex: 1;
	}

	.dashboard-right {
		display: flex;
		flex-direction: column;
	}

	/* ── Guide callout — a prominent featured doorway to a content-authored
	   guide (tour, "start here", landing page). Repeated once per
	   registered guide. Top+left borders thicker (2px) in muted copper,
	   right+bottom hairline — corner-bracket idiom that reads as an entrance.
	   Optional guide-mark ornament sits above the body text. */
	.guide-callout {
		display: flex;
		align-items: flex-start;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-6);
		text-decoration: none;
		color: inherit;
		background: var(--vellum);
		border-top: 2px solid color-mix(in oklab, var(--accent) 40%, var(--rule));
		border-left: 2px solid color-mix(in oklab, var(--accent) 40%, var(--rule));
		border-right: 1px solid color-mix(in oklab, var(--accent) 40%, var(--rule));
		border-bottom: 1px solid color-mix(in oklab, var(--accent) 40%, var(--rule));
		border-radius: var(--radius-sm);
		transition:
			background-color 250ms ease,
			box-shadow 250ms ease,
			transform 250ms ease;
	}

	.guide-callout:hover {
		background: color-mix(in oklab, var(--accent-meta) 5%, var(--parchment));
		box-shadow:
			0 1px 1px rgba(120, 90, 60, 0.04),
			0 4px 14px -8px rgba(120, 90, 60, 0.10);
		transform: translateY(-1px);
	}

	/* Optional ornamental mark from ornament.guides.svg. Inlined SVG
	   colours via currentColor so --accent-warm flows through.
	   align-self: flex-start keeps it left-anchored with the body text
	   rather than stretching full-width. */
	.guide-mark {
		display: flex;
		color: var(--accent-warm);
		margin-bottom: var(--space-3);
	}

	.guide-mark :global(svg) {
		height: 2rem;
		width: auto;
		display: block;
	}

	.guide-body {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.guide-eyebrow {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-1);
	}

	.guide-title {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		color: var(--ink);
		margin: 0 0 var(--space-2);
		font-style: italic;
		/* Gradient parked off-screen; background-clip:text set so worlds
		   can trigger a gleam sweep on hover via @keyframes in theme.css
		   without touching engine code — same hook as .card-link in EntityCard. */
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

	.guide-callout:hover .guide-title {
		color: var(--accent-meta);
	}

	.guide-sub {
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
		margin: 0;
		line-height: var(--leading-normal);
	}

	.guide-arrow {
		font-size: var(--text-xl);
		color: var(--accent);
		flex-shrink: 0;
	}

	.guide-callout:hover .guide-arrow {
		color: var(--accent-meta);
	}


	/* ── Notebook callout — quieter sibling to the guide doorway.
	   Solid border and vellum background; display-italic title for
	   visual consistency with guide register but clearly secondary. */
	.notebook-callout {
		display: flex;
		align-items: flex-start;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-6);
		text-decoration: none;
		color: inherit;
		background: var(--vellum);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		transition: background-color 0.2s ease;
	}

	.notebook-callout:hover {
		background: color-mix(in oklab, var(--accent-meta) 5%, var(--parchment));
	}

	.notebook-body {
		flex: 1;
	}

	.notebook-eyebrow {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-1);
	}

	.notebook-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-xl);
		color: var(--ink);
		margin: 0 0 var(--space-2);
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

	.notebook-callout:hover .notebook-title {
		color: var(--accent-meta);
	}

	.notebook-sub {
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
		margin: 0;
		line-height: var(--leading-normal);
	}

	.notebook-arrow {
		font-size: var(--text-xl);
		color: var(--ink-faint);
		flex-shrink: 0;
	}

	.notebook-callout:hover .notebook-arrow {
		color: var(--accent-meta);
	}

	/* ── Source projects callout — out-of-world workbench doorway.
	   Solid border and vellum background matches notebook callout;
	   display-italic title; italic summary for register consistency. */
	.sources-callout {
		display: flex;
		align-items: flex-start;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-6);
		text-decoration: none;
		color: inherit;
		background: var(--vellum);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		transition: background-color 0.2s ease;
	}

	.sources-callout:hover {
		background: color-mix(in oklab, var(--accent-meta) 5%, var(--parchment));
	}

	.sources-body {
		flex: 1;
		min-width: 0;
	}

	.sources-eyebrow {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-1);
	}

	.sources-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-xl);
		color: var(--ink);
		margin: 0 0 var(--space-2);
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

	.sources-callout:hover .sources-title {
		color: var(--accent-meta);
	}

	.sources-sub {
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
		margin: 0;
		line-height: var(--leading-normal);
	}

	.sources-names {
		font-style: italic;
		color: var(--ink);
	}

	.sources-arrow {
		font-size: var(--text-xl);
		color: var(--ink-faint);
		flex-shrink: 0;
	}

	.sources-callout:hover .sources-arrow {
		color: var(--accent-meta);
	}

	/* ── Influence card — tall vertical card occupying the right column.
	   Image fills the top ~65% of the card; text (eyebrow, title, creator,
	   epigraph) sits below. The whole card links to /influences. */
	.influence-card {
		display: flex;
		flex-direction: column;
		height: 100%;
		text-decoration: none;
		color: inherit;
		background: color-mix(in oklab, var(--parchment-soft) 30%, white);
		border-radius: var(--radius-sm);
		overflow: hidden;
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--rule-hair) 60%, transparent);
		transition: box-shadow 0.2s ease;
	}

	.influence-card:hover {
		background: color-mix(in oklab, var(--accent-meta) 5%, var(--parchment));
		box-shadow:
			0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent),
			0 8px 24px -12px rgba(120, 90, 60, 0.14);
	}

	.influence-card__image {
		flex: 1 1 0;
		overflow: hidden;
		background: var(--parchment-soft);
		min-height: 10rem;
	}

	.influence-card__body {
		flex: 0 0 auto;
		padding: var(--space-4) var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.influence-card__image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 0.4s ease;
	}

	.influence-card:hover .influence-card__image img {
		transform: scale(1.03);
	}

	/* Placeholder when no image is set — renders as a tinted block */
	.influence-card__image--empty {
		background: color-mix(in oklab, var(--accent) 8%, var(--parchment-soft));
	}

	.influence-card__section {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-1);
	}

	.influence-card__eyebrow {
		font-size: var(--text-sm);
		font-family: var(--font-author);
		color: var(--ink-soft);
		margin: 0 0 var(--space-2);
		line-height: var(--leading-normal);
	}

	.influence-card__title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-lg);
		color: var(--ink);
		margin: 0;
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

	.influence-card__creator {
		font-style: normal;
		font-size: var(--text-sm);
	}

	.influence-card__title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-xl);
		color: var(--ink);
		margin: 0;
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

	.influence-card:hover .influence-card__title {
		color: var(--accent-meta);
	}

	.influence-card__creator {
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
		margin: 0;
	}

	.influence-card__epigraph {
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
		margin: 0;
		line-height: var(--leading-normal);
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
	}

	.influence-card__cta {
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
		color: var(--ink-faint);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		transition: color 0.15s ease;
	}

	.influence-card:hover .influence-card__cta {
		color: var(--accent-meta);
	}

	.section-heading {
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		font-weight: 500;
		margin: 0 0 var(--space-4);
		font-family: var(--font-serif);
	}

	.types {
		margin-bottom: var(--space-8);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: var(--space-5);
	}

	/* ── Type cards (Collections + Starting threads) — each card now
	   has a vellum background, border-radius, and padding. The top
	   border acts as the former hairline rule but in context with the
	   card surface. Hover bumps to parchment-soft and --accent top border. */
	.type-card {
		display: block;
		padding: var(--space-3) var(--space-4);
		text-decoration: none;
		color: inherit;
		background: var(--vellum);
		border-radius: var(--radius-sm);
		border-top: 2px solid var(--rule);
		transition:
			background-color 0.2s ease,
			border-top-color 0.2s ease;
	}

	.type-card:hover {
		background: var(--parchment-soft);
		border-top-color: var(--accent);
	}

	.label {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		color: var(--ink);
		margin-top: var(--space-2);
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

	.type-card:hover .label {
		color: var(--accent);
	}

	.count {
		font-size: var(--text-sm);
		color: var(--ink-soft);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		margin-top: var(--space-1);
	}

	.description {
		margin-top: var(--space-2);
		font-size: var(--text-sm);
		color: var(--ink-soft);
		font-style: italic;
	}

	.type-card-thread .label {
		font-style: italic;
	}

	.threads {
		margin-bottom: var(--space-8);
	}

	.tags-section {
		margin-bottom: var(--space-8);
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	/* Title-page colophon: single centered tally line. */
	.colophon {
		margin: var(--space-7) auto 0;
		text-align: center;
		font-family: var(--font-serif);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.18em;
		font-size: var(--text-sm);
		color: var(--ink-faint);
	}

	/* The "N issues" segment of the counter is itself a link to the
	   health dashboard. Borrow the counter's small-caps register so
	   the row reads as one editorial label; underline-on-hover signals
	   the link without making it shout. */
	.issues-link {
		color: inherit;
		text-decoration: none;
		border-bottom: 1px dotted currentColor;
	}

	.issues-link:hover {
		color: var(--accent);
	}

	/* ── Mobile: single column, influence card hoisted above left-column list */
	@media (max-width: 48rem) {
		.dashboard {
			grid-template-columns: 1fr;
		}

		.dashboard-right {
			order: -1;
		}

		.influence-card {
			min-height: 22rem;
		}
	}
</style>
