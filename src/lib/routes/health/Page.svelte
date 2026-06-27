<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { HealthData } from './load';

	let { data }: { data: HealthData } = $props();

	const ui = $derived(t(page.data.world.language));
</script>

<svelte:head>
	<title>Health · {page.data.world.shortName}</title>
</svelte:head>

<PageHeader title={ui.health_title} />

<p class="lede">
	{ui.health_lede} <em>{ui.health_lede_good}</em>
</p>

{#if data.total === 0}
	<p class="empty"><em>{ui.health_empty}</em></p>
{:else}
	{#each data.groups as group (group.kind)}
		<section class="group">
			<h2 class="group-heading">
				{group.label}
				<span class="group-count">{group.items.length}</span>
			</h2>
			<p class="group-blurb">{group.blurb}</p>
			<ul class="issues">
				{#each group.items as item, i (i)}
					<li class="issue">
						{#if item.entity}
							{#if item.href}
								<a class="entity" href={item.href}>{item.entity}</a>
							{:else}
								<span class="entity muted">{item.entity}</span>
							{/if}
						{:else}
							<span class="entity muted">—</span>
						{/if}
						<span class="detail">{item.detail}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/if}

<style>
	.lede {
		max-width: var(--prose-max);
		color: var(--ink-soft);
		margin: 0 0 var(--space-6);
	}

	.lede em {
		color: var(--ink);
		font-style: italic;
	}

	.empty {
		color: var(--ink-faint);
	}

	.group {
		margin-bottom: var(--space-7);
	}

	.group-heading {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 500;
		color: var(--ink);
		margin: 0 0 var(--space-1);
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.group-count {
		font-size: var(--text-sm);
		font-variant: tabular-nums small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	.group-blurb {
		max-width: var(--prose-max);
		color: var(--ink-soft);
		margin: 0 0 var(--space-4);
		font-size: var(--text-sm);
	}

	.issues {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		border-top: var(--rule-thin);
	}

	.issue {
		display: grid;
		grid-template-columns: minmax(14rem, 22rem) 1fr;
		gap: var(--space-4);
		padding: var(--space-2) 0;
		border-bottom: var(--rule-thin);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
	}

	@media (max-width: 50rem) {
		.issue {
			grid-template-columns: 1fr;
			gap: var(--space-1);
		}
	}

	.entity {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.92em;
		color: var(--ink);
		text-decoration: none;
	}

	.entity:hover {
		color: var(--accent);
	}

	.entity.muted {
		color: var(--ink-faint);
		font-style: italic;
	}

	.detail {
		color: var(--ink-soft);
	}
</style>
