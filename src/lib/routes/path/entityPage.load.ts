import { graph, byRankThenName } from '$lib/server/graph';
import type { SpeciesPresenceEntry } from '$lib/server/graph';
import { inlineSvgFigures } from '$lib/server/inlineSvgs';
import { makeCollectionResolver, renderEntityBody, renderSummary } from '$lib/server/markdown';
import { titleCaseSlug, toRoman, relationLabel, type Entity, type RankDisplay, type VocabEntry } from '$lib/types';
import type { ViewMode } from '$lib/cluster';

/**
 * Build the view-model for an entity page. Returned shape is consumed
 * by `EntityPage.svelte`.
 */
export async function loadEntityPage(entity: Entity, mode: ViewMode = 'visitor') {
	const id = entity.id;
	const type = entity.type;

	const resolveLink = (path: string) => graph.resolveLink(path, graph.clusterOf(id));
	const kindLookup = (eid: string) => graph.get(eid)?.meta.kind;
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();
	const resolveCollection = makeCollectionResolver({
		getCollection: (p) => graph.collection(p),
		folderLabels: (p) => graph.folderLabels(p),
		resolveLink,
		languageCodes,
		kindIds
	});

	const html = await inlineSvgFigures(
		renderEntityBody(entity, resolveLink, languageCodes, kindIds, resolveCollection, kindLookup)
	);

	const summaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { kindIds, kindLookup }) : null;
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true, kindIds }) : null;

	const langCode = typeof entity.meta.language === 'string' ? entity.meta.language : null;
	// If no scalar `language:` field, check vocabulary[] items for a language reference.
	// Only items with no explicit `word` field qualify — those are implicitly naming
	// the entity itself in that language, which is what the header pill signals.
	// Items that carry a distinct `word` (like an older name) go to the sidebar list
	// instead and must not trigger the pill.
	const effectiveLangCode = langCode ?? (() => {
		const vocabArr = entity.meta.vocabulary;
		if (!Array.isArray(vocabArr)) return null;
		for (const item of vocabArr) {
			if (!item || typeof item !== 'object') continue;
			const v = item as Record<string, unknown>;
			const hasWord = typeof v.word === 'string' && v.word.trim() !== '';
			if (!hasWord && typeof v.language === 'string' && v.language) return v.language;
		}
		return null;
	})();
	const langTargetId = effectiveLangCode ? languageCodes.get(effectiveLangCode) : undefined;
	const language = effectiveLangCode
		? {
				code: effectiveLangCode,
				href: langTargetId ? `/${langTargetId}` : '#',
				broken: !langTargetId
			}
		: null;

	// Breadcrumb chain: every browseable folder on the path from the
	// content root down to (and including) this entity's containing
	// folder. We render plural folder labels because parent folders
	// are narrative collections (topology), not taxonomic kinds —
	// `Places › Celestial › Aureth System` reads as "where in the
	// field-journal you are", not "this is a planet which is a
	// celestial body".
	const breadcrumbs: { label: string; href: string }[] = [];
	if (type) {
		const segs = type.split('/');
		for (let i = 1; i <= segs.length; i++) {
			const prefix = segs.slice(0, i).join('/');
			if (graph.isFolder(prefix)) {
				breadcrumbs.push({
					label: graph.folderLabels(prefix).plural,
					href: `/${prefix}`
				});
			}
		}
	}

	// Kind chip data for the header. We always emit something when
	// the entity has a kind, even an unregistered one — broken
	// chips are useful health signals, just like broken wikilinks.
	const kindId = typeof entity.meta.kind === 'string' ? entity.meta.kind : null;
	const kindObj = kindId ? graph.kind(kindId) : undefined;

	// Class chip: when the entity declares `class: <entity-id>`, resolve
	// the target entity's name and emit a chip that links to its page.
	// The class chip takes visual precedence over the kind chip on the
	// entity detail page (same slot, but class is more specific).
	const classId = typeof entity.meta.class === 'string' ? entity.meta.class : null;
	const classEntity = classId ? graph.get(classId) : null;
	const classChip = classEntity
		? { id: classId as string, name: classEntity.meta.name, href: `/${classId}` }
		: null;

	// rankDisplay for this entity's own rank glyph and prev/next nav.
	// Resolution order (first match wins):
	//   1. The containing folder's _collection.yaml / _collection.md
	//   2. The containing folder's entity (index.md), if that folder is
	//      itself an entity that carries rankDisplay in its frontmatter.
	//      This lets an entity like "The Aureth System" declare
	//      `rankDisplay: none` directly on itself and have it govern
	//      how its child planets' rank glyphs are rendered.
	//   3. Default: 'arabic'
	const folderRankDisplay: RankDisplay = (() => {
		if (!type) return 'arabic';
		const fromCollection = graph.collection(type)?.meta.rankDisplay;
		if (fromCollection) return fromCollection;
		const parentEntityRankDisplay = graph.get(type)?.meta.rankDisplay;
		if (
			parentEntityRankDisplay === 'none' ||
			parentEntityRankDisplay === 'roman' ||
			parentEntityRankDisplay === 'arabic'
		) {
			return parentEntityRankDisplay;
		}
		return 'arabic';
	})();

	const kindChip = kindId
		? {
				id: kindId,
				label: kindObj?.meta.singular ?? titleCaseSlug(kindId),
				broken: !kindObj,
				rank: typeof entity.meta.rank === 'number' ? entity.meta.rank : null,
				rankDisplay: folderRankDisplay
			}
		: null;

	const outEdges = graph.outEdges(id).map((e) => ({
		...e,
		toEntity: pickCard(graph.get(e.to), cardSummaryHtml),
		qualifierEntity: e.qualifier ? pickQualifierEntity(graph.get(e.qualifier)) : null
	}));
	const inEdges = graph.inEdges(id).map((e) => ({
		...e,
		fromEntity: pickCard(graph.get(e.from), cardSummaryHtml),
		qualifierEntity: e.qualifier ? pickQualifierEntity(graph.get(e.qualifier)) : null
	}));

	// Filesystem-derived containment: entities living *inside* this
	// entity's folder. Grouped by the child's *kind* (taxonomy)
	// rather than by folder path (topology), so a heading like
	// "Planets" or "Moons" describes what the children *are*, not
	// where they sit. The topology — that they're inside this
	// entity — is already implicit from the page you're on.
	const childGroups = (() => {
		const byKind = new Map<
			string,
			{
				kindId: string;
				label: { singular: string; plural: string };
				entities: ReturnType<typeof toChildCard>[];
			}
		>();
		for (const child of graph.children(id)) {
			const childKindId = typeof child.meta.kind === 'string' ? child.meta.kind : '';
			const groupKey = childKindId || '__unkinded__';
			if (!byKind.has(groupKey)) {
				const k = childKindId ? graph.kind(childKindId) : undefined;
				const label = childKindId
					? {
							singular: k?.meta.singular ?? titleCaseSlug(childKindId),
							plural: k?.meta.plural ?? titleCaseSlug(childKindId)
						}
					: { singular: 'Entry', plural: 'Entries' };
				byKind.set(groupKey, { kindId: groupKey, label, entities: [] });
			}
			byKind.get(groupKey)!.entities.push(toChildCard(child, cardSummaryHtml));
		}
		for (const g of byKind.values()) {
			g.entities.sort((a, b) => {
				const aRank = a.rank;
				const bRank = b.rank;
				if (aRank !== null && bRank !== null) return aRank - bRank;
				if (aRank !== null) return -1;
				if (bRank !== null) return 1;
				return a.name.localeCompare(b.name);
			});
		}
		return [...byKind.values()].sort((a, b) => a.label.plural.localeCompare(b.label.plural));
	})();

	// ── Statistics ────────────────────────────────────────────────
	// Parse the `statistics` frontmatter field into a structured view-model.
	// The raw shape is:
	//   statistics:
	//     - population:
	//       - total: <number>
	//       - slices:
	//         - species: <entity-id>
	//           percentage: <number>
	// YAML parses this as an array of objects whose keys are stat names.
	// We normalise it into typed blocks and resolve entity links.
	const statistics: StatBlock[] = parseStatistics(entity.meta.statistics, (eid: string) => {
		const target = graph.get(eid);
		return target
			? { name: target.meta.name, href: `/${eid}` }
			: { name: eid.split('/').pop() ?? eid, href: `/${eid}` };
	});

	// Attach known sub-group population blocks to world-level population stats
	// (e.g. Ashara). graph.worldSubGroups() returns WorldSubGroup[], each with
	// its own species breakdown for rendering as a separate pie chart.
	const worldSubGroupsList = graph.worldSubGroups(id);
	if (worldSubGroupsList.length > 0) {
		for (const block of statistics) {
			if (block.kind !== 'population') continue;
			block.subGroupBlocks = worldSubGroupsList.map((sg) => ({
				groupId: sg.groupId,
				groupName: sg.groupName,
				href: sg.href,
				kind: sg.kind,
				total: sg.total,
				derivedTotal: sg.derivedTotal,
				slices: sg.slices.map((s) => {
					const resolved = graph.get(s.species);
					return {
						speciesId: s.species,
						speciesName: resolved?.meta.name ?? s.species.split('/').pop() ?? s.species,
						href: resolved ? `/${s.species}` : null,
						percentage: s.percentage,
						count: s.count
					};
				})
			}));
		}
	}

	// Automatically derive a "presence" block from the reverse population
	// index: if any world's `statistics.population.slices` references this
	// entity, surface "Population presence" without any extra frontmatter.
	const presenceEntries: SpeciesPresenceEntry[] = graph.speciesPresence(id);
	if (presenceEntries.length > 0) {
		statistics.push({
			kind: 'presence',
			entries: presenceEntries.map((e) => ({
				worldId: e.worldId,
				worldName: e.worldName,
				href: e.href,
				percentage: e.percentage,
				worldTotal: e.worldTotal,
				count: e.count ?? null,
				subGroups: e.subGroups.map((sg) => ({
					groupId: sg.groupId,
					groupName: sg.groupName,
					href: sg.href,
					count: sg.count,
					pctOfSlice: sg.pctOfSlice
				}))
			}))
		});
	}

	// ── Derived "inhabits" edges from statistics ──────────────────────────
	// Planet side: each population slice → a synthetic inEdge (the species
	// "inhabits" this world). Deduplicates against explicit typed relations.
	const existingInIds = new Set(inEdges.map((e) => e.from));
	const existingOutIds = new Set(outEdges.map((e) => e.to));

	for (const block of statistics) {
		if (block.kind !== 'population') continue;
		for (const slice of block.slices) {
			if (slice.speciesId === '__other__') continue;
			if (existingInIds.has(slice.speciesId)) continue;
			existingInIds.add(slice.speciesId);
			const entity = graph.get(slice.speciesId);
			inEdges.push({
				from: slice.speciesId,
				to: id,
				kind: 'inhabits',
			fromEntity: pickCard(entity, cardSummaryHtml),
			qualifierEntity: null
			});
		}
	}

	// Species side: each presence entry → a synthetic outEdge (this species
	// "inhabits" that world). Deduplicates against explicit typed relations.
	for (const entry of presenceEntries) {
		if (existingOutIds.has(entry.worldId)) continue;
		existingOutIds.add(entry.worldId);
		const worldEntity = graph.get(entry.worldId);
		outEdges.push({
			from: id,
			to: entry.worldId,
			kind: 'inhabits',
			toEntity: pickCard(worldEntity, cardSummaryHtml),
			qualifierEntity: null
		});
	}

	const HIDDEN = new Set([
		'name',
		// `title` overrides the page <h1> and is surfaced there; not a sidebar property.
		'title',
		'summary',
		'aliases',
		'tags',
		'relations',
		'kind',
		'class',
		'language',
		'code',
		'sigil',
		// `book` is a structured config block surfaced via the
		// chapter-list rendering, not as a sidebar property.
		'book',
		// `rank` is surfaced as prev/next navigation, not a raw property.
		'rank',
		// `rankDisplay` is a collection-level rendering hint; on entities it
		// is either ignored (the containing _collection governs display) or
		// set on the entity's own _collection.  Either way it should not
		// appear as a raw sidebar property.
		'rankDisplay',
		// `statistics` is surfaced as its own structured panel.
		'statistics',
		// `vocabulary` is surfaced as its own Vocabulary tab.
		'vocabulary',
		// `properties` is read separately below from entity.meta.properties.
		'properties'
	]);
	const extra: { key: string; value: unknown }[] = [];
	// Read structured properties from the explicit `properties:` block
	const metaProps = entity.meta.properties;
	if (metaProps && typeof metaProps === 'object' && !Array.isArray(metaProps)) {
		for (const [key, value] of Object.entries(metaProps as Record<string, unknown>)) {
			if (value === null || value === undefined || value === '') continue;
			extra.push({ key, value });
		}
	}
	// Also surface any non-hidden, non-kindRef meta fields not in `properties`
	for (const [key, value] of Object.entries(entity.meta)) {
		if (HIDDEN.has(key)) continue;
		// Kind-link fields are surfaced in their own block (kindRefs
		// below), pre-rendered as chip links. Skip them here so the
		// property sidebar doesn't also render the raw `kinds/<id>`
		// strings as plain text.
		if (key in entity.kindRefs) continue;
		if (value === null || value === undefined || value === '') continue;
		extra.push({ key, value });
	}

	// Structured kind-references declared in YAML, pre-rendered for
	// the sidebar chip block. Each field becomes one group; each
	// resolved kind id becomes one chip with the kind's singular
	// label and an href into the /kinds/<id> page. Only resolved
	// references appear here — unregistered ids were dropped (and
	// surfaced on /health) during loading.
	const kindRefs = Object.entries(entity.kindRefs)
		.filter(([, ids]) => ids.length > 0)
		.map(([field, ids]) => ({
			field,
			items: ids.map((kid) => {
				const k = graph.kind(kid);
				return {
					id: kid,
					label: k?.meta.singular ?? titleCaseSlug(kid),
					href: `/kinds/${kid}`
				};
			})
		}))
		.sort((a, b) => a.field.localeCompare(b.field));

	// Instances: entities that declare `class: <this entity's id>`.
	// Rendered on the entity page as an "Instances" tab (mirroring
	// the kind page's About/Instances pattern) when non-empty.
	const classMateEntities = graph.classMates(id);
	const classMates = classMateEntities.map((e) => ({
		id: e.id,
		name: e.meta.name,
		kind: typeof e.meta.kind === 'string' ? e.meta.kind : null,
		typeLabel: graph.folderLabels(e.type).singular,
		summaryHtml: cardSummaryHtml(e.meta.summary),
		tags: e.meta.tags ?? [],
		era: e.meta.era ?? null,
		sigil: typeof e.meta.sigil === 'string' ? e.meta.sigil : null,
		rank: typeof e.meta.rank === 'number' ? e.meta.rank : null
	}));

	// Qualifier holders: entities that reference this entity in the `qualifier` field
	// of one of their relations. Surfaces on qualifier-kind entity pages as a
	// "Holders" tab — analogous to the "Instances" tab but driven by the
	// qualifier relation pattern rather than the `class:` field.
	// Each entry also carries the group the holder belongs to (the `target`
	// of the relation that carries this qualifier) so the tab can show
	// "Old Elfric — The Dawncallers" at a glance.
	const qualifierHolders = graph.all()
		.flatMap((e) =>
			(e.meta.relations ?? [])
				.filter((rel) => rel.qualifier === id)
				.map((rel) => ({ holder: e, targetId: rel.target }))
		)
		.map(({ holder, targetId }) => {
			const groupEntity = graph.get(targetId);
			const classId = typeof holder.meta.class === 'string' ? holder.meta.class : null;
			const classEntity = classId ? graph.get(classId) : null;
			return {
				id: holder.id,
				name: holder.meta.name,
				kind: typeof holder.meta.kind === 'string' ? holder.meta.kind : null,
				typeLabel: graph.folderLabels(holder.type).singular,
				summaryHtml: cardSummaryHtml(holder.meta.summary),
				tags: holder.meta.tags ?? [],
				era: holder.meta.era ?? null,
				sigil: typeof holder.meta.sigil === 'string' ? holder.meta.sigil : null,
				rank: typeof holder.meta.rank === 'number' ? holder.meta.rank : null,
				classLabel: classEntity?.meta.name ?? null,
				classHref: classId ? `/${classId}` : null,
				groupName: groupEntity?.meta.name ?? null,
				groupHref: groupEntity ? `/${targetId}` : null
			};
		});

	// Vocabulary: only collected for language entities.
	const vocabulary: VocabEntry[] =
		entity.meta.kind === 'language' ? graph.languageVocabulary(id) : [];

	// Names in other languages: vocabulary items on non-language entities that
	// carry a `language:` field. Shown as a compact sidebar list — language
	// name/code + word + optional notes. Distinct from the full Vocabulary tab
	// (which only appears on language entities).
	const namesInOtherLanguages: {
		word: string;
		langCode: string;
		langName: string;
		langHref: string | null;
		notes: string | null;
	}[] = (() => {
		if (entity.meta.kind === 'language') return [];
		const raw = entity.meta.vocabulary;
		if (!Array.isArray(raw)) return [];
		const out = [];
		for (const item of raw) {
			if (!item || typeof item !== 'object') continue;
			const v = item as Record<string, unknown>;
			const langRef = typeof v.language === 'string' ? v.language.trim() : null;
			if (!langRef) continue;
			const word = typeof v.word === 'string' ? v.word.trim() : null;
			if (!word) continue;
			const notes = typeof v.notes === 'string' ? v.notes.trim() || null : null;
			const targetId = languageCodes.get(langRef) ?? (graph.get(langRef) ? langRef : null);
			const langEntity = targetId ? graph.get(targetId) : null;
			const langName = langEntity?.meta.name ?? langRef;
			const langHref = targetId ? `/${targetId}` : null;
			out.push({ word, langCode: langRef, langName, langHref, notes });
		}
		return out;
	})();

	// Rank-based prev/next navigation. When this entity has a numeric
	// rank, find all folder-siblings (same containing folder) that also
	// have a rank, sort them, and pick the immediate neighbours.
	// rankDisplay is inherited from the containing folder's _collection.
	const rankNav: {
		prev: { id: string; name: string; rank: number } | null;
		next: { id: string; name: string; rank: number } | null;
		rankDisplay: RankDisplay;
	} | null = (() => {
		const myRank = typeof entity.meta.rank === 'number' ? entity.meta.rank : null;
		if (myRank === null || !type) return null;

		const ranked = graph
			.byFolder(type)
			.filter((e): e is Entity & { meta: { rank: number } } => typeof e.meta.rank === 'number')
			.sort(byRankThenName);

		const idx = ranked.findIndex((e) => e.id === id);
		if (idx === -1) return null;

		const prev = idx > 0 ? ranked[idx - 1] : null;
		const next = idx < ranked.length - 1 ? ranked[idx + 1] : null;

		if (!prev && !next) return null;

		return {
			prev: prev ? { id: prev.id, name: prev.meta.name, rank: prev.meta.rank } : null,
			next: next ? { id: next.id, name: next.meta.name, rank: next.meta.rank } : null,
			rankDisplay: folderRankDisplay
		};
	})();

	// Pre-resolve relation labels using the world-level registry so the
	// component doesn't need to receive the Map (which isn't serializable
	// across the load boundary) and falls back to slug-humanisation only
	// for kinds not declared in the registry.
	const registry = graph.relationRegistry();
	const allKinds = new Set([
		...outEdges.map((e) => e.kind),
		...inEdges.map((e) => e.kind)
	]);
	const relationLabels: Record<string, { out: string; in: string }> = {};
	for (const kind of allKinds) {
		relationLabels[kind] = {
			out: relationLabel(kind, 'out', registry),
			in: relationLabel(kind, 'in', registry)
		};
	}

	// ── Dev info ─────────────────────────────────────────────────────────
	// Always populated — the dev bar is shown/hidden client-side based on
	// ?mode=dev, and on a prerendered site the server load always runs in
	// visitor mode. None of this data is sensitive (it's all already public
	// through the page content).
	const devInfo = {
		issues: graph.issues().filter((i) => i.entity === entity.id),
		yamlPath: entity.yamlPath,
		mdPath: entity.mdPath,
		isStub: !entity.body.trim(),
		kind: kindId ?? null,
		classId: classId ?? null
	};

	return {
		breadcrumbs,
		kindChip,
		classChip,
		entity: {
			id: entity.id,
			name: entity.meta.name,
			title: typeof entity.meta.title === 'string' ? entity.meta.title : null,
			summaryHtml: summaryHtml(entity.meta.summary),
			aliases: entity.meta.aliases ?? [],
			tags: entity.meta.tags ?? [],
			sigil: typeof entity.meta.sigil === 'string' ? entity.meta.sigil : null,
			entityType: (entity.meta.type === 'class' ? 'class' : 'instance') as 'class' | 'instance',
			plural: typeof entity.meta.plural === 'string' ? entity.meta.plural : null
		},
		extra,
		kindRefs,
		html,
		language,
		childGroups,
		outEdges,
		inEdges,
		chapters: entity.chapters.map((c) => ({
			slug: c.slug,
			order: c.order,
			title: c.title,
			href: `/${entity.id}/chapters/${c.slug}`
		})),
		book: entity.book,
		// Sub-page href for the author's-room companion document,
		// when one exists. The entity page surfaces it as a small
		// link at the foot of the prose; absent when the entity has
		// no `craft.md`.
		craftHref: entity.craft !== null ? `/${entity.id}/craft` : null,
		rankNav,
		classMates,
		qualifierHolders,
		statistics,
		vocabulary,
		namesInOtherLanguages,
		relationLabels,
		devInfo,
		timelineBacklinks: graph.timelinesTargeting(entity.id).map((tl) => ({
			title: tl.meta.name ?? graph.get(tl.path)?.meta.name ?? tl.path.split('/').pop()!,
			href: `/${tl.path}`,
			firstYear: tl.entries.length > 0 ? tl.entries[0].year : null,
			lastYear: tl.entries.length > 0 ? tl.entries[tl.entries.length - 1].year : null
		}))
	};
}

export type EntityPageData = Awaited<ReturnType<typeof loadEntityPage>>;

function pickCard(
	e: ReturnType<typeof graph.get>,
	cardSummaryHtml: (s: string | null | undefined) => string | null
) {
	if (!e) return null;
	return {
		id: e.id,
		type: e.type,
		slug: e.slug,
		name: e.meta.name,
		summary: e.meta.summary ?? null,
		summaryHtml: cardSummaryHtml(e.meta.summary),
		sigil: typeof e.meta.sigil === 'string' ? e.meta.sigil : null,
		kind: e.meta.kind ?? null
	};
}

/** Minimal qualifier-entity shape used for sub-group headings in the relations sidebar. */
function pickQualifierEntity(e: ReturnType<typeof graph.get>): { id: string; name: string; href: string } | null {
	if (!e) return null;
	return { id: e.id, name: e.meta.name, href: `/${e.id}` };
}

function toChildCard(e: Entity, cardSummaryHtml: (s: string | null | undefined) => string | null) {
	return {
		id: e.id,
		name: e.meta.name,
		summaryHtml: cardSummaryHtml(e.meta.summary),
		kind: typeof e.meta.kind === 'string' ? e.meta.kind : null,
		rank: typeof e.meta.rank === 'number' ? e.meta.rank : null
	};
}

// ── Statistics helpers ─────────────────────────────────────────────────────

export interface SubGroupEntry {
	groupId: string;
	groupName: string;
	href: string;
	/** Count of THIS species within this sub-group (for presence panel). */
	count: number | null;
	/** % of parent world's species-slice that this sub-group accounts for. */
	pctOfSlice: number | null;
}

/** A sub-group's own population block, for rendering as a separate pie on world pages. */
export interface SubGroupBlock {
	groupId: string;
	groupName: string;
	href: string;
	kind: string | null;
	total: number | null;
	/** Derived total when `total` is not authored; null if not derivable. */
	derivedTotal: number | null;
	slices: PopulationSlice[];
}

export interface PopulationSlice {
	speciesId: string;
	speciesName: string;
	href: string | null;
	/** Percentage of world population. Full precision — not rounded. */
	percentage: number;
	/** Raw count from frontmatter, if provided directly rather than as a percentage. */
	count: number | null;
}

export interface PopulationStat {
	kind: 'population';
	total: number | null;
	/** Entity id this population is a sub-set of (set on sub-group entities). */
	withinId: string | null;
	withinName: string | null;
	withinHref: string | null;
	slices: PopulationSlice[];
	/** Full population blocks for each sub-group (for world-page separate pies). */
	subGroupBlocks: SubGroupBlock[];
}

export interface PresenceEntry {
	worldId: string;
	worldName: string;
	href: string;
	percentage: number;
	worldTotal: number | null;
	/** Raw count if the slice was authored as a count rather than a percentage. */
	count: number | null;
	/** Known sub-groups within this world for this species. */
	subGroups: SubGroupEntry[];
}

export interface PresenceStat {
	kind: 'presence';
	entries: PresenceEntry[];
}

export type StatBlock = PopulationStat | PresenceStat;

/**
 * Normalise the raw `statistics` frontmatter value into typed stat blocks.
 *
 * Raw YAML shape (as parsed by the `yaml` package):
 *   statistics:
 *     - population:          ← array item whose key is the stat name
 *       - total: 100000
 *       - slices:
 *         - species: <id>
 *           percentage: <n>
 *
 * The YAML parser turns this into:
 *   [ { population: [ { total: 100000 }, { slices: [...] } ] } ]
 */
function parseStatistics(
	raw: unknown,
	resolveEntity: (id: string) => { name: string; href: string }
): StatBlock[] {
	if (!Array.isArray(raw)) return [];
	const blocks: StatBlock[] = [];

	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const entry = item as Record<string, unknown>;

		if ('population' in entry) {
			const pop = parsePopulation(entry.population, resolveEntity);
			if (pop) blocks.push(pop);
		}
	}

	return blocks;
}

function parsePopulation(
	raw: unknown,
	resolveEntity: (id: string) => { name: string; href: string }
): PopulationStat | null {
	if (!Array.isArray(raw)) return null;

	let total: number | null = null;
	let withinId: string | null = null;
	let slices: PopulationSlice[] = [];

	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const entry = item as Record<string, unknown>;

		if ('total' in entry && typeof entry.total === 'number') {
			total = entry.total;
		}
		if ('within' in entry && typeof entry.within === 'string') {
			withinId = entry.within;
		}
		if ('slices' in entry && Array.isArray(entry.slices)) {
			for (const s of entry.slices) {
				if (!s || typeof s !== 'object') continue;
				const slice = s as Record<string, unknown>;
				const id = typeof slice.species === 'string' ? slice.species : null;
				if (id === null) continue;

				const pct = typeof slice.percentage === 'number' ? slice.percentage : null;
				const count = typeof slice.count === 'number' ? slice.count : null;

				const resolved = resolveEntity(id);
				// Store count alongside; percentage will be finalised below.
			slices.push({
					speciesId: id,
					speciesName: resolved.name,
					href: resolved.href,
					percentage: pct ?? 0, // placeholder; overwritten below if count-based
					count: null,
					_rawCount: count,
					_rawPct: pct
				} as PopulationSlice & { _rawCount: number | null; _rawPct: number | null });
			}
		}
	}

	// Resolve within entity name/href.
	let withinName: string | null = null;
	let withinHref: string | null = null;
	if (withinId !== null) {
		const resolved = resolveEntity(withinId);
		withinName = resolved.name;
		withinHref = resolved.href;
	}

	// Finalise percentages: prefer explicit percentage; fall back to count/total.
	// Drop slices where neither could be resolved.
	// Keep full precision on percentage — rounding is the display layer's job.
	const finalSlices: PopulationSlice[] = [];
	for (const sl of slices as (PopulationSlice & { _rawCount: number | null; _rawPct: number | null })[]) {
		if (sl._rawPct !== null) {
			finalSlices.push({ speciesId: sl.speciesId, speciesName: sl.speciesName, href: sl.href, percentage: sl._rawPct, count: null });
		} else if (sl._rawCount !== null && total !== null && total > 0) {
			// Full-precision percentage — do NOT round here
			const pct = (sl._rawCount / total) * 100;
			finalSlices.push({ speciesId: sl.speciesId, speciesName: sl.speciesName, href: sl.href, percentage: pct, count: sl._rawCount });
		}
		// else: no usable data — skip
	}

	if (total === null && finalSlices.length === 0 && withinId === null) return null;
	return { kind: 'population', total, withinId, withinName, withinHref, slices: finalSlices, subGroupBlocks: [] };
}
