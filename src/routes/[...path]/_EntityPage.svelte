<script lang="ts">
	import type { EntityPageData } from './_entityPage.load';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PropertyList from '$lib/components/PropertyList.svelte';
	import EntityLink from '$lib/components/EntityLink.svelte';
	import Tag from '$lib/components/Tag.svelte';

	let { data }: { data: EntityPageData } = $props();

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

	function labelForKind(kind: string, direction: 'out' | 'in'): string {
		if (kind === 'wikilink') return 'Mentions';
		if (direction === 'in') {
			// Inverse labels for incoming edges. The relation is declared
			// on the *other* entity, so on this page we want the converse
			// reading. Without this, "X located-in Y" rendered on Y's page
			// as "located in: X" reads as if Y is located in X.
			const inverse: Record<string, string> = {
				'region-of': 'Regions',
				'native-to': 'Native peoples',
				'serves-in': 'Members',
				'spoken-in': 'Languages',
				orbits: 'Moons'
			};
			if (inverse[kind]) return inverse[kind];
		}
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
		subtitleHtml={data.entity.summaryHtml}
		language={data.language ?? undefined}
	/>

	{#if data.entity.aliases.length > 0}
		<p class="aliases"><em>Also known as: {data.entity.aliases.join(', ')}</em></p>
	{/if}

	<div class="layout">
		<div class="prose">
			{@html data.html}

			{#if data.childGroups.length > 0}
				<section class="children" aria-label="Contents">
					{#each data.childGroups as group (group.type)}
						<h2 class="children-heading">
							{group.label.plural} within {data.entity.name}
						</h2>
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
		</div>

		<aside class="sidebar">
			{#if data.extra.length > 0 || data.entity.tags.length > 0}
				<section>
					<PropertyList items={data.extra} />
					{#if data.entity.tags.length > 0}
						<div class="tag-row">
							{#each data.entity.tags as tag (tag)}
								<Tag label={tag} href={`/tags/${encodeURIComponent(tag)}`} />
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
							<div class="group-label">{labelForKind(group.kind, 'out')}</div>
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
							<div class="group-label">{labelForKind(group.kind, 'in')}</div>
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

	.children {
		margin-top: var(--space-7);
		padding-top: var(--space-5);
		border-top: var(--rule-thin);
	}

	.children-heading {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 500;
		color: var(--ink);
		margin: 0 0 var(--space-4) 0;
	}

	.children-heading:not(:first-child) {
		margin-top: var(--space-6);
	}

	.child-list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-5) 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.child {
		padding-top: var(--space-3);
		border-top: 1px solid var(--rule);
	}

	.child:first-child {
		border-top: 0;
		padding-top: 0;
	}

	.child-link {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		color: inherit;
		text-decoration: none;
	}

	.child-link:hover .child-name {
		color: var(--accent);
	}

	.child-name {
		font-family: var(--font-display);
		font-size: var(--text-base);
		color: var(--ink);
	}

	.child-kind {
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	.child-summary {
		margin: var(--space-1) 0 0 0;
		color: var(--ink-soft);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
	}
</style>
