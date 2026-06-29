<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { EntityPageData } from './entityPage.load';
	import { t } from '$lib/i18n';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PropertyList from '$lib/components/PropertyList.svelte';
	import EntityLink from '$lib/components/EntityLink.svelte';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import Tag from '$lib/components/Tag.svelte';
	import StatisticsPanel from '$lib/components/StatisticsPanel.svelte';
	import VocabularyTable from '$lib/components/VocabularyTable.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { relationLabel } from '$lib/types';
	import { toRoman } from '$lib/types';
	import { formatDate } from '$lib/dates';

	let { data }: { data: EntityPageData } = $props();

	const ui = $derived(t(page.data.world.language));
	const ornamentSvg = $derived(page.data.ornament?.svg ?? null);

	/** Format a single ISO date string using world dateFormat + language. */
	const fmt = $derived((iso: string) =>
		formatDate(iso, page.data.world?.dateFormat, page.data.world?.language ?? 'en')
	);

	const isStub = $derived(!data.html.trim() && data.chapters.length === 0 && data.childGroups.length === 0);

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

	const displayTitle = $derived(
		data.entity.entityType === 'class'
			? data.entity.plural
				? data.entity.name + ' / ' + data.entity.plural
				: data.entity.name + ' (class)'
			: (data.entity.title ?? data.entity.name)
	);

	// Tabs: shown when the entity has classMates (instances) and/or statistics.
	// "About" wraps all existing page content; "Instances" lists classMates as cards;
	// "Holders" lists qualifierHolders (entities holding this as a qualifier);
	// "Statistics" shows structured statistics blocks; "Vocabulary" shows language words.
	const hasClassMates = $derived(data.classMates.length > 0);
	const hasQualifierHolders = $derived(data.qualifierHolders.length > 0);
	const hasStatistics = $derived(data.statistics.length > 0);
	const hasVocabulary = $derived(data.vocabulary.length > 0);
	const hasTabs = $derived(hasClassMates || hasQualifierHolders || hasStatistics || hasVocabulary);
	const VALID_TABS = ['about', 'instances', 'holders', 'statistics', 'vocabulary'] as const;
	type TabId = (typeof VALID_TABS)[number];

	const activeTab = $derived.by((): TabId => {
		let param: string | null = null;
		try { param = page.url.searchParams.get('tab'); } catch { /* prerender */ }
		if (param && (VALID_TABS as readonly string[]).includes(param)) return param as TabId;
		return 'about';
	});

	const effectiveTab = $derived.by(() => {
		if (activeTab === 'instances' && !hasClassMates) return 'about';
		if (activeTab === 'holders' && !hasQualifierHolders) return 'about';
		if (activeTab === 'statistics' && !hasStatistics) return 'about';
		if (activeTab === 'vocabulary' && !hasVocabulary) return 'about';
		return activeTab;
	});

	function gotoTab(tab: TabId) {
		const url = new URL(page.url);
		if (tab === 'about') {
			url.searchParams.delete('tab');
		} else {
			url.searchParams.set('tab', tab);
		}
		goto(url.toString(), { replaceState: true, noScroll: true });
	}

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
		qualifierEntity: { id: string; name: string; href: string } | null;
		entity: {
			id: string;
			name: string;
			summary: string | null;
			sigil: string | null;
			kind: string | null;
		} | null;
		/** ISO-8601 date for temporal: moment relations. */
		date?: string;
		/** ISO-8601 range start for temporal: range relations. */
		from?: string;
		/** ISO-8601 range end for temporal: range relations. */
		to?: string;
	};

	function labelForKind(kind: string, direction: 'out' | 'in'): string {
		const entry = data.relationLabels[kind];
		if (entry) return direction === 'out' ? entry.out : entry.in;
		return relationLabel(kind, direction);
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
	 *
	 * Within a group, edges that carry a `qualifierEntity` are sub-grouped
	 * by that qualifier. Edges without a qualifier form an implicit final sub-group
	 * with no heading, so untagged members still appear.
	 */
	const relationGroups = $derived.by(() => {
		const all: EdgeWithEntity[] = [
			...data.outEdges.map(
				(e): EdgeWithEntity => ({
					kind: e.kind,
					direction: 'out' as const,
					note: e.note,
					qualifierEntity: e.qualifierEntity ?? null,
					entity: e.toEntity,
					date: e.date,
					from: e.from,
					to: e.to
				})
			),
		...data.inEdges.map(
			(e): EdgeWithEntity => ({
				kind: e.kind,
				direction: 'in' as const,
				note: e.note,
				qualifierEntity: e.qualifierEntity ?? null,
				entity: e.fromEntity,
				date: e.date,
				from: e.from,
				to: e.to
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

		type QualifierSubGroup = {
			qualifierId: string | null; // null = no qualifier (plain members)
			qualifierEntity: { id: string; name: string; href: string } | null;
			items: EdgeWithEntity[];
		};
		type Group = {
			key: string;
			label: string;
			kind: string;
			/** Present when all items share a single flat list (no qualifier sub-grouping). */
			items: EdgeWithEntity[];
			/** Present when at least one item carries a qualifierEntity — mutually exclusive with flat items. */
			qualifierSubGroups: QualifierSubGroup[] | null;
		};

		const groups = new Map<string, Group>();
		for (const edge of deduped) {
			const label = labelForKind(edge.kind, edge.direction);
			const key = `${edge.direction}:${edge.kind}`;
			if (!groups.has(key)) groups.set(key, { key, label, kind: edge.kind, items: [], qualifierSubGroups: null });
			groups.get(key)!.items.push(edge);
		}

		// For groups that contain any qualifier-annotated edge, convert to
		// sub-group structure. Qualifiers are ordered by first appearance;
		// un-qualified items collect at the end under a null key.
		for (const group of groups.values()) {
			const hasQualifiers = group.items.some((e) => e.qualifierEntity !== null);
			if (!hasQualifiers) continue;

			const subMap = new Map<string | null, QualifierSubGroup>();
			for (const edge of group.items) {
				const qualifierId = edge.qualifierEntity?.id ?? null;
				if (!subMap.has(qualifierId)) {
					subMap.set(qualifierId, { qualifierId, qualifierEntity: edge.qualifierEntity, items: [] });
				}
				subMap.get(qualifierId)!.items.push(edge);
			}
			// Named qualifiers first (insertion order), then null (plain members).
			const named = [...subMap.entries()].filter(([k]) => k !== null).map(([, v]) => v);
			const plain = subMap.get(null);
			group.qualifierSubGroups = plain ? [...named, plain] : named;
		}

		// Sort items within each group by temporal date (moment: date, range: from), nulls last.
		for (const group of groups.values()) {
			const temporalKey = (e: EdgeWithEntity): string | undefined => e.date ?? e.from;
			const hasAnyTemporal = group.items.some((e) => temporalKey(e) !== undefined);
			if (!hasAnyTemporal) continue;
			const sortItems = (items: EdgeWithEntity[]) =>
				items.sort((a, b) => {
					const ta = temporalKey(a);
					const tb = temporalKey(b);
					if (ta && tb) return ta.localeCompare(tb);
					if (ta) return -1;
					if (tb) return 1;
					return 0;
				});
			sortItems(group.items);
			if (group.qualifierSubGroups) {
				for (const sub of group.qualifierSubGroups) sortItems(sub.items);
			}
		}

		// Groups with temporal data first (earliest anchor first), then
		// non-temporal typed relations, then wikilink mentions.
		const temporalKey = (e: EdgeWithEntity): string | undefined => e.date ?? e.from;
		const groupEarliestTemporal = (g: Group): string | undefined => {
			for (const item of g.items) {
				const t = temporalKey(item);
				if (t) return t;
			}
			return undefined;
		};

		const withTemporal: Group[] = [];
		const typedOnly: Group[] = [];
		const mentions: Group[] = [];
		for (const g of groups.values()) {
			if (g.kind === 'wikilink') { mentions.push(g); continue; }
			if (groupEarliestTemporal(g) !== undefined) withTemporal.push(g);
			else typedOnly.push(g);
		}
		withTemporal.sort((a, b) => {
			const ta = groupEarliestTemporal(a)!;
			const tb = groupEarliestTemporal(b)!;
			return ta.localeCompare(tb);
		});
		return [...withTemporal, ...typedOnly, ...mentions];
	});
</script>

<svelte:head>
	<title>{displayTitle} · {page.data.world.shortName}</title>
</svelte:head>

<article class="entity">
	<PageHeader
		breadcrumbs={data.breadcrumbs}
		kindChip={effectiveKindChip}
		title={displayTitle}
		subtitleHtml={data.entity.summaryHtml}
		language={data.language ?? undefined}
		sigil={data.entity.sigil}
	/>

	{#if data.entity.aliases.length > 0}
		<p class="aliases"><em>{ui.entity_also_known_as} {data.entity.aliases.join(', ')}</em></p>
	{/if}

	{#if hasTabs}
		<div class="tabs" role="tablist" aria-label={ui.entity_sections_aria}>
			<button
				type="button"
				role="tab"
				class="tab"
				aria-selected={effectiveTab === 'about'}
				class:active={effectiveTab === 'about'}
				onclick={() => gotoTab('about')}
			>
				{ui.entity_tab_about}
			</button>
			{#if hasClassMates}
				<button
					type="button"
					role="tab"
					class="tab"
				aria-selected={effectiveTab === 'instances'}
				class:active={effectiveTab === 'instances'}
					onclick={() => gotoTab('instances')}
				>
					{ui.entity_tab_instances}
				</button>
			{/if}
			{#if hasQualifierHolders}
				<button
					type="button"
					role="tab"
					class="tab"
					aria-selected={effectiveTab === 'holders'}
					class:active={effectiveTab === 'holders'}
					onclick={() => gotoTab('holders')}
				>
					{ui.entity_tab_holders}
				</button>
			{/if}
			{#if hasStatistics}
				<button
					type="button"
					role="tab"
					class="tab"
				aria-selected={effectiveTab === 'statistics'}
				class:active={effectiveTab === 'statistics'}
					onclick={() => gotoTab('statistics')}
				>
					{ui.entity_tab_statistics}
				</button>
			{/if}
			{#if hasVocabulary}
				<button
					type="button"
					role="tab"
					class="tab"
				aria-selected={effectiveTab === 'vocabulary'}
				class:active={effectiveTab === 'vocabulary'}
					onclick={() => gotoTab('vocabulary')}
				>
					{ui.entity_tab_vocabulary}
				</button>
			{/if}
		</div>
	{/if}

	{#if !hasTabs || effectiveTab === 'about'}

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
		<nav class="rank-nav" aria-label={ui.entity_rank_nav_aria}>
			{#if data.rankNav.prev}
				<a
					class="rank-nav__item rank-nav__item--prev"
				href="/{data.rankNav.prev.id}"
				aria-label={ui.entity_rank_prev_aria(data.rankNav.prev.name)}
			>
				<span class="rank-nav__arrow" aria-hidden="true">←</span>
				<span>{ui.entity_rank_prev_label}</span>
				</a>
			{:else}
				<span class="rank-nav__item rank-nav__item--prev rank-nav__item--empty"></span>
			{/if}
			{#if data.rankNav.next}
				<a
					class="rank-nav__item rank-nav__item--next"
				href="/{data.rankNav.next.id}"
				aria-label={ui.entity_rank_next_aria(data.rankNav.next.name)}
			>
				<span>{ui.entity_rank_next_label}</span>
				<span class="rank-nav__arrow" aria-hidden="true">→</span>
				</a>
			{:else}
				<span class="rank-nav__item rank-nav__item--next rank-nav__item--empty"></span>
			{/if}
		</nav>
	{/if}

	{#if isStub}
		<div class="layout layout--stub">
			{#if data.profileUrl}
				<div class="stub-profile">
					<img src={data.profileUrl} alt={data.entity.name} class="profile-img" />
					{#if data.extra.length > 0}
						<section class="stub-profile__props">
							<PropertyList items={data.extra} />
						</section>
					{/if}
				</div>
			{/if}
			<aside class="sidebar sidebar--stub" class:sidebar--stub-with-profile={!!data.profileUrl}>
				{#if data.craftHref}
					<section class="craft-link" aria-label={ui.entity_craft_aria}>
						<a href={data.craftHref}>{ui.entity_craft_link}</a>
					</section>
				{/if}

				{#if data.namesInOtherLanguages.length > 0}
					<section class="names-in-languages">
						<dl>
							{#each data.namesInOtherLanguages as entry (entry.langCode)}
								<dt>
									{#if entry.langHref}
										<a href={entry.langHref}>{entry.langName}</a>
									{:else}
										{entry.langName}
									{/if}
								</dt>
								<dd>
									{entry.word}{#if entry.notes}<span class="names-note">{entry.notes}</span>{/if}
								</dd>
							{/each}
						</dl>
					</section>
				{/if}

				{#if !data.profileUrl && data.extra.length > 0}
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
										{#if i > 0},{/if}<a class="kind-ref" href={item.href}>{item.label}</a>
									{/each}
								</dd>
							{/each}
						</dl>
					</section>
				{/if}

				{#if relationGroups.length > 0}
					<section class="relations">
						{#each relationGroups as group, gi (group.key)}
							<div class="group">
								<div class="group-label">
									{group.label}
								</div>
								{#if group.qualifierSubGroups}
									{#each group.qualifierSubGroups as sub (sub.qualifierId ?? '__plain__')}
										{@const subKey = group.key + ':' + (sub.qualifierId ?? '__plain__')}
										{@const isExpanded = expanded.has(subKey)}
										{@const visible = sub.items.length > COLLAPSE_AT && !isExpanded ? sub.items.slice(0, COLLAPSE_AT) : sub.items}
										{#if sub.qualifierEntity}
											<div class="qualifier-sub-label">
												<a href={sub.qualifierEntity.href}>{sub.qualifierEntity.name}</a>
											</div>
										{/if}
										<ul>
											{#each visible as item, i (item.entity?.id ?? i)}
												{#if item.entity}
													<li>
														<EntityLink id={item.entity.id} name={item.entity.name} summary={item.entity.summary} sigil={item.entity.sigil} kind={item.entity.kind} compact />
														{#if item.date}<span class="rel-temporal">{fmt(item.date)}</span>{:else if item.from || item.to}<span class="rel-temporal">{item.from ? fmt(item.from) : '?'}–{item.to ? fmt(item.to) : '?'}</span>{/if}
														{#if item.note}<span class="note"> — {item.note}</span>{/if}
													</li>
												{/if}
											{/each}
										</ul>
										{#if sub.items.length > COLLAPSE_AT}
											<button type="button" class="show-toggle" onclick={() => toggle(subKey)}>
												{isExpanded ? ui.entity_show_fewer : ui.entity_show_all(sub.items.length)}
											</button>
										{/if}
									{/each}
								{:else}
									{@const isExpanded = expanded.has(group.key)}
									{@const visible = group.items.length > COLLAPSE_AT && !isExpanded ? group.items.slice(0, COLLAPSE_AT) : group.items}
									<ul>
										{#each visible as item, i (item.entity?.id ?? i)}
											{#if item.entity}
												<li>
													<EntityLink id={item.entity.id} name={item.entity.name} summary={item.entity.summary} sigil={item.entity.sigil} kind={item.entity.kind} compact />
													{#if item.date}<span class="rel-temporal">{fmt(item.date)}</span>{:else if item.from || item.to}<span class="rel-temporal">{item.from ? fmt(item.from) : '?'}–{item.to ? fmt(item.to) : '?'}</span>{/if}
													{#if item.note}<span class="note"> — {item.note}</span>{/if}
												</li>
											{/if}
										{/each}
									</ul>
									{#if group.items.length > COLLAPSE_AT}
										<button type="button" class="show-toggle" onclick={() => toggle(group.key)}>
											{isExpanded ? ui.entity_show_fewer : ui.entity_show_all(group.items.length)}
										</button>
									{/if}
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

			{#if data.timelineBacklinks.length > 0 || relationGroups.length > 0}
				<aside class="sidebar sidebar--stub sidebar--stub-extra">
					{#if relationGroups.length > 0}
						<a class="graph-link" href={'/graph?node=' + encodeURIComponent(data.entity.id)}>{ui.entity_graph_link}</a>
					{/if}
					{#if data.timelineBacklinks.length > 0}
					<section class="timeline-backlinks">
						<div class="group-label">{ui.entity_timelines}</div>
						<ul>
							{#each data.timelineBacklinks as tl (tl.href)}
								<li>
									<a class="timeline-backlink" href={tl.href}>{tl.title}</a>
									{#if tl.firstYear !== null}
										<span class="timeline-backlink__years">
											{tl.firstYear}{tl.lastYear !== null && tl.lastYear !== tl.firstYear ? `–${tl.lastYear}` : ''}
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
					{/if}
				</aside>
			{/if}
		</div>
	{:else}

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
			<section class="chapters" aria-label={data.book?.unitPlural ?? ui.entity_chapters_fallback}>
				<h2 class="chapters-heading">{data.book?.unitPlural ?? ui.entity_chapters_fallback}</h2>
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
				<section class="children" aria-label={ui.entity_children_aria}>
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
			{#if data.profileUrl}
				<section class="sidebar-profile">
					<img src={data.profileUrl} alt={data.entity.name} class="profile-img" />
				</section>
			{/if}

			{#if data.craftHref}
				<!-- Sub-page link to the author's-room companion
				     document. Lives in the sidebar (alongside the
				     property list, kind refs, and relations) rather
				     than the prose flow, so it reads as one of the
				     entity's structural facets — a separate document
				     about this subject — instead of being mistaken
				     for an in-world section heading. -->
			<section class="craft-link" aria-label={ui.entity_craft_aria}>
				<a href={data.craftHref}>{ui.entity_craft_link}</a>
				</section>
			{/if}

			{#if data.namesInOtherLanguages.length > 0}
				<section class="names-in-languages">
					<dl>
						{#each data.namesInOtherLanguages as entry (entry.langCode)}
							<dt>
								{#if entry.langHref}
									<a href={entry.langHref}>{entry.langName}</a>
								{:else}
									{entry.langName}
								{/if}
							</dt>
							<dd>
								{entry.word}{#if entry.notes}<span class="names-note">{entry.notes}</span>{/if}
							</dd>
						{/each}
					</dl>
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
					{#each relationGroups as group, gi (group.key)}
						<div class="group">
							<div class="group-label">
								{group.label}
								{#if gi === 0}
									<a class="graph-link" href={'/graph?node=' + encodeURIComponent(data.entity.id)}>{ui.entity_graph_link}</a>
								{/if}
							</div>
						{#if group.qualifierSubGroups}
							{#each group.qualifierSubGroups as sub (sub.qualifierId ?? '__plain__')}
								{@const subKey = group.key + ':' + (sub.qualifierId ?? '__plain__')}
								{@const isExpanded = expanded.has(subKey)}
								{@const visible =
									sub.items.length > COLLAPSE_AT && !isExpanded
										? sub.items.slice(0, COLLAPSE_AT)
										: sub.items}
								{#if sub.qualifierEntity}
									<div class="qualifier-sub-label">
										<a href={sub.qualifierEntity.href}>{sub.qualifierEntity.name}</a>
									</div>
								{/if}
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
													{#if item.date}
														<span class="rel-temporal">{fmt(item.date)}</span>
													{:else if item.from || item.to}
														<span class="rel-temporal">{item.from ? fmt(item.from) : '?'}–{item.to ? fmt(item.to) : '?'}</span>
													{/if}
													{#if item.note}<span class="note"> — {item.note}</span>{/if}
												</li>
											{/if}
										{/each}
									</ul>
									{#if sub.items.length > COLLAPSE_AT}
										<button type="button" class="show-toggle" onclick={() => toggle(subKey)}>
											{isExpanded ? ui.entity_show_fewer : ui.entity_show_all(sub.items.length)}
										</button>
									{/if}
								{/each}
							{:else}
								{@const isExpanded = expanded.has(group.key)}
								{@const visible =
									group.items.length > COLLAPSE_AT && !isExpanded
										? group.items.slice(0, COLLAPSE_AT)
										: group.items}
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
											{#if item.date}
												<span class="rel-temporal">{fmt(item.date)}</span>
											{:else if item.from || item.to}
												<span class="rel-temporal">{item.from ? fmt(item.from) : '?'}–{item.to ? fmt(item.to) : '?'}</span>
											{/if}
												{#if item.note}<span class="note"> — {item.note}</span>{/if}
											</li>
										{/if}
									{/each}
								</ul>
							{#if group.items.length > COLLAPSE_AT}
								<button type="button" class="show-toggle" onclick={() => toggle(group.key)}>
									{isExpanded ? ui.entity_show_fewer : ui.entity_show_all(group.items.length)}
								</button>
							{/if}
							{/if}
						</div>
					{/each}
				</section>
			{/if}

			{#if data.timelineBacklinks.length > 0}
				<section class="timeline-backlinks">
					<div class="group-label">{ui.entity_timelines}</div>
					<ul>
						{#each data.timelineBacklinks as tl (tl.href)}
							<li>
								<a class="timeline-backlink" href={tl.href}>{tl.title}</a>
								{#if tl.firstYear !== null}
									<span class="timeline-backlink__years">
										{tl.firstYear}{tl.lastYear !== null && tl.lastYear !== tl.firstYear ? `–${tl.lastYear}` : ''}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
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

	{/if}

	{#if hasClassMates && effectiveTab === 'instances'}
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

	{#if hasQualifierHolders && effectiveTab === 'holders'}
		<div role="tabpanel" class="instances-panel">
			<div class="grid">
				{#each data.qualifierHolders as card (card.id)}
					<EntityCard
						id={card.id}
						name={card.name}
						type={card.typeLabel ?? 'entity'}
						kind={card.kind}
						classLabel={card.classLabel}
						classHref={card.classHref}
						summaryHtml={card.groupName
							? `<span class="holder-group">in <a href="${card.groupHref}">${card.groupName}</a></span>`
							: card.summaryHtml}
						tags={card.tags}
						era={card.era}
						sigil={card.sigil}
						rank={card.rank}
					/>
				{/each}
			</div>
		</div>
	{/if}

	{#if hasStatistics && effectiveTab === 'statistics'}
		<div role="tabpanel" class="statistics-tab-panel">
			<StatisticsPanel blocks={data.statistics} />
		</div>
	{/if}

	{#if hasVocabulary && effectiveTab === 'vocabulary'}
		<div role="tabpanel" class="vocabulary-tab-panel">
			<VocabularyTable entries={data.vocabulary} />
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

	/* Vocabulary tab panel: slightly wider to accommodate the table. */
	.vocabulary-tab-panel {
		margin-top: var(--space-5);
		max-width: 64rem;
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
		margin: 0 auto var(--space-4);
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

	/* Stub layout: no prose column.
	   On wide screens: profile image left, metadata right, side by side.
	   On narrow screens: stack vertically. */
	.layout--stub {
		--layout-max: min(80rem, calc(100vw - 2 * var(--space-8)));
		display: flex;
		justify-content: center;
		align-items: flex-start;
		gap: var(--space-8);
		flex-wrap: wrap;
		width: var(--layout-max);
		margin-inline: calc((100% - var(--layout-max)) / 2);
	}

	.stub-profile {
		flex: 0 0 auto;
		width: clamp(10rem, 20vw, 18rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.stub-profile__props {
		font-size: var(--text-sm);
	}

	.profile-img {
		display: block;
		width: 100%;
		border-radius: 4px;
		object-fit: cover;
	}

	.sidebar--stub {
		flex: 0 1 28rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		font-size: var(--text-base);
	}

	/* Third column: tijdlijnen (and any future extras). Only visible on
	   wide screens; wraps under the other columns on narrower ones. */
	.sidebar--stub-extra {
		flex: 0 1 16rem;
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

	.sidebar--stub {
		width: var(--stub-sidebar-w, 20rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		font-size: var(--text-base);
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

	/* ── Timeline backlinks ───────────────────────────────────────── */
	.timeline-backlinks ul {
		list-style: none;
		padding: 0;
		margin: var(--space-2) 0 0;
	}

	.timeline-backlinks li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin-bottom: var(--space-1);
	}

	.timeline-backlink {
		font-size: var(--text-sm);
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px solid transparent;
		transition: border-color 120ms;
	}

	.timeline-backlink:hover {
		border-bottom-color: var(--accent);
	}

	.timeline-backlink__years {
		font-size: var(--text-xs);
		color: var(--ink-faint);
		font-variant-numeric: tabular-nums;
	}

	.rel-temporal {
		display: inline-block;
		margin-left: 0.4em;
		font-size: var(--text-xs);
		color: var(--ink-faint);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
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
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		margin-bottom: var(--space-2);
	}

	.graph-link {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		text-decoration: none;
		margin-left: auto;
	}

	/* When graph-link is a direct child of sidebar--stub-extra it stands
	   alone (not inside a group-label flex row) so auto margin has no effect
	   and we want it left-aligned. */
	.sidebar--stub-extra > .graph-link {
		margin-left: 0;
	}

	.graph-link:hover {
		color: var(--accent);
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

	/* Qualifier sub-group heading inside a relation group. Shown as a quiet
	   small-caps label linking to the qualifier entity's own page. Appears
	   only when at least one member of the group carries a qualifier. */
	.qualifier-sub-label {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		margin-top: var(--space-3);
		margin-bottom: var(--space-1);
	}

	.qualifier-sub-label:first-child {
		margin-top: 0;
	}

	.qualifier-sub-label a {
		color: inherit;
		text-decoration: none;
	}

	.qualifier-sub-label a:hover {
		color: var(--accent);
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

	/* Profile image in the right sidebar (non-stub layout). */
	.sidebar-profile .profile-img {
		width: 100%;
		border-radius: 4px;
		object-fit: cover;
		display: block;
	}

	/* Craft sub-page link in the sidebar. Quiet by
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

	.names-in-languages dl {
		margin: 0;
		display: grid;
		grid-template-columns: max-content 1fr;
		column-gap: var(--space-4);
		row-gap: var(--space-2);
	}

	.names-in-languages dt {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		font-weight: 500;
		padding-top: 0.15em;
	}

	.names-in-languages dt a {
		color: inherit;
		text-decoration: none;
	}

	.names-in-languages dt a:hover {
		color: var(--accent);
	}

	.names-in-languages dd {
		margin: 0;
		font-family: var(--font-display);
		color: var(--ink);
	}

	.names-note {
		display: block;
		font-family: var(--font-sans, inherit);
		font-size: var(--text-xs);
		font-style: italic;
		color: var(--ink-soft);
		margin-top: 0.1em;
	}

</style>
