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
	<p class="tagline">A field-notebook of worlds.</p>
	<p class="lede">
		A private compendium of characters, places, factions and ideas — gathered slowly, like
		marginalia in an old folio. Entries cross-reference one another; tags and connections form the
		map. Begin anywhere.
	</p>
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
