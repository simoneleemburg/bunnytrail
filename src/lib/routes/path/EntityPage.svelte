<script lang="ts">
	import { page } from '$app/state';
	import type { EntityPageData } from './entityPage.load';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PropertyList from '$lib/components/PropertyList.svelte';
	import EntityLink from '$lib/components/EntityLink.svelte';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import Tag from '$lib/components/Tag.svelte';
	import StatisticsPanel from '$lib/components/StatisticsPanel.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { toRoman } from '$lib/types';

	let { data }: { data: EntityPageData } = $props();

	const ornamentSvg = $derived(page.data.ornament?.svg ?? null);

	const rankGlyph = $derived(
		data.kindChip?.rank != null && data.kindChip.rankDisplay !== 'none'
			? data.kindChip.rankDisplay === 'roman'
				? toRoman(data.kindChip.rank)
				: String(data.kindChip.rank)
			: null
	);

	// When the entity has a classChip (it is an instance of a class entity),
	// override the kind chip to show the class name linking to the class entity
	// instead of the kind name linking to /kinds/<id>.
	const effectiveKindChip = $derived(
		data.classChip && data.kindChip
			? { ...data.kindChip, label: data.classChip.name, href: data.classChip.href }
			: data.kindChip
	);

	// Tabs: shown when the entity has classMates (instances) and/or statistics.
	// "About" wraps all existing page content; "Instances" lists classMates as cards;
	// "Statistics" shows structured statistics blocks.
	const hasClassMates = $derived(data.classMates.length > 0);
	const hasStatistics = $derived(data.statistics.length > 0);
	const hasTabs = $derived(hasClassMates || hasStatistics);
	let activeTab: 'about' | 'instances' | 'statistics' = $state('about');

	const COLLAPSE_AT = 8;
	const expanded = new SvelteSet<string>();

	function toggle(label: string) {
		if (expanded.has(label)) expanded.delete(label);
		else expanded.add(label);
	}

	type EdgeWithEntity = {
		kind: string;
		direction: 'out' | 'in';
		note?: string;
		entity: {
			id: string;
			name: string;
			summary: string | null;
			sigil: string | null;
			kind: string | null;
		} | null;
	};

	function labelForKind(kind: string, direction: 'out' | 'in'): string {
		if (kind === 'wikilink') {
			return direction === 'out' ? 'Mentions' : 'Mentioned by';
		}
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
				'located-in': 'Located here',
				'is-a': 'Includes',
				'member-of': 'Bodies',
				'occurred-on': 'Events',
				'occurred-in': 'Events',
				records: 'Recorded in',
				'recorded-on': 'Account',
				orbits: 'Moons',
				'governed-by': 'Governs',
				'local-account-of': 'Local accounts',
				approaches: 'Approached by',
				'defined-by': 'Defines',
				'bounded-by': 'Bounds'
			};
			if (inverse[kind]) return inverse[kind];
		}
		return kind.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
	}

	/**
	 * Humanise a YAML field name for use as a sidebar label on
	 * structured kind-link blocks. `camelCase`, `kebab-case` and
	 * `snake_case` all become space-separated words. The first
	 * letter is *not* capitalised here — the dt element styling
	 * (small-caps) handles visual register, so keeping the
	 * underlying text lower-case avoids double-capitalisation.
	 */
	function humaniseField(field: string): string {
		return field
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.replace(/[-_]/g, ' ')
			.toLowerCase();
	}

	/**
	 * Format a chapter ordinal as a Roman numeral. Used for the
	 * book-mode TOC and chapter-page eyebrows. Returns the original
	 * number as a string for values outside 1..3999 (we don't expect
	 * works that long, but the fallback keeps render safe).
	 */
	function romanise(n: number): string {
		if (!Number.isFinite(n) || n < 1 || n > 3999) return String(n);
		const pairs: [number, string][] = [
			[1000, 'M'],
			[900, 'CM'],
			[500, 'D'],
			[400, 'CD'],
			[100, 'C'],
			[90, 'XC'],
			[50, 'L'],
			[40, 'XL'],
			[10, 'X'],
			[9, 'IX'],
			[5, 'V'],
			[4, 'IV'],
			[1, 'I']
		];
		let v = Math.floor(n);
		let out = '';
		for (const [k, r] of pairs) {
			while (v >= k) {
				out += r;
				v -= k;
			}
		}
		return out;
	}

	/**
	 * Single flat stream of relationships, regardless of arrow direction.
	 * Each (kind, direction) pair gets its own labelled bucket — so an
	 * "is-a" pointing out reads as "is a" while an "is-a" pointing in
	 * reads as "Includes". The user shouldn't have to think about which
	 * way the underlying edge points.
	 */
	const relationGroups = $derived.by(() => {
		const all: EdgeWithEntity[] = [
			...data.outEdges.map(
				(e): EdgeWithEntity => ({
					kind: e.kind,
					direction: 'out' as const,
					note: e.note,
					entity: e.toEntity
				})
			),
			...data.inEdges.map(
				(e): EdgeWithEntity => ({
					kind: e.kind,
					direction: 'in' as const,
					note: e.note,
					entity: e.fromEntity
				})
			)
		];

		// Suppress wikilink edges that duplicate a typed relation
		// between the same two entities. If there is *any* typed
		// relation connecting this entity to Y (in either
		// direction), the typed relation alone tells the story —
		// the wikilink "Mentions" / "Mentioned by" groups would
		// just repeat Y. The typed channel is the structured
		// signal; wikilinks are the residual prose layer that
		// hasn't (yet) been promoted to relations.
		const typedPartners = new Set<string>();
		for (const e of all) {
			if (e.kind !== 'wikilink' && e.entity) typedPartners.add(e.entity.id);
		}

		// Collect all entity ids that appear under outgoing wikilinks
		// ("Mentions"). Any entity that is already listed there does
		// not need to appear again under incoming wikilinks
		// ("Mentioned by"), so we track them and filter below.
		const mentionedOutIds = new Set<string>();
		for (const e of all) {
			if (e.kind === 'wikilink' && e.direction === 'out' && e.entity) {
				mentionedOutIds.add(e.entity.id);
			}
		}

		const deduped = all.filter((e) => {
			if (!e.entity) return true;
			// Drop self-links (entity mentions or links to itself).
			if (e.entity.id === data.entity.id) return false;
			// Drop wikilinks to entities that already have a typed relation.
			if (e.kind === 'wikilink' && typedPartners.has(e.entity.id)) return false;
			// Drop "Mentioned by" entries that are already under "Mentions".
			if (e.kind === 'wikilink' && e.direction === 'in' && mentionedOutIds.has(e.entity.id))
				return false;
			return true;
		});

		type Group = { key: string; label: string; kind: string; items: EdgeWithEntity[] };
		const groups = new Map<string, Group>();
		for (const edge of deduped) {
			const label = labelForKind(edge.kind, edge.direction);
			const key = `${edge.direction}:${edge.kind}`;
			if (!groups.has(key)) groups.set(key, { key, label, kind: edge.kind, items: [] });
			groups.get(key)!.items.push(edge);
		}

		// Typed relations first (the structured signal), then wikilink
		// mentions at the bottom (the noisier prose layer). Within each
		// tier, preserve insertion order so authors get a predictable
		// reading order tied to how the page declares its connections.
		const typed: Group[] = [];
		const mentions: Group[] = [];
		for (const g of groups.values()) {
			if (g.kind === 'wikilink') mentions.push(g);
			else typed.push(g);
		}
		return [...typed, ...mentions];
	});
</script>

<svelte:head>
	<title>{data.entity.name} · {page.data.world.shortName}</title>
</svelte:head>

<article class="entity">
	<PageHeader
		breadcrumbs={data.breadcrumbs}
		kindChip={effectiveKindChip}
		title={data.entity.name}
		subtitleHtml={data.entity.summaryHtml}
		language={data.language ?? undefined}
		sigil={data.entity.sigil}
	/>

	{#if data.entity.aliases.length > 0}
		<p class="aliases"><em>Also known as: {data.entity.aliases.join(', ')}</em></p>
	{/if}

	{#if hasTabs}
		<div class="tabs" role="tablist" aria-label="Entity sections">
			<button
				type="button"
				role="tab"
				class="tab"
				aria-selected={activeTab === 'about'}
				class:active={activeTab === 'about'}
				onclick={() => (activeTab = 'about')}
			>
				About
			</button>
			{#if hasClassMates}
				<button
					type="button"
					role="tab"
					class="tab"
					aria-selected={activeTab === 'instances'}
					class:active={activeTab === 'instances'}
					onclick={() => (activeTab = 'instances')}
				>
					Instances
				</button>
			{/if}
			{#if hasStatistics}
				<button
					type="button"
					role="tab"
					class="tab"
					aria-selected={activeTab === 'statistics'}
					class:active={activeTab === 'statistics'}
					onclick={() => (activeTab = 'statistics')}
				>
					Statistics
				</button>
			{/if}
		</div>
	{/if}

	{#if !hasTabs || activeTab === 'about'}

	<!-- Fleuron: same ornamental chapter-mark used on collection pages,
	     marking the boundary between the editorial header zone and the
	     content body. Unconditional — every entity page has a layout
	     to follow. When the entity has a rank, the rank numeral
	     replaces the ornament glyph in the centre of the rule. -->
	<div class="bt-fleuron" aria-hidden="true">
		<span class="bt-fleuron__rule"></span>
		{#if rankGlyph != null}
			<span class="bt-fleuron__glyph bt-fleuron__glyph--rank">{rankGlyph}</span>
		{:else if ornamentSvg}
			<span class="bt-fleuron__glyph bt-fleuron__glyph--svg">{@html ornamentSvg}</span>
		{:else}
			<span class="bt-fleuron__glyph"></span>
		{/if}
		<span class="bt-fleuron__rule"></span>
	</div>

	{#if data.rankNav}
		<nav class="rank-nav" aria-label="Ranked navigation">
			{#if data.rankNav.prev}
				<a
					class="rank-nav__item rank-nav__item--prev"
					href="/{data.rankNav.prev.id}"
					aria-label="Previous: {data.rankNav.prev.name}"
				>
					<span class="rank-nav__arrow" aria-hidden="true">←</span>
					<span>back</span>
				</a>
			{:else}
				<span class="rank-nav__item rank-nav__item--prev rank-nav__item--empty"></span>
			{/if}
			{#if data.rankNav.next}
				<a
					class="rank-nav__item rank-nav__item--next"
					href="/{data.rankNav.next.id}"
					aria-label="Next: {data.rankNav.next.name}"
				>
					<span>next</span>
					<span class="rank-nav__arrow" aria-hidden="true">→</span>
				</a>
			{:else}
				<span class="rank-nav__item rank-nav__item--next rank-nav__item--empty"></span>
			{/if}
		</nav>
	{/if}

	<div class="layout">
		<div class="prose">
			{@html data.html}

			<!-- Ornamental rule between the entity's free-form prose
			     and the structural sub-sections that follow
			     (chapters, contained children). Only renders when
			     both halves exist, so a body-only entity ends
			     cleanly and a chapter-list-only entity doesn't
			     open with an orphan rule. The rule itself is
			     decorated by the world theme — see theme.css
			     `hr::before` for the alteria treatment. -->
			{#if data.html.trim().length > 0 && (data.chapters.length > 0 || data.childGroups.length > 0)}
				<hr class="prose-end" />
			{/if}

			{#if data.chapters.length > 0}
				<section class="chapters" aria-label={data.book?.unitPlural ?? 'Chapters'}>
					<h2 class="chapters-heading">{data.book?.unitPlural ?? 'Chapters'}</h2>
					<ol class="chapter-list">
						{#each data.chapters as ch (ch.slug)}
							<li class="chapter-item">
								<a class="chapter-link" href={ch.href}>
									<span class="chapter-numeral">{romanise(ch.order)}</span>
									<span class="chapter-title">{ch.title}</span>
								</a>
							</li>
						{/each}
					</ol>
				</section>
			{/if}

			{#if data.childGroups.length > 0}
				<section class="children" aria-label="Contents">
					{#each data.childGroups as group (group.kindId)}
						<h2 class="children-heading">
							{group.label.plural}
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

		<aside class="sidebar sidebar--top">
			{#if data.craftHref}
				<!-- Sub-page link to the author's-room companion
				     document. Lives in the sidebar (alongside the
				     property list, kind refs, and relations) rather
				     than the prose flow, so it reads as one of the
				     entity's structural facets — a separate document
				     about this subject — instead of being mistaken
				     for an in-world section heading. -->
				<section class="craft-link" aria-label="Author's notes">
					<a href={data.craftHref}>Craft sheet →</a>
				</section>
			{/if}

			{#if data.extra.length > 0}
				<section>
					<PropertyList items={data.extra} />
				</section>
			{/if}

			{#if data.kindRefs.length > 0}
				<section class="kind-refs">
					<dl>
						{#each data.kindRefs as group (group.field)}
							<dt>{humaniseField(group.field)}</dt>
							<dd>
								{#each group.items as item, i (item.id)}
									{#if i > 0},
									{/if}<a class="kind-ref" href={item.href}>{item.label}</a>
								{/each}
							</dd>
						{/each}
					</dl>
				</section>
			{/if}

			{#if relationGroups.length > 0}
				<section class="relations">
					{#each relationGroups as group (group.key)}
						{@const isExpanded = expanded.has(group.key)}
						{@const visible =
							group.items.length > COLLAPSE_AT && !isExpanded
								? group.items.slice(0, COLLAPSE_AT)
								: group.items}
						<div class="group">
							<div class="group-label">{group.label}</div>
							<ul>
								{#each visible as item, i (item.entity?.id ?? i)}
									{#if item.entity}
										<li>
											<EntityLink
												id={item.entity.id}
												name={item.entity.name}
												summary={item.entity.summary}
												sigil={item.entity.sigil}
												kind={item.entity.kind}
												compact
											/>
											{#if item.note}<span class="note"> — {item.note}</span>{/if}
										</li>
									{/if}
								{/each}
							</ul>
							{#if group.items.length > COLLAPSE_AT}
								<button type="button" class="show-toggle" onclick={() => toggle(group.key)}>
									{isExpanded ? 'Show fewer' : `Show all (${group.items.length})`}
								</button>
							{/if}
						</div>
					{/each}
				</section>
			{/if}

			{#if data.entity.tags.length > 0}
				<section>
					<div class="tag-row">
						{#each data.entity.tags as tag (tag)}
							<Tag label={tag} href={`/tags/${encodeURIComponent(tag)}`} />
						{/each}
					</div>
				</section>
			{/if}
		</aside>
	</div>
	{/if}

	{#if hasClassMates && activeTab === 'instances'}
		<div role="tabpanel" class="instances-panel">
			<div class="grid">
				{#each data.classMates as card (card.id)}
					<EntityCard
						id={card.id}
						name={card.name}
						type={card.typeLabel ?? 'entity'}
						kind={card.kind}
						summaryHtml={card.summaryHtml}
						tags={card.tags}
						era={card.era}
						sigil={card.sigil}
						rank={card.rank}
					/>
				{/each}
			</div>
		</div>
	{/if}

	{#if hasStatistics && activeTab === 'statistics'}
		<div role="tabpanel" class="statistics-tab-panel">
			<StatisticsPanel blocks={data.statistics} />
		</div>
	{/if}
</article>

<style>
	.aliases {
		color: var(--ink-soft);
		margin: calc(-1 * var(--space-4)) 0 var(--space-5);
		max-width: var(--prose-max);
	}

	/* Tab strip for About / Instances — mirrors KindPage treatment. */
	.tabs {
		display: flex;
		justify-content: center;
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
		font-variant-caps: all-small-caps;
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

	/* Instances tab panel: entity card grid, same as KindPage. */
	.instances-panel {
		margin-top: var(--space-5);
	}

	/* Statistics tab panel: centered prose column width. */
	.statistics-tab-panel {
		margin-top: var(--space-5);
		max-width: var(--prose-w, 48rem);
		margin-inline: auto;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--space-5) var(--space-6);
	}

	.rank-nav {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		max-width: var(--prose-max);
		margin: 0 auto var(--space-6);
		gap: var(--space-4);
	}

	.rank-nav__item {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4em;
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	a.rank-nav__item:hover {
		color: var(--accent-warm);
	}

	.rank-nav__item--empty {
		pointer-events: none;
	}

	.rank-nav__arrow {
		font-variant: normal;
		letter-spacing: 0;
	}

	.rank-nav__item--prev {
		text-align: left;
	}
	.rank-nav__item--next {
		text-align: right;
		margin-left: auto;
	}

	:global(.bt-fleuron__glyph--rank) {
		font-family: var(--font-serif);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		font-size: var(--text-4xl);
		color: var(--accent-warm);
		line-height: 1;
		display: inline;
		/* Serif numerals sit low in the em square; nudge up so the
		   visual midpoint of the glyph aligns with the rule line. */
		position: relative;
		top: -0.15em;
	}

	:global(.bt-fleuron .bt-fleuron__glyph--rank::before) {
		content: none;
	}

	.layout {
		--sidebar-w: 12rem;
		--prose-w: 48rem;
		--layout-max: min(80rem, calc(100vw - 2 * var(--space-8)));
		display: grid;
		/* Ghost column mirrors the sidebar so the two 1fr gutters are
		   symmetric and the prose column sits at true visual centre. */
		grid-template-columns: var(--sidebar-w) 1fr minmax(0, var(--prose-w)) 1fr var(--sidebar-w);
		gap: 0 var(--space-5);
		align-items: start;
		width: var(--layout-max);
		margin-inline: calc((100% - var(--layout-max)) / 2);
	}

	.prose {
		grid-column: 3;
		grid-row: 1 / span 99; /* span all sidebar rows so prose always fills the left column */
		min-width: 0;
	}

	.sidebar--top {
		grid-column: 5;
		grid-row: 1 / span 99;
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		font-size: var(--text-sm);
		align-self: start;
	}

	@media (max-width: 60rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-6);
		}

		.prose,
		.sidebar--top {
			grid-column: 1;
			grid-row: auto;
		}

		.sidebar--top {
			order: 1;
		}

		.prose {
			order: 0;
		}
	}

	.prose {
		max-width: var(--prose-w);
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

	.prose :global(details.collection-include) {
		margin: var(--space-5) 0;
		border-left: 2px solid var(--ink-faint, var(--ink-soft));
		padding: var(--space-2) var(--space-4);
		background: var(--surface-soft, transparent);
	}

	.prose :global(details.collection-include > summary) {
		cursor: pointer;
		font-style: italic;
		color: var(--ink-soft);
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		list-style: none;
		user-select: none;
	}

	.prose :global(details.collection-include > summary::-webkit-details-marker) {
		display: none;
	}

	.prose :global(.collection-include-marker) {
		display: inline-block;
		font-size: 0.85em;
		color: var(--ink-soft);
		transition: transform 120ms ease-out;
	}

	.prose :global(details.collection-include[open] > summary .collection-include-marker) {
		transform: rotate(90deg);
	}

	.prose :global(details.collection-include > summary:hover .collection-include-title),
	.prose :global(details.collection-include > summary:hover .collection-include-marker) {
		color: var(--ink);
	}

	.prose :global(.collection-include-title) {
		font-style: italic;
	}

	.prose :global(details.collection-include > summary:hover .collection-include-title) {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.prose :global(.collection-include-link) {
		font-size: var(--text-sm);
		font-style: normal;
	}

	.prose :global(.collection-include-body) {
		margin-top: var(--space-3);
	}

	.prose :global(.collection-include-body > *:last-child) {
		margin-bottom: 0;
	}

	/* Structured kind references (e.g. nativeBeings → [kinds/human])
	   rendered as a small dl that visually echoes PropertyList:
	   small-caps dt label, anchor chips on the right. Distinct from
	   PropertyList because each value is a link to /kinds/<id>, not
	   plain text. */
	.kind-refs dl {
		margin: 0;
		display: grid;
		grid-template-columns: max-content 1fr;
		column-gap: var(--space-4);
		row-gap: var(--space-2);
	}

	.kind-refs dt {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		font-weight: 500;
		padding-top: 0.15em;
	}

	.kind-refs dd {
		margin: 0;
		color: var(--ink);
	}

	.kind-ref {
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px solid transparent;
	}

	.kind-ref:hover {
		color: var(--accent-soft);
		border-bottom-color: var(--accent-soft);
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
	}

	/* Match collection-card / EntityCard treatment: drop the per-tag
	   hairline in the sidebar; restore on hover. */
	.tag-row :global(.tag) {
		border-bottom-color: transparent;
	}

	.tag-row :global(a.tag:hover) {
		border-bottom-color: var(--accent-warm);
	}

	.group {
		margin-bottom: var(--space-4);
	}

	.group:last-child {
		margin-bottom: 0;
	}

	.group-label {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		margin-bottom: var(--space-2);
	}

	.show-toggle {
		background: none;
		border: 0;
		padding: 0;
		margin-top: var(--space-2);
		font: inherit;
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		cursor: pointer;
	}

	.show-toggle:hover {
		color: var(--accent);
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

	/* When the ornamental prose-end rule already divides body
	   prose from the sub-section, suppress this section's own
	   top border + the extra padding it needs to clear it.
	   Keeps a single divider on the page instead of stacking
	   two. The intrinsic `margin-top` stays so the section
	   still breathes. */
	:global(hr.prose-end) + .children {
		border-top: 0;
		padding-top: 0;
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
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	.child-summary {
		margin: var(--space-1) 0 0 0;
		color: var(--ink-soft);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
	}

	/* Book-mode table of contents on the cover (entity) page.
	   The chapter pages themselves carry the strongly book-styled
	   chrome; this TOC is a quieter on-ramp sitting inside the
	   compendium-style entity layout. */
	.chapters {
		margin-top: var(--space-7);
		padding-top: var(--space-5);
		border-top: var(--rule-double);
	}

	/* See `.children` above — same suppression when the
	   ornamental prose-end rule precedes the chapters TOC. */
	:global(hr.prose-end) + .chapters {
		border-top: 0;
		padding-top: 0;
	}

	.chapters-heading {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 500;
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		color: var(--ink);
		margin: 0 0 var(--space-4) 0;
	}

	.chapter-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.chapter-item {
		padding: var(--space-2) 0;
		border-bottom: 1px dotted var(--rule);
	}

	.chapter-item:last-child {
		border-bottom: 0;
	}

	.chapter-link {
		display: grid;
		grid-template-columns: 3rem 1fr;
		align-items: baseline;
		gap: var(--space-3);
		text-decoration: none;
		color: inherit;
	}

	.chapter-link:hover .chapter-title {
		color: var(--accent);
	}

	.chapter-numeral {
		font-family: var(--font-display);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		text-align: right;
	}

	.chapter-title {
		font-family: var(--font-display);
		font-size: var(--text-base);
		color: var(--ink);
	}

	/* Sidebar link to the entity's craft sub-page. Quiet by
	   design: a single line in the same register as the other
	   sidebar metadata (small, soft ink) so it doesn't compete
	   with the in-world content for attention. */
	.craft-link a {
		font-size: var(--text-sm);
		color: var(--ink-soft);
		text-decoration: none;
	}

	.craft-link a:hover {
		color: var(--accent);
	}
</style>
