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
	<p class="tagline">My sacred universe of imagination.</p>
	<p class="counter">
		<em>
			{data.totalEntities} entries ({data.entitiesWithProse} with prose){#if data.totalChapters > 0}
				· {data.totalChapters} chapters across {data.workCount}
				{data.workCount === 1 ? 'work' : 'works'}{/if} · {data.kindCount} kinds ({data.kindsWithProse}
			documented) · {data.collectionCount} collections{#if data.issues > 0}
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

<!--
	Notebook callout: a sibling doorway to the author's-room blog,
	in a cooler register than the world's chrome. Same shape as the
	Cognita callout so the two read as a paired set, but the rule
	is faint and the surface is the notebook tint to signal that
	this is *about* Alteria rather than *of* it.
-->
<a class="notebook-callout" href="/blog">
	<div class="notebook-rule"></div>
	<div class="notebook-body">
		<p class="notebook-eyebrow">Working notes</p>
		<p class="notebook-title">Notebook</p>
		<p class="notebook-sub">
			Author&rsquo;s-room reflections on building Alteria. Out-of-world; not part of the compendium.
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

	/* ── Notebook callout — quieter sibling to the Cognita doorway.
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
		font-variant: small-caps;
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
