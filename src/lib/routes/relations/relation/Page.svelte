<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { RelationDetailPageData, RelationEdge, MissingRelationEntry } from './load';

	let { data }: { data: RelationDetailPageData } = $props();

	const hasEdges = $derived(data.edges.length > 0);
	const hasMissing = $derived(data.missing.length > 0);
	const isEmpty = $derived(!hasEdges && !hasMissing);

	const domainLabel = $derived(data.domain.length > 0 ? null : 'Any');
	const codomainLabel = $derived(data.codomain.length > 0 ? null : 'Any');
</script>

<svelte:head>
	<title>{data.outLabel} · Relations · {page.data.world.shortName}</title>
</svelte:head>

<PageHeader
	title={data.outLabel}
	eyebrow="Relations"
	breadcrumbs={[{ href: '/relations', label: 'Relations' }]}
	subtitle="Inverse: {data.inLabel}"
/>

{#snippet kindPill(k: string)}
	<span class="pill">{k}</span>
{/snippet}

{#if data.worldDefined}
	<div class="schema-card">
		<div class="schema-row">
			<span class="schema-label">Kind</span>
			<code class="kind-mono">{data.kind}</code>
		</div>
		<div class="schema-row">
			<span class="schema-label">Domain</span>
			{#if domainLabel}
				<em class="any-label">Any</em>
			{:else}
				<span class="pill-group">
					{#each data.domain as k (k)}
						{@render kindPill(k)}
					{/each}
				</span>
			{/if}
		</div>
		<div class="schema-row">
			<span class="schema-label">Codomain</span>
			{#if codomainLabel}
				<em class="any-label">Any</em>
			{:else}
				<span class="pill-group">
					{#each data.codomain as k (k)}
						{@render kindPill(k)}
					{/each}
				</span>
			{/if}
		</div>
	</div>
{/if}

{#if isEmpty}
	<p class="empty"><em>No edges of this kind in the graph.</em></p>
{:else}
	{#if hasEdges}
		<section class="edges-section">
			<h2 class="section-heading">
				Edges
				<span class="section-count">{data.edges.length}</span>
			</h2>
			<ul class="edge-list" role="list">
				{#each data.edges as edge (edge.sourceId + '→' + edge.targetId)}
					<li class="edge-row">
						<span class="edge-source">
							<a class="entity-link" href={edge.sourceHref}>{edge.sourceName}</a>
							{#if edge.sourceKind}
								<span class="kind-chip">{edge.sourceKind}</span>
							{/if}
						</span>
						<span class="edge-arrow" aria-hidden="true">→</span>
						<span class="edge-target">
							<a class="entity-link" href={edge.targetHref}>{edge.targetName}</a>
							{#if edge.targetKind}
								<span class="kind-chip">{edge.targetKind}</span>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if hasMissing}
		<section class="missing-section">
			<h2 class="section-heading">
				Missing
				<span class="section-count">{data.missing.length}</span>
			</h2>
			<p class="section-blurb">
				Entities whose kind satisfies the domain constraint but have no {data.outLabel.toLowerCase()} relation.
			</p>
			<ul class="missing-list" role="list">
				{#each data.missing as item (item.entityId)}
					<li class="missing-row">
						<a class="entity-link" href={item.href}>{item.entityName}</a>
						<span class="kind-chip">{item.entityKind}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
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

	.any-label {
		color: var(--ink-faint);
		font-style: italic;
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
		/* Inside the card the pill sits on the same --surface-alt bg;
		   add a border so it still reads as a distinct chip. */
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

	.section-blurb {
		max-width: var(--prose-max);
		color: var(--ink-soft);
		font-size: var(--text-sm);
		margin: 0 0 var(--space-4);
	}

	/* ── Edges list ── */
	.edges-section {
		margin-bottom: var(--space-7);
	}

	.edge-list {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: var(--rule-thin);
	}

	.edge-row {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		font-size: var(--text-sm);
	}

	@media (max-width: 42rem) {
		.edge-row {
			grid-template-columns: 1fr;
		}

		.edge-arrow {
			display: none;
		}

		.edge-target {
			padding-left: var(--space-4);
			color: var(--ink-soft);
		}

		.edge-target::before {
			content: '→ ';
			color: var(--ink-faint);
		}
	}

	.edge-source,
	.edge-target {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex-wrap: wrap;
		min-width: 0;
	}

	.edge-target {
		justify-content: flex-start;
	}

	.edge-arrow {
		color: var(--ink-faint);
		text-align: center;
		flex-shrink: 0;
	}

	/* ── Entity links ── */
	.entity-link {
		color: var(--ink);
		text-decoration: none;
	}

	.entity-link:hover {
		color: var(--accent);
	}

	/* ── Kind chips (inline soft labels) ── */
	.kind-chip {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.8em;
		color: var(--ink-soft);
		flex-shrink: 0;
	}

	/* ── Missing list ── */
	.missing-section {
		margin-bottom: var(--space-7);
	}

	.missing-list {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: var(--rule-thin);
	}

	.missing-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		font-size: var(--text-sm);
	}
</style>
