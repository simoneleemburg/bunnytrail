import type {
	Collection,
	Edge,
	Entity,
	EntityId,
	EntityType,
	FolderLabels,
	HealthIssue,
	Kind,
	VocabEntry
} from '$lib/types';
import { folderLabels } from '$lib/types';
import { CONTENT_DIR } from './globals';
import { buildEdges, loadAll, resolveWikilink } from './loader';

/**
 * Compare two entities: ranked entities sort first (ascending), unranked
 * entities fall back to locale-aware name order. Exported so load functions
 * can reuse the same comparator without duplicating it.
 */
export function byRankThenName(a: Entity, b: Entity): number {
	const aRank = a.meta.rank;
	const bRank = b.meta.rank;
	if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
	if (aRank !== undefined) return -1;
	if (bRank !== undefined) return 1;
	return a.meta.name.localeCompare(b.meta.name);
}

/**
 * In-memory worldbuilding graph, built from the `content/` directory at boot
 * and kept fresh in dev via the file watcher (see `watcher.ts`).
 *
 * It is intentionally simple: a few maps, no query language. If the data grows
 * past "thousands of entities" we can revisit.
 */
/**
 * One entry in the species-presence index: this species appears in the
 * population statistics of `worldId` at `percentage`%.
 */
export interface SpeciesPresenceEntry {
	worldId: EntityId;
	worldName: string;
	href: string;
	percentage: number;
	worldTotal: number | null;
	/** Raw count if the slice was authored as a count rather than a percentage. */
	count?: number | null;
}

export class Graph {
	#entities = new Map<EntityId, Entity>();
	#outEdges = new Map<EntityId, Edge[]>();
	#inEdges = new Map<EntityId, Edge[]>();
	#issues: HealthIssue[] = [];
	#kindRegistry: Map<string, Kind> = new Map();
	#collections: Map<string, Collection> = new Map();
	#clusters: Set<string> = new Set();
	#universalFolders: Set<string> = new Set();
	#loaded = false;
	#loading: Promise<void> | null = null;
	/** Lazily built on first call to `speciesPresence()`. */
	#speciesPopulationIndex: Map<EntityId, SpeciesPresenceEntry[]> | null = null;
	/** Lazily built on first call to `languageVocabulary()`. */
	#vocabIndex: Map<EntityId, VocabEntry[]> | null = null;

	/** Load (or reload) the entire graph from disk. */
	async load(contentDir: string = CONTENT_DIR): Promise<void> {
		if (this.#loading) return this.#loading;
		this.#loading = (async () => {
			const { entities, issues, kindRegistry, collections, clusters, universalFolders } =
				await loadAll(contentDir);
			const edges = buildEdges(entities);
			this.#entities = entities;
			this.#outEdges = edges.out;
			this.#inEdges = edges.in;
			this.#issues = issues;
			this.#kindRegistry = kindRegistry;
			this.#collections = collections;
			this.#clusters = clusters;
			this.#universalFolders = universalFolders;
			this.#loaded = true;
		// Invalidate lazy indices so a dev-mode reload rebuilds them
		// against the fresh entity set.
		this.#speciesPopulationIndex = null;
		this.#vocabIndex = null;
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
	 * Top-level folders that act as *clusters* of the universe —
	 * distinct charted neighbourhoods like `aurethia/` (a star
	 * system and its surroundings) or `earth/` (a single world).
	 *
	 * Excludes any top-level folder marked `universal: true` in its
	 * `_collection.{yaml,md}` — those are universal substrate
	 * (e.g. `foundation/`), not peer clusters. They remain fully
	 * browseable and reachable, but they do not appear in the
	 * cluster selector and do not participate in cluster-scoped
	 * resolution as a "from" cluster.
	 */
	clusters(): string[] {
		return [...this.#clusters].sort();
	}

	/**
	 * Top-level folders explicitly marked as universal substrate
	 * (`universal: true` in their `_collection.{yaml,md}`).
	 * Bare-slug wikilinks fall back to these when no in-cluster
	 * match is found.
	 */
	universalFolders(): string[] {
		return [...this.#universalFolders].sort();
	}

	/**
	 * Union of immediate sub-shelves found across all clusters AND
	 * universal-substrate folders. A "shelf" is a single-segment
	 * folder name like `characters`, `places`, `history`, `nature`.
	 * The same name appearing under multiple roots collapses to one
	 * entry. Universal substrates (e.g. `foundation/`) participate so
	 * that a shelf like `nature` — present under both `aurethia/` and
	 * `foundation/` — is surfaced as a single aggregate page at
	 * `/nature` rather than only through `foundation/nature`.
	 *
	 * Returned sorted alphabetically by shelf id.
	 */
	unionShelves(): string[] {
		const seen = new Set<string>();
		for (const root of [...this.clusters(), ...this.universalFolders()]) {
			for (const childPath of this.childFolders(root)) {
				const shelf = childPath.slice(root.length + 1);
				if (shelf && !shelf.includes('/')) seen.add(shelf);
			}
		}
		return [...seen].sort();
	}

	/**
	 * Immediate sub-shelves of every universal-substrate top-level
	 * folder, paired with their root. Universal substrate is shared
	 * across all clusters, so these shelves are surfaced inline in
	 * the masthead nav alongside cluster union shelves and remain
	 * visible in every cluster scope.
	 *
	 * Unlike `unionShelves()`, entries are returned with their root
	 * intact (e.g. `{ root: 'foundation', shelf: 'fabric' }`) because
	 * universal shelves don't aggregate across roots — each one
	 * lives at its real folder path. Sorted by shelf id, then root.
	 */
	universalShelves(): { root: string; shelf: string }[] {
		const out: { root: string; shelf: string }[] = [];
		for (const root of this.universalFolders()) {
			for (const childPath of this.childFolders(root)) {
				const shelf = childPath.slice(root.length + 1);
				if (shelf && !shelf.includes('/')) out.push({ root, shelf });
			}
		}
		out.sort((a, b) => a.shelf.localeCompare(b.shelf) || a.root.localeCompare(b.root));
		return out;
	}

	/**
	 * Every entity living under a shelf-name across all clusters.
	 * E.g. `entitiesByShelfAcrossClusters('characters')` returns the
	 * union of `aurethia/characters/*`, plus any future cluster's
	 * `characters/*`. Sort is by display name.
	 */
	entitiesByShelfAcrossClusters(shelf: string): Entity[] {
		const out: Entity[] = [];
		for (const cluster of this.clusters()) {
			for (const e of this.byFolderRecursive(`${cluster}/${shelf}`)) out.push(e);
		}
		out.sort(byRankThenName);
		return out;
	}

	/**
	 * Per-cluster paths for a given shelf — i.e. the concrete folder
	 * paths whose union the aggregate represents. A cluster is
	 * included only if it actually has the shelf.
	 */
	clusterShelfPaths(shelf: string): string[] {
		const out: string[] = [];
		for (const cluster of this.clusters()) {
			const candidate = `${cluster}/${shelf}`;
			if (this.isFolder(candidate)) out.push(candidate);
		}
		return out;
	}

	/**
	 * Distinct second-level sub-folder names that exist under
	 * `<cluster>/<shelf>/` across all clusters. E.g. for `people`
	 * may return `['characters', 'cultures', 'languages']`. Only
	 * includes names that are genuine folders (have descendants or a
	 * _collection.yaml). Sorted alphabetically.
	 */
	subShelvesAcrossClusters(shelf: string): string[] {
		const seen = new Set<string>();
		for (const cluster of this.clusters()) {
			const shelfPath = `${cluster}/${shelf}`;
			for (const childPath of this.childFolders(shelfPath)) {
				const sub = childPath.slice(shelfPath.length + 1);
				if (sub && !sub.includes('/')) seen.add(sub);
			}
		}
		return [...seen].sort();
	}

	/**
	 * Per-cluster paths for a given shelf + sub-shelf pair — e.g.
	 * `clusterSubShelfPaths('people', 'characters')` returns
	 * `['aurethia/people/characters', 'earth/people/characters']`
	 * for every cluster that actually has that sub-shelf folder.
	 */
	clusterSubShelfPaths(shelf: string, subShelf: string): string[] {
		const out: string[] = [];
		for (const cluster of this.clusters()) {
			const candidate = `${cluster}/${shelf}/${subShelf}`;
			if (this.isFolder(candidate)) out.push(candidate);
		}
		return out;
	}

	/**
	 * Every entity living under a sub-shelf across all clusters.
	 * E.g. `entitiesBySubShelfAcrossClusters('people', 'characters')`
	 * returns the union of `aurethia/people/characters/*` etc.
	 */
	entitiesBySubShelfAcrossClusters(shelf: string, subShelf: string): Entity[] {
		const out: Entity[] = [];
		for (const cluster of this.clusters()) {
			for (const e of this.byFolderRecursive(`${cluster}/${shelf}/${subShelf}`)) out.push(e);
		}
		out.sort(byRankThenName);
		return out;
	}

	/**
	 * Every concrete folder path for a shelf across **all roots** —
	 * both cluster folders and universal-substrate folders. E.g. for
	 * `nature` may return `['aurethia/nature', 'foundation/nature']`.
	 * Only roots that actually have the shelf are included.
	 */
	allShelfPaths(shelf: string): string[] {
		const out: string[] = [];
		for (const root of [...this.clusters(), ...this.universalFolders()]) {
			const candidate = `${root}/${shelf}`;
			if (this.isFolder(candidate)) out.push(candidate);
		}
		return out;
	}

	/**
	 * Every entity living under a shelf across all clusters AND
	 * universal-substrate folders. Sorted by rank then name.
	 */
	entitiesByShelfAll(shelf: string): Entity[] {
		const out: Entity[] = [];
		for (const root of [...this.clusters(), ...this.universalFolders()]) {
			for (const e of this.byFolderRecursive(`${root}/${shelf}`)) out.push(e);
		}
		out.sort(byRankThenName);
		return out;
	}

	/**
	 * Distinct second-level sub-folder names under `<root>/<shelf>/`
	 * across all clusters AND universal-substrate folders. Sorted
	 * alphabetically.
	 */
	subShelvesAll(shelf: string): string[] {
		const seen = new Set<string>();
		for (const root of [...this.clusters(), ...this.universalFolders()]) {
			const shelfPath = `${root}/${shelf}`;
			for (const childPath of this.childFolders(shelfPath)) {
				const sub = childPath.slice(shelfPath.length + 1);
				if (sub && !sub.includes('/')) seen.add(sub);
			}
		}
		return [...seen].sort();
	}

	/**
	 * Every concrete folder path for a shelf + sub-shelf pair across
	 * all roots (clusters + universals). E.g.
	 * `allSubShelfPaths('nature', 'mortals')` returns
	 * `['aurethia/nature/mortals', 'foundation/nature/mortals']` for
	 * every root that actually has that sub-shelf.
	 */
	allSubShelfPaths(shelf: string, subShelf: string): string[] {
		const out: string[] = [];
		for (const root of [...this.clusters(), ...this.universalFolders()]) {
			const candidate = `${root}/${shelf}/${subShelf}`;
			if (this.isFolder(candidate)) out.push(candidate);
		}
		return out;
	}

	/**
	 * Every entity living under a sub-shelf across all clusters AND
	 * universal-substrate folders. Sorted by rank then name.
	 */
	entitiesBySubShelfAll(shelf: string, subShelf: string): Entity[] {
		const out: Entity[] = [];
		for (const root of [...this.clusters(), ...this.universalFolders()]) {
			for (const e of this.byFolderRecursive(`${root}/${shelf}/${subShelf}`)) out.push(e);
		}
		out.sort(byRankThenName);
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
		out.sort(byRankThenName);
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
			arr.sort(byRankThenName);
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
	 * Resolve a wikilink path to a canonical entity id.
	 *
	 * When `fromCluster` is set, resolution is cluster-scoped: bare
	 * and partial paths resolve within that cluster first, then fall
	 * back to any universal-substrate folders. Cluster-prefixed
	 * paths (e.g. `[[earth/places/sharazan]]`) always resolve
	 * globally, regardless of `fromCluster`. See `resolveWikilink`
	 * in `loader.ts` for the full algorithm and `WIKILINKS.md` for
	 * the authoring contract.
	 *
	 * When `fromCluster` is `null` (or omitted), resolution is
	 * fully global — equivalent to the pre-cluster-scoping
	 * behaviour. Use this for contexts that legitimately span all
	 * clusters (e.g. kind pages, the tag index).
	 *
	 * Returns `null` if the path is missing or ambiguous; the
	 * markdown renderer treats both as broken links.
	 *
	 * Entities are tried first. On miss, the same algorithm is
	 * applied against the collections map, so wikilinks like
	 * `[[the-three-cardinals]]` (a collection folder, not an
	 * entity file) resolve to the collection's browse page.
	 */
	resolveLink(rawPath: string, fromCluster: string | null = null): EntityId | null {
		const r = resolveWikilink(
			rawPath,
			this.#entities,
			fromCluster,
			this.#clusters,
			this.#universalFolders
		);
		if (r.id) return r.id;
		const c = resolveWikilink(
			rawPath,
			this.#collections,
			fromCluster,
			this.#clusters,
			this.#universalFolders
		);
		return c.id;
	}

	/**
	 * Compute the wikilink-resolution scope for a given entity or
	 * collection id: the top-level folder it lives under, if that
	 * folder is either a registered cluster or a universal
	 * substrate. Returns `null` for ids outside both (e.g. flat
	 * pre-cluster fixtures in tests).
	 *
	 * Universal substrates count as their own scope so that
	 * authoring within `foundation/` can use bare slugs the same
	 * way authoring within a cluster does — bare `[[oblivion]]`
	 * from `foundation/fabric/quantities/subjectivity` resolves
	 * cluster-locally to `foundation/.../oblivion`, rather than
	 * leaking to global suffix match.
	 *
	 * Use this from page-load callsites to curry `resolveLink`
	 * with the correct context for the entity being rendered.
	 */
	clusterOf(id: EntityId): string | null {
		const first = id.split('/')[0];
		if (this.#clusters.has(first)) return first;
		if (this.#universalFolders.has(first)) return first;
		return null;
	}

	/**
	 * All entities whose `meta.class` points at `classId` — i.e.
	 * every entity that declares itself an instance of the given
	 * entity. Sorted by rank then name.
	 *
	 * Used to build the "Instances" tab on entity pages that act as
	 * class targets (e.g. the Human entity listing all humans).
	 */
	classMates(classId: EntityId): Entity[] {
		const out: Entity[] = [];
		for (const e of this.#entities.values()) {
			if (e.meta.class === classId) out.push(e);
		}
		out.sort(byRankThenName);
		return out;
	}

	/**
	 * Every world-level population entry that references `speciesId`
	 * in its `statistics.population.slices`. Lazily builds a reverse
	 * index on first call (O(n) over all entities) and caches it for
	 * subsequent calls. The cache is invalidated by `load()` so dev
	 * hot-reloads always see fresh data.
	 *
	 * Returns an empty array for entities that appear in no world's
	 * population statistics. Sorted by percentage descending so the
	 * most populous presence appears first.
	 */
	speciesPresence(speciesId: EntityId): SpeciesPresenceEntry[] {
		if (!this.#speciesPopulationIndex) {
			this.#speciesPopulationIndex = this.#buildSpeciesPopulationIndex();
		}
		return this.#speciesPopulationIndex.get(speciesId) ?? [];
	}

	/**
	 * Walk every entity, extract `statistics[].population` blocks, and
	 * build a reverse map from species entity id → list of world entries.
	 */
	#buildSpeciesPopulationIndex(): Map<EntityId, SpeciesPresenceEntry[]> {
		const index = new Map<EntityId, SpeciesPresenceEntry[]>();

		for (const entity of this.#entities.values()) {
			const rawStats = entity.meta.statistics;
			if (!Array.isArray(rawStats)) continue;

			for (const item of rawStats) {
				if (!item || typeof item !== 'object') continue;
				const entry = item as Record<string, unknown>;
				if (!('population' in entry) || !Array.isArray(entry.population)) continue;

			// Extract total and slices from the population array.
			let total: number | null = null;
			let slices: Array<{ species: string; percentage: number; count?: number }> = [];

			for (const popItem of entry.population) {
				if (!popItem || typeof popItem !== 'object') continue;
				const p = popItem as Record<string, unknown>;
				if (typeof p.total === 'number') total = p.total;
				if (Array.isArray(p.slices)) {
					for (const s of p.slices) {
						if (!s || typeof s !== 'object') continue;
						const sl = s as Record<string, unknown>;
						if (typeof sl.species !== 'string') continue;
						const pct = typeof sl.percentage === 'number' ? sl.percentage : null;
						const cnt = typeof sl.count === 'number' ? sl.count : null;
						if (pct !== null) {
							slices.push({ species: sl.species, percentage: pct });
						} else if (cnt !== null && total !== null && total > 0) {
							// Full-precision percentage derived from count
							slices.push({ species: sl.species, percentage: (cnt / total) * 100, count: cnt });
						}
					}
				}
			}

				if (slices.length === 0) continue;

				const worldEntry: Omit<SpeciesPresenceEntry, 'percentage'> = {
					worldId: entity.id,
					worldName: entity.meta.name,
					href: `/${entity.id}`,
					worldTotal: total
				};

			for (const slice of slices) {
				const arr = index.get(slice.species) ?? [];
				arr.push({ ...worldEntry, percentage: slice.percentage, count: slice.count ?? null });
				index.set(slice.species, arr);
			}
			}
		}

		// Sort each species' entry list by percentage descending.
		for (const arr of index.values()) {
			arr.sort((a, b) => b.percentage - a.percentage);
		}

		return index;
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

	/**
	 * All vocabulary entries attributed to a language entity, sorted
	 * alphabetically by word. Collects entries from:
	 *   1. The language entity's own `vocabulary:` frontmatter block
	 *      (no `language:` field needed — all items belong to it).
	 *   2. Any other entity whose `vocabulary:` block items carry a
	 *      `language:` field that resolves (by short code or full id)
	 *      to this language.
	 */
	languageVocabulary(langId: EntityId): VocabEntry[] {
		if (!this.#vocabIndex) this.#vocabIndex = this.#buildVocabIndex();
		return this.#vocabIndex.get(langId) ?? [];
	}

	#buildVocabIndex(): Map<EntityId, VocabEntry[]> {
		const index = new Map<EntityId, VocabEntry[]>();
		// Build code→id map once so we can resolve short codes in vocabulary items.
		const codes = this.languageCodes();

		/** Resolve a `language:` value (short code or full entity id) to a language entity id. */
		const resolveLang = (raw: string): EntityId | null => {
			if (codes.has(raw)) return codes.get(raw)!;
			if (this.#entities.has(raw)) return raw;
			return null;
		};

		const push = (langId: EntityId, entry: VocabEntry) => {
			const arr = index.get(langId) ?? [];
			arr.push(entry);
			index.set(langId, arr);
		};

		for (const entity of this.#entities.values()) {
			const raw = entity.meta.vocabulary;
			if (!Array.isArray(raw)) continue;

			const isLang = entity.meta.kind === 'language';

			for (const item of raw) {
				if (!item || typeof item !== 'object') continue;
				const v = item as Record<string, unknown>;
				const word = typeof v.word === 'string' ? v.word.trim() : null;
				if (!word) continue;

				const meaning = typeof v.meaning === 'string' ? v.meaning.trim() || null : null;
				const pos = typeof v.pos === 'string' ? v.pos.trim() || null : null;
				const notes = typeof v.notes === 'string' ? v.notes.trim() || null : null;

				if (isLang) {
					// Item on the language entity itself — always belongs here.
					// Optionally a `language:` field can override (rare edge case).
					const langOverride =
						typeof v.language === 'string' ? resolveLang(v.language) : null;
					const targetId = langOverride ?? entity.id;
					push(targetId, {
						word,
						meaning,
						pos,
						notes,
						sourceId: null,
						sourceName: null,
						sourceHref: null
					});
				} else {
					// Item on a non-language entity — requires a `language:` field.
					const langRef = typeof v.language === 'string' ? v.language : null;
					if (!langRef) continue;
					const targetId = resolveLang(langRef);
					if (!targetId) continue;
					push(targetId, {
						word,
						meaning,
						pos,
						notes,
						sourceId: entity.id,
						sourceName: entity.meta.name,
						sourceHref: `/${entity.id}`
					});
				}
			}
		}

		// Sort each language's list alphabetically by word.
		for (const arr of index.values()) {
			arr.sort((a, b) => a.word.localeCompare(b.word, undefined, { sensitivity: 'base' }));
		}

		return index;
	}
}

/** Singleton graph instance. */
export const graph = new Graph();
