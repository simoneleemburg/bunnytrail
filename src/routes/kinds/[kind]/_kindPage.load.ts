import { error } from '@sveltejs/kit';
import { graph } from '$lib/server/graph';
import { inverseLabelFor } from '$lib/server/kindLinkLabels';
import { renderBody, renderSummary, makeCollectionResolver } from '$lib/server/markdown';
import type { Entity } from '$lib/types';
import type { ClusterScope } from '$lib/cluster';

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
	/** `/kinds/<kind>` (or `/<cluster>/kinds/<kind>` in scope) for registered kinds. */
	href: string | null;
	/** Plural label from the registry, when present. */
	label: string | null;
	/** Total entity count for this kind family (kind + descendants). Scope-filtered when in scope. */
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
	field: string;
	heading: string;
	cards: KindCard[];
}

export interface KindPageData {
	kindId: string;
	singular: string;
	plural: string;
	description: string | null;
	bodyHtml: string | null;
	slice: KindSliceNode | null;
	direct: KindCard[];
	kindRefSections: KindRefSection[];
	backlinks: KindCard[];
}

/**
 * Build the view-model for a single kind page.
 *
 * When `scope` is a cluster id, the instance/backlink/ref sections
 * are narrowed to entities in that cluster, and the lineage slice's
 * counts reflect the scope. Direct subkinds with 0 in-scope
 * attestations drop out of the slice; ancestors of the current kind
 * are preserved (lineage is structural, not editorial).
 *
 * When `scope` is null, returns the full cross-cluster view.
 */
export function loadKindPage(kindId: string, scope: ClusterScope): KindPageData {
	const kind = graph.kind(kindId);
	if (!kind) {
		throw error(404, `Unknown kind: ${kindId}`);
	}

	const inScope = (id: string): boolean => (scope === null ? true : id.startsWith(`${scope}/`));
	const hrefForKind = (k: string): string =>
		scope === null ? `/kinds/${k}` : `/${scope}/kinds/${k}`;

	// Kind pages are intentionally cross-cluster: a kind is a
	// universal taxonomy node, and its prose may reach into any
	// cluster's content. Resolve wikilinks globally regardless of
	// the URL scope.
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

	const family = kindFamily(kindId);
	const direct = graph
		.all()
		.filter((e) => typeof e.meta.kind === 'string' && family.has(e.meta.kind) && inScope(e.id))
		.sort((a, b) => a.meta.name.localeCompare(b.meta.name))
		.map(toCard);

	const slice = buildKindSlice(kindId, scope, hrefForKind, inScope);

	const backlinks = graph
		.kindBacklinks(kindId)
		.filter((e) => inScope(e.id))
		.map(toCard);

	const refsByField = graph.entitiesReferencingKind(kindId);
	const kindRefSections: KindRefSection[] = [];
	for (const [field, entities] of refsByField) {
		const cards = entities.filter((e) => inScope(e.id)).map(toCard);
		if (cards.length === 0) continue;
		kindRefSections.push({
			field,
			heading: inverseLabelFor(field),
			cards
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
 * In scope mode: counts use scope-filtered family rollup; direct
 * children with 0 in-scope attestations drop out; ancestors stay
 * regardless of attestation (lineage is structural).
 */
function buildKindSlice(
	currentId: string,
	scope: ClusterScope,
	hrefForKind: (k: string) => string,
	inScope: (id: string) => boolean
): KindSliceNode | null {
	const registry = graph.kindRegistry();
	const current = registry.get(currentId);
	if (!current) return null;

	const countFor = (kindId: string): number => {
		const family = kindFamily(kindId);
		return graph
			.all()
			.filter((e) => typeof e.meta.kind === 'string' && family.has(e.meta.kind) && inScope(e.id))
			.length;
	};

	const nodeFor = (
		kindId: string,
		isCurrent: boolean,
		children: KindSliceNode[]
	): KindSliceNode => {
		const k = registry.get(kindId);
		return {
			kind: kindId,
			href: k ? hrefForKind(kindId) : null,
			label: k?.meta.plural ?? null,
			count: countFor(kindId),
			isCurrent,
			children
		};
	};

	// Direct children of the current kind. In scope mode, drop
	// children with 0 in-scope family count.
	const childNodes = graph
		.childKinds(currentId)
		.map((c) => c.id)
		.sort()
		.map((cid) => nodeFor(cid, false, []))
		.filter((n) => scope === null || n.count > 0);

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
