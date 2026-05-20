<script lang="ts">
	import type { PageData } from './$types';
	import Tag from '$lib/components/Tag.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Alteria</title>
</svelte:head>

<section class="hero">
	<h1>Alteria</h1>
	<p class="tagline">My sacred place of transformation.</p>
	<p class="counter">
		<em>
			{data.totalEntities} entries{#if data.issues > 0}
				· <a class="issues-link" href="/health"
					>{data.issues} {data.issues === 1 ? 'issue' : 'issues'}</a
				>{/if}
		</em>
	</p>
	<div class="lede">
		<p>
			This shall be the name of my collective ideas and creations. This is where my world-building
			stops being restrictive and starts being generative.
		</p>
		<p>
			It contains three words in my mind in one: <em>alternate</em>, <em>alteration</em> and
			<em>altar</em>. Imagining something different, the act of change, and the sacred spirit of it.
			This is the essence around which all my ideas revolve.
		</p>
		<p class="closing">
			Now it&rsquo;s time for them to come home. No more isolated worlds — but one interconnected
			universe.
		</p>
	</div>
</section>

<a class="cognita-callout" href="/cognita">
	<div class="cognita-rule"></div>
	<div class="cognita-body">
		<p class="cognita-eyebrow">Start here</p>
		<p class="cognita-title">Alteria Cognita</p>
		<p class="cognita-sub">
			The mapped territory — what I&rsquo;ve been able to give a place so far. One star, seven
			planets, two layers of being.
		</p>
	</div>
	<div class="cognita-arrow" aria-hidden="true">→</div>
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
		<a class="type-card type-card-everything" href="/everything">
			<div class="rule"></div>
			<div class="label">Everything</div>
			<div class="description">
				One grid for the whole world. Filter by kind or tag, or flatten and skim.
			</div>
			<div class="count">{data.totalEntities}</div>
		</a>
		<a class="type-card type-card-meta" href="/kinds">
			<div class="rule"></div>
			<div class="label">Kinds</div>
			<div class="description">
				The hierarchy of registered kinds — the taxonomy the entities classify themselves into,
				independent of where they sit in the collections.
			</div>
			<div class="count">{data.kindCount}</div>
		</a>
	</div>
</section>

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
		margin-bottom: var(--space-8);
		max-width: var(--prose-max);
	}

	.hero h1 {
		font-size: var(--text-3xl);
		margin: 0 0 var(--space-2);
	}

	.tagline {
		font-style: italic;
		color: var(--ink-soft);
		font-size: var(--text-lg);
		margin: 0 0 var(--space-5);
	}

	.lede {
		color: var(--ink-soft);
		margin: 0;
	}

	.lede p {
		margin: 0 0 var(--space-4);
	}

	.lede p:last-child {
		margin-bottom: 0;
	}

	.lede em {
		font-style: italic;
		color: var(--ink);
	}

	.lede .closing {
		margin-top: var(--space-5);
		color: var(--ink);
	}

	/* ── Alteria Cognita callout — a prominent doorway ───────── */
	.cognita-callout {
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

	.cognita-callout:hover {
		background: var(--parchment-soft);
	}

	.cognita-rule {
		width: 3px;
		align-self: stretch;
		background: var(--accent);
		flex-shrink: 0;
	}

	.cognita-body {
		flex: 1;
	}

	.cognita-eyebrow {
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-1);
	}

	.cognita-title {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		color: var(--ink);
		margin: 0 0 var(--space-2);
		font-style: italic;
	}

	.cognita-callout:hover .cognita-title {
		color: var(--accent);
	}

	.cognita-sub {
		font-size: var(--text-sm);
		color: var(--ink-soft);
		margin: 0;
		line-height: var(--leading-normal);
	}

	.cognita-arrow {
		font-size: var(--text-xl);
		color: var(--ink-faint);
		flex-shrink: 0;
	}

	.cognita-callout:hover .cognita-arrow {
		color: var(--accent);
	}

	.section-heading {
		font-size: var(--text-sm);
		font-variant: small-caps;
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
		font-variant: small-caps;
		letter-spacing: 0.06em;
		margin-top: var(--space-1);
	}

	.description {
		margin-top: var(--space-2);
		font-size: var(--text-sm);
		color: var(--ink-soft);
		font-style: italic;
	}

	.type-card-everything .label {
		font-style: italic;
	}

	.type-card-everything .rule {
		border-top-color: var(--accent-soft, var(--rule));
	}

	/* Same italic + accent-rule treatment as Everything — both
	   are meta views over the whole graph rather than collections
	   of entities. */
	.type-card-meta .label {
		font-style: italic;
	}

	.type-card-meta .rule {
		border-top-color: var(--accent-soft, var(--rule));
	}

	.tags-section {
		margin-bottom: var(--space-8);
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	.counter {
		font-size: var(--text-sm);
		color: var(--ink-faint);
		margin: 0 0 var(--space-5);
		font-variant: small-caps;
		letter-spacing: 0.06em;
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
