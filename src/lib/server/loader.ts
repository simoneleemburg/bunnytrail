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
import { splitFrontmatter } from './frontmatter';
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

	// Determine the cluster set and the universal-substrate set.
	//
	// A *cluster* is a top-level folder under `content/` that is not
	// itself marked `universal: true` and that does not itself act as
	// an entity. Clusters are the editorial neighbourhoods of the
	// world (e.g. `mistwood`, `tideholm` in the sample world).
	//
	// A *universal substrate* is a top-level folder explicitly marked
	// with `universal: true` in its `_collection.{yaml,md}`. It is
	// reachable as a fallback from any cluster's bare-slug links and
	// never participates in cluster-scoping itself.
	//
	// Together these drive `resolveWikilink`: cluster-prefixed paths
	// resolve globally, bare paths resolve in the source cluster
	// first and then fall back to universal substrates.
	const clusterSet = new Set<string>();
	const universalSet = new Set<string>();
	for (const id of entities.keys()) {
		const first = id.split('/')[0];
		if (!first) continue;
		if (entities.has(first)) continue;
		clusterSet.add(first);
	}
	for (const [path, collection] of collections) {
		if (path.includes('/')) continue; // top-level only
		if (collection.meta.universal === true) {
			universalSet.add(path);
			clusterSet.delete(path);
		}
	}

	// Resolve wikilinks.
	for (const entity of entities.values()) {
		const resolved = new Set<EntityId>();
		const fromCluster = clusterSet.has(entity.id.split('/')[0]) ? entity.id.split('/')[0] : null;
		for (const raw of entity.wikilinks) {
			if (langCodes.has(raw)) continue;
			const r = resolveWikilink(raw, entities, fromCluster, clusterSet, universalSet);
			if (r.id !== null) {
				resolved.add(r.id);
				continue;
			}
			if (r.reason === 'ambiguous' || r.reason === 'ambiguous-in-cluster') {
				const scope =
					r.reason === 'ambiguous-in-cluster' && fromCluster ? ` in cluster ${fromCluster}` : '';
				issues.push({
					kind: 'broken-link',
					entity: entity.id,
					detail: `wikilink → ${raw} (ambiguous${scope}: matches ${r.matches.join(', ')})`
				});
			} else if (r.reason === 'missing-in-cluster' && fromCluster) {
				issues.push({
					kind: 'broken-link',
					entity: entity.id,
					detail: `wikilink → ${raw} (not found in cluster ${fromCluster}; for cross-cluster references write the full path starting with a cluster name)`
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
		collections,
		clusters: clusterSet,
		universalFolders: universalSet
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

	// Load _collection.yaml if present, or frontmatter from
	// _collection.md, to register an editorial collection.
	// Collections are pure browsing metadata. Skipped at the content
	// root (relPath === '').
	//
	// Two layouts are supported, mirroring entities:
	//
	//   1. Sidecar: `_collection.yaml` (+ optional `_collection.md`).
	//   2. Frontmatter: `_collection.md` with a `---`-delimited
	//      YAML block at the top.
	//
	// If both `_collection.yaml` and `_collection.md` frontmatter
	// are present, that's an authoring mistake: emit a health issue
	// and fall back to treating the folder as a collection with no
	// editorial metadata.
	if (relPath && (hasCollectionYaml || hasCollectionMd)) {
		const collectionMdRaw = hasCollectionMd ? await readFile(collectionMdPath, 'utf8') : null;
		const collectionMdSplit = collectionMdRaw !== null ? splitFrontmatter(collectionMdRaw) : null;
		const collectionHasFrontmatter =
			collectionMdSplit?.frontmatter !== null && collectionMdSplit?.frontmatter !== undefined;

		let meta: CollectionMeta = {};
		let body: string | null = null;
		let conflict = false;

		if (hasCollectionYaml && collectionHasFrontmatter) {
			conflict = true;
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relPath}: both _collection.yaml and _collection.md frontmatter declare metadata; pick one`
			});
		} else if (hasCollectionYaml) {
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
			if (hasCollectionMd && collectionMdRaw !== null) {
				body = collectionMdRaw;
			}
		} else if (collectionHasFrontmatter && collectionMdSplit) {
			try {
				const parsed = parseYaml(collectionMdSplit.frontmatter ?? '');
				meta = (parsed && typeof parsed === 'object' ? parsed : {}) as CollectionMeta;
			} catch (err) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${collectionMdPath}: ${err instanceof Error ? err.message : String(err)}`
				});
			}
			body = collectionMdSplit.body;
		} else if (hasCollectionMd && collectionMdRaw !== null) {
			// Bare `_collection.md` with no frontmatter: collection with
			// default labels, raw markdown body.
			body = collectionMdRaw;
		}

		if (!conflict) {
			collections.set(relPath, { path: relPath, meta, body });
		}
	}

	// Load index.yaml if present, or frontmatter from index.md, to
	// classify the current folder as an entity.
	//
	// Two layouts are supported:
	//
	//   1. Sidecar (legacy): `index.yaml` carries the metadata,
	//      `index.md` carries the prose.
	//   2. Frontmatter:      `index.md` carries both — a standard
	//      `---`-delimited YAML block at the top, followed by the
	//      prose body.
	//
	// If both an `index.yaml` AND an `index.md` with a frontmatter
	// fence are present in the same folder, that's an authoring
	// mistake: emit an `invalid-yaml` issue and skip the entity so
	// the conflict surfaces loudly rather than one source silently
	// shadowing the other.
	let nextParentEntity = args.parentEntity;
	const mdRaw = hasIndexMd ? await readFile(indexMdPath, 'utf8') : null;
	const mdSplit = mdRaw !== null ? splitFrontmatter(mdRaw) : null;
	const hasMdFrontmatter = mdSplit?.frontmatter !== null && mdSplit?.frontmatter !== undefined;
	const isEntity = relPath !== '' && (hasIndexYaml || hasMdFrontmatter);

	if (isEntity) {
		const id: EntityId = relPath;
		const slug = leafOf(relPath);
		// `type` is the parent-folder path: one segment shorter than
		// `id`. For an entity directly under the content root, `type`
		// is the empty string.
		const entityType = parentOf(relPath);

		let meta: EntityMeta | null = null;
		// `metaPath` is what we report in diagnostics: the file the
		// metadata was actually parsed from. May be the `.md` file
		// when frontmatter is in use.
		let metaPath = indexYamlPath;
		let conflict = false;

		if (hasIndexYaml && hasMdFrontmatter) {
			conflict = true;
			issues.push({
				kind: 'invalid-yaml',
				entity: id,
				detail: `both index.yaml and index.md frontmatter declare metadata; pick one`
			});
		} else if (hasIndexYaml) {
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
		} else if (hasMdFrontmatter && mdSplit) {
			metaPath = indexMdPath;
			try {
				const parsed = parseYaml(mdSplit.frontmatter ?? '');
				meta = ((parsed && typeof parsed === 'object' ? parsed : {}) as EntityMeta) ?? null;
				if (meta && !meta.name) meta.name = slug;
			} catch (err) {
				issues.push({
					kind: 'invalid-yaml',
					entity: id,
					detail: `${indexMdPath}: ${err instanceof Error ? err.message : String(err)}`
				});
			}
		}

		// Determine the body. Frontmatter wins (its body is the
		// post-fence remainder). The sidecar layout uses the whole
		// file. When neither side carries an md, we still emit the
		// missing-md health issue exactly as before.
		let body = '';
		if (hasIndexMd) {
			body = hasMdFrontmatter && mdSplit ? mdSplit.body : (mdRaw ?? '');
		} else if (hasIndexYaml) {
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

		if (meta && !conflict) {
			entities.set(id, {
				id,
				type: entityType,
				slug,
				meta,
				body,
				wikilinks: mergedWikilinks,
				kindLinks: mergedKindLinks,
				kindRefs: extractKindRefs(meta),
				yamlPath: metaPath,
				mdPath: indexMdPath,
				parent: args.parentEntity,
				children: [],
				chapters,
				book: chapters.length > 0 ? resolveBookMeta(meta.book) : null,
				craft
			});

			nextParentEntity = id;
		}
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
 * Resolve a wikilink path to a canonical entity id.
 *
 * The algorithm is cluster-scoped when `fromCluster` is set and the
 * raw path does not itself begin with a known cluster or universal
 * substrate name; otherwise it falls back to global resolution.
 *
 * Order:
 *
 *   1. **Cluster-prefixed or no-cluster context** — if `rawPath`
 *      starts with a known cluster id or a universal-substrate id,
 *      or if `fromCluster` is `null`, resolve globally:
 *        a. Exact match.
 *        b. Suffix match across all entities. Exactly one → use it.
 *        c. Else → `missing` / `ambiguous`.
 *
 *   2. **Cluster-local** — otherwise the path is treated as relative
 *      to `fromCluster`:
 *        a. Exact match against `<fromCluster>/<rawPath>`.
 *        b. Suffix match restricted to ids in `<fromCluster>/`.
 *           Exactly one in-cluster → use it.
 *        c. Universal-substrate fallback: try exact and suffix match
 *           across every universal root combined. Exactly one match
 *           → use it.
 *        d. Else → `missing-in-cluster` / `ambiguous-in-cluster`.
 *
 * Bare-slug `[[foo]]` is supported via the suffix match. Authors who
 * need cross-cluster references must write the full path beginning
 * with a cluster id (e.g. `[[earth/places/sharazan]]`) — that hits
 * branch 1.
 */
export type WikilinkResolveResult =
	| { id: EntityId }
	| {
			id: null;
			reason: 'missing' | 'ambiguous' | 'missing-in-cluster' | 'ambiguous-in-cluster';
			matches: EntityId[];
	  };

export function resolveWikilink(
	rawPath: string,
	entities: ReadonlyMap<EntityId, unknown>,
	fromCluster: string | null = null,
	clusters: ReadonlySet<string> = new Set(),
	universal: ReadonlySet<string> = new Set()
): WikilinkResolveResult {
	const firstSeg = rawPath.split('/')[0];
	const isPrefixed = clusters.has(firstSeg) || universal.has(firstSeg);

	if (isPrefixed || fromCluster === null) {
		return resolveGlobal(rawPath, entities);
	}

	// (a) Cluster-local exact.
	const localExact = `${fromCluster}/${rawPath}`;
	if (entities.has(localExact)) return { id: localExact };

	// (b) Cluster-local suffix.
	const prefix = `${fromCluster}/`;
	const suffix = `/${rawPath}`;
	const localMatches: EntityId[] = [];
	for (const id of entities.keys()) {
		if (id.startsWith(prefix) && id.endsWith(suffix)) localMatches.push(id);
	}
	if (localMatches.length === 1) return { id: localMatches[0] };
	if (localMatches.length > 1) {
		return { id: null, reason: 'ambiguous-in-cluster', matches: localMatches };
	}

	// (c) Universal-substrate fallback across all universal roots.
	const universalMatches: EntityId[] = [];
	for (const root of universal) {
		const exact = `${root}/${rawPath}`;
		if (entities.has(exact)) universalMatches.push(exact);
	}
	if (universalMatches.length === 0) {
		for (const root of universal) {
			const rootPrefix = `${root}/`;
			for (const id of entities.keys()) {
				if (id.startsWith(rootPrefix) && id.endsWith(suffix)) universalMatches.push(id);
			}
		}
	}
	if (universalMatches.length === 1) return { id: universalMatches[0] };
	if (universalMatches.length > 1) {
		return { id: null, reason: 'ambiguous-in-cluster', matches: universalMatches };
	}

	return { id: null, reason: 'missing-in-cluster', matches: [] };
}

function resolveGlobal(
	rawPath: string,
	entities: ReadonlyMap<EntityId, unknown>
): WikilinkResolveResult {
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
