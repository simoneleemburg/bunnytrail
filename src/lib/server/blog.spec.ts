import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatPostDate, loadBlog } from './blog';

/**
 * Seed a blog tree on disk. `tree` is a record keyed by slug; each
 * value is `{ yaml, md }` written into `<slug>/index.yaml` and
 * `<slug>/index.md`. Pass `null` for either to deliberately omit
 * that file (so the loader's error paths are exercisable).
 */
async function seedBlogDir(
	tree: Record<string, { yaml?: string | null; md?: string | null }>
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'alteria-blog-'));
	for (const [slug, files] of Object.entries(tree)) {
		const abs = join(dir, slug);
		await mkdir(abs, { recursive: true });
		if (files.yaml !== undefined && files.yaml !== null) {
			await writeFile(join(abs, 'index.yaml'), files.yaml);
		}
		if (files.md !== undefined && files.md !== null) {
			await writeFile(join(abs, 'index.md'), files.md);
		}
	}
	return dir;
}

describe('loadBlog', () => {
	it('returns an empty result with no issues when the directory is absent', async () => {
		const result = await loadBlog(join(tmpdir(), 'alteria-blog-missing-' + Date.now()));
		expect(result.posts).toEqual([]);
		expect(result.issues).toEqual([]);
	});

	it('returns an empty result when the directory exists but is empty', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-blog-'));
		const result = await loadBlog(dir);
		expect(result.posts).toEqual([]);
		expect(result.issues).toEqual([]);
	});

	it('loads a well-formed post', async () => {
		const dir = await seedBlogDir({
			'first-post': {
				yaml: 'title: First post\ndate: 2026-05-21\ntags: [meta, process]\n',
				md: 'Hello, world.\n'
			}
		});
		const result = await loadBlog(dir);
		expect(result.issues).toEqual([]);
		expect(result.posts).toHaveLength(1);
		expect(result.posts[0]).toMatchObject({
			slug: 'first-post',
			title: 'First post',
			date: '2026-05-21',
			tags: ['meta', 'process'],
			body: 'Hello, world.\n'
		});
	});

	it('treats tags as optional and defaults to an empty array', async () => {
		const dir = await seedBlogDir({
			plain: { yaml: 'title: Plain\ndate: 2026-01-01\n', md: 'body\n' }
		});
		const result = await loadBlog(dir);
		expect(result.issues).toEqual([]);
		expect(result.posts[0].tags).toEqual([]);
	});

	it('sorts posts newest first, then by slug for stable ordering', async () => {
		const dir = await seedBlogDir({
			older: { yaml: 'title: Older\ndate: 2026-01-01\n', md: 'x' },
			'newer-b': { yaml: 'title: Newer B\ndate: 2026-05-21\n', md: 'x' },
			'newer-a': { yaml: 'title: Newer A\ndate: 2026-05-21\n', md: 'x' }
		});
		const result = await loadBlog(dir);
		expect(result.posts.map((p) => p.slug)).toEqual(['newer-a', 'newer-b', 'older']);
	});

	it('skips a post and reports an issue when index.yaml is missing', async () => {
		const dir = await seedBlogDir({
			'no-yaml': { md: 'orphan body\n' }
		});
		const result = await loadBlog(dir);
		expect(result.posts).toEqual([]);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0].detail).toMatch(/missing index\.yaml/);
	});

	it('skips a post and reports an issue when index.md is missing', async () => {
		const dir = await seedBlogDir({
			'no-md': { yaml: 'title: T\ndate: 2026-05-21\n' }
		});
		const result = await loadBlog(dir);
		expect(result.posts).toEqual([]);
		expect(result.issues[0].detail).toMatch(/missing index\.md/);
	});

	it('rejects a post whose date is not in YYYY-MM-DD form', async () => {
		const dir = await seedBlogDir({
			'bad-date': {
				yaml: 'title: T\ndate: May 21 2026\n',
				md: 'x'
			}
		});
		const result = await loadBlog(dir);
		expect(result.posts).toEqual([]);
		expect(result.issues[0].detail).toMatch(/date must be a string in YYYY-MM-DD/);
	});

	it('rejects a post with a missing or empty title', async () => {
		const dir = await seedBlogDir({
			'no-title': { yaml: 'date: 2026-05-21\n', md: 'x' },
			'blank-title': { yaml: 'title: "   "\ndate: 2026-05-21\n', md: 'x' }
		});
		const result = await loadBlog(dir);
		expect(result.posts).toEqual([]);
		expect(result.issues).toHaveLength(2);
		for (const issue of result.issues) {
			expect(issue.detail).toMatch(/title must be a non-empty string/);
		}
	});

	it('rejects a post whose tags are not an array of strings', async () => {
		const dir = await seedBlogDir({
			'bad-tags': {
				yaml: 'title: T\ndate: 2026-05-21\ntags: just-a-string\n',
				md: 'x'
			}
		});
		const result = await loadBlog(dir);
		expect(result.posts).toEqual([]);
		expect(result.issues[0].detail).toMatch(/tags must be an array of strings/);
	});

	it('reports malformed yaml without crashing', async () => {
		const dir = await seedBlogDir({
			broken: { yaml: 'title: [unterminated\n', md: 'x' }
		});
		const result = await loadBlog(dir);
		expect(result.posts).toEqual([]);
		expect(result.issues[0].kind).toBe('invalid-yaml');
	});

	it('skips folders whose names are not valid slugs and reports the issue', async () => {
		const dir = await seedBlogDir({
			'Bad Slug': {
				yaml: 'title: T\ndate: 2026-05-21\n',
				md: 'x'
			}
		});
		const result = await loadBlog(dir);
		expect(result.posts).toEqual([]);
		expect(result.issues[0].detail).toMatch(/post slug must be kebab-case/);
	});

	it('ignores hidden and underscore-prefixed folders', async () => {
		const dir = await seedBlogDir({
			'.draft': { yaml: 'title: T\ndate: 2026-05-21\n', md: 'x' },
			_scratch: { yaml: 'title: T\ndate: 2026-05-21\n', md: 'x' },
			real: { yaml: 'title: Real\ndate: 2026-05-21\n', md: 'x' }
		});
		const result = await loadBlog(dir);
		expect(result.posts.map((p) => p.slug)).toEqual(['real']);
		expect(result.issues).toEqual([]);
	});
});

describe('formatPostDate', () => {
	it('formats an ISO date as `D Month YYYY`', () => {
		expect(formatPostDate('2026-05-21')).toBe('21 May 2026');
		expect(formatPostDate('2025-01-05')).toBe('5 January 2025');
		expect(formatPostDate('1999-12-31')).toBe('31 December 1999');
	});

	it('returns the input unchanged for malformed values', () => {
		expect(formatPostDate('not-a-date')).toBe('not-a-date');
		expect(formatPostDate('2026-13-01')).toBe('2026-13-01');
	});
});
