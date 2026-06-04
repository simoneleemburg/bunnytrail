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

<article class="influence-detail">
	<div class="influence-nav" role="navigation" aria-label="Influences navigation">
		<a class="influence-nav__back" href="/influences">← Influences</a>
		<a class="influence-nav__home" href="/">
			<span class="influence-nav__arrow" aria-hidden="true">↑</span>{page.data.world.shortName}
		</a>
	</div>

	<header class="influence-head">
		<div class="title-row">
			<h1 class="influence-title">{data.title}</h1>
			{#if data.kind !== null}
				<span class="kind-chip">{data.kind}</span>
			{/if}
		</div>
		{#if data.creator !== null || data.year !== null}
			<p class="influence-meta">
				{[data.creator, data.year].filter(Boolean).join(' · ')}
			</p>
		{/if}
	</header>

	<div class="bt-fleuron influence-fleuron" aria-hidden="true">
		<span class="bt-fleuron__rule"></span>
		<span class="bt-fleuron__glyph"></span>
		<span class="bt-fleuron__rule"></span>
	</div>

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
			<div class="bt-prose influence-prose">
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
	.influence-detail {
		max-width: 44rem;
		margin: 0 auto;
		padding: var(--space-8) var(--space-4);
		--fleuron-glyph-color: var(--accent-meta);
	}

	/* Nav row: ↑ Home centred, ← Back left-anchored.
	   Uses position:relative + absolute for the back link so it
	   doesn't disturb the centred home link's flow. */
	.influence-nav {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: baseline;
		margin-bottom: var(--space-4);
	}

	.influence-nav__home {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	.influence-nav__home:hover {
		color: var(--accent-meta);
	}

	.influence-nav__arrow {
		font-variant: normal;
		letter-spacing: 0;
		margin-right: 0.35em;
	}

	.influence-nav__back {
		position: absolute;
		left: 0;
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	.influence-nav__back:hover {
		color: var(--accent-meta);
	}

	.influence-head {
		text-align: center;
		margin-bottom: var(--space-6);
	}

	.title-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: flex-start;
		gap: 0 0.7em;
		margin: 0 0 var(--space-3);
	}

	.influence-title {
		margin: 0;
		font-size: var(--text-3xl);
		color: var(--ink);
	}

	.kind-chip {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		font-weight: 600;
		color: var(--accent-deep);
		margin-top: 0.85em;
	}

	.influence-fleuron {
		margin: var(--space-6) auto;
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
