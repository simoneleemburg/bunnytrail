<script lang="ts">
	import { page } from '$app/state';
	import type { GuidesIndexData } from './load';

	let { data }: { data: GuidesIndexData } = $props();

	const ornament = $derived(page.data.ornament);
	const guideMark = $derived(ornament.guides.svg ?? ornament.svg);
</script>

<svelte:head>
	<title>Guides · {page.data.world.shortName}</title>
</svelte:head>

<section class="guides-index">
	<header class="head">
		<p class="eyebrow">Start here</p>
		<h1>{page.data.world.shortName}</h1>
	</header>

	<div class="bt-fleuron" aria-hidden="true">
		<span class="bt-fleuron__rule"></span>
		{#if guideMark}
			<span class="bt-fleuron__glyph bt-fleuron__glyph--svg">{@html guideMark}</span>
		{:else}
			<span class="bt-fleuron__glyph"></span>
		{/if}
		<span class="bt-fleuron__rule"></span>
	</div>

	{#if data.guides.length === 0}
		<p class="empty">No guides yet.</p>
	{:else}
		<ul class="guide-list">
			{#each data.guides as guide (guide.slug)}
				<li class="guide-entry">
					<a class="guide-link" href={`/guides/${guide.slug}`}>
						<p class="guide-eyebrow">{guide.eyebrow}</p>
						<h2 class="guide-title">{guide.title}</h2>
						{#if guide.summary}
							<p class="guide-summary">{guide.summary}</p>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.guides-index {
		max-width: var(--page-max);
		margin: 0 auto;
	}

	.head {
		text-align: center;
		margin: 0 auto var(--space-5);
		max-width: var(--prose-max);
	}

	.eyebrow {
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-3);
	}

	h1 {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		margin: 0;
	}

	/* Guide ornament: same SVG override as the single-guide page. */
	.bt-fleuron :global(.bt-fleuron__glyph--svg::before) {
		content: none;
	}

	.bt-fleuron :global(.bt-fleuron__glyph--svg svg) {
		height: 2em;
	}

	.empty {
		margin: 0;
		color: var(--ink-soft);
		font-style: italic;
	}

	.guide-list {
		list-style: none;
		padding: 0;
		margin: var(--space-6) auto 0;
		max-width: var(--prose-max);
	}

	.guide-entry + .guide-entry {
		border-top: 1px solid var(--rule-hair);
	}

	.guide-link {
		display: block;
		padding: var(--space-5) 0;
		color: inherit;
		text-decoration: none;
	}

	.guide-eyebrow {
		margin: 0 0 var(--space-2);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
	}

	.guide-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 500;
		color: var(--ink);
		transition: color 0.15s ease;
	}

	.guide-link:hover .guide-title {
		color: var(--accent);
	}

	.guide-summary {
		margin: var(--space-2) 0 0;
		font-size: var(--text-sm);
		color: var(--ink-soft);
		line-height: var(--leading-normal);
	}
</style>
