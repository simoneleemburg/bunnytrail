<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n';
	import PageHeader from '$lib/components/PageHeader.svelte';

	interface SymbolEntry {
		id: string;
		href: string;
		name: string;
		sigil: string;
		summary: string | null;
		kind: string | null;
	}

	interface SymbolGroup {
		cluster: string | null;
		label: string | null;
		entries: SymbolEntry[];
	}

	let { data }: { data: { scope: string | null; groups: SymbolGroup[] } } = $props();

	const isEmpty = $derived(
		data.groups.length === 0 || data.groups.every((g) => g.entries.length === 0)
	);

	const showHeadings = $derived(data.scope === null && data.groups.length > 1);

	const ui = $derived(t(page.data.world.language));
</script>

<svelte:head>
	<title>Symbology · {page.data.world.shortName}</title>
</svelte:head>

<PageHeader title={ui.symbology_title} />

{#if isEmpty}
	<p class="empty"><em>{ui.symbology_empty}</em></p>
{:else}
	{#each data.groups as group, i (group.cluster ?? '__ungrouped__')}
		{#if group.entries.length > 0}
			{#if showHeadings && group.label}
				<h2 class="section-heading" class:group-after-first={i > 0}>{group.label}</h2>
			{/if}
			<ul class="symbol-list" class:has-heading={showHeadings && group.label != null}>
				{#each group.entries as entry (entry.id)}
					<li class="symbol-row">
						<span class="sigil" aria-hidden="true">{entry.sigil}</span>
						<div class="symbol-info">
							<a class="symbol-name" href={entry.href}>{entry.name}</a>
							{#if entry.kind || entry.summary}
								<span class="symbol-meta">
									{#if entry.kind}<span class="symbol-kind">{entry.kind}</span>{/if}{#if entry.kind && entry.summary}<span class="meta-sep" aria-hidden="true">·</span>{/if}{#if entry.summary}<span class="symbol-summary">{entry.summary}</span>{/if}
								</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/each}
{/if}

<style>
	.empty {
		color: var(--ink-faint);
	}

	.section-heading {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 500;
		margin: 0 0 var(--space-2);
		color: var(--ink);
	}

	.section-heading.group-after-first {
		margin-top: var(--space-7);
	}

	.symbol-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
	}

	.symbol-list.has-heading {
		margin-top: 0;
	}

	.symbol-row {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-2) 0;
	}

	.sigil {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		line-height: 1;
		color: var(--accent-warm);
		flex-shrink: 0;
		width: 3.5rem;
		text-align: center;
		letter-spacing: -0.16em;
	}

	.symbol-info {
		display: flex;
		flex-direction: column;
		gap: 0;
		justify-content: center;
		min-width: 0;
	}

	.symbol-name {
		font-family: var(--font-display);
		font-size: var(--text-base);
		color: var(--ink);
		text-decoration: none;
		line-height: 1.3;
	}

	.symbol-name:hover {
		color: var(--accent-warm);
		text-decoration: underline;
	}

	.symbol-meta {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-2);
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}

	.symbol-kind {
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
	}

	.meta-sep {
		color: var(--ink-faint);
	}

	.symbol-summary {
		font-style: italic;
	}
</style>
