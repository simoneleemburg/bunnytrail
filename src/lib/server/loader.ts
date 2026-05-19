import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
	Collection,
	CollectionMeta,
	Edge,
	Entity,
	EntityId,
	EntityMeta,
	EntityType,
	HealthIssue,
	Kind
} from '$lib/types';
import { loadKindRegistry } from './kinds';

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
// Wikilink extractor regex. Matches both full paths and bare slugs,
// with an optional `#anchor` fragment and an optional `|label`.
// The anchor and label are dropped here; only the path part flows
// into wikilink resolution. Bare lang-code matches (e.g. `[[ot]]`)
// are also caught by this regex — the consumer filters those out
// by checking against the language-code set before resolving.
const WIKILINK_RE = /\[\[([a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*)(?:#[a-z0-9][a-z0-9-]*)?(?:\|[^\]]+)?\]\]/g;

export interface LoadResult {
	entities: Map<EntityId, Entity>;
	issues: HealthIssue[];
	/**
	 * The central kind registry loaded from `src/kinds/`. The sole
	 * source of truth for kind metadata and hierarchy.
	 */
	kindRegistry: Map<string, Kind>;
	/**
	 * Collections discovered while walking `content/`, keyed by
	 * folder path. Only folders that carry a `_collection.yaml`
	 * marker (or a bare `_collection.md`) are recorded; other
	 * folders are still browseable but have no editorial metadata.
	 */
	collections: Map<string, Collection>;
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
 * Walk `content/` recursively and load every entity and collection.
 *
 * A folder is classified by which marker files it contains:
 *
 *   - `index.yaml` (+/`-` md) → an entity. May itself contain child
 *                               entity folders.
 *   - `_collection.yaml`      → an editorial collection (browse
 *                               page metadata). Does not affect kind.
 *   - both                    → an entity that also acts as a
 *                               collection (rare).
 *   - neither                 → an implicit grouping; descended into.
 *
 * Each entity's `type` is the relative path of its containing folder
 * (one segment shorter than its `id`). Each entity's `id` is its
 * full path under `contentDir`. The `type` field no longer carries
 * kind semantics — it is just a folder-grouping convenience for
 * consumers like `/everything` and the language-detection heuristic.
 */
export async function loadAll(contentDir: string = CONTENT_DIR): Promise<LoadResult> {
	const entities = new Map<EntityId, Entity>();
	const issues: HealthIssue[] = [];
	const collections = new Map<string, Collection>();

	await walk({
		absDir: contentDir,
		relPath: '',
		parentEntity: null,
		contentDir,
		entities,
		issues,
		collections
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

	// Build the language-code set so the wikilink resolver can skip
	// over `[[ot]]`-style lang tags. A language code is only honoured
	// if it sits on an entity in a `languages` folder and is 2–8
	// lowercase letters.
	const langCodes = new Set<string>();
	for (const e of entities.values()) {
		const isLang = e.type === 'languages' || e.type.endsWith('/languages');
		if (!isLang) continue;
		const code = (e.meta as { code?: unknown }).code;
		if (typeof code === 'string' && /^[a-z]{2,8}$/.test(code)) {
			langCodes.add(code);
		}
	}

	// Resolve wikilinks.
	for (const entity of entities.values()) {
		const resolved = new Set<EntityId>();
		for (const raw of entity.wikilinks) {
			if (langCodes.has(raw)) continue;
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

	// Detect broken relation targets.
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

	// Load the central kind registry. The registry is the sole
	// source of truth for kind metadata and hierarchy.
	const registryResult = await loadKindRegistry();
	for (const issue of registryResult.issues) issues.push(issue);

	// Validate entity kinds against the registry. Lenient: every
	// entity must declare a non-empty `kind`, and unregistered
	// kinds emit a health-page warning but still load. Entities
	// with no `kind` field get the same warning.
	for (const entity of entities.values()) {
		const k = (entity.meta as { kind?: unknown }).kind;
		if (typeof k !== 'string' || k.length === 0) {
			issues.push({
				kind: 'invalid-yaml',
				entity: entity.id,
				detail: `entity has no 'kind' field`
			});
			continue;
		}
		if (!registryResult.kinds.has(k)) {
			issues.push({
				kind: 'invalid-yaml',
				entity: entity.id,
				detail: `kind '${k}' is not registered in src/kinds/`
			});
		}
	}

	return {
		entities,
		issues,
		kindRegistry: registryResult.kinds,
		collections
	};
}

interface WalkArgs {
	/** Absolute path to the folder being walked. */
	absDir: string;
	/** Path of this folder relative to `contentDir` (`''` for the root). */
	relPath: string;
	/** Closest enclosing *entity* id, or `null` if no enclosing entity. */
	parentEntity: EntityId | null;
	contentDir: string;
	entities: Map<EntityId, Entity>;
	issues: HealthIssue[];
	collections: Map<string, Collection>;
}

async function walk(args: WalkArgs): Promise<void> {
	const { absDir, relPath, entities, issues, collections } = args;

	const indexYamlPath = join(absDir, 'index.yaml');
	const indexMdPath = join(absDir, 'index.md');
	const collectionYamlPath = join(absDir, '_collection.yaml');
	const collectionMdPath = join(absDir, '_collection.md');

	const hasIndexYaml = await exists(indexYamlPath);
	const hasIndexMd = await exists(indexMdPath);
	const hasCollectionYaml = await exists(collectionYamlPath);
	const hasCollectionMd = await exists(collectionMdPath);

	// Load _collection.yaml if present. Collections are pure browsing
	// metadata. Skipped at the content root (relPath === '').
	if (hasCollectionYaml && relPath) {
		let meta: CollectionMeta = {};
		try {
			const raw = await readFile(collectionYamlPath, 'utf8');
			const parsed = parseYaml(raw);
			meta = (parsed && typeof parsed === 'object' ? parsed : {}) as CollectionMeta;
		} catch (err) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${collectionYamlPath}: ${err instanceof Error ? err.message : String(err)}`
			});
		}
		let body: string | null = null;
		if (hasCollectionMd) {
			try {
				body = await readFile(collectionMdPath, 'utf8');
			} catch (err) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${collectionMdPath}: ${err instanceof Error ? err.message : String(err)}`
				});
			}
		}
		collections.set(relPath, { path: relPath, meta, body });
	} else if (hasCollectionMd && relPath) {
		// A bare `_collection.md` without a yaml marker is treated as
		// a collection with default labels.
		try {
			const body = await readFile(collectionMdPath, 'utf8');
			collections.set(relPath, { path: relPath, meta: {}, body });
		} catch (err) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${collectionMdPath}: ${err instanceof Error ? err.message : String(err)}`
			});
		}
	}

	// Load index.yaml if present. The current folder is an entity.
	let nextParentEntity = args.parentEntity;
	if (hasIndexYaml && relPath) {
		const id: EntityId = relPath;
		const slug = leafOf(relPath);
		// `type` is the parent-folder path: one segment shorter than
		// `id`. For an entity directly under the content root, `type`
		// is the empty string.
		const entityType = parentOf(relPath);

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

		nextParentEntity = id;
	}

	// Recurse into subdirectories.
	const dirents = await readDirents(absDir);
	for (const entry of dirents) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
		await walk({
			absDir: join(absDir, entry.name),
			relPath: childRel,
			parentEntity: nextParentEntity,
			contentDir: args.contentDir,
			entities,
			issues,
			collections
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

function parentOf(path: string): string {
	const idx = path.lastIndexOf('/');
	return idx < 0 ? '' : path.slice(0, idx);
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
				order: rel.order
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
