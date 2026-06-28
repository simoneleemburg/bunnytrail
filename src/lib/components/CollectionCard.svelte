<script lang="ts">
	import { toRoman, type RankDisplay } from '$lib/types.js';
	import Tag from '$lib/components/Tag.svelte';

	interface Props {
		href: string;
		label: string;
		eyebrow?: string;		description?: string | null;
		rank?: number | null;
		rankDisplay?: RankDisplay | null;
		tags?: Array<{ label: string }>;
		isCluster?: boolean;
	}

	let {
		href,
		label,
		eyebrow = '',
		description = null,
		rank = null,
		rankDisplay = null,
		tags = [],
		isCluster = false
	}: Props = $props();
</script>

<li class="collection-card" class:cluster={isCluster}>
	<a class="card-link" class:bt-meta-link={isCluster} {href}>
		<div class="card-eyebrow">
			<span class="card-eyebrow-label">{eyebrow}</span>
			{#if rank != null && rankDisplay !== 'none'}
				<span class="card-rank">
					{rankDisplay === 'roman' ? toRoman(rank) : rank}
				</span>
			{/if}
		</div>
		<h3 class="card-label">{label}</h3>
	</a>
	{#if description && !isCluster}
		<p class="card-description">{description}</p>
	{/if}
	{#if tags.length > 0}
		<ul class="card-tags">
			{#each tags as tag (tag.label)}
				<li><Tag label={tag.label} href={'/tags/' + tag.label} /></li>
			{/each}
		</ul>
	{/if}
</li>

<style>
	.collection-card {
		position: relative;
		padding: var(--space-4);
		margin: 0 calc(var(--space-4) * -1);
		border-radius: 8px;
		transition:
			background-color 200ms ease,
			box-shadow 200ms ease,
			transform 200ms ease;
	}

	.collection-card:hover {
		background-color: var(--paper-warm);
		box-shadow:
			0 1px 1px rgba(120, 90, 60, 0.04),
			0 4px 14px -8px rgba(120, 90, 60, 0.1);
		transform: translateY(-1px);
	}

	.card-link {
		display: block;
		color: inherit;
		text-decoration: none;
		padding-left: var(--space-3);
		border-left: 2px solid var(--accent-warm);
	}

	.card-link.bt-meta-link {
		border-left-color: var(--accent-meta);
	}

	/* Stretched link: covers the whole tile so the description and
	   tags row are also clickable. Tag links sit above via z-index. */
	.card-link::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.card-eyebrow {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-2);
	}

	.card-eyebrow-label {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-xs);
		letter-spacing: 0.04em;
		color: var(--ink-faint);
	}

	.card-rank {
		font-size: var(--text-xs);
		font-variant: tabular-nums small-caps;
		color: var(--ink-faint);
	}

	.card-label {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 500;
		margin: 0;
		color: var(--ink);
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-warm) 50%,
			currentColor 58%,
			currentColor 100%
		);
		background-size: 250% 100%;
		background-position: 130% 0;
		background-clip: text;
		-webkit-background-clip: text;
	}

	.collection-card:hover .card-label {
		animation: card-label-gleam 600ms ease-out;
		color: var(--accent);
	}

	@keyframes card-label-gleam {
		0% {
			background-position: 130% 0;
			-webkit-text-fill-color: currentColor;
		}
		15%,
		85% {
			-webkit-text-fill-color: transparent;
		}
		100% {
			background-position: -30% 0;
			-webkit-text-fill-color: currentColor;
		}
	}

	/* Cluster variant — meta-link colours instead of warm gold. */
	.cluster .card-label {
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-meta) 50%,
			currentColor 58%,
			currentColor 100%
		);
	}

	.cluster:hover .card-label {
		animation: card-label-gleam--meta 600ms ease-out;
		color: var(--accent-meta);
	}

	@keyframes card-label-gleam--meta {
		0% {
			background-position: 130% 0;
			-webkit-text-fill-color: currentColor;
		}
		15%,
		85% {
			-webkit-text-fill-color: transparent;
		}
		100% {
			background-position: -30% 0;
			-webkit-text-fill-color: currentColor;
		}
	}

	.card-description {
		margin: var(--space-2) 0 0 0;
		font-size: var(--text-sm);
		color: var(--ink-soft);
		line-height: var(--leading-normal);
		text-align: justify;
		text-wrap: pretty;
		hyphens: auto;
	}

	.card-tags {
		list-style: none;
		padding: 0;
		margin: var(--space-3) 0 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-2);
		position: relative;
		z-index: 2;
	}

	.card-tags :global(.tag) {
		border-bottom-color: transparent;
	}

	.card-tags :global(a.tag:hover) {
		border-bottom-color: var(--accent-warm);
	}
</style>
