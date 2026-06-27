<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PropertiesIndexPageData } from './load';

	let { data }: { data: PropertiesIndexPageData } = $props();

	const hasEntries = $derived(data.entries.length > 0);

	const ui = $derived(t(page.data.world.language));
</script>

<svelte:head>
	<title>Properties · {page.data.world.shortName}</title>
</svelte:head>

<PageHeader title={ui.properties_title} />

<p class="lede">{ui.properties_lede}</p>

{#if !data.hasSchema}
	<p class="notice"><em>{ui.properties_no_schema}</em></p>
{:else if !hasEntries}
	<p class="empty"><em>{ui.properties_empty}</em></p>
{:else}
	<ul class="property-list" role="list">
		{#each data.entries as entry (entry.id)}
			<li class="property-row">
				<a class="kind-id" href={entry.href}>{entry.id}</a>
				<span class="label">{entry.label}</span>
				<span class="count" aria-label={ui.properties_entities(entry.count)}>{entry.count}</span>
			</li>
		{/each}
	</ul>
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

	/* Label */
	.label {
		color: var(--ink-soft);
	}

	/* Count — far right, tabular, quiet */
	.count {
		font-variant-numeric: tabular-nums;
		color: var(--ink-faint);
		text-align: right;
	}
</style>
