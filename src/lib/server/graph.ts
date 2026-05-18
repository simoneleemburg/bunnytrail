import type {
	Edge,
	Entity,
	EntityId,
	EntityType,
	EntityTypeInfo,
	EntityTypeMeta,
	HealthIssue
} from '$lib/types';
import { parentType, resolveTypeInfo } from '$lib/types';
import { buildEdges, CONTENT_DIR, loadAll, resolveWikilink, typeOf } from './loader';

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
	#types: EntityType[] = [];
	#typesSet = new Set<EntityType>();
	#typeMeta = new Map<EntityType, EntityTypeMeta>();
	#loaded = false;
	#loading: Promise<void> | null = null;

	/** Load (or reload) the entire graph from disk. */
	async load(contentDir: string = CONTENT_DIR): Promise<void> {
		if (this.#loading) return this.#loading;
		this.#loading = (async () => {
			const { entities, issues, types, typeMeta } = await loadAll(contentDir);
			const edges = buildEdges(entities);
			this.#entities = entities;
			this.#outEdges = edges.out;
			this.#inEdges = edges.in;
			this.#issues = issues;
			this.#types = types;
			this.#typesSet = new Set(types);
			this.#typeMeta = typeMeta;
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

	/** Direct entities of a type — does not include entities of subtypes. */
	byType(type: EntityType): Entity[] {
		return this.all().filter((e) => e.type === type);
	}

	/** Entities of this type plus all subtypes (recursive). */
	byTypeRecursive(type: EntityType): Entity[] {
		return this.all().filter((e) => e.type === type || e.type.startsWith(`${type}/`));
	}

	/**
	 * All type paths discovered (top-level + subtypes), each decorated
	 * with display labels, the description from `_type.yaml` (if any),
	 * and a live count of *direct* entities (not including subtypes).
	 */
	types(): (EntityTypeInfo & { count: number })[] {
		return this.#types.map((type) => ({
			...resolveTypeInfo(type, this.#typeMeta.get(type)),
			count: this.byType(type).length
		}));
	}

	/** Only top-level types (no parent). */
	topLevelTypes(): (EntityTypeInfo & { count: number })[] {
		return this.types().filter((t) => t.parent === null);
	}

	/** Direct subtypes of a given type. */
	subtypesOf(type: EntityType): (EntityTypeInfo & { count: number })[] {
		return this.types().filter((t) => t.parent === type);
	}

	/** Resolved info for a single type, with defaults applied. */
	typeInfo(type: EntityType): EntityTypeInfo {
		return resolveTypeInfo(type, this.#typeMeta.get(type));
	}

	hasType(type: EntityType): boolean {
		return this.#typesSet.has(type);
	}

	/** Resolve the type path of an entity id. */
	typeOf(id: EntityId): EntityType | null {
		return typeOf(id, this.#typesSet);
	}

	/** Child entities of an entity (filesystem-nested). */
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
	 * from the `code` field on entities whose type matches the
	 * `languages` collection — top-level `languages` or the subtype
	 * `culture/languages`, whichever exists.
	 *
	 * Used by the markdown renderer to resolve `[[ot]]`-style inline
	 * language tags.
	 */
	languageCodes(): Map<string, EntityId> {
		const out = new Map<string, EntityId>();
		const langTypes = this.#types.filter((t) => t === 'languages' || t.endsWith('/languages'));
		for (const t of langTypes) {
			for (const e of this.byType(t)) {
				const code = e.meta.code;
				if (typeof code !== 'string' || !code) continue;
				out.set(code, e.id);
			}
		}
		return out;
	}
}

// Re-export for callers that want path utilities without reaching into types.
export { parentType };

/** Singleton graph instance. */
export const graph = new Graph();
