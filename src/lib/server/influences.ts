import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { HealthIssue } from '$lib/types';
import { defaultInfluencesDir, INFLUENCES_DIR } from './globals';
import { splitFrontmatter } from './frontmatter';
import type { LinkResolver } from './markdown';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * A single cultural or intellectual influence — a book, thinker,
 * film, painting, place, scientific idea, or anything else that fed
 * the worldbuilding. Lives under `content_meta/influences/<slug>/`.
 *
 * Only `title` is required; every other field is optional so entries
 * can be stubbed quickly and filled in later.
 */
export interface Influence {
	slug: string;
	/** Display name, e.g. "Borges", "General Relativity". */
	title: string;
	/**
	 * Who made / embodies it: author, director, thinker, place name.
	 * Omit for ideas or works where attribution doesn't apply.
	 */
	creator: string | null;
	/**
	 * Free-form category used for gallery filter chips.
	 * E.g. `thinker`, `book`, `film`, `painting`, `place`, `idea`, `music`.
	 */
	kind: string | null;
	/**
	 * Year of the work, or birth year of the thinker, or whenever
	 * the idea was first encountered. Author's call.
	 */
	year: number | null;
	/**
	 * A short quote in the influence's own words. Rendered as a
	 * pull-quote on the detail page and as a hover caption on the
	 * gallery tile. Distinct from illustration comments, which are
	 * the author's own notes about specific images.
	 */
	epigraph: string | null;
	/**
	 * Ordered list of illustrations for this influence. Each has a
	 * sibling image filename (or external URL) and an optional
	 * personal comment from the author explaining its relevance.
	 * Rendered as a sequence of framed images on the detail page;
	 * the first image is used as the gallery tile thumbnail.
	 *
	 * When empty the tile renders as a typographic card.
	 */
	illustrations: Array<{ image: string; comment: string | null }>;
	/**
	 * Your own commentary prose. Plain markdown; wikilinks resolve
	 * into the world. May be empty — omit the body section entirely
	 * for stub entries.
	 */
	body: string;
}

export interface InfluencesLoadResult {
	influences: Influence[];
	issues: HealthIssue[];
}

/**
 * Walk `content_meta/influences/` and return every well-formed entry.
 *
 * Entries are sorted by `year` descending (most recent first), then
 * alphabetically by `title` for determinism within a year. Entries
 * with no year sort after all dated entries.
 *
 * Malformed folders are skipped and surfaced as health issues.
 * A missing directory is a valid empty state.
 */
export async function loadInfluences(
	influencesDir: string = defaultInfluencesDir()
): Promise<InfluencesLoadResult> {
	const influences: Influence[] = [];
	const issues: HealthIssue[] = [];

	if (!(await dirExists(influencesDir))) {
		return { influences, issues };
	}

	let entries: Dirent[];
	try {
		entries = (await readdir(influencesDir, { withFileTypes: true })) as Dirent[];
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/influences: cannot read directory (${err instanceof Error ? err.message : String(err)})`
		});
		return { influences, issues };
	}

	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		if (!entry.isDirectory()) continue;

		const slug = entry.name;
		if (!SLUG_RE.test(slug)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `content_meta/influences/${slug}: slug must be kebab-case starting with a letter or digit`
			});
			continue;
		}

		const influence = await loadInfluence(join(influencesDir, slug), slug, issues);
		if (influence) influences.push(influence);
	}

	// Sort: dated entries by year desc, then title asc; undated after.
	influences.sort((a, b) => {
		if (a.year !== null && b.year !== null) {
			if (a.year !== b.year) return b.year - a.year;
		} else if (a.year !== null) {
			return -1;
		} else if (b.year !== null) {
			return 1;
		}
		return a.title.localeCompare(b.title);
	});

	return { influences, issues };
}

async function loadInfluence(
	dir: string,
	slug: string,
	issues: HealthIssue[]
): Promise<Influence | null> {
	const yamlRaw = await readOptional(join(dir, 'index.yaml'));
	const mdRaw = await readOptional(join(dir, 'index.md'));
	const mdSplit = mdRaw !== null ? splitFrontmatter(mdRaw) : null;
	const hasMdFrontmatter = mdSplit?.frontmatter != null;

	if (yamlRaw !== null && hasMdFrontmatter) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/influences/${slug}: both index.yaml and index.md frontmatter declare metadata; pick one`
		});
		return null;
	}

	let metaSource: string;
	let where: string;
	let body: string;
	if (hasMdFrontmatter && mdSplit) {
		metaSource = mdSplit.frontmatter ?? '';
		where = `content_meta/influences/${slug}/index.md`;
		body = mdSplit.body;
	} else if (yamlRaw !== null) {
		metaSource = yamlRaw;
		where = `content_meta/influences/${slug}/index.yaml`;
		// body from accompanying index.md (without frontmatter) when using sidecar yaml
		body = mdRaw ?? '';
	} else {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/influences/${slug}: missing index.yaml (or use frontmatter in index.md)`
		});
		return null;
	}

	let parsed: unknown;
	try {
		parsed = parseYaml(metaSource);
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${where}: ${err instanceof Error ? err.message : String(err)}`
		});
		return null;
	}
	if (!parsed || typeof parsed !== 'object') {
		issues.push({ kind: 'invalid-yaml', detail: `${where}: expected a mapping` });
		return null;
	}

	const meta = parsed as Record<string, unknown>;

	// title is the only required field
	const title = meta.title;
	if (typeof title !== 'string' || title.trim() === '') {
		issues.push({ kind: 'invalid-yaml', detail: `${where}: title must be a non-empty string` });
		return null;
	}

	// creator — optional non-empty string
	let creator: string | null = null;
	if (meta.creator !== undefined && meta.creator !== null) {
		if (typeof meta.creator !== 'string' || meta.creator.trim() === '') {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${where}: creator must be a non-empty string, or omitted`
			});
			return null;
		}
		creator = meta.creator.trim();
	}

	// kind — optional non-empty string (free-form tag)
	let kind: string | null = null;
	if (meta.kind !== undefined && meta.kind !== null) {
		if (typeof meta.kind !== 'string' || meta.kind.trim() === '') {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${where}: kind must be a non-empty string, or omitted`
			});
			return null;
		}
		kind = meta.kind.trim();
	}

	// year — optional integer
	let year: number | null = null;
	if (meta.year !== undefined && meta.year !== null) {
		if (typeof meta.year !== 'number' || !Number.isInteger(meta.year)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${where}: year must be an integer, or omitted`
			});
			return null;
		}
		year = meta.year;
	}

	// epigraph — optional non-empty string
	let epigraph: string | null = null;
	if (meta.epigraph !== undefined && meta.epigraph !== null) {
		if (typeof meta.epigraph !== 'string' || meta.epigraph.trim() === '') {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${where}: epigraph must be a non-empty string, or omitted`
			});
			return null;
		}
		epigraph = meta.epigraph.trim();
	}

	// illustrations — optional array of { image, comment? } objects
	const illustrations: Array<{ image: string; comment: string | null }> = [];
	if (meta.illustrations !== undefined && meta.illustrations !== null) {
		if (!Array.isArray(meta.illustrations)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${where}: illustrations must be a list, or omitted`
			});
			return null;
		}
		for (const [i, item] of (meta.illustrations as unknown[]).entries()) {
			if (!item || typeof item !== 'object') {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${where}: illustrations[${i}] must be a mapping with an image field`
				});
				return null;
			}
			const entry = item as Record<string, unknown>;
			if (typeof entry.image !== 'string' || entry.image.trim() === '') {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${where}: illustrations[${i}].image must be a non-empty filename or URL`
				});
				return null;
			}
			let comment: string | null = null;
			if (entry.comment !== undefined && entry.comment !== null) {
				if (typeof entry.comment !== 'string' || entry.comment.trim() === '') {
					issues.push({
						kind: 'invalid-yaml',
						detail: `${where}: illustrations[${i}].comment must be a non-empty string, or omitted`
					});
					return null;
				}
				comment = entry.comment.trim();
			}
			illustrations.push({ image: entry.image.trim(), comment });
		}
	}

	return {
		slug,
		title: title.trim(),
		creator,
		kind,
		year,
		epigraph,
		illustrations,
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
 * In-memory influences singleton, sibling to `graph`, `blog`,
 * `guides`, and `sources`. Loaded once at boot, reloaded by the dev
 * watcher on file changes under `content_meta/influences/`.
 */
class Influences {
	#influences: Influence[] = [];
	#bySlug = new Map<string, Influence>();
	#issues: HealthIssue[] = [];
	#loaded = false;
	#loading: Promise<void> | null = null;

	async load(influencesDir: string = INFLUENCES_DIR): Promise<void> {
		if (this.#loading) return this.#loading;
		this.#loading = (async () => {
			const { influences, issues } = await loadInfluences(influencesDir);
			this.#influences = influences;
			this.#bySlug = new Map(influences.map((i) => [i.slug, i]));
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

	all(): Influence[] {
		return [...this.#influences];
	}

	get(slug: string): Influence | undefined {
		return this.#bySlug.get(slug);
	}

	/**
	 * Wrap a base LinkResolver so that `influences/<slug>` paths are
	 * resolved to their canonical route before the base resolver is
	 * tried. Unknown influence slugs return null (broken-link), while
	 * all other paths fall through to `base` unchanged.
	 *
	 * Call this after `ready()` — the lookup uses the in-memory map
	 * that is populated at load time.
	 */
	wrapResolver(base: LinkResolver): LinkResolver {
		return (path: string) => {
			if (path.startsWith('influences/')) {
				const slug = path.slice('influences/'.length);
				return this.#bySlug.has(slug) ? path : null;
			}
			return base(path);
		};
	}

	issues(): HealthIssue[] {
		return [...this.#issues];
	}
}

export const influences = new Influences();
