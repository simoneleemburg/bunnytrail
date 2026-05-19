import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadKindRegistry } from './kinds';

/**
 * Seed a kinds registry on disk. `tree` is an object whose keys are
 * folder paths relative to the registry root, and whose values are
 * either `null` (just create the folder), or `{ yaml?, md? }` to
 * write `_kind.yaml` / `_kind.md` inside it.
 */
async function seedKindsDir(
	tree: Record<string, null | { yaml?: string; md?: string }>
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'alteria-kinds-'));
	for (const [path, files] of Object.entries(tree)) {
		const abs = join(dir, path);
		await mkdir(abs, { recursive: true });
		if (files?.yaml !== undefined) await writeFile(join(abs, '_kind.yaml'), files.yaml);
		if (files?.md !== undefined) await writeFile(join(abs, '_kind.md'), files.md);
	}
	return dir;
}

describe('loadKindRegistry', () => {
	it('returns an empty registry with no issues when the directory is absent', async () => {
		const result = await loadKindRegistry(join(tmpdir(), 'alteria-missing-' + Date.now()));
		expect(result.kinds.size).toBe(0);
		expect(result.issues).toEqual([]);
	});

	it('returns an empty registry when the directory is present but empty', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-kinds-'));
		const result = await loadKindRegistry(dir);
		expect(result.kinds.size).toBe(0);
		expect(result.issues).toEqual([]);
	});

	it('derives the kind hierarchy from folder nesting', async () => {
		const dir = await seedKindsDir({
			place: { yaml: 'singular: Place\nplural: Places\ndescription: Where things happen.' },
			'place/celestial-body': { yaml: 'singular: Celestial Body\nplural: Celestial Bodies' },
			'place/celestial-body/star': { yaml: 'singular: Star\nplural: Stars' }
		});
		const result = await loadKindRegistry(dir);
		expect(result.issues).toEqual([]);
		expect(result.kinds.get('place')?.parent).toBe(null);
		expect(result.kinds.get('place')?.meta.singular).toBe('Place');
		expect(result.kinds.get('celestial-body')?.parent).toBe('place');
		expect(result.kinds.get('star')?.parent).toBe('celestial-body');
	});

	it('registers kinds that have no _kind.yaml with empty metadata', async () => {
		const dir = await seedKindsDir({
			place: null,
			'place/realm': null
		});
		const result = await loadKindRegistry(dir);
		expect(result.kinds.get('place')?.meta).toEqual({});
		expect(result.kinds.get('place')?.parent).toBe(null);
		expect(result.kinds.get('realm')?.parent).toBe('place');
	});

	it('reads _kind.md prose bodies when present', async () => {
		const dir = await seedKindsDir({
			'celestial-body': {
				yaml: 'singular: Celestial Body\nplural: Celestial Bodies',
				md: 'A category page rather than an entity.\n'
			}
		});
		const result = await loadKindRegistry(dir);
		expect(result.issues).toEqual([]);
		expect(result.kinds.get('celestial-body')?.body).toContain('category page');
	});

	it('returns null body when no _kind.md exists', async () => {
		const dir = await seedKindsDir({ place: { yaml: 'singular: Place\nplural: Places' } });
		const result = await loadKindRegistry(dir);
		expect(result.kinds.get('place')?.body).toBe(null);
	});

	it('flags malformed yaml without aborting the rest of the registry', async () => {
		const dir = await seedKindsDir({
			broken: { yaml: 'singular: [unclosed' },
			place: { yaml: 'singular: Place\nplural: Places' }
		});
		const result = await loadKindRegistry(dir);
		expect(result.kinds.has('place')).toBe(true);
		// `broken` is still registered (folder presence is enough),
		// but its metadata is empty and an issue is recorded.
		expect(result.kinds.has('broken')).toBe(true);
		expect(result.kinds.get('broken')?.meta).toEqual({});
		expect(result.issues.some((i) => i.detail.includes('broken/_kind.yaml'))).toBe(true);
	});

	it('rejects folder names that are not kebab-case', async () => {
		const dir = await seedKindsDir({ Bad_Kind: null });
		const result = await loadKindRegistry(dir);
		expect(result.kinds.size).toBe(0);
		expect(result.issues[0].detail).toMatch(/kebab-case/);
	});

	it('skips underscore-prefixed and hidden folders', async () => {
		const dir = await seedKindsDir({
			'_draft': null,
			'.hidden': null,
			place: null
		});
		const result = await loadKindRegistry(dir);
		expect([...result.kinds.keys()]).toEqual(['place']);
	});

	it('warns when a yaml still carries the legacy kindParent field', async () => {
		const dir = await seedKindsDir({
			place: null,
			'place/realm': { yaml: 'singular: Realm\nkindParent: place' }
		});
		const result = await loadKindRegistry(dir);
		expect(result.kinds.get('realm')?.parent).toBe('place');
		expect(result.issues.some((i) => i.detail.includes("'kindParent' is no longer supported"))).toBe(
			true
		);
	});

	it('rejects fields with the wrong shape', async () => {
		const dir = await seedKindsDir({
			place: { yaml: 'singular: [not, a, string]' }
		});
		const result = await loadKindRegistry(dir);
		expect(result.issues.some((i) => i.detail.includes('singular must be a string'))).toBe(true);
		// Bad field is dropped but the kind still registers.
		expect(result.kinds.get('place')?.meta.singular).toBeUndefined();
	});
});
