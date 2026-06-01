<script lang="ts">
	import { page } from '$app/state';
	import type { EntityPageData } from './entityPage.load';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PropertyList from '$lib/components/PropertyList.svelte';
	import EntityLink from '$lib/components/EntityLink.svelte';
	import Tag from '$lib/components/Tag.svelte';
	import { SvelteSet } from 'svelte/reactivity';

	let { data }: { data: EntityPageData } = $props();

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
		entity: { id: string; name: string; summary: string | null; sigil: string | null } | null;
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
		const deduped = all.filter(
			(e) => e.kind !== 'wikilink' || !e.entity || !typedPartners.has(e.entity.id)
		);

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
		kindChip={data.kindChip}
		title={data.entity.name}
		subtitleHtml={data.entity.summaryHtml}
		language={data.language ?? undefined}
		sigil={data.entity.sigil}
	/>

	{#if data.entity.aliases.length > 0}
		<p class="aliases"><em>Also known as: {data.entity.aliases.join(', ')}</em></p>
	{/if}

	<!-- Fleuron: same ornamental chapter-mark used on collection pages,
	     marking the boundary between the editorial header zone and the
	     content body. Unconditional — every entity page has a layout
	     to follow. -->
	<div class="bt-fleuron" aria-hidden="true">
		<span class="bt-fleuron__rule"></span>
		<span class="bt-fleuron__glyph"></span>
		<span class="bt-fleuron__rule"></span>
	</div>

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

		<aside class="sidebar">
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
</article>

<style>
	.aliases {
		color: var(--ink-soft);
		margin: calc(-1 * var(--space-4)) 0 var(--space-5);
		max-width: var(--prose-max);
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
		min-width: 0;
	}

	.sidebar {
		grid-column: 5;
	}

	@media (max-width: 60rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-6);
		}

		.prose,
		.sidebar {
			grid-column: 1;
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

	.sidebar {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		font-size: var(--text-sm);
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
