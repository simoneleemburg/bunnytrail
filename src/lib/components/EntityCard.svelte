<script lang="ts">
	import Tag from './Tag.svelte';

	interface Props {
		id: string;
		name: string;
		type: string;
		kind?: string | null;
		summary?: string | null;
		/**
		 * Summary as inline HTML, pre-rendered via `renderSummary` with
		 * `stripLinks: true` (the card title acts as a stretched link, so
		 * nested anchors inside the summary would compete for clicks).
		 * Prefer this; `summary` is kept as a fallback.
		 */
		summaryHtml?: string | null;
		tags?: string[];
		era?: string | null;
		/** Optional sigil glyph rendered before the name. */
		sigil?: string | null;
	}

	let {
		id,
		name,
		type,
		kind = null,
		summary = null,
		summaryHtml = null,
		tags = [],
		era = null,
		sigil = null
	}: Props = $props();
</script>

<article class="entity-card">
	<div class="eyebrow">
		<span class="type">{kind ?? type}</span>
		{#if era}
			<span class="sep">·</span>
			<span class="era">{era}</span>
		{/if}
	</div>
	<h3 class="name">
		<a class="card-link" href={`/${id}`}
			>{#if sigil}<span class="sigil" aria-hidden="true">{sigil}</span>{/if}{name}</a
		>
	</h3>
	{#if summaryHtml}
		<p class="summary">{@html summaryHtml}</p>
	{:else if summary}
		<p class="summary">{summary}</p>
	{/if}
	{#if tags.length > 0}
		<div class="tags">
			{#each tags as tag (tag)}
				<Tag label={tag} href={`/tags/${encodeURIComponent(tag)}`} />
			{/each}
		</div>
	{/if}
</article>

<style>
	.entity-card {
		position: relative;
		padding: var(--space-4) var(--space-4) var(--space-5);
		margin: 0 calc(var(--space-4) * -1);
		border-radius: 8px;
		transition:
			background-color 200ms ease,
			box-shadow 200ms ease,
			transform 200ms ease;
	}

	.entity-card:hover {
		background-color: var(--paper-warm);
		box-shadow:
			0 1px 1px rgba(120, 90, 60, 0.04),
			0 4px 14px -8px rgba(120, 90, 60, 0.10);
		transform: translateY(-1px);
	}

	.eyebrow {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		margin-bottom: var(--space-2);
	}

	.sep {
		margin: 0 var(--space-2);
	}

	.name {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 500;
		margin: 0 0 var(--space-2);
		color: var(--ink);
	}

	.card-link {
		color: inherit;
		text-decoration: none;
		background-image: linear-gradient(
			115deg,
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

	.entity-card:hover .card-link {
		animation: title-gleam 600ms ease-out;
	}

	@keyframes title-gleam {
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

	.name .sigil {
		display: inline-block;
		margin-right: 0.3em;
		color: var(--ink-soft);
		font-weight: 400;
		/* Alchemical glyphs sit low on the baseline; optically
		   centre on the title's cap-height. */
		font-size: 0.85em;
		vertical-align: 0.08em;
	}

	/* Stretch the title's link over the whole card so empty space and
	   the summary are clickable too. Real interactive children (tags)
	   sit above this overlay via their own z-index and stay clickable. */
	.card-link::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.entity-card:hover .card-link {
		color: var(--accent);
	}

	.summary {
		margin: 0 0 var(--space-3);
		color: var(--ink-soft);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
	}

	.tags {
		position: relative;
		z-index: 2;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
	}
</style>
