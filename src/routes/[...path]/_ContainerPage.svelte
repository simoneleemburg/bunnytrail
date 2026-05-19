<script lang="ts">
	import type { ContainerPageData } from './_containerPage.load';
	import PageHeader from '$lib/components/PageHeader.svelte';

	interface Props {
		data: ContainerPageData;
	}

	let { data }: Props = $props();

	let eyebrow = $derived(
		data.crossLink
			? `${data.crossLink.typeLabel}: ${data.crossLink.name}`
			: `${data.totalCount} ${data.totalCount === 1 ? 'entry' : 'entries'}`
	);
</script>

<PageHeader {eyebrow} title={data.title} />

{#if data.crossLink}
	<p class="cross-link">
		See also the entity: <a href={`/${data.crossLink.id}`}>{data.crossLink.name}</a>.
	</p>
{/if}

{#if data.groups.length === 0}
	<p class="empty">No entries in this folder.</p>
{:else}
	<section class="children" aria-label="Contents">
		{#each data.groups as group (group.type)}
			{#if data.groups.length > 1}
				<h2 class="children-heading">{group.label.plural}</h2>
			{/if}
			<ul class="child-list">
				{#each group.entities as child (child.id)}
					<li class="child">
						<a href={`/${child.id}`} class="child-link">
							<span class="child-name">{child.name}</span>
							{#if child.kind}<span class="child-kind">{child.kind}</span>{/if}
						</a>
						{#if child.summaryHtml}
							<p class="child-summary">{@html child.summaryHtml}</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/each}
	</section>
{/if}

<style>
	.cross-link {
		color: var(--ink-soft);
		font-style: italic;
		margin: 0 0 var(--space-5);
	}

	.empty {
		color: var(--ink-faint);
		font-style: italic;
	}

	.children {
		margin-top: var(--space-4);
	}

	.children-heading {
		font-variant: small-caps;
		letter-spacing: 0.06em;
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--ink-soft);
		margin: var(--space-5) 0 var(--space-3);
		border-bottom: var(--rule-thin);
		padding-bottom: var(--space-1);
	}

	.child-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.child {
		margin-bottom: var(--space-3);
	}

	.child-link {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
		text-decoration: none;
		color: var(--ink);
	}

	.child-link:hover .child-name {
		text-decoration: underline;
	}

	.child-name {
		font-weight: 600;
	}

	.child-kind {
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	.child-summary {
		margin: var(--space-1) 0 0;
		color: var(--ink-soft);
		max-width: var(--prose-max);
	}
</style>
