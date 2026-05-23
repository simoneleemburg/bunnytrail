import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path, { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
	BookFormat,
	BookMeta,
	Chapter,
	Collection,
	CollectionMeta,
	Edge,
	Entity,
	EntityId,
	EntityMeta,
	EntityType,
	HealthIssue,
	Kind,
	ResolvedBookMeta
} from '$lib/types';
import { loadKindRegistry } from './kinds';
import { CONTENT_DIR } from './globals';

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
const WIKILINK_RE =
	/\[\[([a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*)(?:#[a-z0-9][a-z0-9-]*)?(?:\|[^\]]+)?\]\]/g;

export interface LoadResult {
	entities: Map<EntityId, Entity>;
	issues: HealthIssue[];
	/**
	 * The central kind registry loaded from `content_meta/kinds/`. The sole
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

	// Validate `[[kinds/<id>]]` wikilinks against the registry.
	// Unregistered kind targets get the same broken-link treatment
	// as broken entity wikilinks. Resolved ids stay on
	// `entity.kindLinks` so the graph can index backlinks.
	for (const entity of entities.values()) {
		const resolved: string[] = [];
		for (const raw of entity.kindLinks) {
			if (registryResult.kinds.has(raw)) {
				resolved.push(raw);
			} else {
				issues.push({
					kind: 'broken-link',
					entity: entity.id,
					detail: `wikilink → kinds/${raw} (not found)`
				});
			}
		}
		entity.kindLinks = resolved;
	}

	// Validate structured kind-references declared in YAML (e.g.
	// `nativeBeings: [kinds/human]`). Same lenient treatment as
	// prose kind-wikilinks: unregistered ids emit a broken-link
	// issue and are dropped from `entity.kindRefs`, so the graph
	// only indexes resolved references.
	for (const entity of entities.values()) {
		const resolvedRefs: Record<string, string[]> = {};
		for (const [field, ids] of Object.entries(entity.kindRefs)) {
			const keep: string[] = [];
			for (const id of ids) {
				if (registryResult.kinds.has(id)) {
					keep.push(id);
				} else {
					issues.push({
						kind: 'broken-link',
						entity: entity.id,
						detail: `${field} → kinds/${id} (not found)`
					});
				}
			}
			if (keep.length > 0) resolvedRefs[field] = keep;
		}
		entity.kindRefs = resolvedRefs;
	}

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
				detail: `kind '${k}' is not registered in content_meta/kinds/`
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

		// Load `chapters/*.md` if present. Chapters are sub-pages of
		// the entity, not entities themselves. Their wikilinks merge
		// into the parent entity's `wikilinks` so backlinks attribute
		// to the work as a whole.
		const chapters = await loadChapters(join(absDir, 'chapters'), id, issues);
		const wikilinksFromBody = extractWikilinks(body);
		const wikilinksFromChapters = chapters.flatMap((c) => extractWikilinks(c.body));
		const mergedWikilinks = [...new Set([...wikilinksFromBody, ...wikilinksFromChapters])];
		const kindLinksFromBody = extractKindLinks(body);
		const kindLinksFromChapters = chapters.flatMap((c) => extractKindLinks(c.body));
		const mergedKindLinks = [...new Set([...kindLinksFromBody, ...kindLinksFromChapters])];

		// Optional sibling `craft.md` — author's-room companion. Read
		// raw and stash on the entity; deliberately *don't* merge any
		// wikilinks or kind-links it contains into the entity's graph
		// edges. Craft notes are about how the entity is written, not
		// what's true in-world; conflating them would corrupt
		// backlinks.
		const craftMdPath = join(absDir, 'craft.md');
		const craft = (await exists(craftMdPath)) ? await readFile(craftMdPath, 'utf8') : null;

		if (meta) {
			entities.set(id, {
				id,
				type: entityType,
				slug,
				meta,
				body,
				wikilinks: mergedWikilinks,
				kindLinks: mergedKindLinks,
				kindRefs: extractKindRefs(meta),
				yamlPath: indexYamlPath,
				mdPath: indexMdPath,
				parent: args.parentEntity,
				children: [],
				chapters,
				book: chapters.length > 0 ? resolveBookMeta(meta.book) : null,
				craft
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
 * Load chapter files from `<entity>/chapters/`. Each `*.md` file
 * with a `NN-<slug>.md` filename becomes a chapter; the numeric
 * prefix sets ordering. Files without a numeric prefix are skipped
 * with a `broken-link` issue (treated as malformed).
 *
 * Chapters are not entities — they have no kind, no relations, no
 * graph membership.
 */
async function loadChapters(
	chaptersDir: string,
	entityId: EntityId,
	issues: HealthIssue[]
): Promise<Chapter[]> {
	const dirents = await readDirents(chaptersDir);
	const out: Chapter[] = [];
	for (const entry of dirents) {
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith('.md')) continue;
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		const m = entry.name.match(/^(\d+)-([a-z0-9][a-z0-9-]*)\.md$/);
		if (!m) {
			issues.push({
				kind: 'invalid-yaml',
				entity: entityId,
				detail: `chapter filename must match \`NN-slug.md\`: ${join(chaptersDir, entry.name)}`
			});
			continue;
		}
		const order = parseInt(m[1], 10);
		const slug = m[2];
		const mdPath = join(chaptersDir, entry.name);
		let body = '';
		try {
			body = await readFile(mdPath, 'utf8');
		} catch (err) {
			issues.push({
				kind: 'invalid-yaml',
				entity: entityId,
				detail: `${mdPath}: ${err instanceof Error ? err.message : String(err)}`
			});
			continue;
		}
		const title = extractChapterTitle(body) ?? humaniseSlug(slug);
		// Strip the leading `# Heading` from the body so the chapter
		// page's own header (Chapter <numeral> / <title>) doesn't get
		// shadowed by a duplicate heading at the top of the prose.
		const prosed = stripLeadingHeading(body);
		out.push({ slug, order, title, body: prosed, mdPath });
	}
	out.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
	return out;
}

/**
 * Pull the first markdown `# Heading` from a chapter body to use as
 * its title. Returns `null` if no top-level heading is found.
 */
export function extractChapterTitle(body: string): string | null {
	const m = body.match(/^\s*#\s+(.+?)\s*$/m);
	return m ? m[1].trim() : null;
}

/**
 * Strip a leading `# Heading` (and any blank lines after it) from a
 * chapter body, leaving the prose proper. The chapter page's own
 * header already renders the chapter title; keeping the heading in
 * the body would render it twice. Only the *first* heading at the
 * top of the file is removed; `##` and lower headings inside the
 * body are preserved.
 */
export function stripLeadingHeading(body: string): string {
	return body.replace(/^\s*#\s+.+?\n+/, '');
}

function humaniseSlug(slug: string): string {
	return slug
		.split('-')
		.map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

/**
 * Default unit-naming per book format. The chapter page reads
 * these via `Entity.book` and renders the unit word in the eyebrow
 * and prev/next labels.
 */
const BOOK_FORMAT_DEFAULTS: Record<BookFormat, { singular: string; plural: string }> = {
	book: { singular: 'Chapter', plural: 'Chapters' },
	scrolls: { singular: 'Fragment', plural: 'Fragments' }
};

/**
 * Resolve author-facing `book:` YAML into a fully populated
 * `ResolvedBookMeta`. Unknown formats fall back to `book`; manual
 * `unitSingular` / `unitPlural` overrides win over the format
 * defaults.
 */
export function resolveBookMeta(raw: unknown): ResolvedBookMeta {
	const meta = (raw && typeof raw === 'object' ? raw : {}) as BookMeta;
	const formatRaw = typeof meta.format === 'string' ? meta.format : 'book';
	const format: BookFormat = formatRaw in BOOK_FORMAT_DEFAULTS ? (formatRaw as BookFormat) : 'book';
	const defaults = BOOK_FORMAT_DEFAULTS[format];
	return {
		format,
		unitSingular:
			typeof meta.unitSingular === 'string' && meta.unitSingular.trim()
				? meta.unitSingular.trim()
				: defaults.singular,
		unitPlural:
			typeof meta.unitPlural === 'string' && meta.unitPlural.trim()
				? meta.unitPlural.trim()
				: defaults.plural
	};
}

/**
 * Extract entity wikilink ids from a markdown body. Accepts paths
 * of any depth (e.g. `[[culture/languages/tholingian]]`). Returns
 * the *raw* paths as written; resolution to canonical ids is
 * performed separately (see `resolveWikilink`).
 *
 * `[[kinds/<id>]]` paths are deliberately excluded: those don't
 * resolve to entities and have their own extractor
 * (`extractKindLinks`) and index. Without this filter they would
 * fall through to wikilink resolution and raise spurious
 * broken-link warnings.
 */
export function extractWikilinks(body: string): EntityId[] {
	const out = new Set<EntityId>();
	for (const m of body.matchAll(WIKILINK_RE)) {
		const path = m[1];
		if (path.startsWith('kinds/')) continue;
		out.add(path);
	}
	return [...out];
}

/**
 * Extract kind ids referenced from a markdown body via
 * `[[kinds/<id>]]` wikilinks. Returns the raw kind ids (the part
 * after `kinds/`); validation against the registry is performed
 * separately so the body itself doesn't need to know which kinds
 * are registered.
 */
export function extractKindLinks(body: string): string[] {
	const out = new Set<string>();
	for (const m of body.matchAll(WIKILINK_RE)) {
		const path = m[1];
		if (!path.startsWith('kinds/')) continue;
		const id = path.slice('kinds/'.length);
		if (id) out.add(id);
	}
	return [...out];
}

/**
 * Inspect a parsed YAML `meta` object and pick out fields whose
 * value is a non-empty list of strings, every entry beginning with
 * `kinds/`. Each such field is treated as a *kind-link list*: the
 * trailing ids are extracted and returned, grouped by field name.
 *
 * The shape rule is deliberately strict — a mixed list like
 * `[kinds/human, asthera]` does *not* qualify, so authors get a
 * clean separation between kind-references and other tokens. New
 * field names cost zero code: any `<fieldName>: [kinds/<id>, …]`
 * automatically participates.
 *
 * Returns `{}` if no field qualifies. Does not touch `meta`.
 */
export function extractKindRefs(meta: unknown): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	if (!meta || typeof meta !== 'object') return out;
	for (const [field, value] of Object.entries(meta as Record<string, unknown>)) {
		if (!Array.isArray(value) || value.length === 0) continue;
		const ids: string[] = [];
		let qualifies = true;
		for (const v of value) {
			if (typeof v !== 'string' || !v.startsWith('kinds/')) {
				qualifies = false;
				break;
			}
			const id = v.slice('kinds/'.length);
			if (!id) {
				qualifies = false;
				break;
			}
			ids.push(id);
		}
		if (qualifies) out[field] = ids;
	}
	return out;
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
