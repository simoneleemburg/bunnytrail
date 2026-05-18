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
		 * `stripLinks: true` (the card is wrapped in an <a>, so nested
		 * anchors aren't permitted). Prefer this; `summary` is kept as
		 * a fallback.
		 */
		summaryHtml?: string | null;
		tags?: string[];
		era?: string | null;
	}

	let {
		id,
		name,
		type,
		kind = null,
		summary = null,
		summaryHtml = null,
		tags = [],
		era = null
	}: Props = $props();
</script>

<a class="entity-card" href={`/${id}`}>
	<div class="rule"></div>
	<div class="eyebrow">
		<span class="type">{kind ?? type}</span>
		{#if era}
			<span class="sep">·</span>
			<span class="era">{era}</span>
		{/if}
	</div>
	<h3 class="name">{name}</h3>
	{#if summaryHtml}
		<p class="summary">{@html summaryHtml}</p>
	{:else if summary}
		<p class="summary">{summary}</p>
	{/if}
	{#if tags.length > 0}
		<div class="tags">
			{#each tags as tag (tag)}
				<Tag label={tag} />
			{/each}
		</div>
	{/if}
</a>

<style>
	.entity-card {
		display: block;
		padding: var(--space-4) 0 var(--space-5);
		color: inherit;
		text-decoration: none;
	}

	.rule {
		border-top: var(--rule-thin);
		margin-bottom: var(--space-3);
	}

	.eyebrow {
		font-size: var(--text-xs);
		font-variant: small-caps;
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

	.entity-card:hover .name {
		color: var(--accent);
	}

	.summary {
		margin: 0 0 var(--space-3);
		color: var(--ink-soft);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
	}
</style>
