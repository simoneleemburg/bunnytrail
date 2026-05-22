import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { HealthIssue } from '$lib/types';

/**
 * Where the "source projects" catalogue lives. Each project sits
 * under `content_meta/sources/<slug>/index.yaml` carrying the
 * structured fields below. An optional `index.md` is allowed for
 * future per-project prose, but the loader does not require it and
 * the homepage section ignores it.
 *
 * Like the blog, this is out-of-world authoring material: it is
 * *about* the worldbuilding project — the feeder works that are
 * being integrated into Alteria — rather than part of the world
 * itself. It is loaded as its own singleton so source projects
 * never leak into entity counts, tag indexes, or any cross-cluster
 * aggregate.
 *
 * Override the directory with `ALTERIA_SOURCES_DIR` for testing.
 */
function defaultSourcesDir(): string {
	return process.env.ALTERIA_SOURCES_DIR ?? resolve(process.cwd(), 'content_meta/sources');
}

export const SOURCES_DIR = defaultSourcesDir();

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const SIZE_VALUES = new Set(['S', 'M', 'L', 'XL']);

export type SourceSize = 'S' | 'M' | 'L' | 'XL';

export interface SourceProject {
	slug: string;
	title: string;
	/** Calendar year the project was started. */
	yearStart: number;
	genre: string;
	size: SourceSize;
	/** Integration percentage into Alteria, 0–100. */
	integration: number;
	catchline: string;
	/**
	 * Optional pointer to an in-world entity id (e.g.
	 * `aurethia/places/celestial/aureth-system/nebelheim`) — set
	 * for projects already absorbed into the compendium. Resolved
	 * to a real entity by the page load function; unresolved
	 * pointers surface as a health issue.
	 */
	entity: string | null;
	/**
	 * Optional cluster slug (e.g. `aurethia`, `earth`). The cluster
	 * the project will land in once integrated — even projects that
	 * haven't been touched yet typically have a known destination.
	 * Validated by the page load against `graph.topLevelFolders()`;
	 * unknown values render as the raw slug.
	 */
	cluster: string | null;
}

export interface SourcesLoadResult {
	projects: SourceProject[];
	issues: HealthIssue[];
}

/**
 * Walk `content_meta/sources/` and return every well-formed
 * project entry.
 *
 * Projects are returned sorted by `yearStart` descending, then by
 * `title` ascending for determinism within a year. Malformed
 * folders are skipped with a health-dashboard issue. A missing
 * directory is a valid empty state.
 */
export async function loadSources(
	sourcesDir: string = defaultSourcesDir()
): Promise<SourcesLoadResult> {
	const projects: SourceProject[] = [];
	const issues: HealthIssue[] = [];

	if (!(await dirExists(sourcesDir))) {
		return { projects, issues };
	}

	let entries: Dirent[];
	try {
		entries = (await readdir(sourcesDir, { withFileTypes: true })) as Dirent[];
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/sources: cannot read directory (${err instanceof Error ? err.message : String(err)})`
		});
		return { projects, issues };
	}

	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		if (!entry.isDirectory()) continue;

		const slug = entry.name;
		if (!SLUG_RE.test(slug)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `content_meta/sources/${slug}: slug must be kebab-case starting with a letter or digit`
			});
			continue;
		}

		const project = await loadProject(join(sourcesDir, slug), slug, issues);
		if (project) projects.push(project);
	}

	projects.sort((a, b) => {
		if (a.yearStart !== b.yearStart) return b.yearStart - a.yearStart;
		return a.title.localeCompare(b.title);
	});

	return { projects, issues };
}

async function loadProject(
	dir: string,
	slug: string,
	issues: HealthIssue[]
): Promise<SourceProject | null> {
	const yamlRaw = await readOptional(join(dir, 'index.yaml'));
	if (yamlRaw === null) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/sources/${slug}: missing index.yaml`
		});
		return null;
	}

	let parsed: unknown;
	try {
		parsed = parseYaml(yamlRaw);
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/sources/${slug}/index.yaml: ${err instanceof Error ? err.message : String(err)}`
		});
		return null;
	}
	if (!parsed || typeof parsed !== 'object') {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/sources/${slug}/index.yaml: expected a mapping`
		});
		return null;
	}

	const meta = parsed as Record<string, unknown>;
	const where = `content_meta/sources/${slug}/index.yaml`;

	const title = meta.title;
	if (typeof title !== 'string' || title.trim() === '') {
		issues.push({ kind: 'invalid-yaml', detail: `${where}: title must be a non-empty string` });
		return null;
	}

	const yearStart = meta.yearStart;
	if (typeof yearStart !== 'number' || !Number.isInteger(yearStart) || yearStart < 1900) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${where}: yearStart must be an integer year`
		});
		return null;
	}

	const genre = meta.genre;
	if (typeof genre !== 'string' || genre.trim() === '') {
		issues.push({ kind: 'invalid-yaml', detail: `${where}: genre must be a non-empty string` });
		return null;
	}

	const size = meta.size;
	if (typeof size !== 'string' || !SIZE_VALUES.has(size)) {
		issues.push({ kind: 'invalid-yaml', detail: `${where}: size must be one of S, M, L, XL` });
		return null;
	}

	const integration = meta.integration;
	if (
		typeof integration !== 'number' ||
		!Number.isFinite(integration) ||
		integration < 0 ||
		integration > 100
	) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${where}: integration must be a number between 0 and 100`
		});
		return null;
	}

	const catchline = meta.catchline;
	if (typeof catchline !== 'string' || catchline.trim() === '') {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${where}: catchline must be a non-empty string`
		});
		return null;
	}

	let entity: string | null = null;
	if (meta.entity !== undefined && meta.entity !== null) {
		if (typeof meta.entity !== 'string' || meta.entity.trim() === '') {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${where}: entity must be a non-empty string entity id, or omitted`
			});
			return null;
		}
		entity = meta.entity.trim();
	}

	let cluster: string | null = null;
	if (meta.cluster !== undefined && meta.cluster !== null) {
		if (typeof meta.cluster !== 'string' || meta.cluster.trim() === '') {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${where}: cluster must be a non-empty string cluster slug, or omitted`
			});
			return null;
		}
		cluster = meta.cluster.trim();
	}

	return {
		slug,
		title: title.trim(),
		yearStart,
		genre: genre.trim(),
		size: size as SourceSize,
		integration,
		catchline: catchline.trim(),
		entity,
		cluster
	};
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

/**
 * In-memory sources singleton, sibling to `graph` and `blog`.
 * Loaded once at boot, reloaded by the dev watcher on file changes
 * under `content_meta/sources/`. Pages call `await sources.ready()`
 * from their load functions, then use the synchronous accessors.
 */
class Sources {
	#projects: SourceProject[] = [];
	#issues: HealthIssue[] = [];
	#loaded = false;
	#loading: Promise<void> | null = null;

	async load(sourcesDir: string = SOURCES_DIR): Promise<void> {
		if (this.#loading) return this.#loading;
		this.#loading = (async () => {
			const { projects, issues } = await loadSources(sourcesDir);
			this.#projects = projects;
			this.#issues = issues;
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

	all(): SourceProject[] {
		return [...this.#projects];
	}

	issues(): HealthIssue[] {
		return [...this.#issues];
	}
}

export const sources = new Sources();
