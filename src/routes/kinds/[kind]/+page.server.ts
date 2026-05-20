import { error } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { renderBody, renderSummary } from '$lib/server/markdown';
import type { Entity } from '$lib/types';
import { buildKindTree } from '$lib/types';

export interface KindCard {
	id: string;
	name: string;
	kind: string | null;
	typeLabel: string | null;
	summaryHtml: string | null;
	tags: string[];
	era: string | null;
	sigil: string | null;
}

export interface KindSection {
	/** Kind id this section is about. */
	kind: string;
	/** Display heading — singular kind label, title-cased. */
	heading: string;
	/** Whether this kind has its own /kinds/<kind> page. */
	href: string | null;
	cards: KindCard[];
}

export async function load({ params }: { params: { kind: string } }) {
	await graph.ready();

	const kindId = params.kind;
	const kind = graph.kind(kindId);
	if (!kind) {
		throw error(404, `Unknown kind: ${kindId}`);
	}

	const tree = buildKindTreeFromRegistry();
	const registry = graph.kindRegistry();

	const resolveLink = (path: string) => graph.resolveLink(path);
	const languageCodes = graph.languageCodes();
	const kindIds = graph.kindIds();
	const cardSummaryHtml = (s: string | null | undefined) =>
		s ? renderSummary(s, resolveLink, languageCodes, { stripLinks: true, kindIds }) : null;

	const toCard = (e: Entity): KindCard => ({
		id: e.id,
		name: e.meta.name,
		kind: typeof e.meta.kind === 'string' ? e.meta.kind : null,
		typeLabel: labelForType(e.type),
		summaryHtml: cardSummaryHtml(e.meta.summary),
		tags: e.meta.tags ?? [],
		era: e.meta.era ?? null,
		sigil: typeof e.meta.sigil === 'string' ? e.meta.sigil : null
	});

	// Display labels with fallbacks.
	const singular = kind.meta.singular ?? titleCase(kindId);
	const plural = kind.meta.plural ?? `${singular}s`;

	// Optional prose body (content_meta/kinds/<…>/<kindId>/_kind.md).
	const bodyHtml = kind.body ? renderBody(kind.body, resolveLink, languageCodes, kindIds) : null;

	// Direct entities: those whose meta.kind === this kind. Shown
	// first, under a section labelled with the singular form.
	const direct = graph
		.all()
		.filter((e) => e.meta.kind === kindId)
		.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
		.map(toCard);

	// Subkind sections: for every direct child of this kind in the
	// hierarchy, gather all entities whose meta.kind falls anywhere
	// inside that subkind's descendants. This matches the "kind family"
	// semantics: clicking /kinds/celestial-body shows stars / planets /
	// moons / black-holes, each section listing all entities of that
	// family regardless of folder.
	const childKinds = tree.has(kindId)
		? tree.children(kindId).sort((a, b) => a.localeCompare(b))
		: [];

	const subkindSections: KindSection[] = [];
	for (const childId of childKinds) {
		const family = tree.descendantsInclusive(childId);
		const cards = graph
			.all()
			.filter((e) => typeof e.meta.kind === 'string' && family.has(e.meta.kind))
			.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
			.map(toCard);
		if (cards.length === 0) continue;
		const childMeta = registry.get(childId);
		const childSingular = childMeta?.meta.singular ?? titleCase(childId);
		const childPlural = childMeta?.meta.plural ?? `${childSingular}s`;
		subkindSections.push({
			kind: childId,
			heading: childPlural,
			href: childMeta ? `/kinds/${childId}` : null,
			cards
		});
	}

	// Parent breadcrumb-ish link (one hop up the kind tree). Only
	// shown when the parent is itself a registered kind in the
	// registry, so the link goes somewhere with a page.
	const parentId = kind.parent;
	const parent = parentId && registry.has(parentId)
		? {
				id: parentId,
				label: registry.get(parentId)?.meta.singular ?? titleCase(parentId)
			}
		: null;

	// Entities that mention this kind in prose via a
	// `[[kinds/<id>]]` wikilink. Distinct from "entities of this
	// kind" (the direct/subkind sections above) — backlinks are
	// the prose-level counterpart to entity backlinks elsewhere
	// in the site.
	const backlinks = graph.kindBacklinks(kindId).map(toCard);

	return {
		kindId,
		singular,
		plural,
		description: kind.meta.description ?? null,
		bodyHtml,
		parent,
		directHeading: direct.length > 0 ? plural : null,
		direct,
		subkindSections,
		backlinks
	};
}

function labelForType(type: string): string | null {
	if (!type) return null;
	return graph.folderLabels(type).singular;
}

function buildKindTreeFromRegistry() {
	const declarations = new Map<string, string | null>();
	for (const k of graph.kindRegistry().values()) {
		declarations.set(k.id, k.parent);
	}
	return buildKindTree(declarations);
}

function titleCase(slug: string): string {
	return slug
		.split('-')
		.map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
		.join(' ');
}
