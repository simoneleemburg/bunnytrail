<script lang="ts">
	import EntityCard from '$lib/components/EntityCard.svelte';
	import EntityLink from '$lib/components/EntityLink.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { KindCard, KindSection } from './+page.server';

	let {
		data
	}: {
		data: {
			kindId: string;
			singular: string;
			plural: string;
			description: string | null;
			bodyHtml: string | null;
			parent: { id: string; label: string } | null;
			directHeading: string | null;
			direct: KindCard[];
			subkindSections: KindSection[];
			backlinks: KindCard[];
		};
	} = $props();

	// Hide the "Direct" heading when the page has no subkind sections —
	// in that case the page is just a single grid and a section heading
	// above it would be redundant noise.
	const showDirectHeading = $derived(data.direct.length > 0 && data.subkindSections.length > 0);
	const totalCount = $derived(
		data.direct.length + data.subkindSections.reduce((n, s) => n + s.cards.length, 0)
	);
</script>

<svelte:head>
	<title>{data.plural} · Kinds · Alteria</title>
</svelte:head>

{#if data.parent}
	<p class="up">
		<a href={`/kinds/${data.parent.id}`}>↑ {data.parent.label}</a>
	</p>
{/if}

<PageHeader title={data.plural} />

{#if data.description}
	<p class="lede">{data.description}</p>
{/if}

{#if data.bodyHtml}
	<div class="prose">{@html data.bodyHtml}</div>
{/if}

{#if totalCount === 0}
	<p class="empty">
		<em>No {data.plural.toLowerCase()} have been recorded yet.</em>
	</p>
{:else}
	{#if data.direct.length > 0}
		<section class="kind-section">
			{#if showDirectHeading}
				<h2 class="section-heading">{data.directHeading}</h2>
			{/if}
			<div class="grid">
				{#each data.direct as card (card.id)}
					<EntityCard
						id={card.id}
						name={card.name}
						type={card.typeLabel ?? data.singular}
						kind={card.kind}
						summaryHtml={card.summaryHtml}
						tags={card.tags}
						era={card.era}
						sigil={card.sigil}
					/>
				{/each}
			</div>
		</section>
	{/if}

	{#each data.subkindSections as section (section.kind)}
		<section class="kind-section">
			<h2 class="section-heading">
				{#if section.href}
					<a href={section.href}>{section.heading}</a>
				{:else}
					{section.heading}
				{/if}
				<span class="section-count">{section.cards.length}</span>
			</h2>
			<div class="grid">
				{#each section.cards as card (card.id)}
					<EntityCard
						id={card.id}
						name={card.name}
						type={card.typeLabel ?? section.heading}
						kind={card.kind}
						summaryHtml={card.summaryHtml}
						tags={card.tags}
						era={card.era}
						sigil={card.sigil}
					/>
				{/each}
			</div>
		</section>
	{/each}
{/if}

{#if data.backlinks.length > 0}
	<section class="kind-section backlinks">
		<h2 class="section-heading">
			Mentioned in
			<span class="section-count">{data.backlinks.length}</span>
		</h2>
		<ul class="backlinks-list">
			{#each data.backlinks as card (card.id)}
				<li>
					<EntityLink id={card.id} name={card.name} summary={null} />
					{#if card.typeLabel}<span class="backlink-type">· {card.typeLabel}</span>{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.up {
		margin: 0 0 var(--space-3) 0;
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.06em;
	}

	.up a {
		color: var(--ink-faint);
		text-decoration: none;
	}

	.up a:hover {
		color: var(--accent);
	}

	.lede {
		max-width: var(--prose-max);
		margin: 0 0 var(--space-5) 0;
		color: var(--ink-soft);
		font-style: italic;
	}

	.prose {
		max-width: var(--prose-max);
		margin: 0 0 var(--space-6) 0;
		color: var(--ink);
	}

	.prose :global(p),
	.prose :global(ul),
	.prose :global(ol) {
		margin: 0 0 var(--space-4);
	}

	.prose :global(ul),
	.prose :global(ol) {
		padding-left: var(--space-5);
	}

	.prose :global(blockquote) {
		margin: var(--space-5) 0;
	}

	.empty {
		color: var(--ink-faint);
	}

	.kind-section {
		margin: 0 0 var(--space-7) 0;
	}

	.kind-section:last-of-type {
		margin-bottom: 0;
	}

	.section-heading {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 500;
		margin: 0 0 var(--space-4) 0;
		color: var(--ink);
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.section-heading a {
		color: inherit;
		text-decoration: none;
	}

	.section-heading a:hover {
		color: var(--accent);
	}

	.section-count {
		font-size: var(--text-xs);
		font-variant: tabular-nums small-caps;
		color: var(--ink-faint);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--space-5) var(--space-6);
	}

	.backlinks-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.backlink-type {
		color: var(--ink-faint);
		font-size: var(--text-sm);
		margin-left: var(--space-2);
	}
</style>
