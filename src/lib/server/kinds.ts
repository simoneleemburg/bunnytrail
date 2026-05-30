import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { HealthIssue, Kind, KindMeta } from '$lib/types';
import { defaultKindsDir } from './globals';
import { splitFrontmatter } from './frontmatter';

const KIND_ID_RE = /^[a-z][a-z0-9-]*$/;

export interface KindLoadResult {
	/** All loaded kinds, keyed by id. */
	kinds: Map<string, Kind>;
	/** Any problems encountered (malformed yaml, bad folder name). */
	issues: HealthIssue[];
}

/**
 * Walk `content_meta/kinds/` (or `BUNNYTRAIL_KINDS_DIR`) recursively and return
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
export async function loadKindRegistry(
	kindsDir: string = defaultKindsDir()
): Promise<KindLoadResult> {
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
		const { meta, body } = await loadKindFiles(kindDir, id, rootDir, issues);

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

/**
 * Load a kind's editorial files. Two layouts are supported:
 *
 *   1. Sidecar (legacy): `_kind.yaml` carries the metadata,
 *      `_kind.md` carries the prose.
 *   2. Frontmatter:      `_kind.md` carries both — a `---`-fenced
 *      YAML block at the top, followed by the prose body.
 *
 * If both `_kind.yaml` and `_kind.md` frontmatter declare metadata
 * for the same kind, that's an authoring mistake: emit a health
 * issue and fall back to default labels (no body, no description)
 * so the conflict surfaces rather than one source silently
 * shadowing the other.
 */
async function loadKindFiles(
	kindDir: string,
	id: string,
	rootDir: string,
	issues: HealthIssue[]
): Promise<{ meta: KindMeta; body: string | null }> {
	const yamlPath = join(kindDir, '_kind.yaml');
	const mdPath = join(kindDir, '_kind.md');
	const yamlRaw = await readOptional(yamlPath);
	const mdRaw = await readOptional(mdPath);
	const mdSplit = mdRaw !== null ? splitFrontmatter(mdRaw) : null;
	const hasFrontmatter = mdSplit?.frontmatter !== null && mdSplit?.frontmatter !== undefined;

	if (yamlRaw !== null && hasFrontmatter) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(kindDir, rootDir)}: both _kind.yaml and _kind.md frontmatter declare metadata; pick one`
		});
		// Surface a consistent body so the kind is still browseable.
		return { meta: {}, body: mdSplit?.body ?? null };
	}

	if (hasFrontmatter && mdSplit) {
		const meta = parseKindMeta(mdSplit.frontmatter ?? '', mdPath, rootDir, issues);
		return { meta, body: mdSplit.body };
	}

	const meta = yamlRaw !== null ? parseKindMeta(yamlRaw, yamlPath, rootDir, issues) : {};
	void id;
	return { meta, body: mdRaw };
}

/**
 * Parse + validate a YAML document into a `KindMeta`. Pure aside
 * from pushing health issues. Used both for `_kind.yaml` files and
 * for the YAML body of a `_kind.md` frontmatter block.
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
	if (absPath.startsWith(rootDir + '/'))
		return `content_meta/kinds/${absPath.slice(rootDir.length + 1)}`;
	return absPath;
}
