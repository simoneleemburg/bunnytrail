import type {
	Collection,
	Edge,
	Entity,
	EntityId,
	EntityType,
	FolderLabels,
	HealthIssue,
	Kind
} from '$lib/types';
import { folderLabels } from '$lib/types';
import { buildEdges, CONTENT_DIR, loadAll, resolveWikilink } from './loader';

/**
 * In-memory worldbuilding graph, built from the `content/` directory at boot
 * and kept fresh in dev via the file watcher (see `watcher.ts`).
 *
 * It is intentionally simple: a few maps, no query language. If the data grows
 * past "thousands of entities" we can revisit.
 */
class Graph {
	#entities = new Map<EntityId, Entity>();
	#outEdges = new Map<EntityId, Edge[]>();
	#inEdges = new Map<EntityId, Edge[]>();
	#issues: HealthIssue[] = [];
	#kindRegistry: Map<string, Kind> = new Map();
	#collections: Map<string, Collection> = new Map();
	#loaded = false;
	#loading: Promise<void> | null = null;

	/** Load (or reload) the entire graph from disk. */
	async load(contentDir: string = CONTENT_DIR): Promise<void> {
		if (this.#loading) return this.#loading;
		this.#loading = (async () => {
			const { entities, issues, kindRegistry, collections } = await loadAll(contentDir);
			const edges = buildEdges(entities);
			this.#entities = entities;
			this.#outEdges = edges.out;
			this.#inEdges = edges.in;
			this.#issues = issues;
			this.#kindRegistry = kindRegistry;
			this.#collections = collections;
			this.#loaded = true;
		})();
		try {
			await this.#loading;
		} finally {
			this.#loading = null;
		}
	}

	async ready(): Promise<void> {
		if (!this.#loaded) await this.load();
	}

	get(id: EntityId): Entity | undefined {
		return this.#entities.get(id);
	}

	has(id: EntityId): boolean {
		return this.#entities.has(id);
	}

	all(): Entity[] {
		return [...this.#entities.values()];
	}

	/**
	 * The central kind registry from `content_meta/kinds/`. The sole source of
	 * truth for kind metadata and hierarchy.
	 */
	kindRegistry(): ReadonlyMap<string, Kind> {
		return this.#kindRegistry;
	}

	/** A single registered kind by id, or undefined if not registered. */
	kind(id: string): Kind | undefined {
		return this.#kindRegistry.get(id);
	}

	/**
	 * The set of registered kind ids. A small convenience for the
	 * markdown renderer, which uses it to decide whether
	 * `[[kinds/<id>]]` resolves or renders broken.
	 */
	kindIds(): ReadonlySet<string> {
		return new Set(this.#kindRegistry.keys());
	}

	/**
	 * All collections recorded under `content/`, keyed by folder path.
	 * Only folders carrying a `_collection.yaml` or `_collection.md`
	 * marker are present; absence does not mean "non-existent folder",
	 * just "no editorial metadata authored yet".
	 */
	collections(): ReadonlyMap<string, Collection> {
		return this.#collections;
	}

	/** A single collection by its folder path, or undefined. */
	collection(path: string): Collection | undefined {
		return this.#collections.get(path);
	}

	// ---------------------------------------------------------------------
	// Folder helpers. After the kinds-decoupling cutover, folders are no
	// longer typed — they are pure browsing structure. These helpers
	// answer the structural questions the routes need: "is this a
	// browseable folder?", "what entities live under it?", "what are its
	// child folders?", "what label do we show?"
	// ---------------------------------------------------------------------

	/**
	 * Display labels for a folder, derived from its `_collection.yaml`
	 * (if any) and the folder's leaf segment. Always returns a usable
	 * `{ singular, plural }` even for unknown folders.
	 */
	folderLabels(path: string): FolderLabels {
		const leaf = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
		const title = this.#collections.get(path)?.meta.title;
		return folderLabels(leaf, title);
	}

	/** True if `path` is a browseable folder: it has at least one descendant entity, or it has a `_collection.yaml`. */
	isFolder(path: string): boolean {
		if (this.#collections.has(path)) return true;
		const prefix = `${path}/`;
		for (const id of this.#entities.keys()) {
			if (id.startsWith(prefix)) return true;
		}
		return false;
	}

	/** Direct entities of a folder: id is exactly `${path}/${slug}` (no deeper). */
	byFolder(path: string): Entity[] {
		const prefix = `${path}/`;
		return this.all().filter((e) => {
			if (!e.id.startsWith(prefix)) return false;
			return !e.id.slice(prefix.length).includes('/');
		});
	}

	/** Entities at any depth under a folder. */
	byFolderRecursive(path: string): Entity[] {
		const prefix = `${path}/`;
		return this.all().filter((e) => e.id.startsWith(prefix));
	}

	/**
	 * Immediate child folders of `path`. A child folder is any path
	 * one segment deeper than `path` that itself qualifies as a
	 * browseable folder (has descendants or a `_collection.yaml`).
	 * Pass `''` to list top-level folders.
	 */
	childFolders(path: string): string[] {
		const prefix = path ? `${path}/` : '';
		const seen = new Set<string>();
		const consider = (full: string) => {
			if (!full.startsWith(prefix)) return;
			const rest = full.slice(prefix.length);
			if (!rest) return;
			const seg = rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : rest;
			if (!seg) return;
			seen.add(path ? `${path}/${seg}` : seg);
		};
		for (const id of this.#entities.keys()) consider(id);
		for (const cp of this.#collections.keys()) consider(cp);
		// A path that exactly equals an entity is not a folder; remove.
		const out: string[] = [];
		for (const candidate of seen) {
			// Must have descendants or a collection marker. The candidate
			// itself being an entity id doesn't disqualify — an entity
			// folder may also act as a container if it has children.
			if (this.#collections.has(candidate)) {
				out.push(candidate);
				continue;
			}
			const pfx = `${candidate}/`;
			for (const id of this.#entities.keys()) {
				if (id.startsWith(pfx)) {
					out.push(candidate);
					break;
				}
			}
		}
		out.sort();
		return out;
	}

	/** Convenience: top-level folders (immediate children of content root). */
	topLevelFolders(): string[] {
		return this.childFolders('');
	}

	/**
	 * Top-level folders are *regions* of the universe — distinct
	 * cosmological neighbourhoods like `aurethia/`. Aliases
	 * `topLevelFolders()` for now; if regional structure ever needs
	 * its own filter (e.g. "real" regions vs scratch shelves), it
	 * lives here.
	 */
	regions(): string[] {
		return this.topLevelFolders();
	}

	/**
	 * Union of immediate sub-shelves found across all regions. A
	 * "shelf" is a single-segment folder name like `characters`,
	 * `places`, `history`. The same name appearing under multiple
	 * regions collapses to one entry.
	 *
	 * Returned sorted by display label, lower-case shelf id.
	 */
	unionShelves(): string[] {
		const seen = new Set<string>();
		for (const region of this.regions()) {
			for (const childPath of this.childFolders(region)) {
				const shelf = childPath.slice(region.length + 1);
				if (shelf && !shelf.includes('/')) seen.add(shelf);
			}
		}
		return [...seen].sort();
	}

	/**
	 * Every entity living under a shelf-name across all regions.
	 * E.g. `entitiesByShelfAcrossRegions('characters')` returns the
	 * union of `aurethia/characters/*`, plus any future region's
	 * `characters/*`. Sort is by display name.
	 */
	entitiesByShelfAcrossRegions(shelf: string): Entity[] {
		const out: Entity[] = [];
		for (const region of this.regions()) {
			for (const e of this.byFolderRecursive(`${region}/${shelf}`)) out.push(e);
		}
		out.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
		return out;
	}

	/**
	 * Per-region paths for a given shelf — i.e. the concrete folder
	 * paths whose union the aggregate represents. A region is
	 * included only if it actually has the shelf.
	 */
	regionShelfPaths(shelf: string): string[] {
		const out: string[] = [];
		for (const region of this.regions()) {
			const candidate = `${region}/${shelf}`;
			if (this.isFolder(candidate)) out.push(candidate);
		}
		return out;
	}

	/**
	 * Entities whose `meta.kind` is `kind` or any descendant of `kind`
	 * in the kind hierarchy (computed from the registry's folder
	 * nesting). Useful for supertype filters and pages that want
	 * every member of a kind family.
	 *
	 * If `kind` is not in the registry, falls back to strict
	 * `meta.kind === kind` matching — so free-form kinds keep working.
	 */
	byKindRecursive(kind: string): Entity[] {
		const family = this.#descendantsInclusive(kind);
		return this.all().filter((e) => typeof e.meta.kind === 'string' && family.has(e.meta.kind));
	}

	/** Direct entities of a registered kind id. */
	byKind(kind: string): Entity[] {
		return this.all().filter((e) => e.meta.kind === kind);
	}

	/**
	 * Entities that mention `kindId` from prose via a
	 * `[[kinds/<kindId>]]` wikilink. Only resolved (registered)
	 * kind links are counted — broken kind wikilinks surface as
	 * `broken-link` health issues and are dropped from
	 * `entity.kindLinks` during loading.
	 */
	kindBacklinks(kindId: string): Entity[] {
		const out: Entity[] = [];
		for (const e of this.#entities.values()) {
			if (e.kindLinks.includes(kindId)) out.push(e);
		}
		out.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
		return out;
	}

	/**
	 * Entities that reference `kindId` from a structured YAML
	 * kind-link field (e.g. `nativeBeings: [kinds/human]`), grouped
	 * by which field carries the reference. Returned shape mirrors
	 * `kindBacklinks` but with the field provenance attached so the
	 * UI can label each section ("Native to", etc.).
	 *
	 * One entity may appear under multiple fields — e.g. a place
	 * declaring both `nativeBeings: [kinds/human]` and
	 * `nativePhenomena: [kinds/binding]` would show up under both
	 * `nativeBeings` (on /kinds/human) and `nativePhenomena` (on
	 * /kinds/binding). On a single /kinds/<id> page, however, the
	 * groups partition the references.
	 */
	entitiesReferencingKind(kindId: string): Map<string, Entity[]> {
		const byField = new Map<string, Entity[]>();
		for (const e of this.#entities.values()) {
			for (const [field, ids] of Object.entries(e.kindRefs)) {
				if (!ids.includes(kindId)) continue;
				const arr = byField.get(field) ?? [];
				arr.push(e);
				byField.set(field, arr);
			}
		}
		for (const arr of byField.values()) {
			arr.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
		}
		return byField;
	}

	/** Direct children of a registered kind in the registry tree. */
	childKinds(parent: string): Kind[] {
		const out: Kind[] = [];
		for (const k of this.#kindRegistry.values()) {
			if (k.parent === parent) out.push(k);
		}
		out.sort((a, b) => a.id.localeCompare(b.id));
		return out;
	}

	/** Top-level registered kinds (no parent). */
	topLevelKinds(): Kind[] {
		const out: Kind[] = [];
		for (const k of this.#kindRegistry.values()) {
			if (k.parent === null) out.push(k);
		}
		out.sort((a, b) => a.id.localeCompare(b.id));
		return out;
	}

	#descendantsInclusive(kind: string): Set<string> {
		const seen = new Set<string>([kind]);
		if (!this.#kindRegistry.has(kind)) return seen;
		// BFS over child kinds. The registry guards against cycles by
		// construction (it's a tree on disk).
		const queue = [kind];
		while (queue.length) {
			const cur = queue.shift()!;
			for (const k of this.#kindRegistry.values()) {
				if (k.parent === cur && !seen.has(k.id)) {
					seen.add(k.id);
					queue.push(k.id);
				}
			}
		}
		return seen;
	}

	/** Direct children of an entity (filesystem-nested). */
	children(id: EntityId): Entity[] {
		const entity = this.#entities.get(id);
		if (!entity) return [];
		return entity.children.map((cid) => this.#entities.get(cid)).filter((e): e is Entity => !!e);
	}

	/** Parent entity, if this entity is filesystem-nested under one. */
	parent(id: EntityId): Entity | null {
		const entity = this.#entities.get(id);
		if (!entity || !entity.parent) return null;
		return this.#entities.get(entity.parent) ?? null;
	}

	/**
	 * Resolve a wikilink path to a canonical entity id, with one
	 * fallback step (suffix match). Returns `null` if the path is
	 * missing or ambiguous; the markdown renderer treats both as
	 * broken links.
	 */
	resolveLink(rawPath: string): EntityId | null {
		const r = resolveWikilink(rawPath, this.#entities);
		return r.id;
	}

	/** Outgoing edges from `id`. */
	outEdges(id: EntityId): Edge[] {
		return this.#outEdges.get(id) ?? [];
	}

	/** Incoming edges to `id` (backlinks). */
	inEdges(id: EntityId): Edge[] {
		return this.#inEdges.get(id) ?? [];
	}

	/** Unique neighbors (both directions), with the edges that connect them. */
	neighbors(id: EntityId): { entity: Entity; edges: Edge[] }[] {
		const map = new Map<EntityId, Edge[]>();
		for (const e of this.outEdges(id)) {
			const arr = map.get(e.to) ?? [];
			arr.push(e);
			map.set(e.to, arr);
		}
		for (const e of this.inEdges(id)) {
			const arr = map.get(e.from) ?? [];
			arr.push(e);
			map.set(e.from, arr);
		}
		const out: { entity: Entity; edges: Edge[] }[] = [];
		for (const [nid, edges] of map) {
			const entity = this.#entities.get(nid);
			if (entity) out.push({ entity, edges });
		}
		return out;
	}

	issues(): HealthIssue[] {
		return this.#issues;
	}

	/**
	 * Naive full-text + tag search.
	 *
	 * Scores by:
	 *   • name exact / prefix / substring match
	 *   • alias match
	 *   • summary substring
	 *   • tag exact match
	 *   • body substring
	 *
	 * `filters.type` filters by containing-folder path (Entity.type).
	 */
	search(query: string, filters: { type?: EntityType; tag?: string } = {}): Entity[] {
		const q = query.trim().toLowerCase();
		const scored: { entity: Entity; score: number }[] = [];

		for (const entity of this.all()) {
			if (filters.type && entity.type !== filters.type) continue;
			if (filters.tag && !(entity.meta.tags ?? []).includes(filters.tag)) continue;

			if (!q) {
				scored.push({ entity, score: 0 });
				continue;
			}

			const name = entity.meta.name.toLowerCase();
			const summary = (entity.meta.summary ?? '').toLowerCase();
			const body = entity.body.toLowerCase();
			const aliases = (entity.meta.aliases ?? []).map((a) => a.toLowerCase());
			const tags = (entity.meta.tags ?? []).map((t) => t.toLowerCase());

			let score = 0;
			if (name === q) score += 100;
			else if (name.startsWith(q)) score += 50;
			else if (name.includes(q)) score += 25;

			if (aliases.some((a) => a === q)) score += 40;
			else if (aliases.some((a) => a.includes(q))) score += 15;

			if (tags.includes(q)) score += 30;
			if (summary.includes(q)) score += 10;
			if (body.includes(q)) score += 5;

			if (score > 0) scored.push({ entity, score });
		}

		scored.sort(
			(a, b) => b.score - a.score || a.entity.meta.name.localeCompare(b.entity.meta.name)
		);
		return scored.map((s) => s.entity);
	}

	/** All tags used anywhere, sorted by frequency desc. */
	tags(): { tag: string; count: number }[] {
		const counts = new Map<string, number>();
		for (const e of this.all()) {
			for (const t of e.meta.tags ?? []) {
				counts.set(t, (counts.get(t) ?? 0) + 1);
			}
		}
		return [...counts.entries()]
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
	}

	/**
	 * Map from short language code to the language entity's id. Built
	 * from the `code` field on entities whose containing folder is
	 * `languages` or ends in `/languages`. Used by the markdown
	 * renderer to resolve `[[ot]]`-style inline language tags.
	 */
	languageCodes(): Map<string, EntityId> {
		const out = new Map<string, EntityId>();
		for (const e of this.all()) {
			const inLang = e.type === 'languages' || e.type.endsWith('/languages');
			if (!inLang) continue;
			const code = e.meta.code;
			if (typeof code !== 'string' || !code) continue;
			out.set(code, e.id);
		}
		return out;
	}
}

/** Singleton graph instance. */
export const graph = new Graph();
