<script lang="ts">
	import EntityCard from '$lib/components/EntityCard.svelte';
	import EntityLink from '$lib/components/EntityLink.svelte';
	import type { KindCard, KindRefSection, KindSliceNode } from './+page.server';

	let {
		data,
		upHref = '/kinds'
	}: {
		data: {
			kindId: string;
			singular: string;
			plural: string;
			description: string | null;
			bodyHtml: string | null;
			slice: KindSliceNode | null;
			direct: KindCard[];
			kindRefSections: KindRefSection[];
			backlinks: KindCard[];
		};
		upHref?: string;
	} = $props();

	// Tabs split the page into the editorial story (About: prose +
	// a sidebar of cross-references) and the populated membership
	// view (Instances: direct entity cards). Either tab is hidden
	// when its content is empty; if only one has content the strip
	// is skipped entirely and that tab's content renders unframed.
	const hasRefs = $derived(data.kindRefSections.length > 0 || data.backlinks.length > 0);
	const hasAbout = $derived(Boolean(data.description) || Boolean(data.bodyHtml) || hasRefs);
	const hasInstances = $derived(data.direct.length > 0);
	const tabCount = $derived((hasAbout ? 1 : 0) + (hasInstances ? 1 : 0));

	let activeTab: 'about' | 'instances' = $state('about');
	// If the default tab has no content, fall back to the other one
	// on first render. Pure derivation from props — no effect needed.
	const currentTab = $derived.by(() => {
		if (activeTab === 'about' && !hasAbout && hasInstances) return 'instances';
		if (activeTab === 'instances' && !hasInstances && hasAbout) return 'about';
		return activeTab;
	});
</script>

{#snippet branch(node: KindSliceNode)}
	<li class="kind" class:current={node.isCurrent}>
		{#if node.isCurrent}
			<span class="kind-link">
				<span class="kind-name">{node.kind}</span>
				{#if node.label && node.label.toLowerCase() !== node.kind}
					<span class="kind-label">{node.label}</span>
				{/if}
				<span class="kind-count">{node.count}</span>
			</span>
		{:else if node.href}
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

<header class="kind-header">
	<a class="up-link" href={upHref} aria-label="Up to Kinds">
		<span class="up-arrow" aria-hidden="true">↑</span>Kinds
	</a>
	{#if data.slice && (data.slice.children.length > 0 || !data.slice.isCurrent)}
		<ul class="tree">
			{@render branch(data.slice)}
		</ul>
	{/if}
	<div class="double-rule"></div>
</header>

{#snippet aboutPanel()}
	<div class="about-layout" class:has-sidebar={hasRefs}>
		<div class="about-main">
			{#if data.description}
				<p class="lede">{data.description}</p>
			{/if}

			{#if data.bodyHtml}
				<div class="prose">{@html data.bodyHtml}</div>
			{/if}
		</div>

		{#if hasRefs}
			<aside class="sidebar">
				{#each data.kindRefSections as section (section.field)}
					<section class="ref-block">
						<h2 class="ref-heading">{section.heading}</h2>
						<ul class="ref-list">
							{#each section.cards as card (card.id)}
								<li>
									<EntityLink id={card.id} name={card.name} summary={null} />
									{#if card.typeLabel}<span class="ref-type">· {card.typeLabel}</span>{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}

				{#if data.backlinks.length > 0}
					<section class="ref-block">
						<h2 class="ref-heading">Mentioned in</h2>
						<ul class="ref-list">
							{#each data.backlinks as card (card.id)}
								<li>
									<EntityLink id={card.id} name={card.name} summary={null} />
									{#if card.typeLabel}<span class="ref-type">· {card.typeLabel}</span>{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			</aside>
		{/if}
	</div>
{/snippet}

{#snippet instancesPanel()}
	{#if data.direct.length > 0}
		<section class="kind-section">
			<div class="grid">
				{#each data.direct as card (card.id)}
					<EntityCard
						id={card.id}
						name={card.name}
						type={card.typeLabel ?? data.singular}
						kind={card.kind}
						summaryHtml={card.summaryHtml}
						tags={card.tags}
						era={card.era}
						sigil={card.sigil}
					/>
				{/each}
			</div>
		</section>
	{/if}
{/snippet}

{#if tabCount > 1}
	<div class="tabs" role="tablist" aria-label="Kind sections">
		<button
			type="button"
			role="tab"
			class="tab"
			aria-selected={currentTab === 'about'}
			class:active={currentTab === 'about'}
			onclick={() => (activeTab = 'about')}
		>
			About
		</button>
		<button
			type="button"
			role="tab"
			class="tab"
			aria-selected={currentTab === 'instances'}
			class:active={currentTab === 'instances'}
			onclick={() => (activeTab = 'instances')}
		>
			Instances
		</button>
	</div>

	<div role="tabpanel">
		{#if currentTab === 'about'}
			{@render aboutPanel()}
		{:else}
			{@render instancesPanel()}
		{/if}
	</div>
{:else if hasAbout}
	{@render aboutPanel()}
{:else if hasInstances}
	{@render instancesPanel()}
{/if}

<style>
	.tabs {
		display: flex;
		gap: var(--space-4);
		margin: 0 0 var(--space-5) 0;
	}

	.tab {
		appearance: none;
		background: none;
		border: none;
		padding: 0 0 var(--space-2) 0;
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		cursor: pointer;
		border-bottom: 1px solid transparent;
		transition:
			color 120ms ease,
			border-color 120ms ease;
	}

	.tab:hover {
		color: var(--accent);
	}

	.tab.active {
		color: var(--ink);
		border-bottom-color: var(--accent);
	}

	/* Two-column About layout: prose left, references sidebar right.
	   When there's nothing for the sidebar, fall back to a single
	   column so the prose still claims the prose-max width on its
	   own. Mirrors the entity-page layout pattern. */
	.about-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-7);
		align-items: start;
	}

	.about-layout.has-sidebar {
		grid-template-columns: minmax(0, var(--prose-max)) 16rem;
	}

	@media (max-width: 60rem) {
		.about-layout.has-sidebar {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-6);
		}
	}

	.about-main {
		min-width: 0;
	}

	.sidebar {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		font-size: var(--text-sm);
	}

	.ref-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.ref-heading {
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		font-weight: 500;
		margin: 0;
	}

	.ref-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.ref-list li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.ref-type {
		color: var(--ink-faint);
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.06em;
	}

	.lede {
		max-width: var(--prose-max);
		margin: 0 0 var(--space-5) 0;
		color: var(--ink-soft);
		font-style: italic;
	}

	.prose {
		max-width: var(--prose-max);
		margin: 0 0 var(--space-6) 0;
		color: var(--ink);
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

	.tree,
	.children {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.tree {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin: 0;
	}

	.kind-header {
		margin-bottom: var(--space-6);
	}

	.kind-header .up-link {
		display: flex;
		align-items: baseline;
		justify-content: flex-start;
		width: fit-content;
		gap: 0.35em;
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
		text-decoration: none;
		margin-bottom: var(--space-2);
	}

	.kind-header .up-link:hover {
		color: var(--accent);
	}

	.kind-header .up-arrow {
		font-variant: normal;
		letter-spacing: 0;
	}

	.kind-header .double-rule {
		border-top: var(--rule-double);
		margin-top: var(--space-3);
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

	a.kind-link:hover .kind-name {
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

	.kind.current > .kind-link .kind-name {
		font-weight: 600;
		color: var(--accent);
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

	.kind-section {
		margin: 0 0 var(--space-7) 0;
	}

	.kind-section:last-of-type {
		margin-bottom: 0;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--space-5) var(--space-6);
	}
</style>
