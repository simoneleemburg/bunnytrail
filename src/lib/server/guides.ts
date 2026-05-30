import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { HealthIssue } from '$lib/types';
import { defaultGuidesDir } from './globals';
import { splitFrontmatter } from './frontmatter';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface Guide {
	slug: string;
	/** Page title. */
	title: string;
	/** Eyebrow line shown above the title — defaults to "Start here". */
	eyebrow: string;
	/** Short blurb used by the homepage callout and the page header. */
	summary: string;
	/** Raw markdown body; rendered with full wikilink support. */
	body: string;
}

export interface GuidesLoadResult {
	guides: Guide[];
	issues: HealthIssue[];
}

const DEFAULT_EYEBROW = 'Start here';

/**
 * Walk `content_meta/guides/` and return every well-formed guide.
 *
 * Guides are out-of-world meta-pages — tours of the world, landing
 * pages, "start here" entry points. Unlike blog posts, wikilinks
 * DO resolve inside guide bodies; this is handled at render time
 * by callers, not here.
 *
 * Returned in slug-alphabetical order (deterministic, since the
 * homepage iterates them). Malformed guide folders are skipped
 * and surfaced via the health page.
 *
 * If the directory does not exist, returns an empty result with no
 * issues — having zero guides is a valid state.
 */
export async function loadGuides(
	guidesDir: string = defaultGuidesDir()
): Promise<GuidesLoadResult> {
	const guides: Guide[] = [];
	const issues: HealthIssue[] = [];

	if (!(await dirExists(guidesDir))) {
		return { guides, issues };
	}

	let entries: Dirent[];
	try {
		entries = (await readdir(guidesDir, { withFileTypes: true })) as Dirent[];
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/guides: cannot read directory (${err instanceof Error ? err.message : String(err)})`
		});
		return { guides, issues };
	}

	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		if (!entry.isDirectory()) continue;

		const slug = entry.name;
		if (!SLUG_RE.test(slug)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `content_meta/guides/${slug}: guide slug must be kebab-case starting with a letter or digit`
			});
			continue;
		}

		const guideDir = join(guidesDir, slug);
		const guide = await loadGuide(guideDir, slug, issues);
		if (guide) guides.push(guide);
	}

	return { guides, issues };
}

async function loadGuide(
	guideDir: string,
	slug: string,
	issues: HealthIssue[]
): Promise<Guide | null> {
	const yamlRaw = await readOptional(join(guideDir, 'index.yaml'));
	const mdRaw = await readOptional(join(guideDir, 'index.md'));

	if (mdRaw === null) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/guides/${slug}: missing index.md`
		});
		return null;
	}

	// Same sidecar-vs-frontmatter rules the blog uses: pick one, not
	// both. Mixing is treated as an authoring error.
	const mdSplit = splitFrontmatter(mdRaw);
	const hasMdFrontmatter = mdSplit.frontmatter !== null;

	if (yamlRaw !== null && hasMdFrontmatter) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/guides/${slug}: both index.yaml and index.md frontmatter declare metadata; pick one`
		});
		return null;
	}

	let metaSource: string;
	let metaPath: string;
	let body: string;
	if (hasMdFrontmatter) {
		metaSource = mdSplit.frontmatter ?? '';
		metaPath = `content_meta/guides/${slug}/index.md`;
		body = mdSplit.body;
	} else if (yamlRaw !== null) {
		metaSource = yamlRaw;
		metaPath = `content_meta/guides/${slug}/index.yaml`;
		body = mdRaw;
	} else {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/guides/${slug}: missing index.yaml (or use frontmatter in index.md)`
		});
		return null;
	}

	let parsed: unknown;
	try {
		parsed = parseYaml(metaSource);
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${metaPath}: ${err instanceof Error ? err.message : String(err)}`
		});
		return null;
	}
	if (!parsed || typeof parsed !== 'object') {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${metaPath}: expected a mapping`
		});
		return null;
	}

	const meta = parsed as Record<string, unknown>;

	const title = meta.title;
	if (typeof title !== 'string' || title.trim() === '') {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${metaPath}: title must be a non-empty string`
		});
		return null;
	}

	const summary = meta.summary;
	if (typeof summary !== 'string' || summary.trim() === '') {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${metaPath}: summary must be a non-empty string`
		});
		return null;
	}

	let eyebrow = DEFAULT_EYEBROW;
	if (meta.eyebrow !== undefined) {
		if (typeof meta.eyebrow !== 'string' || meta.eyebrow.trim() === '') {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${metaPath}: eyebrow must be a non-empty string when present`
			});
			return null;
		}
		eyebrow = meta.eyebrow.trim();
	}

	return {
		slug,
		title: title.trim(),
		eyebrow,
		summary: summary.trim(),
		body
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
 * In-memory guides singleton, sibling to `graph` and `blog`. Loaded
 * once at boot, reloaded by the dev watcher on file changes under
 * `content_meta/guides/`. Pages call `await guides.ready()` from
 * their load functions, then use the synchronous accessors.
 */
class Guides {
	#guides: Guide[] = [];
	#bySlug = new Map<string, Guide>();
	#issues: HealthIssue[] = [];
	#loaded = false;
	#loading: Promise<void> | null = null;

	async load(guidesDir: string = defaultGuidesDir()): Promise<void> {
		if (this.#loading) return this.#loading;
		this.#loading = (async () => {
			const { guides, issues } = await loadGuides(guidesDir);
			this.#guides = guides;
			this.#bySlug = new Map(guides.map((g) => [g.slug, g]));
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

	all(): Guide[] {
		return [...this.#guides];
	}

	get(slug: string): Guide | undefined {
		return this.#bySlug.get(slug);
	}

	issues(): HealthIssue[] {
		return [...this.#issues];
	}
}

export const guides = new Guides();
