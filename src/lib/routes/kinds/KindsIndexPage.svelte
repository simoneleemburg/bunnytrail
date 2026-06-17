<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { KindNode, KindGroupSection } from './load';

	let {
		data
	}: {
		data: { sections: KindGroupSection[]; unregistered: { kind: string; count: number }[] };
	} = $props();

	const isGrouped = $derived(
		data.sections.length > 1 || (data.sections.length === 1 && data.sections[0].groupId !== null)
	);
</script>

<PageHeader title="Kinds" />

{#snippet branch(node: KindNode)}
	<li class="kind" class:linked={node.href !== null}>
		{#if node.href}
			<a class="bt-kind-link" href={node.href}>
				<span class="bt-kind-name">{node.kind}</span>
				{#if node.label && node.label.toLowerCase() !== node.kind}
					<span class="bt-kind-label">{node.label}</span>
				{/if}
				<span class="bt-kind-count">{node.count}</span>
			</a>
		{:else}
			<span class="bt-kind-name muted">{node.kind}</span>
		{/if}
		{#if node.children.length > 0}
			<ul class="children">
				{#each node.children as child (child.kind)}
					{@render branch(child)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

{#if data.sections.every((s) => s.roots.length === 0)}
	<p class="empty"><em>No kinds have been registered yet.</em></p>
{:else if isGrouped}
	{#each data.sections as section (section.groupId ?? '__ungrouped__')}
		<section class="kind-group">
			{#if section.groupTitle}
				<h2 class="section-heading">{section.groupTitle}</h2>
			{/if}
			{#if section.roots.length > 0}
				<ul class="tree">
					{#each section.roots as root (root.kind)}
						{@render branch(root)}
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
{:else}
	<ul class="tree">
		{#each data.sections[0].roots as root (root.kind)}
			{@render branch(root)}
		{/each}
	</ul>
{/if}

{#if data.unregistered.length > 0}
	<section class="unregistered">
		<h2 class="section-heading">Unregistered</h2>
		<ul class="unregistered-list">
			{#each data.unregistered as item (item.kind)}
				<li>
					<span class="bt-kind-name muted">{item.kind}</span>
					<span class="bt-kind-count">{item.count}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.empty {
		color: var(--ink-faint);
	}

	.tree,
	.children {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.children {
		margin-left: var(--space-5);
		padding-left: var(--space-5);
		border-left: 1px solid var(--rule);
		margin-top: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.tree {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.kind {
		display: flex;
		flex-direction: column;
	}

	.kind-group {
		margin-top: var(--space-7);
	}

	.kind-group:first-child {
		margin-top: 0;
	}

	.unregistered {
		margin-top: var(--space-7);
	}

	.section-heading {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 500;
		margin: 0 0 var(--space-2);
		color: var(--ink);
	}

	.unregistered-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-5);
	}

	.unregistered-list li {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
	}
</style>
