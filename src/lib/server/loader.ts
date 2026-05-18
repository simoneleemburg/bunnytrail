import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
	Edge,
	Entity,
	EntityId,
	EntityMeta,
	EntityType,
	EntityTypeMeta,
	HealthIssue
} from '$lib/types';

/**
 * Where the canonical worldbuilding data lives, relative to the project root.
 * Override with ALTERIA_CONTENT_DIR for testing.
 */
export const CONTENT_DIR = process.env.ALTERIA_CONTENT_DIR ?? resolve(process.cwd(), 'content');

/**
 * Match `[[type/slug]]` or `[[type/<sub>/.../slug]]` (optionally
 * labelled) in markdown bodies. The path is one or more kebab-case
 * segments joined by `/`.
 */
const WIKILINK_RE = /\[\[([a-z][a-z0-9-]*(?:\/[a-z0-9-]+)+)(?:\|[^\]]+)?\]\]/g;

export interface LoadResult {
	entities: Map<EntityId, Entity>;
	issues: HealthIssue[];
	/** All type paths discovered (top-level + subtypes), sorted. */
	types: EntityType[];
	/** Per-type meta loaded from `<typePath>/_type.yaml`, if present. */
	typeMeta: Map<EntityType, EntityTypeMeta>;
}

/**
 * List the top-level types: immediate subdirectories of `contentDir`
 * that contain (directly or transitively) a `_type.yaml`. Hidden and
 * underscore-prefixed directories are skipped.
 *
 * Kept around as a convenience for callers that only want the
 * top-level type slugs (e.g. nav). For the full set of types
 * including subtypes, use `loadAll().types`.
 */
export async function discoverTypes(contentDir: string = CONTENT_DIR): Promise<EntityType[]> {
	const entries = await readDirents(contentDir);
	const types: EntityType[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		types.push(entry.name);
	}
	types.sort();
	return types;
}

/**
 * Walk `content/` recursively and load every entity and type.
 *
 * A folder is classified by which marker files it contains:
 *
 *   - `_type.yaml` only       → a type/subtype container.
 *   - `index.yaml` (+/`-` md) → an entity. May itself contain child
 *                               entity folders (e.g. a planet with
 *                               cities nested under it). The child
 *                               entities inherit the enclosing
 *                               *type*, not their parent entity.
 *   - both                    → an entity that also declares a
 *                               subtype for its children. (Possible
 *                               but unusual.)
 *   - neither                 → an implicit grouping; we still
 *                               descend into it.
 *
 * Each entity's `type` is the path to the nearest enclosing
 * `_type.yaml`. Each entity's `id` is its full path under
 * `contentDir`.
 */
export async function loadAll(contentDir: string = CONTENT_DIR): Promise<LoadResult> {
	const entities = new Map<EntityId, Entity>();
	const issues: HealthIssue[] = [];
	const types = new Set<EntityType>();
	const typeMeta = new Map<EntityType, EntityTypeMeta>();

	await walk({
		absDir: contentDir,
		relPath: '',
		currentType: null,
		parentEntity: null,
		contentDir,
		entities,
		issues,
		types,
		typeMeta
	});

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

	// Resolve wikilinks: each entity's raw wikilink paths are mapped
	// to canonical entity ids via `resolveWikilink`. Successful
	// resolutions replace the raw path; failures (missing or
	// ambiguous) become `broken-link` issues. This pass also
	// deduplicates the resolved list.
	for (const entity of entities.values()) {
		const resolved = new Set<EntityId>();
		for (const raw of entity.wikilinks) {
			const r = resolveWikilink(raw, entities);
			if (r.id !== null) {
				resolved.add(r.id);
				continue;
			}
			if (r.reason === 'ambiguous') {
				issues.push({
					kind: 'broken-link',
					entity: entity.id,
					detail: `wikilink → ${raw} (ambiguous: matches ${r.matches.join(', ')})`
				});
			} else {
				issues.push({
					kind: 'broken-link',
					entity: entity.id,
					detail: `wikilink → ${raw} (not found)`
				});
			}
		}
		entity.wikilinks = [...resolved];
	}

	// Detect broken relation targets. (Wikilink issues were emitted
	// during resolution above.)
	for (const entity of entities.values()) {
		for (const rel of entity.meta.relations ?? []) {
			if (!entities.has(rel.target)) {
				issues.push({
					kind: 'broken-link',
					entity: entity.id,
					detail: `relation ${rel.kind} → ${rel.target} (not found)`
				});
			}
		}
	}

	return {
		entities,
		issues,
		types: [...types].sort(),
		typeMeta
	};
}

interface WalkArgs {
	/** Absolute path to the folder being walked. */
	absDir: string;
	/** Path of this folder relative to `contentDir` (`''` for the root). */
	relPath: string;
	/** Closest enclosing type path, or `null` while still under `content/`. */
	currentType: EntityType | null;
	/** Closest enclosing *entity* id, or `null` if we're directly under a type. */
	parentEntity: EntityId | null;
	contentDir: string;
	entities: Map<EntityId, Entity>;
	issues: HealthIssue[];
	types: Set<EntityType>;
	typeMeta: Map<EntityType, EntityTypeMeta>;
}

async function walk(args: WalkArgs): Promise<void> {
	const { absDir, relPath, contentDir, entities, issues, types, typeMeta } = args;

	const typeYamlPath = join(absDir, '_type.yaml');
	const indexYamlPath = join(absDir, 'index.yaml');
	const indexMdPath = join(absDir, 'index.md');

	const hasTypeYaml = await exists(typeYamlPath);
	const hasIndexYaml = await exists(indexYamlPath);
	const hasIndexMd = await exists(indexMdPath);

	// Load _type.yaml if present. The current folder *is* the type
	// (its relPath is the type path); children descended from here
	// inherit this as their `currentType`.
	let nextType = args.currentType;
	if (hasTypeYaml && relPath) {
		const thisType: EntityType = relPath;
		types.add(thisType);
		try {
			const raw = await readFile(typeYamlPath, 'utf8');
			const parsed = (parseYaml(raw) ?? {}) as EntityTypeMeta;
			typeMeta.set(thisType, parsed);
		} catch (err) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${typeYamlPath}: ${err instanceof Error ? err.message : String(err)}`
			});
		}
		nextType = thisType;
	} else if (relPath && !relPath.includes('/') && !hasIndexYaml && !args.currentType) {
		// Back-compat: a top-level folder without `_type.yaml` is
		// treated as a type-by-convention (e.g. an old flat layout
		// where someone hasn't written a `_type.yaml` yet). Subtypes
		// must always be marked explicitly.
		types.add(relPath);
		nextType = relPath;
	}

	// Load index.yaml if present. The current folder is an entity.
	let nextParentEntity = args.parentEntity;
	if (hasIndexYaml && relPath) {
		const id: EntityId = relPath;
		const slug = leafOf(relPath);

		if (!args.currentType && !hasTypeYaml) {
			// An entity-folder sitting outside any declared type. Allowed
			// but odd — record it under a synthetic root type so it
			// still loads, and warn.
			issues.push({
				kind: 'invalid-yaml',
				entity: id,
				detail: `${indexYamlPath}: entity is not inside any _type.yaml-declared type`
			});
		}

		const entityType = args.currentType ?? '';

		let meta: EntityMeta | null = null;
		try {
			const raw = await readFile(indexYamlPath, 'utf8');
			meta = (parseYaml(raw) ?? {}) as EntityMeta;
			if (!meta.name) meta.name = slug;
		} catch (err) {
			issues.push({
				kind: 'invalid-yaml',
				entity: id,
				detail: err instanceof Error ? err.message : String(err)
			});
		}

		let body = '';
		if (hasIndexMd) {
			body = await readFile(indexMdPath, 'utf8');
		} else {
			issues.push({ kind: 'missing-md', entity: id, detail: indexMdPath });
		}

		if (meta) {
			entities.set(id, {
				id,
				type: entityType,
				slug,
				meta,
				body,
				wikilinks: extractWikilinks(body),
				yamlPath: indexYamlPath,
				mdPath: indexMdPath,
				parent: args.parentEntity,
				children: []
			});
		}

		// Children of this folder are *child entities* of this entity.
		nextParentEntity = id;
	}

	// A folder that has neither marker but is the root (relPath === '')
	// is the contentDir itself. Otherwise it's an implicit grouping;
	// we descend into it but treat it as transparent.

	// Recurse into subdirectories.
	const dirents = await readDirents(absDir);
	for (const entry of dirents) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
		await walk({
			absDir: join(absDir, entry.name),
			relPath: childRel,
			currentType: nextType,
			parentEntity: nextParentEntity,
			contentDir,
			entities,
			issues,
			types,
			typeMeta
		});
	}
}

/**
 * Extract entity wikilink ids from a markdown body. Accepts paths
 * of any depth (e.g. `[[culture/languages/tholingian]]`). Returns
 * the *raw* paths as written; resolution to canonical ids is
 * performed separately (see `resolveWikilink`).
 */
export function extractWikilinks(body: string): EntityId[] {
	const out = new Set<EntityId>();
	for (const m of body.matchAll(WIKILINK_RE)) {
		out.add(m[1]);
	}
	return [...out];
}

/**
 * Resolve a wikilink path to a canonical entity id, with one
 * fallback step:
 *
 *   1. Exact match — if the path is already a known id, use it.
 *   2. Suffix match — if exactly one known id ends with the path
 *      (with a `/` separator, or equals it), use that one.
 *   3. Otherwise — return `null` and let the caller raise a
 *      `broken-link` issue. Ambiguous suffix matches also fall
 *      into this case; the issue's `detail` will explain.
 *
 * The point of step 2 is that wikilinks survive entity moves
 * along the filesystem tree. `[[places/sharazan]]` stays valid
 * after Sharazan moves into `places/bayurinda/sharazan/`, as
 * long as no other entity's id ends in `places/sharazan`.
 */
export function resolveWikilink(
	rawPath: string,
	entities: ReadonlyMap<EntityId, unknown>
): { id: EntityId } | { id: null; reason: 'missing' | 'ambiguous'; matches: EntityId[] } {
	if (entities.has(rawPath)) return { id: rawPath };
	const suffix = `/${rawPath}`;
	const matches: EntityId[] = [];
	for (const id of entities.keys()) {
		if (id.endsWith(suffix)) matches.push(id);
	}
	if (matches.length === 1) return { id: matches[0] };
	if (matches.length === 0) return { id: null, reason: 'missing', matches };
	return { id: null, reason: 'ambiguous', matches };
}

async function readDirents(path: string): Promise<Dirent[]> {
	try {
		return (await readdir(path, { withFileTypes: true })) as Dirent[];
	} catch {
		return [];
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

function leafOf(path: string): string {
	const idx = path.lastIndexOf('/');
	return idx < 0 ? path : path.slice(idx + 1);
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
				note: rel.note
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

/**
 * Return the type-path segment of an entity id, given the set of
 * known types. This is the path-prefix of `id` that matches a type.
 *
 * Returns `null` if no known type prefixes the id.
 */
export function typeOf(id: EntityId, types: Set<EntityType>): EntityType | null {
	// Try progressively shorter prefixes, longest first, so subtypes
	// win over their parent types (`culture/languages/tholingian`
	// matches `culture/languages` before `culture`).
	const parts = id.split('/');
	for (let i = parts.length - 1; i > 0; i--) {
		const prefix = parts.slice(0, i).join('/');
		if (types.has(prefix)) return prefix;
	}
	return null;
}
