<script lang="ts">
	import { page } from '$app/state';
	import type { BlogPostData } from './load';
	import Tag from '$lib/components/Tag.svelte';

	let { data }: { data: BlogPostData } = $props();
</script>

<svelte:head>
	<title>{data.title} · Notebook · {page.data.world.shortName}</title>
</svelte:head>

<!--
	Single notebook post. Visually mirrors the craft sheet so
	the author's-room register is recognisable at a glance —
	cool tinted surface, dashed frame, sans-serif title —
	distinct from the warm in-world chrome of the compendium.
-->
<article class="notebook">
	<nav class="frame" aria-label="Notebook navigation">
		<a class="back" href="/blog">↩ Notebook</a>
	</nav>

	<header class="head">
		<p class="eyebrow">Working notes</p>
		<h1 class="title">{data.title}</h1>
		<p class="date">{data.dateLabel}</p>
		{#if data.tags.length > 0}
			<div class="tags">
				{#each data.tags as tag (tag)}
					<Tag label={tag} />
				{/each}
			</div>
		{/if}
	</header>

	<div class="prose">
		<!-- Trusted: html is rendered server-side from in-repo markdown. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html data.html}
	</div>
</article>

<style>
	/* Shared notebook surface — identical to .craft in
	   CraftPage.svelte so notebook posts and craft sheets
	   read as the same author's-room artefact. */
	.notebook {
		max-width: var(--prose-max);
		margin: 0 auto;
		padding: var(--space-6) var(--space-6) var(--space-7);
		background: color-mix(in oklab, var(--ink) 4%, var(--page) 96%);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-sm);
		color: var(--ink);
	}

	@media (max-width: 40rem) {
		.notebook {
			padding: var(--space-5) var(--space-4) var(--space-6);
		}
	}

	.frame {
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		padding-bottom: var(--space-3);
		border-bottom: 1px dashed var(--rule);
	}

	.frame a {
		color: inherit;
		text-decoration: none;
	}

	.frame a:hover {
		color: var(--accent);
	}

	.head {
		margin: var(--space-6) 0;
	}

	.eyebrow {
		margin: 0 0 var(--space-2);
		font-variant: small-caps;
		letter-spacing: 0.14em;
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}

	.title {
		margin: 0 0 var(--space-3);
		font-family: var(--font-sans, var(--font-serif));
		font-weight: 600;
		font-size: var(--text-2xl);
		line-height: var(--leading-tight);
		color: var(--ink);
	}

	.date {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--ink-soft);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.prose {
		color: var(--ink);
	}

	.prose :global(h2) {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: var(--space-6) 0 var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px dashed var(--rule);
		color: var(--ink);
	}

	.prose :global(h3) {
		font-size: var(--text-base);
		font-weight: 600;
		margin: var(--space-5) 0 var(--space-2);
		color: var(--ink);
	}

	.prose :global(p),
	.prose :global(ul),
	.prose :global(ol) {
		margin: 0 0 var(--space-4);
	}

	.prose :global(ul),
	.prose :global(ol) {
		padding-left: var(--space-5);
	}

	.prose :global(li) {
		margin: 0 0 var(--space-2);
	}

	.prose :global(blockquote) {
		margin: var(--space-4) 0;
		padding-left: var(--space-4);
		border-left: 2px solid var(--rule);
		color: var(--ink-soft);
		font-style: italic;
	}

	.prose :global(em) {
		color: var(--ink-soft);
	}
</style>
