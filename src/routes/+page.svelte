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

{#if data.tags.length > 0}
	<section class="tags-section">
		<h2 class="section-heading">Tags</h2>
		<div class="tag-row">
			{#each data.tags as t (t.tag)}
				<Tag label={t.tag} href={`/browse?tag=${encodeURIComponent(t.tag)}`} />
			{/each}
		</div>
	</section>
{/if}

<p class="colophon">
	<em>
		{data.totalEntities} entries{#if data.issues > 0}
			· {data.issues} broken links{/if}
	</em>
</p>

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

	.tags-section {
		margin-bottom: var(--space-8);
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	.colophon {
		color: var(--ink-faint);
		font-size: var(--text-sm);
		text-align: center;
		margin-top: var(--space-8);
	}
</style>
