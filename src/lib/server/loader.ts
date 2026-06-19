import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import type { Edge, Entity, EntityId, EntityType, HealthIssue, Kind, Ontology, Collection, PropertyRegistry, RelationRegistry } from '$lib/types';
import { loadKindRegistry } from './kinds';
import { CONTENT_DIR } from './globals';
import { walk, readDirents } from './walker';
import {
	deriveClusterSets,
	buildLangCodes,
	validateEntityWikilinks,
	validateRelations,
	validateKindLinks,
	validateKindRefs,
	validateEntityKinds,
	validateSummaryWikilinks,
	validateCollectionWikilinks,
	validateClassField,
	validateLangLinks,
	validateUnlabelledWikilinks,
	validateRelationSchema,
	validatePropertySchema,
	validateUnknownEntityFields
} from './validate';

// Re-export symbols that external callers (graph.ts, guides.ts, specs)
// import directly from this module so they don't need to change.
export type { WikilinkResolveResult } from './wikilinks';
export {
	extractWikilinks,
	extractKindLinks,
	extractKindRefs,
	resolveWikilink
} from './wikilinks';
export { extractChapterTitle, stripLeadingHeading, resolveBookMeta } from './walker';

export interface LoadResult {
	entities: Map<EntityId, Entity>;
	issues: HealthIssue[];
	/**
	 * The central kind registry loaded from `content_meta/kinds/`. The sole
	 * source of truth for kind metadata and hierarchy.
	 */
	kindRegistry: Map<string, Kind>;
	/**
	 * Organisational ontologies loaded from `content_meta/kinds/` folders
	 * that carry a `_ontology.yaml`. Ontologies are display-only overlays;
	 * they do not participate in the kind hierarchy.
	 */
	ontologies: Map<string, Ontology>;
	/**
	 * Merged relation registry built from all `_ontology.yaml` files.
	 * Keys are fully-prefixed relation ids (`<ontology-id>/<slug>` for
	 * named ontologies, bare slug for the root ontology).
	 */
	relations: RelationRegistry;
	/**
	 * Collections discovered while walking `content/`, keyed by
	 * folder path. Only folders that carry a `_collection.yaml`
	 * marker (or a bare `_collection.md`) are recorded; other
	 * folders are still browseable but have no editorial metadata.
	 */
	collections: Map<string, Collection>;
	/**
	 * Top-level folders treated as clusters — the editorial
	 * neighbourhoods used for cluster-scoped wikilink resolution.
	 * Excludes any folder marked `universal: true`.
	 */
	clusters: Set<string>;
	/**
	 * Top-level folders explicitly marked as universal substrate via
	 * `universal: true` in their `_collection.{yaml,md}`. Bare-slug
	 * wikilinks fall back to these when no in-cluster match exists.
	 */
	universalFolders: Set<string>;
}

/**
 * List the top-level browseable folders: immediate subdirectories of
 * `contentDir`. Hidden and underscore-prefixed directories are skipped.
 */
export async function discoverTypes(contentDir: string = CONTENT_DIR): Promise<EntityType[]> {
	const entries = await readDirents(contentDir);
	const out: EntityType[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		out.push(entry.name);
	}
	out.sort();
	return out;
}

/**
 * Walk `content/` recursively and load every entity and collection,
 * then run all post-walk validation passes.
 *
 * Delegates to:
 *   - `walker.ts`   — filesystem traversal, entity/collection construction
 *   - `validate.ts` — wikilink resolution, kind checks, health issues
 *   - `kinds.ts`    — kind registry loading (includes relation registry)
 *   - `wikilinks.ts`— extraction and resolution primitives
 */
export async function loadAll(
	contentDir: string = CONTENT_DIR,
	opts: {
		allowUndefinedRelations?: boolean;
		propertyRegistry?: PropertyRegistry;
		allowUndefinedProperties?: boolean;
	} = {}
): Promise<LoadResult> {
	const entities = new Map<EntityId, Entity>();
	const issues: HealthIssue[] = [];
	const collections = new Map<string, Collection>();

	await walk({ absDir: contentDir, relPath: '', parentEntity: null, contentDir, entities, issues, collections });

	// Resolve children: for every entity whose `parent` is set, push its
	// id onto the parent's `children` array. Done in a second pass so
	// that out-of-order discovery doesn't matter.
	for (const entity of entities.values()) {
		if (!entity.parent) continue;
		const parent = entities.get(entity.parent);
		if (parent) parent.children.push(entity.id);
	}
	for (const entity of entities.values()) {
		entity.children.sort();
	}

	const langCodes = buildLangCodes(entities);
	const { clusterSet, universalSet } = deriveClusterSets(entities, collections);

	// Load the central kind registry.
	const registryResult = await loadKindRegistry();
	for (const issue of registryResult.issues) issues.push(issue);

	const validateArgs = {
		entities,
		collections,
		kindRegistry: registryResult.kinds,
		clusterSet,
		universalSet,
		langCodes,
		relationRegistry: registryResult.relations,
		allowUndefinedRelations: opts.allowUndefinedRelations ?? false,
		propertyRegistry: opts.propertyRegistry ?? new Map(),
		allowUndefinedProperties: opts.allowUndefinedProperties ?? true,
		issues
	};

	validateEntityWikilinks(validateArgs);
	validateRelations(validateArgs);
	validateKindLinks(validateArgs);
	validateKindRefs(validateArgs);
	validateEntityKinds(validateArgs);
	validateSummaryWikilinks(validateArgs);
	validateCollectionWikilinks(validateArgs);
	validateClassField(validateArgs);
	validateLangLinks(validateArgs);
	validateUnlabelledWikilinks(validateArgs);
	validateRelationSchema(validateArgs);
	validatePropertySchema(validateArgs);
	validateUnknownEntityFields(validateArgs);

	return {
		entities,
		issues,
		kindRegistry: registryResult.kinds,
		ontologies: registryResult.ontologies,
		relations: registryResult.relations,
		collections,
		clusters: clusterSet,
		universalFolders: universalSet
	};
}

/** Build a forward + reverse edge index from a set of entities. */
export function buildEdges(entities: Map<EntityId, Entity>): {
	out: Map<EntityId, Edge[]>;
	in: Map<EntityId, Edge[]>;
} {
	const outIdx = new Map<EntityId, Edge[]>();
	const inIdx = new Map<EntityId, Edge[]>();

	const push = (idx: Map<EntityId, Edge[]>, key: EntityId, edge: Edge) => {
		const arr = idx.get(key);
		if (arr) arr.push(edge);
		else idx.set(key, [edge]);
	};

	for (const entity of entities.values()) {
		for (const rel of entity.meta.relations ?? []) {
			if (!entities.has(rel.target)) continue;
			const edge: Edge = {
				from: entity.id,
				to: rel.target,
				kind: rel.kind,
				note: rel.note,
				order: rel.order,
				role: rel.role
			};
			push(outIdx, entity.id, edge);
			push(inIdx, rel.target, edge);
		}
		for (const link of entity.wikilinks) {
			if (!entities.has(link)) continue;
			const edge: Edge = { from: entity.id, to: link, kind: 'wikilink' };
			push(outIdx, entity.id, edge);
			push(inIdx, link, edge);
		}
	}

	return { out: outIdx, in: inIdx };
}
