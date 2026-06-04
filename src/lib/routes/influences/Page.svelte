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
	Influences gallery. No notebook frame — the header floats bare,
	centred, with the blue fleuron as the sole separator before the
	full-width masonry board.
-->
<div class="influences-page">
	<div class="influences-header">
		<nav class="bt-notebook__frame" aria-label="Influences navigation">
			<a href="/">↑ {page.data.world.shortName}</a>
		</nav>
		<header class="head">
			<h1 class="bt-notebook__title">Influences</h1>
			<p class="sub">Works, ideas, and creators that shaped this world.</p>
		</header>
		<div class="bt-fleuron" aria-hidden="true">
			<span class="bt-fleuron__rule"></span>
			<span class="bt-fleuron__glyph"></span>
			<span class="bt-fleuron__rule"></span>
		</div>

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
	</div>

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
							<h3 class="tile-title">{item.title}</h3>
							{#if item.creator !== null}
								<p class="tile-creator">{item.creator}</p>
							{/if}
						</div>
					</a>
				{:else}
					<a class="influence-tile influence-tile--text" href="/influences/{item.slug}">
						<div class="tile-body">
							<h3 class="tile-title">{item.title}</h3>
							{#if item.creator !== null}
								<p class="tile-creator">{item.creator}</p>
							{/if}
						</div>
					</a>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Full-width page shell — no prose-max constraint. */
	.influences-page {
		width: 100%;
		--fleuron-glyph-color: var(--accent-meta);
	}

	/* Bare centred header — no card, no background, no shadow.
	   The blue fleuron does the talking. */
	.influences-header {
		max-width: 42rem;
		margin: 0 auto var(--space-7);
		text-align: center;
	}

	.head {
		margin: 0 0 var(--space-4);
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

	/* Pinterest-style CSS-column masonry layout.
	   4 columns at wide, 3 at medium, 2 at narrow, 1 on mobile. */
	.gallery {
		column-count: 4;
		column-gap: 1.25rem;
	}

	@media (max-width: 1199px) {
		.gallery {
			column-count: 3;
		}
	}

	@media (max-width: 799px) {
		.gallery {
			column-count: 2;
		}
	}

	@media (max-width: 499px) {
		.gallery {
			column-count: 1;
		}
	}

	/* Each tile must not be split across columns. */
	.influence-tile {
		display: block;
		break-inside: avoid;
		margin-bottom: 1.25rem;
		text-decoration: none;
		color: inherit;
		background: color-mix(in oklab, var(--parchment-soft) 30%, white);
		border-radius: var(--radius-sm);
		overflow: hidden;
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--rule-hair) 60%, transparent);
		transition:
			box-shadow 0.2s ease;
	}

	.influence-tile:hover {
		background: color-mix(in oklab, var(--accent-meta) 5%, var(--parchment));
		box-shadow:
			0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent),
			0 8px 24px -12px rgba(120, 90, 60, 0.14);
	}

	.tile-image img {
		width: 100%;
		display: block;
		transition: transform 0.4s ease;
	}

	.influence-tile:hover .tile-image img {
		transform: scale(1.03);
	}

	.tile-body {
		padding: var(--space-3) var(--space-4);
	}

	.tile-title {
		margin: 0;
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-base);
		font-weight: normal;
		line-height: var(--leading-tight);
		color: var(--ink);
		transition: color 0.15s ease;
	}

	.influence-tile:hover .tile-title {
		color: var(--accent-meta);
	}

	.tile-creator {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		font-style: italic;
		font-family: var(--font-serif);
		color: var(--ink-soft);
	}

	/* text-only tile: full border radius (no image above) */
	.influence-tile--text .tile-body {
		padding: var(--space-4);
	}
</style>
