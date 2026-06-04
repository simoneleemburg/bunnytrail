<script lang="ts">
	import { page } from '$app/state';
	import type { InfluenceDetailData } from './load';

	let { data }: { data: InfluenceDetailData } = $props();

	const hasContent = $derived(
		data.illustrations.length > 0 || data.epigraph !== null || data.bodyHtml !== null
	);
</script>

<svelte:head>
	<title>{data.title} · {page.data.world.shortName}</title>
</svelte:head>

<!--
	Single influence detail page. Notebook register — cool tinted
	surface, dashed frame — matching the gallery index at /influences.
-->
<article class="bt-notebook">
	<nav class="bt-notebook__frame" aria-label="Influences navigation">
		<a href="/">↑ {page.data.world.shortName}</a>
		<span aria-hidden="true"> · </span>
		<a href="/influences">← Influences</a>
	</nav>

	<header class="head">
		<p class="bt-notebook__eyebrow">{data.kind ?? 'Influence'}</p>
		<h1 class="bt-notebook__title">{data.title}</h1>
		{#if data.creator !== null || data.year !== null}
			<p class="influence-meta">
				{[data.creator, data.year].filter(Boolean).join(' · ')}
			</p>
		{/if}
	</header>

	{#if hasContent}
		{#if data.epigraph !== null}
			<blockquote class="influence-epigraph">
				{data.epigraph}
			</blockquote>
		{/if}

		{#each data.illustrations as ill, i (i)}
			{#if ill.imageSrc !== null}
				<figure class="influence-figure">
					<div class="influence-image">
						<img src={ill.imageSrc} alt={data.title} />
					</div>
					{#if ill.comment !== null}
						<figcaption class="influence-comment">{ill.comment}</figcaption>
					{/if}
				</figure>
			{/if}
		{/each}

		{#if data.bodyHtml !== null}
			<div class="bt-prose bt-notebook__prose">
				<!-- Trusted: html is rendered server-side from in-repo markdown. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html data.bodyHtml}
			</div>
		{/if}
	{:else}
		<p class="no-details"><em>No further details recorded.</em></p>
	{/if}
</article>

<style>
	.head {
		margin: var(--space-6) 0;
	}

	.influence-meta {
		margin: 0;
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
	}

	/* Pull-quote style epigraph — prominent left border in the
	   accent colour, generous padding, larger italic text. */
	.influence-epigraph {
		border-left: 3px solid var(--accent);
		padding: var(--space-3) var(--space-4);
		margin: var(--space-5) 0;
		font-size: var(--text-lg);
		font-style: italic;
		color: var(--ink-soft);
		line-height: var(--leading-relaxed);
	}

	/* Each illustration is a figure: framed image + optional
	   personal comment as figcaption. Multiple figures stack
	   vertically with space between them. */
	.influence-figure {
		margin: var(--space-5) 0;
	}

	.influence-image {
		border: 1px solid var(--rule-hair);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.influence-image img {
		width: 100%;
		display: block;
	}

	.influence-comment {
		margin: var(--space-2) 0 0;
		font-size: var(--text-sm);
		font-family: var(--font-author);
		color: var(--ink-soft);
		line-height: var(--leading-normal);
		padding-left: var(--space-1);
	}

	.no-details {
		margin: 0;
		color: var(--ink-soft);
	}
</style>
