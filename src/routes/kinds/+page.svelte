<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { KindNode } from './+page.server';

	let {
		data
	}: {
		data: { roots: KindNode[]; unregistered: { kind: string; count: number }[] };
	} = $props();
</script>

<svelte:head>
	<title>Kinds · Alteria</title>
</svelte:head>

<PageHeader title="Kinds" />

<p class="lede">
	The full hierarchy of kinds registered across every <code>_type.yaml</code> in
	<code>content/</code>. Linked nodes have a folder of their own; unlinked
	subkinds are registered inside another type's folder.
</p>

{#snippet branch(node: KindNode)}
	<li class="kind" class:linked={node.href !== null}>
		{#if node.href}
			<a class="kind-link" href={node.href}>
				<span class="kind-name">{node.kind}</span>
				{#if node.label && node.label.toLowerCase() !== node.kind}
					<span class="kind-label">{node.label}</span>
				{/if}
				<span class="kind-count">{node.count}</span>
			</a>
		{:else}
			<span class="kind-name muted">{node.kind}</span>
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

{#if data.roots.length === 0}
	<p class="empty"><em>No kinds have been registered yet.</em></p>
{:else}
	<ul class="tree">
		{#each data.roots as root (root.kind)}
			{@render branch(root)}
		{/each}
	</ul>
{/if}

{#if data.unregistered.length > 0}
	<section class="unregistered">
		<h2 class="section-heading">Unregistered</h2>
		<p class="section-note">
			Free-form <code>kind:</code> values carried by entities but not declared in
			any <code>_type.yaml</code>. Promote them into the hierarchy when their meaning
			settles.
		</p>
		<ul class="unregistered-list">
			{#each data.unregistered as item (item.kind)}
				<li>
					<span class="kind-name muted">{item.kind}</span>
					<span class="kind-count">{item.count}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.lede {
		max-width: var(--prose-max);
		color: var(--ink-soft);
		margin: 0 0 var(--space-6);
	}

	.lede code {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.92em;
		color: var(--ink);
	}

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

	.kind-link {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-3);
		text-decoration: none;
		color: inherit;
		width: fit-content;
	}

	.kind-link:hover .kind-name {
		color: var(--accent);
	}

	.kind-name {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		color: var(--ink);
	}

	.kind-name.muted {
		color: var(--ink-faint);
		font-style: italic;
		font-size: var(--text-base);
	}

	.kind-label {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
	}

	.kind-count {
		font-size: var(--text-xs);
		font-variant: tabular-nums small-caps;
		color: var(--ink-faint);
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

	.section-note {
		max-width: var(--prose-max);
		color: var(--ink-soft);
		margin: 0 0 var(--space-5);
	}

	.section-note code {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.92em;
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
