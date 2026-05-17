<script lang="ts">
	import type { PageData } from './$types';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PropertyList from '$lib/components/PropertyList.svelte';
	import EntityLink from '$lib/components/EntityLink.svelte';
	import Tag from '$lib/components/Tag.svelte';

	let { data }: { data: PageData } = $props();

	type EdgeWithEntity = {
		kind: string;
		note?: string;
		entity: { id: string; name: string; summary: string | null } | null;
	};

	function groupEdges<T extends { kind: string }>(edges: T[]): { kind: string; items: T[] }[] {
		const groups = new Map<string, T[]>();
		for (const e of edges) {
			if (!groups.has(e.kind)) groups.set(e.kind, []);
			groups.get(e.kind)!.push(e);
		}
		return [...groups.entries()].map(([kind, items]) => ({ kind, items }));
	}

	function labelForKind(kind: string): string {
		if (kind === 'wikilink') return 'Mentions';
		return kind.replace(/[-_]/g, ' ');
	}

	const outGroups = $derived(
		groupEdges(
			data.outEdges.map(
				(e): EdgeWithEntity => ({
					kind: e.kind,
					note: e.note,
					entity: e.toEntity
				})
			)
		)
	);

	const inGroups = $derived(
		groupEdges(
			data.inEdges.map(
				(e): EdgeWithEntity => ({
					kind: e.kind,
					note: e.note,
					entity: e.fromEntity
				})
			)
		)
	);
</script>

<svelte:head>
	<title>{data.entity.name} · Alteria</title>
</svelte:head>

<article class="entity">
	<PageHeader
		eyebrow={data.entity.kind ?? data.typeLabel.singular}
		title={data.entity.name}
		subtitle={data.entity.summary ?? undefined}
	/>

	{#if data.entity.aliases.length > 0}
		<p class="aliases"><em>Also known as: {data.entity.aliases.join(', ')}</em></p>
	{/if}

	<div class="layout">
		<div class="prose">
			{@html data.html}
		</div>

		<aside class="sidebar">
			{#if data.extra.length > 0 || data.entity.tags.length > 0}
				<section>
					<PropertyList items={data.extra} />
					{#if data.entity.tags.length > 0}
						<div class="tag-row">
							{#each data.entity.tags as tag (tag)}
								<Tag label={tag} />
							{/each}
						</div>
					{/if}
				</section>
			{/if}

			{#if outGroups.length > 0}
				<section>
					<h2 class="side-heading">Connections</h2>
					{#each outGroups as group (group.kind)}
						<div class="group">
							<div class="group-label">{labelForKind(group.kind)}</div>
							<ul>
								{#each group.items as item, i (item.entity?.id ?? i)}
									{#if item.entity}
										<li>
											<EntityLink
												id={item.entity.id}
												name={item.entity.name}
												summary={item.entity.summary}
												compact
											/>
											{#if item.note}<span class="note"> — {item.note}</span>{/if}
										</li>
									{/if}
								{/each}
							</ul>
						</div>
					{/each}
				</section>
			{/if}

			{#if inGroups.length > 0}
				<section>
					<h2 class="side-heading">Referenced by</h2>
					{#each inGroups as group (group.kind)}
						<div class="group">
							<div class="group-label">{labelForKind(group.kind)}</div>
							<ul>
								{#each group.items as item, i (item.entity?.id ?? i)}
									{#if item.entity}
										<li>
											<EntityLink
												id={item.entity.id}
												name={item.entity.name}
												summary={item.entity.summary}
												compact
											/>
										</li>
									{/if}
								{/each}
							</ul>
						</div>
					{/each}
				</section>
			{/if}
		</aside>
	</div>
</article>

<style>
	.aliases {
		color: var(--ink-soft);
		margin: calc(-1 * var(--space-4)) 0 var(--space-5);
		max-width: var(--prose-max);
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, var(--prose-max)) 16rem;
		gap: var(--space-7);
		align-items: start;
	}

	@media (max-width: 60rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-6);
		}
	}

	.prose {
		max-width: var(--prose-max);
		color: var(--ink);
	}

	.prose :global(h2) {
		font-size: var(--text-xl);
		margin-top: var(--space-6);
	}

	.prose :global(h3) {
		font-size: var(--text-lg);
		margin-top: var(--space-5);
	}

	.prose :global(p),
	.prose :global(ul),
	.prose :global(ol) {
		margin: 0 0 var(--space-4);
	}

	.prose :global(ul),
	.prose :global(ol) {
		padding-left: var(--space-5);
	}

	.prose :global(blockquote) {
		margin: var(--space-5) 0;
	}

	.sidebar {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		font-size: var(--text-sm);
	}

	.sidebar section {
		padding-top: var(--space-3);
		border-top: var(--rule-thin);
	}

	.side-heading {
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		font-weight: 500;
		font-family: var(--font-serif);
		margin: 0 0 var(--space-4);
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		margin-top: var(--space-4);
	}

	.group {
		margin-bottom: var(--space-4);
	}

	.group:last-child {
		margin-bottom: 0;
	}

	.group-label {
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		margin-bottom: var(--space-2);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.note {
		color: var(--ink-faint);
		font-style: italic;
	}
</style>
