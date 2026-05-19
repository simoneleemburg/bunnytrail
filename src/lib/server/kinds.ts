import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { HealthIssue, Kind, KindMeta } from '$lib/types';

/**
 * Where the central kind registry lives. The directory mirrors the
 * kind hierarchy as a folder tree: each kind is a directory named
 * after its id, optionally containing `_kind.yaml` (label overrides
 * + description) and `_kind.md` (editorial prose). Nesting expresses
 * the parent/child relationship; there is no `kindParent` field.
 *
 * Override with `ALTERIA_KINDS_DIR` for testing.
 *
 * The registry sits outside `content/` on purpose: kinds are
 * structural metadata about the worldbuilding vocabulary, not
 * worldbuilding prose themselves. Their `.md` companions are the
 * one exception — short editorial blurbs that render on the kind's
 * own page.
 */
function defaultKindsDir(): string {
	return process.env.ALTERIA_KINDS_DIR ?? resolve(process.cwd(), 'content_meta/kinds');
}

/**
 * Back-compat export. Resolved at import time of the caller, which
 * is fine for production but should not be relied on in tests —
 * pass the dir to `loadKindRegistry` explicitly instead.
 */
export const KINDS_DIR = defaultKindsDir();

const KIND_ID_RE = /^[a-z][a-z0-9-]*$/;

export interface KindLoadResult {
	/** All loaded kinds, keyed by id. */
	kinds: Map<string, Kind>;
	/** Any problems encountered (malformed yaml, bad folder name). */
	issues: HealthIssue[];
}

/**
 * Walk `content_meta/kinds/` (or `ALTERIA_KINDS_DIR`) recursively and return
 * every declared kind. Each subdirectory whose name passes
 * `KIND_ID_RE` is a kind; its `_kind.yaml` (if present) supplies
 * label and description overrides, and `_kind.md` (if present)
 * supplies a prose body. A kind with no marker files is still
 * registered with default labels — the folder existing is enough.
 *
 * If the registry directory does not exist, returns an empty
 * registry with no issues — callers should treat absence as "no
 * kinds registered yet" rather than an error.
 */
export async function loadKindRegistry(kindsDir: string = defaultKindsDir()): Promise<KindLoadResult> {
	const kinds = new Map<string, Kind>();
	const issues: HealthIssue[] = [];

	const rootExists = await dirExists(kindsDir);
	if (!rootExists) return { kinds, issues };

	await walk(kindsDir, null, kinds, issues, kindsDir);

	return { kinds, issues };
}

async function walk(
	absDir: string,
	parent: string | null,
	kinds: Map<string, Kind>,
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

		const kindDir = join(absDir, id);
		const meta = await loadKindMeta(kindDir, id, rootDir, issues);
		const body = await readOptional(join(kindDir, '_kind.md'));

		// First declaration wins; warn on the duplicate but keep
		// walking so a sibling typo doesn't hide the rest of the
		// tree from the consumer.
		if (kinds.has(id)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(kindDir, rootDir)}: kind '${id}' is declared more than once`
			});
		} else {
			kinds.set(id, { id, meta, parent, body });
		}

		await walk(kindDir, id, kinds, issues, rootDir);
	}
}

async function loadKindMeta(
	kindDir: string,
	id: string,
	rootDir: string,
	issues: HealthIssue[]
): Promise<KindMeta> {
	const yamlPath = join(kindDir, '_kind.yaml');
	const raw = await readOptional(yamlPath);
	if (raw === null) return {};

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

	// Light field validation. The yaml type is loose; we only
	// complain about wrong shapes for the fields we care about,
	// and we drop unknown extras silently. A stray `kindParent`
	// field is now meaningless — warn so the author notices.
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

	// id is taken from the folder name, not from the yaml.
	void id;

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
	if (absPath.startsWith(rootDir + '/')) return `content_meta/kinds/${absPath.slice(rootDir.length + 1)}`;
	return absPath;
}
