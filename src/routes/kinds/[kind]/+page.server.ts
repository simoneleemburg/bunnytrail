import { error } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { inverseLabelFor } from '$lib/server/kindLinkLabels';
import { renderBody, renderSummary, makeCollectionResolver } from '$lib/server/markdown';
import type { Entity } from '$lib/types';

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

/**
 * A slice of the kind hierarchy centred on the current kind: ancestors
 * (each as a chain), the current kind itself (with `isCurrent: true`),
 * and the current kind's direct children. Mirrors the visual shape used
 * by `/kinds`, just narrowed to this kind's lineage. The component
 * recursion walks `children` on every node, so ancestor nodes carry
 * exactly one child (the next ancestor down) and the current node
 * carries every direct subkind.
 */
export interface KindSliceNode {
	kind: string;
	/** `/kinds/<kind>` for registered kinds, null otherwise. */
	href: string | null;
	/** Plural label from the registry, when present. */
	label: string | null;
	/** Total entity count for this kind family (kind + descendants). */
	count: number;
	/** True for the kind whose page we're on; visually highlighted. */
	isCurrent: boolean;
	children: KindSliceNode[];
}

/**
 * A section listing entities that point at this kind via a
 * structured YAML kind-link field (e.g. `nativeBeings:
 * [kinds/<id>]`). The heading is the *inverse* label of the field
 * — on `/kinds/human` a `nativeBeings` reference reads as
 * "Native to". One section per (field) reference type.
 */
export interface KindRefSection {
	/** The originating YAML field name (e.g. `nativeBeings`). */
	field: string;
	/** Display heading, from `kindLinkLabels.inverseLabelFor`. */
	heading: string;
	cards: KindCard[];
}

export async function load({ params }: { params: { kind: string } }) {
	await graph.ready();

	const kindId = params.kind;
	const kind = graph.kind(kindId);
	if (!kind) {
		throw error(404, `Unknown kind: ${kindId}`);
	}

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
	const bodyHtml = kind.body
		? renderBody(
				kind.body,
				resolveLink,
				languageCodes,
				kindIds,
				makeCollectionResolver({
					getCollection: (p) => graph.collection(p),
					folderLabels: (p) => graph.folderLabels(p),
					resolveLink,
					languageCodes,
					kindIds
				})
			)
		: null;

	// Direct entities: those whose meta.kind is this kind or any
	// of its descendants (the "kind family"). For a leaf kind like
	// `planet` this is just the planets; for a parent like `mortal`
	// it gathers every human, urouthi, nguwari too. Each card still
	// labels itself with its own kind, so the subtype distinction
	// is visible at card level — the Instances tab just stops
	// hiding the subclasses' members behind separate pages.
	const family = kindFamily(kindId);
	const direct = graph
		.all()
		.filter((e) => typeof e.meta.kind === 'string' && family.has(e.meta.kind))
		.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
		.map(toCard);

	// Tree slice: a vertical view of where this kind sits in the
	// hierarchy. Ancestors form a single chain above the current
	// kind; direct children fan out below. Replaces the old
	// `parent` eyebrow and `subkindSections` card grids — clicking
	// a subkind's name takes you to its own page.
	const slice = buildKindSlice(kindId);

	// Entities that mention this kind in prose via a
	// `[[kinds/<id>]]` wikilink. Distinct from "entities of this
	// kind" (the direct/subkind sections above) — backlinks are
	// the prose-level counterpart to entity backlinks elsewhere
	// in the site.
	const backlinks = graph.kindBacklinks(kindId).map(toCard);

	// Structured YAML kind-references (e.g. a place's
	// `nativeBeings: [kinds/<id>]` field) inverted onto this kind
	// page. Each YAML field that points here becomes one section,
	// headed by `inverseLabelFor(field)`. These are the load-bearing
	// "what content depends on this kind" sections; they sit
	// *above* the prose `Mentioned in` backlinks below.
	const refsByField = graph.entitiesReferencingKind(kindId);
	const kindRefSections: KindRefSection[] = [];
	for (const [field, entities] of refsByField) {
		kindRefSections.push({
			field,
			heading: inverseLabelFor(field),
			cards: entities.map(toCard)
		});
	}
	kindRefSections.sort((a, b) => a.heading.localeCompare(b.heading));

	return {
		kindId,
		singular,
		plural,
		description: kind.meta.description ?? null,
		bodyHtml,
		slice,
		direct,
		kindRefSections,
		backlinks
	};
}

/**
 * Build the lineage slice for a single kind: ancestor chain + current
 * kind + direct children. Returns the root of the slice (the topmost
 * ancestor), so the page renders one tree starting from the top.
 *
 * Counts on each node match `/kinds`: total entities whose own kind
 * falls anywhere inside that node's kind family. Ancestors therefore
 * count the whole subtree (including siblings of the current kind),
 * which gives a sense of how big the parent category is.
 */
function buildKindSlice(currentId: string): KindSliceNode | null {
	const registry = graph.kindRegistry();
	const current = registry.get(currentId);
	if (!current) return null;

	const countFor = (kindId: string): number => {
		const family = kindFamily(kindId);
		return graph
			.all()
			.filter((e) => typeof e.meta.kind === 'string' && family.has(e.meta.kind)).length;
	};

	const nodeFor = (
		kindId: string,
		isCurrent: boolean,
		children: KindSliceNode[]
	): KindSliceNode => {
		const k = registry.get(kindId);
		return {
			kind: kindId,
			href: k ? `/kinds/${kindId}` : null,
			label: k?.meta.plural ?? null,
			count: countFor(kindId),
			isCurrent,
			children
		};
	};

	// Direct children of the current kind, each as a leaf node (no
	// grandchildren — the slice deliberately stops here so the page
	// shows just one tier of subtypes).
	const childNodes = graph
		.childKinds(currentId)
		.map((c) => c.id)
		.sort()
		.map((cid) => nodeFor(cid, false, []));

	// Build the chain bottom-up: current first, then wrap in each
	// ancestor in turn until we reach a root.
	let node = nodeFor(currentId, true, childNodes);
	let parentId = current.parent;
	while (parentId && registry.has(parentId)) {
		node = nodeFor(parentId, false, [node]);
		parentId = registry.get(parentId)?.parent ?? null;
	}
	return node;
}

function kindFamily(kind: string): Set<string> {
	const seen = new Set<string>([kind]);
	const queue = [kind];
	while (queue.length) {
		const cur = queue.shift()!;
		for (const c of graph.childKinds(cur)) {
			if (!seen.has(c.id)) {
				seen.add(c.id);
				queue.push(c.id);
			}
		}
	}
	return seen;
}

function labelForType(type: string): string | null {
	if (!type) return null;
	return graph.folderLabels(type).singular;
}

function titleCase(slug: string): string {
	return slug
		.split('-')
		.map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
		.join(' ');
}
