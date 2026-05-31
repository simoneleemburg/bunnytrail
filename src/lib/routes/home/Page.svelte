<script lang="ts">
	import type { HomeData } from './load';
	import { page } from '$app/stores';
	import Tag from '$lib/components/Tag.svelte';

	let { data }: { data: HomeData } = $props();

	const world = $derived($page.data.world);
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

	<div class="hero-fleuron" aria-hidden="true">
		<span class="fleuron-rule"></span>
		<span class="fleuron-glyph">❦</span>
		<span class="fleuron-rule"></span>
	</div>

	{#if world.tagline}
		<p class="hero-tagline">{world.tagline}</p>
	{/if}

	{#if data.lede}
		<div class="lede">{@html data.lede}</div>
	{:else}
		<div class="lede">
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
	<dl class="colophon">
		<div class="colophon-line">
			<dt>{data.totalEntities} entries</dt>
			<dd>{data.entitiesWithProse} with prose</dd>
		</div>
		{#if data.totalChapters > 0}
			<div class="colophon-line">
				<dt>{data.totalChapters} chapters</dt>
				<dd>across {data.workCount} {data.workCount === 1 ? 'work' : 'works'}</dd>
			</div>
		{/if}
		<div class="colophon-line">
			<dt>{data.kindCount} kinds</dt>
			<dd>
				{data.kindsWithProse} documented &middot; {data.collectionCount} collections{#if data.issues > 0}
					&middot; <a class="issues-link" href="/health"
						>{data.issues} {data.issues === 1 ? 'issue' : 'issues'}</a
					>{/if}
			</dd>
		</div>
	</dl>
</section>

{#each data.guides as guide (guide.slug)}
	<a class="guide-callout" href={guide.href}>
		<div class="guide-rule"></div>
		<div class="guide-body">
			<p class="guide-eyebrow">{guide.eyebrow}</p>
			<p class="guide-title">{guide.title}</p>
			<p class="guide-sub">{guide.summary}</p>
		</div>
		<div class="guide-arrow" aria-hidden="true">→</div>
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
		<div class="sources-rule"></div>
		<div class="sources-body">
			<p class="sources-eyebrow">Workbench</p>
			<p class="sources-title">Source projects</p>
			<p class="sources-sub">
				The {data.sourceProjects.length} feeder works being absorbed into {world.name}:
				<span class="sources-names">
					{data.sourceProjects.map((p) => p.title).join(', ')}.
				</span>
			</p>
		</div>
		<div class="sources-arrow" aria-hidden="true">→</div>
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
	<div class="notebook-rule"></div>
	<div class="notebook-body">
		<p class="notebook-eyebrow">Working notes</p>
		<p class="notebook-title">Notebook</p>
		<p class="notebook-sub">
			Author&rsquo;s-room reflections on building {world.name}. Out-of-world; not part of the
			compendium.
		</p>
	</div>
	<div class="notebook-arrow" aria-hidden="true">→</div>
</a>

<section class="types">
	<h2 class="section-heading">Collections</h2>
	<div class="grid">
		{#each data.counts as c (c.type)}
			<a class="type-card" href={`/${c.type}`}>
				<div class="rule"></div>
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
			<a class="type-card type-card-thread" href="/everything">
				<div class="rule"></div>
				<div class="label">Everything</div>
				<div class="description">
					One grid for the whole world. Filter by kind or tag, or flatten and skim.
				</div>
				<div class="count">{data.totalEntities}</div>
			</a>
			{#each data.threads as t (t.type)}
				<a class="type-card type-card-thread" href={`/${t.type}`}>
					<div class="rule"></div>
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
		font-size: var(--text-4xl);
		font-weight: 400;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		text-indent: 0.18em; /* compensate for the trailing tracking */
		margin: 0;
		line-height: 1.05;
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

	.hero-fleuron {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		margin: var(--space-4) auto var(--space-3);
		max-width: 14rem;
	}

	.fleuron-rule {
		flex: 1;
		height: 1px;
		background: var(--rule);
	}

	.fleuron-glyph {
		font-family: var(--font-display);
		color: var(--accent-warm);
		font-size: var(--text-base);
		line-height: 1;
	}

	.hero-tagline {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.22em;
		color: var(--ink-soft);
		margin: 0 0 var(--space-6);
	}

	.lede {
		color: var(--ink-soft);
		font-size: var(--text-lg);
		font-style: italic;
		line-height: var(--leading-relaxed);
		text-align: left;
		margin: 0 auto;
	}

	.lede p {
		margin: 0 0 var(--space-4);
	}

	.lede p:last-child {
		margin-bottom: 0;
	}

	.lede :global(em) {
		font-style: italic;
		color: var(--ink);
	}

	.lede :global(.closing) {
		margin-top: var(--space-5);
		color: var(--ink);
	}

	/* ── Guide callout — a prominent doorway to a content-authored
	   guide (tour, "start here", landing page). Repeated once per
	   registered guide. */
	.guide-callout {
		display: flex;
		align-items: center;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-6);
		margin: 0 0 var(--space-8);
		text-decoration: none;
		color: inherit;
		background: var(--vellum);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		transition: background-color 0.2s ease;
	}

	.guide-callout:hover {
		background: var(--parchment-soft);
	}

	.guide-rule {
		width: 3px;
		align-self: stretch;
		background: var(--accent);
		flex-shrink: 0;
	}

	.guide-body {
		flex: 1;
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
	}

	.guide-callout:hover .guide-title {
		color: var(--accent);
	}

	.guide-sub {
		font-size: var(--text-sm);
		color: var(--ink-soft);
		margin: 0;
		line-height: var(--leading-normal);
	}

	.guide-arrow {
		font-size: var(--text-xl);
		color: var(--ink-faint);
		flex-shrink: 0;
	}

	.guide-callout:hover .guide-arrow {
		color: var(--accent);
	}

	/* ── Notebook callout — quieter sibling to the guide doorway.
	   Notebook tint (cool, dashed) so the visual register tracks the
	   blog/craft-sheet idiom, marking this as out-of-world. */
	.notebook-callout {
		display: flex;
		align-items: center;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-6);
		margin: 0 0 var(--space-8);
		text-decoration: none;
		color: inherit;
		background: color-mix(in oklab, var(--ink) 4%, var(--page) 96%);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-sm);
		transition: background-color 0.2s ease;
	}

	.notebook-callout:hover {
		background: color-mix(in oklab, var(--ink) 7%, var(--page) 93%);
	}

	.notebook-rule {
		width: 3px;
		align-self: stretch;
		background: var(--rule);
		flex-shrink: 0;
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
		font-family: var(--font-sans, var(--font-serif));
		font-weight: 600;
		font-size: var(--text-xl);
		color: var(--ink);
		margin: 0 0 var(--space-2);
	}

	.notebook-callout:hover .notebook-title {
		color: var(--accent);
	}

	.notebook-sub {
		font-size: var(--text-sm);
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
		color: var(--accent);
	}

	/* ── Source projects callout — out-of-world workbench doorway.
	   Mirrors the Notebook callout (notebook tint, dashed border)
	   since both are author's-room material; the third sibling in
	   the homepage doorway stack. The names are listed inline as a
	   tease so the visitor sees what's on the workbench without
	   leaving the page. */
	.sources-callout {
		display: flex;
		align-items: center;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-6);
		margin: 0 0 var(--space-8);
		text-decoration: none;
		color: inherit;
		background: color-mix(in oklab, var(--ink) 4%, var(--page) 96%);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-sm);
		transition: background-color 0.2s ease;
	}

	.sources-callout:hover {
		background: color-mix(in oklab, var(--ink) 7%, var(--page) 93%);
	}

	.sources-rule {
		width: 3px;
		align-self: stretch;
		background: var(--rule);
		flex-shrink: 0;
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
		font-family: var(--font-sans, var(--font-serif));
		font-weight: 600;
		font-size: var(--text-xl);
		color: var(--ink);
		margin: 0 0 var(--space-2);
	}

	.sources-callout:hover .sources-title {
		color: var(--accent);
	}

	.sources-sub {
		font-size: var(--text-sm);
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
		color: var(--accent);
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

	.type-card {
		display: block;
		padding: var(--space-4) 0;
		text-decoration: none;
		color: inherit;
	}

	.type-card .rule {
		border-top: var(--rule-thin);
		margin-bottom: var(--space-3);
	}

	.label {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		color: var(--ink);
	}

	.type-card:hover .label {
		color: var(--accent);
	}

	.count {
		font-size: var(--text-sm);
		color: var(--ink-faint);
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

	/* Title-page colophon: each row is a tally — strong key in
	   tracked small-caps, faded gloss in italic serif. Stacked,
	   centered, separated by hair rules so it reads as the printer's
	   note on the inside cover. */
	.colophon {
		margin: var(--space-7) auto 0;
		max-width: 28rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		text-align: center;
		color: var(--ink-faint);
	}

	.colophon-line {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		padding-top: var(--space-3);
		border-top: 1px solid var(--rule-hair);
	}

	.colophon-line:first-child {
		border-top: none;
		padding-top: 0;
	}

	.colophon dt {
		font-family: var(--font-display);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.22em;
		font-size: var(--text-base);
		color: var(--ink-soft);
		margin: 0;
	}

	.colophon dd {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		color: var(--ink-faint);
		margin: 0;
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
</style>
