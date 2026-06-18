<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { RelationsIndexPageData } from './load';

	let { data }: { data: RelationsIndexPageData } = $props();

	const hasEntries = $derived(data.entries.length > 0);
	const hasPropertyEntries = $derived(data.propertyEntries.length > 0);
</script>

<svelte:head>
	<title>Relations · {page.data.world.shortName}</title>
</svelte:head>

<PageHeader title="Relations" />

<p class="lede">
	Relation types defined in the world schema. Click a kind to see all its edges.
</p>

{#if !data.hasSchema}
	<p class="notice"><em>No relations schema defined in world.md.</em></p>
{:else if !hasEntries}
	<p class="empty"><em>No relation kinds defined yet.</em></p>
{:else}
	{#snippet kindChips(kinds: string[], prefix: string)}
		{#if kinds.length > 0}
			<span class="constraint-group">
				<span class="constraint-label">{prefix}</span>
				{#each kinds as k (k)}
					<span class="pill">{k}</span>
				{/each}
			</span>
		{/if}
	{/snippet}

	<ul class="relation-list" role="list">
		{#each data.entries as entry (entry.kind)}
			<li class="relation-row">
				<a class="kind-id" href={entry.href}>{entry.kind}</a>
				<span class="labels">
					{entry.outLabel}
					<span class="label-sep" aria-hidden="true">/</span>
					{entry.inLabel}
				</span>
				<span class="constraints">
					{@render kindChips(entry.domain, 'from:')}
					{@render kindChips(entry.codomain, 'to:')}
				</span>
				<span class="count" aria-label="{entry.count} edges">{entry.count}</span>
			</li>
		{/each}
	</ul>
{/if}

{#if data.undefinedKinds.length > 0}
	<section class="undefined-section">
		<h2 class="section-heading">Undefined kinds</h2>
		<p class="section-blurb">Used in content but not in world schema.</p>
		<ul class="undefined-list" role="list">
			{#each data.undefinedKinds as item (item.kind)}
				<li class="undefined-row">
					<span class="kind-id kind-id--plain">{item.kind}</span>
					<span class="count">{item.count}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if data.hasPropertySchema}
	<section class="properties-section">
		<h2 class="section-heading">Properties</h2>
		<p class="section-blurb">Property types defined in the world schema.</p>
		{#if !hasPropertyEntries}
			<p class="empty"><em>No property kinds defined yet.</em></p>
		{:else}
			<ul class="property-list" role="list">
				{#each data.propertyEntries as entry (entry.id)}
					<li class="property-row">
						<a class="kind-id" href={entry.href}>{entry.id}</a>
						<span class="label">{entry.label}</span>
						<span class="count" aria-label="{entry.count} entities">{entry.count}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.lede {
		max-width: var(--prose-max);
		color: var(--ink-soft);
		margin: 0 0 var(--space-6);
	}

	.notice,
	.empty {
		color: var(--ink-faint);
	}

	/* ── Table-like grid list ── */
	.relation-list {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: var(--rule-thin);
	}

	.relation-row {
		display: grid;
		grid-template-columns: minmax(10rem, 16rem) minmax(10rem, 1fr) minmax(0, 1fr) 4rem;
		gap: var(--space-4);
		align-items: center;
		padding: var(--space-2) 0;
		font-size: var(--text-sm);
	}

	@media (max-width: 56rem) {
		.relation-row {
			grid-template-columns: minmax(8rem, 12rem) 1fr auto;
			grid-template-rows: auto auto;
		}

		.constraints {
			grid-column: 2 / -1;
		}

		.count {
			grid-row: 1;
			grid-column: 3;
		}
	}

	@media (max-width: 36rem) {
		.relation-row {
			grid-template-columns: 1fr auto;
		}

		.labels,
		.constraints {
			grid-column: 1 / -1;
		}
	}

	/* Kind id — monospace link */
	.kind-id {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.92em;
		color: var(--ink);
		text-decoration: none;
	}

	.kind-id:hover {
		color: var(--accent);
	}

	.kind-id--plain {
		color: var(--ink-soft);
	}

	/* Out / In labels */
	.labels {
		color: var(--ink-soft);
	}

	.label-sep {
		margin: 0 0.3em;
		color: var(--ink-faint);
	}

	/* Constraints column */
	.constraints {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}

	.constraint-group {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	.constraint-label {
		font-size: 0.85em;
		color: var(--ink-faint);
	}

	.pill {
		display: inline-block;
		padding: 0.1em 0.55em;
		border-radius: 999px;
		background: var(--surface-alt, #f5f3ee);
		color: var(--ink-soft);
		font-size: 0.85em;
		line-height: 1.5;
	}

	/* Count — far right, tabular, quiet */
	.count {
		font-variant-numeric: tabular-nums;
		color: var(--ink-faint);
		text-align: right;
	}

	/* ── Undefined kinds section ── */
	.undefined-section {
		margin-top: var(--space-7);
	}

	.section-heading {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 500;
		color: var(--ink);
		margin: 0 0 var(--space-2);
	}

	.section-blurb {
		color: var(--ink-soft);
		font-size: var(--text-sm);
		margin: 0 0 var(--space-4);
	}

	.undefined-list {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: var(--rule-thin);
	}

	.undefined-row {
		display: grid;
		grid-template-columns: minmax(10rem, 16rem) 4rem;
		gap: var(--space-4);
		align-items: center;
		padding: var(--space-2) 0;
		font-size: var(--text-sm);
	}

	/* ── Properties section ── */
	.properties-section {
		margin-top: var(--space-7);
	}

	.property-list {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: var(--rule-thin);
	}

	.property-row {
		display: grid;
		grid-template-columns: minmax(10rem, 16rem) minmax(10rem, 1fr) 4rem;
		gap: var(--space-4);
		align-items: center;
		padding: var(--space-2) 0;
		font-size: var(--text-sm);
	}

	@media (max-width: 36rem) {
		.property-row {
			grid-template-columns: 1fr auto;
		}

		.label {
			grid-column: 1 / -1;
		}
	}

	.label {
		color: var(--ink-soft);
	}
</style>
