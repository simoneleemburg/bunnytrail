import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { HealthIssue } from '$lib/types';

/**
 * Where the author's notebook lives. Each post is a directory under
 * `content_meta/blog/<slug>/` carrying:
 *
 *   - `index.yaml` — required. Frontmatter with `title`, `date`
 *     (ISO `YYYY-MM-DD`), and an optional string-array `tags`.
 *   - `index.md`   — required. The post body, plain markdown.
 *     Wikilink and collection-include directives do *not* resolve
 *     here; the blog is out-of-world authoring material and lives
 *     outside the worldbuilding graph.
 *   - Sibling files (images, attachments) are allowed but the
 *     loader doesn't track them.
 *
 * Override with `ALTERIA_BLOG_DIR` for testing.
 *
 * The blog sits alongside `content_meta/kinds/` for the same
 * reason: it is *about* the worldbuilding project rather than
 * being part of the worldbuilding itself. It is loaded separately
 * from the graph (its own singleton, its own watcher hook) so that
 * blog posts never leak into entity counts, tag indexes, or
 * cross-cluster aggregates.
 */
function defaultBlogDir(): string {
	return process.env.ALTERIA_BLOG_DIR ?? resolve(process.cwd(), 'content_meta/blog');
}

export const BLOG_DIR = defaultBlogDir();

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/**
 * Format an ISO `YYYY-MM-DD` date as `21 May 2026`. Pure string
 * arithmetic — no `Date` parsing — to avoid timezone surprises on
 * a value that has no time component. Called from the server load
 * functions so the formatted string ships to the client and the
 * view stays oblivious to the storage format.
 */
export function formatPostDate(iso: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!m) return iso;
	const [, y, mo, d] = m;
	const month = MONTHS[Number(mo) - 1];
	if (!month) return iso;
	return `${Number(d)} ${month} ${y}`;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface BlogPost {
	slug: string;
	title: string;
	/** ISO `YYYY-MM-DD`. */
	date: string;
	tags: string[];
	body: string;
}

export interface BlogLoadResult {
	posts: BlogPost[];
	issues: HealthIssue[];
}

/**
 * Walk `content_meta/blog/` and return every well-formed post.
 *
 * Posts are returned sorted newest-first (by `date` descending,
 * then `slug` ascending for determinism on same-day posts). If a
 * post folder is malformed (missing yaml, missing md, bad date,
 * etc.) it is skipped and an entry is added to `issues` so the
 * problem surfaces in the health dashboard.
 *
 * If the directory does not exist at all, returns an empty result
 * with no issues — an empty notebook is a valid state.
 */
export async function loadBlog(blogDir: string = defaultBlogDir()): Promise<BlogLoadResult> {
	const posts: BlogPost[] = [];
	const issues: HealthIssue[] = [];

	if (!(await dirExists(blogDir))) {
		return { posts, issues };
	}

	let entries: Dirent[];
	try {
		entries = (await readdir(blogDir, { withFileTypes: true })) as Dirent[];
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/blog: cannot read directory (${err instanceof Error ? err.message : String(err)})`
		});
		return { posts, issues };
	}

	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		if (!entry.isDirectory()) continue;

		const slug = entry.name;
		if (!SLUG_RE.test(slug)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `content_meta/blog/${slug}: post slug must be kebab-case starting with a letter or digit`
			});
			continue;
		}

		const postDir = join(blogDir, slug);
		const post = await loadPost(postDir, slug, issues);
		if (post) posts.push(post);
	}

	posts.sort((a, b) => {
		if (a.date !== b.date) return a.date < b.date ? 1 : -1; // newer first
		return a.slug.localeCompare(b.slug);
	});

	return { posts, issues };
}

async function loadPost(
	postDir: string,
	slug: string,
	issues: HealthIssue[]
): Promise<BlogPost | null> {
	const yamlRaw = await readOptional(join(postDir, 'index.yaml'));
	const body = await readOptional(join(postDir, 'index.md'));

	if (yamlRaw === null) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/blog/${slug}: missing index.yaml`
		});
		return null;
	}
	if (body === null) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/blog/${slug}: missing index.md`
		});
		return null;
	}

	let parsed: unknown;
	try {
		parsed = parseYaml(yamlRaw);
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/blog/${slug}/index.yaml: ${err instanceof Error ? err.message : String(err)}`
		});
		return null;
	}
	if (!parsed || typeof parsed !== 'object') {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/blog/${slug}/index.yaml: expected a mapping`
		});
		return null;
	}

	const meta = parsed as Record<string, unknown>;

	const title = meta.title;
	if (typeof title !== 'string' || title.trim() === '') {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/blog/${slug}/index.yaml: title must be a non-empty string`
		});
		return null;
	}

	const date = meta.date;
	if (typeof date !== 'string' || !DATE_RE.test(date)) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/blog/${slug}/index.yaml: date must be a string in YYYY-MM-DD form`
		});
		return null;
	}

	let tags: string[] = [];
	if (meta.tags !== undefined) {
		if (!Array.isArray(meta.tags) || meta.tags.some((t) => typeof t !== 'string')) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `content_meta/blog/${slug}/index.yaml: tags must be an array of strings`
			});
			return null;
		}
		tags = (meta.tags as string[]).map((t) => t.trim()).filter((t) => t.length > 0);
	}

	return { slug, title: title.trim(), date, tags, body };
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
 * In-memory blog singleton, sibling to `graph`. Loaded once at
 * boot, reloaded by the dev watcher on file changes under
 * `content_meta/blog/`. Pages call `await blog.ready()` from their
 * load functions, then use the synchronous accessors.
 */
class Blog {
	#posts: BlogPost[] = [];
	#bySlug = new Map<string, BlogPost>();
	#issues: HealthIssue[] = [];
	#loaded = false;
	#loading: Promise<void> | null = null;

	async load(blogDir: string = BLOG_DIR): Promise<void> {
		if (this.#loading) return this.#loading;
		this.#loading = (async () => {
			const { posts, issues } = await loadBlog(blogDir);
			this.#posts = posts;
			this.#bySlug = new Map(posts.map((p) => [p.slug, p]));
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

	all(): BlogPost[] {
		return [...this.#posts];
	}

	get(slug: string): BlogPost | undefined {
		return this.#bySlug.get(slug);
	}

	issues(): HealthIssue[] {
		return [...this.#issues];
	}
}

export const blog = new Blog();
