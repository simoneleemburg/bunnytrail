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
<article class="bt-notebook">
	<nav class="bt-notebook__frame" aria-label="Notebook navigation">
		<a href="/">↑ {page.data.world.shortName}</a>
		<span aria-hidden="true"> · </span>
		<a href="/blog">↩ Notebook</a>
	</nav>

	<header class="head">
		<p class="bt-notebook__eyebrow">Working notes</p>
		<h1 class="bt-notebook__title">{data.title}</h1>
		<p class="date">{data.dateLabel}</p>
		{#if data.tags.length > 0}
			<div class="tags">
				{#each data.tags as tag (tag)}
					<Tag label={tag} />
				{/each}
			</div>
		{/if}
	</header>

	<div class="bt-prose bt-notebook__prose">
		<!-- Trusted: html is rendered server-side from in-repo markdown. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html data.html}
	</div>
</article>

<style>
	.head {
		margin: var(--space-6) 0;
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

	/* Author voice: prose body uses the handwritten-feeling manuscript
	   face so blog entries read as personal field-notes rather than
	   world compendium entries. Headings stay in --font-display for
	   hierarchy; only prose text nodes get the author register. */
	.bt-notebook__prose :global(p),
	.bt-notebook__prose :global(li),
	.bt-notebook__prose :global(blockquote) {
		font-family: var(--font-author);
	}
</style>
