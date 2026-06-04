<script lang="ts">
	import { page } from '$app/state';
	import type { InfluencesData } from './load';

	let { data }: { data: InfluencesData } = $props();

	let activeKind = $state<string | null>(null);

	const visibleItems = $derived(
		activeKind === null ? data.items : data.items.filter((item) => item.kind === activeKind)
	);
</script>

<svelte:head>
	<title>Influences · {page.data.world.shortName}</title>
</svelte:head>

<!--
	Influences gallery. Shares the notebook surface with /blog and
	/sources (cool tint, dashed frame) so the author's-room register
	is recognisable at a glance — this page is *about* what shaped
	the world, not *of* it. Laid out as a CSS-column masonry grid
	so tiles of varying heights flow naturally.
-->
<section class="bt-notebook influences-notebook">
	<nav class="bt-notebook__frame" aria-label="Influences navigation">
		<a href="/">↑ {page.data.world.shortName}</a>
	</nav>
	<header class="head">
		<p class="bt-notebook__eyebrow">Out of world</p>
		<h1 class="bt-notebook__title">Influences</h1>
		<p class="sub">Works, ideas, and creators that shaped this world.</p>
	</header>

	{#if data.kinds.length > 1}
		<div class="filter-group" role="group" aria-label="Filter by kind">
			<button
				type="button"
				class="filter"
				class:active={activeKind === null}
				onclick={() => (activeKind = null)}
			>
				All
			</button>
			{#each data.kinds as kind (kind)}
				<button
					type="button"
					class="filter"
					class:active={activeKind === kind}
					onclick={() => (activeKind = kind)}
				>
					{kind}
				</button>
			{/each}
		</div>
	{/if}

	{#if data.items.length === 0}
		<p class="empty"><em>No influences recorded yet.</em></p>
	{:else if visibleItems.length === 0}
		<p class="empty"><em>No influences in this category.</em></p>
	{:else}
		<div class="gallery">
			{#each visibleItems as item (item.slug)}
				{#if item.thumbSrc !== null}
					<a class="influence-tile" href="/influences/{item.slug}">
						<div class="tile-image">
							<img src={item.thumbSrc} alt={item.title} loading="lazy" />
						</div>
						<div class="tile-body">
							{#if item.year !== null || item.kind !== null}
								<p class="tile-meta">
									{[item.year, item.kind].filter(Boolean).join(' · ')}
								</p>
							{/if}
							<h3 class="tile-title">{item.title}</h3>
							{#if item.creator !== null}
								<p class="tile-creator">{item.creator}</p>
							{/if}
							{#if item.epigraph !== null}
								<p class="tile-epigraph">"{item.epigraph}"</p>
							{/if}
						</div>
					</a>
				{:else}
					<a class="influence-tile influence-tile--text" href="/influences/{item.slug}">
						<div class="tile-body">
							{#if item.year !== null || item.kind !== null}
								<p class="tile-meta">
									{[item.year, item.kind].filter(Boolean).join(' · ')}
								</p>
							{/if}
							<h3 class="tile-title">{item.title}</h3>
							{#if item.creator !== null}
								<p class="tile-creator">{item.creator}</p>
							{/if}
							{#if item.epigraph !== null}
								<p class="tile-epigraph">"{item.epigraph}"</p>
							{/if}
						</div>
					</a>
				{/if}
			{/each}
		</div>
	{/if}
</section>

<style>
	/* Override the default prose-max width — the gallery needs
	   more room to show two masonry columns comfortably. */
	.influences-notebook {
		max-width: 52rem;
	}

	.head {
		margin: 0 0 var(--space-6);
		padding-bottom: var(--space-5);
		border-bottom: 1px solid var(--rule-hair);
	}

	.sub {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--ink-soft);
		line-height: var(--leading-normal);
	}

	.empty {
		margin: 0;
		color: var(--ink-soft);
	}

	/* Kind filter chip row — matches the `.filter` / `.filter.active`
	   pattern used in CollectionPage. */
	.filter-group {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		margin-bottom: var(--space-5);
	}

	.filter {
		appearance: none;
		background: transparent;
		border: 0;
		padding: 0.18em 0.7em;
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		color: var(--ink-soft);
		cursor: pointer;
		line-height: 1.6;
		border-radius: 999px;
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}

	.filter:hover {
		color: var(--accent);
		background-color: var(--paper-warm);
	}

	.filter.active {
		color: var(--page);
		background-color: var(--accent);
	}

	.filter.active:hover {
		background-color: var(--accent-soft);
	}

	/* CSS-column masonry layout. Two columns on wider viewports;
	   collapses to one on mobile. */
	.gallery {
		column-count: 2;
		column-gap: 1.5rem;
	}

	@media (max-width: 600px) {
		.gallery {
			column-count: 1;
		}
	}

	/* Each tile must not be split across columns. */
	.influence-tile {
		display: block;
		break-inside: avoid;
		margin-bottom: 1.5rem;
		text-decoration: none;
		color: inherit;
		transition: opacity 120ms ease;
	}

	.influence-tile:hover {
		opacity: 0.85;
	}

	.tile-image img {
		width: 100%;
		display: block;
		border-radius: var(--radius-sm) var(--radius-sm) 0 0;
	}

	.tile-body {
		padding: var(--space-3) var(--space-4);
		background: color-mix(in oklab, var(--parchment-soft) 30%, white);
		border: 1px solid var(--rule-hair);
		border-top: none;
		border-radius: 0 0 var(--radius-sm) var(--radius-sm);
	}

	/* Text-only tile: slightly dimmer border to distinguish from image tiles. */
	.influence-tile--text .tile-body {
		border: 1px solid var(--rule-hair);
		border-radius: var(--radius-sm);
		padding: var(--space-4);
	}

	.tile-meta {
		margin: 0 0 var(--space-1);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
	}

	.tile-title {
		margin: 0 0 var(--space-2);
		font-family: var(--font-display);
		font-size: var(--text-base);
		font-weight: 600;
		line-height: var(--leading-tight);
		color: var(--ink);
	}

	.tile-creator {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		font-family: var(--font-serif);
		color: var(--ink-soft);
	}

	.tile-epigraph {
		margin: 0;
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
		padding-left: var(--space-3);
		border-left: 1px solid var(--rule);
		line-height: var(--leading-normal);
	}
</style>
