<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PropertyDetailPageData } from './load';

	let { data }: { data: PropertyDetailPageData } = $props();

	const hasEntries = $derived(data.entries.length > 0);
</script>

<svelte:head>
	<title>{data.schema.label} · Properties · {page.data.world.shortName}</title>
</svelte:head>

<PageHeader
	title={data.schema.label}
	eyebrow="Properties"
	breadcrumbs={[{ href: '/properties', label: 'Properties' }]}
/>

{#if data.schema.allowedKinds || data.schema.values}
	<div class="schema-card">
		<div class="schema-row">
			<span class="schema-label">Id</span>
			<code class="kind-mono">{data.kindId}</code>
		</div>
		{#if data.schema.allowedKinds && data.schema.allowedKinds.length > 0}
			<div class="schema-row">
				<span class="schema-label">Kinds</span>
				<span class="pill-group">
					{#each data.schema.allowedKinds as k (k)}
						<span class="pill">{k}</span>
					{/each}
				</span>
			</div>
		{/if}
		{#if data.schema.values && data.schema.values.length > 0}
			<div class="schema-row">
				<span class="schema-label">Values</span>
				<span class="pill-group">
					{#each data.schema.values as v (v)}
						<span class="pill">{v}</span>
					{/each}
				</span>
			</div>
		{/if}
	</div>
{/if}

{#if !hasEntries}
	<p class="empty"><em>No entities carry this property.</em></p>
{:else}
	<section class="entries-section">
		<h2 class="section-heading">
			Entities
			<span class="section-count">{data.entries.length}</span>
		</h2>
		<ul class="entry-list" role="list">
			{#each data.entries as entry (entry.entityId)}
				<li class="entry-row">
					<a class="entity-link" href={entry.href}>{entry.entityName}</a>
					<span class="entry-value">{entry.value}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	/* ── Schema card ── */
	.schema-card {
		display: inline-flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-5);
		border: var(--rule-thin);
		border-radius: 4px;
		background: var(--surface-alt, #f5f3ee);
		margin-bottom: var(--space-6);
		font-size: var(--text-sm);
	}

	.schema-row {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.schema-label {
		width: 5.5rem;
		flex-shrink: 0;
		color: var(--ink-faint);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		font-size: 0.9em;
	}

	.kind-mono {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.92em;
		color: var(--ink);
		background: none;
		padding: 0;
	}

	.pill-group {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.pill {
		display: inline-block;
		padding: 0.1em 0.55em;
		border-radius: 999px;
		background: var(--surface-alt, #f5f3ee);
		color: var(--ink-soft);
		font-size: 0.85em;
		line-height: 1.5;
		border: 1px solid var(--rule, rgba(0 0 0 / 0.12));
	}

	/* ── Shared section chrome ── */
	.empty {
		color: var(--ink-faint);
	}

	.section-heading {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 500;
		color: var(--ink);
		margin: 0 0 var(--space-3);
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.section-count {
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		color: var(--ink-faint);
	}

	/* ── Entries list ── */
	.entries-section {
		margin-bottom: var(--space-7);
	}

	.entry-list {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: var(--rule-thin);
	}

	.entry-row {
		display: grid;
		grid-template-columns: minmax(10rem, 1fr) minmax(8rem, 1fr);
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-2) 0;
		font-size: var(--text-sm);
	}

	@media (max-width: 36rem) {
		.entry-row {
			grid-template-columns: 1fr;
			gap: var(--space-1);
		}

		.entry-value {
			padding-left: var(--space-4);
			color: var(--ink-soft);
		}
	}

	/* ── Entity links ── */
	.entity-link {
		color: var(--ink);
		text-decoration: none;
	}

	.entity-link:hover {
		color: var(--accent);
	}

	.entry-value {
		color: var(--ink-soft);
	}
</style>
