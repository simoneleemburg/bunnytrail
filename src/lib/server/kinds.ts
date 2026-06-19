import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { HealthIssue, Kind, Ontology, KindMeta } from '$lib/types';
import { titleCaseSlug } from '$lib/types';
import { defaultKindsDir } from './globals';

const KIND_ID_RE = /^[a-z][a-z0-9-]*$/;

export interface KindLoadResult {
	/** All loaded kinds, keyed by id. */
	kinds: Map<string, Kind>;
	/** All loaded ontologies, keyed by id. */
	ontologies: Map<string, Ontology>;
	/** Any problems encountered (malformed yaml, bad folder name). */
	issues: HealthIssue[];
}

/**
 * Walk `content_meta/kinds/` (or `BUNNYTRAIL_KINDS_DIR`) recursively and return
 * every declared kind. Each subdirectory whose name passes `KIND_ID_RE` is a
 * kind; its `_kind.yaml` (if present) supplies label and description overrides.
 * A kind with no marker file is still registered with default labels — the
 * folder existing is enough.
 *
 * A subdirectory that contains `_ontology.yaml` (and no `_kind.yaml`) is
 * treated as an organisational **ontology**, not a kind. Ontologies are one level
 * deep: kind folders inside an ontology folder become members of that ontology
 * (their `group` field is set to the ontology id). Ontologies do not affect the
 * kind hierarchy (`parent` is independent).
 *
 * If the registry directory does not exist, returns an empty registry with
 * no issues — callers should treat absence as "no kinds registered yet".
 */
export async function loadKindRegistry(
	kindsDir: string = defaultKindsDir()
): Promise<KindLoadResult> {
	const kinds = new Map<string, Kind>();
	const ontologies = new Map<string, Ontology>();
	const issues: HealthIssue[] = [];

	const rootExists = await dirExists(kindsDir);
	if (!rootExists) return { kinds, ontologies, issues };

	await walk(kindsDir, null, null, kinds, ontologies, issues, kindsDir);

	return { kinds, ontologies, issues };
}

async function walk(
	absDir: string,
	parent: string | null,
	group: string | null,
	kinds: Map<string, Kind>,
	ontologies: Map<string, Ontology>,
	issues: HealthIssue[],
	rootDir: string
): Promise<void> {
	let entries: Dirent[];
	try {
		entries = (await readdir(absDir, { withFileTypes: true })) as Dirent[];
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(absDir, rootDir)}: cannot read directory (${err instanceof Error ? err.message : String(err)})`
		});
		return;
	}

	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		if (!entry.isDirectory()) continue;

		const id = entry.name;
		if (!KIND_ID_RE.test(id)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(join(absDir, id), rootDir)}: kind id must be kebab-case starting with a letter`
			});
			continue;
		}

		const childDir = join(absDir, id);

		// A folder with `_ontology.yaml` and no `_kind.yaml` is an ontology container.
		// Ontologies are only allowed at the top level (parent === null) and cannot nest.
		const isGroup = await isOntologyFolder(childDir);

		if (isGroup) {
			if (parent !== null) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${relTo(childDir, rootDir)}: _ontology.yaml is only supported at the top level of content_meta/kinds/`
				});
				continue;
			}
			if (group !== null) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${relTo(childDir, rootDir)}: ontologies cannot be nested`
				});
				continue;
			}

			if (ontologies.has(id)) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${relTo(childDir, rootDir)}: ontology '${id}' is declared more than once`
				});
			} else {
				const ontology = await loadOntologyFile(childDir, id, rootDir, issues);
				ontologies.set(id, ontology);
			}

			await walk(childDir, null, id, kinds, ontologies, issues, rootDir);
			continue;
		}

		// Regular kind folder.
		const meta = await loadKindMeta(childDir, id, rootDir, issues);

		if (kinds.has(id)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(childDir, rootDir)}: kind '${id}' is declared more than once`
			});
		} else {
			kinds.set(id, { id, meta, parent, group });
		}

		await walk(childDir, id, group, kinds, ontologies, issues, rootDir);
	}
}

/**
 * Return true when the folder should be treated as an ontology container:
 * has `_ontology.yaml` and no `_kind.yaml`.
 */
async function isOntologyFolder(dir: string): Promise<boolean> {
	const hasGroupFile = await fileExists(join(dir, '_ontology.yaml'));
	if (!hasGroupFile) return false;
	const hasKindYaml = await fileExists(join(dir, '_kind.yaml'));
	return !hasKindYaml;
}

/**
 * Load a `_ontology.yaml` file and return an `Ontology`.
 */
async function loadOntologyFile(
	dir: string,
	id: string,
	rootDir: string,
	issues: HealthIssue[]
): Promise<Ontology> {
	const yamlPath = join(dir, '_ontology.yaml');
	const raw = await readOptional(yamlPath);
	if (raw === null) return { id, title: null, description: null };

	let parsed: unknown;
	try {
		parsed = parseYaml(raw);
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(yamlPath, rootDir)}: ${err instanceof Error ? err.message : String(err)}`
		});
		return { id, title: null, description: null };
	}

	const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	const title = typeof obj.title === 'string' ? obj.title : null;
	const description = typeof obj.description === 'string' ? obj.description : null;

	for (const field of ['title', 'description'] as const) {
		if (obj[field] !== undefined && typeof obj[field] !== 'string') {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(yamlPath, rootDir)}: ${field} must be a string`
			});
		}
	}

	return { id, title, description };
}

/**
 * Load a kind's `_kind.yaml` metadata. Returns an empty `KindMeta` when
 * the file is absent — the folder existing is enough to register a kind.
 */
async function loadKindMeta(
	kindDir: string,
	id: string,
	rootDir: string,
	issues: HealthIssue[]
): Promise<KindMeta> {
	const yamlPath = join(kindDir, '_kind.yaml');
	const raw = await readOptional(yamlPath);
	void id;
	return raw !== null ? parseKindMeta(raw, yamlPath, rootDir, issues) : {};
}

/**
 * Parse + validate a YAML document into a `KindMeta`.
 */
function parseKindMeta(
	raw: string,
	yamlPath: string,
	rootDir: string,
	issues: HealthIssue[]
): KindMeta {
	let parsed: unknown;
	try {
		parsed = parseYaml(raw);
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(yamlPath, rootDir)}: ${err instanceof Error ? err.message : String(err)}`
		});
		return {};
	}
	const meta: KindMeta =
		parsed && typeof parsed === 'object' ? ({ ...(parsed as KindMeta) } as KindMeta) : {};

	const dropped = (parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {})
		.kindParent;
	if (dropped !== undefined) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(yamlPath, rootDir)}: 'kindParent' is no longer supported — parent kind is derived from the folder hierarchy`
		});
	}

	for (const field of ['singular', 'plural', 'description'] as const) {
		const value = meta[field];
		if (value !== undefined && typeof value !== 'string') {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(yamlPath, rootDir)}: ${field} must be a string`
			});
			meta[field] = undefined;
		}
	}

	return meta;
}

async function readOptional(path: string): Promise<string | null> {
	try {
		const st = await stat(path);
		if (!st.isFile()) return null;
		return await readFile(path, 'utf8');
	} catch {
		return null;
	}
}

async function fileExists(path: string): Promise<boolean> {
	try {
		const st = await stat(path);
		return st.isFile();
	} catch {
		return false;
	}
}

async function dirExists(path: string): Promise<boolean> {
	try {
		const st = await stat(path);
		return st.isDirectory();
	} catch {
		return false;
	}
}

function relTo(absPath: string, rootDir: string): string {
	if (absPath === rootDir) return 'content_meta/kinds';
	if (absPath.startsWith(rootDir + '/'))
		return `content_meta/kinds/${absPath.slice(rootDir.length + 1)}`;
	return absPath;
}

// Keep resolve in scope — used transitively by defaultKindsDir import path
void resolve;
