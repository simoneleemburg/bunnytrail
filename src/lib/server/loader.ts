import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
	ENTITY_TYPES,
	type Edge,
	type Entity,
	type EntityId,
	type EntityMeta,
	type EntityType,
	type HealthIssue
} from '$lib/types';

/**
 * Where the canonical worldbuilding data lives, relative to the project root.
 * Override with ALTERIA_CONTENT_DIR for testing.
 */
export const CONTENT_DIR =
	process.env.ALTERIA_CONTENT_DIR ?? resolve(process.cwd(), 'content');

/** Match `[[type/slug]]` or `[[type/slug|label]]` in markdown bodies. */
const WIKILINK_RE = /\[\[([a-z]+)\/([a-z0-9-]+)(?:\|[^\]]+)?\]\]/g;

export interface LoadResult {
	entities: Map<EntityId, Entity>;
	issues: HealthIssue[];
}

/** Walk `content/<type>/*.{yaml,md}` and produce a list of entities. */
export async function loadAll(contentDir: string = CONTENT_DIR): Promise<LoadResult> {
	const entities = new Map<EntityId, Entity>();
	const issues: HealthIssue[] = [];

	for (const type of ENTITY_TYPES) {
		const typeDir = join(contentDir, type);
		let files: string[];
		try {
			files = await readdir(typeDir);
		} catch {
			continue; // directory doesn't exist yet — fine
		}

		const slugs = new Set<string>();
		for (const f of files) {
			const m = f.match(/^(.+)\.(yaml|md)$/);
			if (m) slugs.add(m[1]);
		}

		for (const slug of slugs) {
			const yamlPath = join(typeDir, `${slug}.yaml`);
			const mdPath = join(typeDir, `${slug}.md`);
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

	return { entities, issues };
}

/** Extract `[[type/slug]]` references from a markdown body. */
export function extractWikilinks(body: string): EntityId[] {
	const out = new Set<EntityId>();
	for (const m of body.matchAll(WIKILINK_RE)) {
		out.add(`${m[1]}/${m[2]}`);
	}
	return [...out];
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
	const t = id.split('/')[0] as EntityType;
	return ENTITY_TYPES.includes(t) ? t : null;
}
