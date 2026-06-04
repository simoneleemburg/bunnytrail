import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadInfluences } from './influences';

/**
 * Seed an influences tree on disk. `tree` is keyed by slug; each
 * value is `{ yaml?, md? }` — pass `null` for either to omit that
 * file, exercising error paths.
 */
async function seedInfluencesDir(
	tree: Record<string, { yaml?: string | null; md?: string | null }>
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'bt-influences-'));
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

describe('loadInfluences', () => {
	it('returns an empty result with no issues when the directory is absent', async () => {
		const result = await loadInfluences(join(tmpdir(), 'bt-influences-missing-' + Date.now()));
		expect(result.influences).toEqual([]);
		expect(result.issues).toEqual([]);
	});

	it('returns an empty result when the directory exists but is empty', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'bt-influences-'));
		const result = await loadInfluences(dir);
		expect(result.influences).toEqual([]);
		expect(result.issues).toEqual([]);
	});

	it('loads a minimal entry with only a title', async () => {
		const dir = await seedInfluencesDir({
			borges: { md: '---\ntitle: Borges\n---\n' }
		});
		const result = await loadInfluences(dir);
		expect(result.issues).toEqual([]);
		expect(result.influences).toHaveLength(1);
		expect(result.influences[0]).toMatchObject({
			slug: 'borges',
			title: 'Borges',
			creator: null,
			kind: null,
			year: null,
			epigraph: null,
			illustrations: [],
			body: ''
		});
	});

	it('loads a fully-specified entry with illustrations', async () => {
		const dir = await seedInfluencesDir({
			borges: {
				md: [
					'---',
					'title: Ficciones',
					'creator: Jorge Luis Borges',
					'kind: book',
					'year: 1944',
					'epigraph: The library will endure; it is the universe.',
					'illustrations:',
					'  - image: library-of-babel.jpg',
					'    comment: The image that started it all.',
					'  - image: portrait.jpg',
					'---',
					'My commentary prose here.'
				].join('\n') + '\n'
			}
		});
		const result = await loadInfluences(dir);
		expect(result.issues).toEqual([]);
		const inf = result.influences[0];
		expect(inf).toMatchObject({
			slug: 'borges',
			title: 'Ficciones',
			creator: 'Jorge Luis Borges',
			kind: 'book',
			year: 1944,
			epigraph: 'The library will endure; it is the universe.',
			body: 'My commentary prose here.\n'
		});
		expect(inf.illustrations).toHaveLength(2);
		expect(inf.illustrations[0]).toEqual({ image: 'library-of-babel.jpg', comment: 'The image that started it all.' });
		expect(inf.illustrations[1]).toEqual({ image: 'portrait.jpg', comment: null });
	});

	it('loads via sidecar yaml + separate index.md body', async () => {
		const dir = await seedInfluencesDir({
			relativity: {
				yaml: 'title: General Relativity\ncreator: Albert Einstein\nyear: 1915\n',
				md: 'Curved spacetime shaped every cosmology in the world.\n'
			}
		});
		const result = await loadInfluences(dir);
		expect(result.issues).toEqual([]);
		expect(result.influences[0]).toMatchObject({
			slug: 'relativity',
			title: 'General Relativity',
			creator: 'Albert Einstein',
			year: 1915,
			body: 'Curved spacetime shaped every cosmology in the world.\n'
		});
	});

	it('rejects an entry with no metadata source', async () => {
		const dir = await seedInfluencesDir({
			empty: { md: 'No frontmatter here.\n' }
		});
		const result = await loadInfluences(dir);
		expect(result.influences).toHaveLength(0);
		expect(result.issues[0].detail).toMatch(/missing index\.yaml/);
	});

	it('rejects mixing index.yaml and index.md frontmatter', async () => {
		const dir = await seedInfluencesDir({
			borges: {
				yaml: 'title: Borges\n',
				md: '---\ntitle: Also Borges\n---\n'
			}
		});
		const result = await loadInfluences(dir);
		expect(result.influences).toHaveLength(0);
		expect(result.issues[0].detail).toMatch(/pick one/);
	});

	it('rejects an entry with a missing title', async () => {
		const dir = await seedInfluencesDir({
			borges: { md: '---\ncreator: Borges\n---\n' }
		});
		const result = await loadInfluences(dir);
		expect(result.influences).toHaveLength(0);
		expect(result.issues[0].detail).toMatch(/title/);
	});

	it('rejects an entry with an empty title', async () => {
		const dir = await seedInfluencesDir({
			borges: { md: '---\ntitle: ""\n---\n' }
		});
		const result = await loadInfluences(dir);
		expect(result.influences).toHaveLength(0);
	});

	it('rejects a year that is not an integer', async () => {
		const dir = await seedInfluencesDir({
			borges: { md: '---\ntitle: Borges\nyear: "nineteen-forty-four"\n---\n' }
		});
		const result = await loadInfluences(dir);
		expect(result.influences).toHaveLength(0);
		expect(result.issues[0].detail).toMatch(/year/);
	});

	it('rejects illustrations that is not a list', async () => {
		const dir = await seedInfluencesDir({
			borges: { md: '---\ntitle: Borges\nillustrations: not-a-list\n---\n' }
		});
		const result = await loadInfluences(dir);
		expect(result.influences).toHaveLength(0);
		expect(result.issues[0].detail).toMatch(/illustrations must be a list/);
	});

	it('rejects an illustration entry missing image', async () => {
		const dir = await seedInfluencesDir({
			borges: {
				md: '---\ntitle: Borges\nillustrations:\n  - comment: no image here\n---\n'
			}
		});
		const result = await loadInfluences(dir);
		expect(result.influences).toHaveLength(0);
		expect(result.issues[0].detail).toMatch(/illustrations\[0\]\.image/);
	});

	it('skips folders with invalid slugs and surfaces an issue', async () => {
		const dir = await seedInfluencesDir({
			'Bad Slug': { md: '---\ntitle: X\n---\n' }
		});
		const result = await loadInfluences(dir);
		expect(result.influences).toHaveLength(0);
		expect(result.issues[0].detail).toMatch(/slug/);
	});

	it('ignores hidden and underscore-prefixed folders', async () => {
		const dir = await seedInfluencesDir({
			'.hidden': { md: '---\ntitle: Hidden\n---\n' },
			'_draft': { md: '---\ntitle: Draft\n---\n' },
			'real': { md: '---\ntitle: Real\n---\n' }
		});
		const result = await loadInfluences(dir);
		expect(result.influences).toHaveLength(1);
		expect(result.influences[0].slug).toBe('real');
	});

	it('skips a valid entry alongside a malformed one without crashing', async () => {
		const dir = await seedInfluencesDir({
			good: { md: '---\ntitle: Good\n---\n' },
			bad: { md: 'No frontmatter\n' }
		});
		const result = await loadInfluences(dir);
		expect(result.influences).toHaveLength(1);
		expect(result.issues).toHaveLength(1);
	});

	it('sorts dated entries by year descending, then title alphabetically', async () => {
		const dir = await seedInfluencesDir({
			alpha: { md: '---\ntitle: Alpha\nyear: 2000\n---\n' },
			beta: { md: '---\ntitle: Beta\nyear: 2010\n---\n' },
			gamma: { md: '---\ntitle: Gamma\nyear: 2000\n---\n' }
		});
		const result = await loadInfluences(dir);
		const titles = result.influences.map((i) => i.title);
		expect(titles).toEqual(['Beta', 'Alpha', 'Gamma']);
	});

	it('places undated entries after all dated entries', async () => {
		const dir = await seedInfluencesDir({
			dated: { md: '---\ntitle: Dated\nyear: 1990\n---\n' },
			undated: { md: '---\ntitle: Undated\n---\n' }
		});
		const result = await loadInfluences(dir);
		expect(result.influences[0].slug).toBe('dated');
		expect(result.influences[1].slug).toBe('undated');
	});
});
