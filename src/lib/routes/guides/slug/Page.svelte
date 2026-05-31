<script lang="ts">
	import { page } from '$app/state';
	import type { GuideData } from './load';

	let { data }: { data: GuideData } = $props();
</script>

<svelte:head>
	<title>{data.title} · {page.data.world.shortName}</title>
</svelte:head>

<!--
	A single guide. Visually warm in-world chrome (matches the
	compendium pages, distinct from the cool author's-room
	register used for blog posts and craft sheets).

	The body is full markdown with wikilinks resolved against the
	graph and inline-SVG figures (maps) auto-styled.
-->
<article class="guide">
	<header>
		<p class="eyebrow">{data.eyebrow}</p>
		<h1>{data.title}</h1>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<p class="lede">{@html data.summaryHtml}</p>
	</header>

	<div class="prose">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html data.html}
	</div>
</article>

<style>
	.guide {
		max-width: var(--page-max);
		margin: 0 auto;
	}

	header {
		max-width: var(--prose-max);
		margin: 0 auto var(--space-7);
		text-align: center;
	}

	.eyebrow {
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-3);
	}

	header h1 {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		margin: 0 0 var(--space-5);
	}

	.lede {
		color: var(--ink-soft);
		text-align: left;
		margin: 0;
		line-height: var(--leading-relaxed);
		font-style: italic;
	}

	/* The body. Prose lines stay narrow and centered; inline-svg
	   figures break out to their own (wider) max-widths set in
	   the world's inline-svg.css. */
	.prose {
		color: var(--ink);
	}

	.prose :global(p),
	.prose :global(ul),
	.prose :global(ol),
	.prose :global(dl),
	.prose :global(blockquote) {
		max-width: var(--prose-max);
		margin-left: auto;
		margin-right: auto;
	}

	.prose :global(p),
	.prose :global(ul),
	.prose :global(ol),
	.prose :global(dl) {
		margin-top: 0;
		margin-bottom: var(--space-4);
		line-height: var(--leading-relaxed);
	}

	.prose :global(h2) {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 500;
		text-align: center;
		max-width: var(--prose-max);
		margin: var(--space-8) auto var(--space-5);
		padding-top: var(--space-6);
		border-top: 1px solid var(--rule);
	}

	.prose :global(h3) {
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		font-weight: 500;
		font-family: var(--font-serif);
		max-width: var(--prose-max);
		margin: var(--space-6) auto var(--space-3);
		text-align: center;
	}

	.prose :global(ul),
	.prose :global(ol) {
		padding-left: var(--space-5);
	}

	/* Definition lists — used in the cognita guide for the
	   legend blocks beneath each map. */
	.prose :global(dl) {
		padding: var(--space-6) var(--space-7);
		background: var(--parchment-soft);
		border: 1px solid var(--rule);
		border-radius: 2px;
	}

	.prose :global(dt) {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-style: italic;
		color: var(--ink);
		margin: var(--space-5) 0 var(--space-2);
	}

	.prose :global(dt:first-of-type) {
		margin-top: 0;
	}

	.prose :global(dd) {
		margin: 0;
		color: var(--ink-soft);
		line-height: var(--leading-relaxed);
	}
</style>
