<script lang="ts">
	import { page } from '$app/state';
	import type { TagPageData } from './load';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let { data }: { data: TagPageData } = $props();

	const countLabel = $derived(`${data.count} ${data.count === 1 ? 'entry' : 'entries'} tagged`);
</script>

<svelte:head>
	<title>#{data.tag} · {page.data.world.shortName}</title>
</svelte:head>

<PageHeader eyebrow={countLabel} title={`#${data.tag}`} />

{#each data.groups as group (group.type)}
	<section class="group">
		<h2 class="group-heading">
			<a href={`/${group.type}`}>{group.label.plural}</a>
		</h2>
		<div class="grid">
			{#each group.entities as entity (entity.id)}
				<EntityCard
					id={entity.id}
					name={entity.name}
					type={group.label.singular}
					kind={entity.kind}
					summaryHtml={entity.summaryHtml}
					tags={entity.tags}
				era={entity.era}
				sigil={entity.sigil}
				rank={entity.rank}
			/>
			{/each}
		</div>
	</section>
{/each}

<style>
	.group {
		margin-bottom: var(--space-7);
	}

	.group-heading {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 500;
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-soft);
		margin: 0 0 var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: var(--rule-thin);
	}

	.group-heading a {
		color: inherit;
		text-decoration: none;
	}

	.group-heading a:hover {
		color: var(--accent);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--space-5) var(--space-6);
	}
</style>
