import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadGuides } from './guides';

/**
 * Seed a guides tree on disk. `tree` is keyed by slug; each value
 * is `{ yaml, md }` written into `<slug>/index.yaml` and
 * `<slug>/index.md` respectively. Pass `null` for either to omit
 * that file, so the loader's error paths stay exercisable.
 */
async function seedGuidesDir(
	tree: Record<string, { yaml?: string | null; md?: string | null }>
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'alteria-guides-'));
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

describe('loadGuides', () => {
	it('returns an empty result with no issues when the directory is absent', async () => {
		const result = await loadGuides(join(tmpdir(), 'alteria-guides-missing-' + Date.now()));
		expect(result.guides).toEqual([]);
		expect(result.issues).toEqual([]);
	});

	it('returns an empty result when the directory exists but is empty', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-guides-'));
		const result = await loadGuides(dir);
		expect(result.guides).toEqual([]);
		expect(result.issues).toEqual([]);
	});

	it('loads a well-formed guide via sidecar layout', async () => {
		const dir = await seedGuidesDir({
			cognita: {
				yaml: 'title: Alteria Cognita\nsummary: The mapped territory.\n',
				md: 'Body prose.\n'
			}
		});
		const result = await loadGuides(dir);
		expect(result.issues).toEqual([]);
		expect(result.guides).toHaveLength(1);
		expect(result.guides[0]).toMatchObject({
			slug: 'cognita',
			title: 'Alteria Cognita',
			summary: 'The mapped territory.',
			eyebrow: 'Start here',
			body: 'Body prose.\n'
		});
	});

	it('loads a guide written entirely as index.md with frontmatter', async () => {
		const dir = await seedGuidesDir({
			tour: {
				md: [
					'---',
					'title: Tour',
					'summary: A short tour.',
					'eyebrow: Begin',
					'---',
					'',
					'Tour body.',
					''
				].join('\n')
			}
		});
		const result = await loadGuides(dir);
		expect(result.issues).toEqual([]);
		expect(result.guides[0]).toMatchObject({
			slug: 'tour',
			title: 'Tour',
			summary: 'A short tour.',
			eyebrow: 'Begin'
		});
		expect(result.guides[0].body.startsWith('---')).toBe(false);
		expect(result.guides[0].body.includes('Tour body.')).toBe(true);
	});

	it('defaults the eyebrow to "Start here" when unset', async () => {
		const dir = await seedGuidesDir({
			g: { yaml: 'title: T\nsummary: S\n', md: 'x\n' }
		});
		const result = await loadGuides(dir);
		expect(result.guides[0].eyebrow).toBe('Start here');
	});

	it('sorts guides alphabetically by slug for deterministic homepage order', async () => {
		const dir = await seedGuidesDir({
			zebra: { yaml: 'title: Z\nsummary: s\n', md: 'x' },
			alpha: { yaml: 'title: A\nsummary: s\n', md: 'x' },
			mango: { yaml: 'title: M\nsummary: s\n', md: 'x' }
		});
		const result = await loadGuides(dir);
		expect(result.guides.map((g) => g.slug)).toEqual(['alpha', 'mango', 'zebra']);
	});

	it('skips a guide and reports an issue when index.md is missing', async () => {
		const dir = await seedGuidesDir({
			'no-md': { yaml: 'title: T\nsummary: S\n' }
		});
		const result = await loadGuides(dir);
		expect(result.guides).toEqual([]);
		expect(result.issues[0].detail).toMatch(/missing index\.md/);
	});

	it('skips a guide and reports an issue when only an index.md without frontmatter exists', async () => {
		const dir = await seedGuidesDir({
			'prose-only': { md: 'no metadata here\n' }
		});
		const result = await loadGuides(dir);
		expect(result.guides).toEqual([]);
		expect(result.issues[0].detail).toMatch(/missing index\.yaml/);
	});

	it('rejects a guide with a missing or empty title', async () => {
		const dir = await seedGuidesDir({
			'no-title': { yaml: 'summary: S\n', md: 'x' },
			'blank-title': { yaml: 'title: "   "\nsummary: S\n', md: 'x' }
		});
		const result = await loadGuides(dir);
		expect(result.guides).toEqual([]);
		expect(result.issues).toHaveLength(2);
		for (const issue of result.issues) {
			expect(issue.detail).toMatch(/title must be a non-empty string/);
		}
	});

	it('rejects a guide with a missing or empty summary', async () => {
		const dir = await seedGuidesDir({
			'no-summary': { yaml: 'title: T\n', md: 'x' }
		});
		const result = await loadGuides(dir);
		expect(result.guides).toEqual([]);
		expect(result.issues[0].detail).toMatch(/summary must be a non-empty string/);
	});

	it('rejects a guide with an empty eyebrow when the field is present', async () => {
		const dir = await seedGuidesDir({
			g: { yaml: 'title: T\nsummary: S\neyebrow: "   "\n', md: 'x' }
		});
		const result = await loadGuides(dir);
		expect(result.guides).toEqual([]);
		expect(result.issues[0].detail).toMatch(/eyebrow must be a non-empty string/);
	});

	it('rejects a guide that mixes index.yaml and index.md frontmatter', async () => {
		const dir = await seedGuidesDir({
			both: {
				yaml: 'title: From yaml\nsummary: s\n',
				md: '---\ntitle: From frontmatter\nsummary: s\n---\n\nBody.\n'
			}
		});
		const result = await loadGuides(dir);
		expect(result.guides).toEqual([]);
		expect(result.issues.some((i) => i.detail.includes('pick one'))).toBe(true);
	});

	it('reports malformed yaml without crashing', async () => {
		const dir = await seedGuidesDir({
			broken: { yaml: 'title: [unterminated\n', md: 'x' }
		});
		const result = await loadGuides(dir);
		expect(result.guides).toEqual([]);
		expect(result.issues[0].kind).toBe('invalid-yaml');
	});

	it('skips folders whose names are not valid slugs and reports the issue', async () => {
		const dir = await seedGuidesDir({
			'Bad Slug': { yaml: 'title: T\nsummary: S\n', md: 'x' }
		});
		const result = await loadGuides(dir);
		expect(result.guides).toEqual([]);
		expect(result.issues[0].detail).toMatch(/guide slug must be kebab-case/);
	});

	it('ignores hidden and underscore-prefixed folders', async () => {
		const dir = await seedGuidesDir({
			'.draft': { yaml: 'title: T\nsummary: S\n', md: 'x' },
			_scratch: { yaml: 'title: T\nsummary: S\n', md: 'x' },
			real: { yaml: 'title: Real\nsummary: S\n', md: 'x' }
		});
		const result = await loadGuides(dir);
		expect(result.guides.map((g) => g.slug)).toEqual(['real']);
		expect(result.issues).toEqual([]);
	});
});
