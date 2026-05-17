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

/** Match `[[type/slug]]` or `[[type/slug|label]]` in markdown bodies. */
const WIKILINK_RE = /\[\[([a-z]+)\/([a-z0-9-]+)(?:\|[^\]]+)?\]\]/g;

export interface LoadResult {
	entities: Map<EntityId, Entity>;
	issues: HealthIssue[];
	/** Type slugs discovered as immediate subdirectories of `contentDir`, sorted. */
	types: EntityType[];
	/** Per-type meta loaded from `content/<type>/_type.yaml`, if present. */
	typeMeta: Map<EntityType, EntityTypeMeta>;
}

/**
 * List the immediate subdirectories of `contentDir`. Each one is treated as
 * an entity type. Hidden directories (`.foo`) and underscore-prefixed ones
 * (`_foo`) are skipped — the latter is reserved for content-system
 * scaffolding (e.g. shared assets).
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
 * Walk `content/<type>/<slug>/index.{yaml,md}` and produce a list of
 * entities. Each entity lives in its own folder so it can grow companion
 * assets (images, attachments) over time without polluting the parent
 * directory.
 */
export async function loadAll(contentDir: string = CONTENT_DIR): Promise<LoadResult> {
	const entities = new Map<EntityId, Entity>();
	const issues: HealthIssue[] = [];
	const types = await discoverTypes(contentDir);
	const typeMeta = new Map<EntityType, EntityTypeMeta>();

	for (const type of types) {
		const typeDir = join(contentDir, type);

		// Optional per-type meta. Missing file is fine; bad YAML is a load issue.
		const typeMetaPath = join(typeDir, '_type.yaml');
		if (await exists(typeMetaPath)) {
			try {
				const raw = await readFile(typeMetaPath, 'utf8');
				const parsed = (parseYaml(raw) ?? {}) as EntityTypeMeta;
				typeMeta.set(type, parsed);
			} catch (err) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${typeMetaPath}: ${err instanceof Error ? err.message : String(err)}`
				});
			}
		}

		const entries = await readDirents(typeDir);
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

			const slug = entry.name;
			const entityDir = join(typeDir, slug);
			const yamlPath = join(entityDir, 'index.yaml');
			const mdPath = join(entityDir, 'index.md');
			const id: EntityId = `${type}/${slug}`;

			const hasYaml = await exists(yamlPath);
			const hasMd = await exists(mdPath);

			if (!hasYaml) {
				issues.push({ kind: 'missing-yaml', entity: id, detail: yamlPath });
				continue;
			}

			let meta: EntityMeta;
			try {
				const raw = await readFile(yamlPath, 'utf8');
				meta = parseYaml(raw) ?? {};
				if (!meta.name) meta.name = slug;
			} catch (err) {
				issues.push({
					kind: 'invalid-yaml',
					entity: id,
					detail: err instanceof Error ? err.message : String(err)
				});
				continue;
			}

			let body = '';
			if (hasMd) {
				body = await readFile(mdPath, 'utf8');
			} else {
				issues.push({ kind: 'missing-md', entity: id, detail: mdPath });
			}

			const wikilinks = extractWikilinks(body);

			entities.set(id, {
				id,
				type,
				slug,
				meta,
				body,
				wikilinks,
				yamlPath,
				mdPath
			});
		}
	}

	// Detect broken links after the full map is built.
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
		for (const link of entity.wikilinks) {
			if (!entities.has(link)) {
				issues.push({
					kind: 'broken-link',
					entity: entity.id,
					detail: `wikilink → ${link} (not found)`
				});
			}
		}
	}

	return { entities, issues, types, typeMeta };
}

/** Extract `[[type/slug]]` references from a markdown body. */
export function extractWikilinks(body: string): EntityId[] {
	const out = new Set<EntityId>();
	for (const m of body.matchAll(WIKILINK_RE)) {
		out.add(`${m[1]}/${m[2]}`);
	}
	return [...out];
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

/** Pretty-print the type segment of an entity id, e.g. "characters/kael" → "characters". */
export function typeOf(id: EntityId): EntityType | null {
	const idx = id.indexOf('/');
	if (idx <= 0) return null;
	return id.slice(0, idx);
}
