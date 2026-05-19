import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { HealthIssue, Kind, KindMeta } from '$lib/types';

/**
 * Where the central kind registry lives. Each kind is a sibling
 * `<kind>.yaml` plus an optional `<kind>.md` prose file. Override
 * with `ALTERIA_KINDS_DIR` for testing.
 *
 * The registry sits outside `content/` on purpose: kinds are
 * structural metadata about the worldbuilding vocabulary, not
 * worldbuilding prose themselves. Their `.md` companions are the
 * one exception — short editorial blurbs that render on the kind's
 * supertype-self-page.
 */
export const KINDS_DIR = process.env.ALTERIA_KINDS_DIR ?? resolve(process.cwd(), 'src/kinds');

const KIND_ID_RE = /^[a-z][a-z0-9-]*$/;

export interface KindLoadResult {
	/** All loaded kinds, keyed by id. */
	kinds: Map<string, Kind>;
	/** Any problems encountered (malformed yaml, bad id, missing parent). */
	issues: HealthIssue[];
}

/**
 * Walk `src/kinds/` (or `ALTERIA_KINDS_DIR`) once and return every
 * declared kind plus any prose body. The directory is shallow by
 * design: kinds are flat; the hierarchy is expressed through
 * `kindParent` inside the yaml, not via filesystem nesting.
 *
 * If the directory does not exist, returns an empty registry with
 * no issues — callers should treat absence as "no kinds registered
 * yet" rather than an error.
 */
export async function loadKindRegistry(kindsDir: string = KINDS_DIR): Promise<KindLoadResult> {
	const kinds = new Map<string, Kind>();
	const issues: HealthIssue[] = [];

	let entries: string[];
	try {
		entries = await readdir(kindsDir);
	} catch {
		return { kinds, issues };
	}

	for (const name of entries.sort()) {
		if (name.startsWith('.') || name.startsWith('_')) continue;
		if (!name.endsWith('.yaml')) continue;

		const id = name.slice(0, -'.yaml'.length);
		if (!KIND_ID_RE.test(id)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `src/kinds/${name}: kind id must be kebab-case starting with a letter`
			});
			continue;
		}

		const yamlPath = join(kindsDir, name);
		let raw: string;
		try {
			raw = await readFile(yamlPath, 'utf8');
		} catch (err) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `src/kinds/${name}: cannot read (${err instanceof Error ? err.message : String(err)})`
			});
			continue;
		}

		let meta: KindMeta;
		try {
			const parsed = parseYaml(raw);
			meta = (parsed && typeof parsed === 'object' ? parsed : {}) as KindMeta;
		} catch (err) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `src/kinds/${name}: ${err instanceof Error ? err.message : String(err)}`
			});
			continue;
		}

		// Light field validation. Anything unknown is preserved (yaml is
		// already typed loosely) — we only complain about wrong shapes
		// for fields we care about.
		if (meta.kindParent !== undefined && typeof meta.kindParent !== 'string') {
			issues.push({
				kind: 'invalid-yaml',
				detail: `src/kinds/${name}: kindParent must be a string`
			});
			continue;
		}
		for (const field of ['singular', 'plural', 'description'] as const) {
			const value = meta[field];
			if (value !== undefined && typeof value !== 'string') {
				issues.push({
					kind: 'invalid-yaml',
					detail: `src/kinds/${name}: ${field} must be a string`
				});
				meta[field] = undefined;
			}
		}

		// Optional prose body. Read it eagerly so the renderer has
		// uniform access via the registry without a separate fs hop.
		const bodyPath = join(kindsDir, `${id}.md`);
		let body: string | null = null;
		try {
			const st = await stat(bodyPath);
			if (st.isFile()) body = await readFile(bodyPath, 'utf8');
		} catch {
			// no companion .md — fine.
		}

		kinds.set(id, { id, meta, body });
	}

	// Validate parent references after every kind is loaded so order
	// inside the directory doesn't matter.
	for (const k of kinds.values()) {
		const parent = k.meta.kindParent;
		if (parent === undefined) continue;
		if (!kinds.has(parent)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `src/kinds/${k.id}.yaml: kindParent '${parent}' is not a registered kind`
			});
		}
	}

	// Detect cycles by walking each kind's ancestry.
	for (const k of kinds.values()) {
		const seen = new Set<string>([k.id]);
		let cur = k.meta.kindParent ?? null;
		while (cur !== null) {
			if (seen.has(cur)) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `src/kinds/${k.id}.yaml: kind cycle through '${cur}'`
				});
				break;
			}
			seen.add(cur);
			cur = kinds.get(cur)?.meta.kindParent ?? null;
		}
	}

	return { kinds, issues };
}
