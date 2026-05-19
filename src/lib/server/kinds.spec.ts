import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadKindRegistry } from './kinds';

async function seedKindsDir(files: Record<string, string>): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'alteria-kinds-'));
	await mkdir(dir, { recursive: true });
	for (const [name, contents] of Object.entries(files)) {
		await writeFile(join(dir, name), contents);
	}
	return dir;
}

describe('loadKindRegistry', () => {
	it('returns an empty registry with no issues when the directory is absent', async () => {
		const result = await loadKindRegistry(join(tmpdir(), 'alteria-missing-' + Date.now()));
		expect(result.kinds.size).toBe(0);
		expect(result.issues).toEqual([]);
	});

	it('loads kinds with metadata and parent references', async () => {
		const dir = await seedKindsDir({
			'place.yaml': ['singular: Place', 'plural: Places', 'description: Where things happen.'].join(
				'\n'
			),
			'celestial-body.yaml': [
				'singular: Celestial Body',
				'plural: Celestial Bodies',
				'kindParent: place'
			].join('\n')
		});
		const result = await loadKindRegistry(dir);
		expect(result.issues).toEqual([]);
		expect(result.kinds.get('place')?.meta.singular).toBe('Place');
		expect(result.kinds.get('celestial-body')?.meta.kindParent).toBe('place');
	});

	it('reads sibling markdown bodies when present', async () => {
		const dir = await seedKindsDir({
			'celestial-body.yaml': 'singular: Celestial Body\nplural: Celestial Bodies',
			'celestial-body.md': 'A category page rather than an entity.\n'
		});
		const result = await loadKindRegistry(dir);
		expect(result.issues).toEqual([]);
		expect(result.kinds.get('celestial-body')?.body).toContain('category page');
	});

	it('returns null body when no companion markdown exists', async () => {
		const dir = await seedKindsDir({ 'place.yaml': 'singular: Place\nplural: Places' });
		const result = await loadKindRegistry(dir);
		expect(result.kinds.get('place')?.body).toBe(null);
	});

	it('flags malformed yaml without aborting the rest of the registry', async () => {
		const dir = await seedKindsDir({
			'broken.yaml': 'singular: [unclosed',
			'place.yaml': 'singular: Place\nplural: Places'
		});
		const result = await loadKindRegistry(dir);
		expect(result.kinds.has('place')).toBe(true);
		expect(result.kinds.has('broken')).toBe(false);
		expect(result.issues.some((i) => i.detail.includes('broken.yaml'))).toBe(true);
	});

	it('rejects ids that are not kebab-case', async () => {
		const dir = await seedKindsDir({ 'Bad_Kind.yaml': 'singular: Bad' });
		const result = await loadKindRegistry(dir);
		expect(result.kinds.size).toBe(0);
		expect(result.issues[0].detail).toMatch(/kebab-case/);
	});

	it('flags a kindParent that does not refer to a registered kind', async () => {
		const dir = await seedKindsDir({ 'orphan.yaml': 'singular: Orphan\nkindParent: ghost' });
		const result = await loadKindRegistry(dir);
		expect(result.issues.some((i) => i.detail.includes("kindParent 'ghost'"))).toBe(true);
	});

	it('detects cycles in the kind hierarchy', async () => {
		const dir = await seedKindsDir({
			'a.yaml': 'singular: A\nkindParent: b',
			'b.yaml': 'singular: B\nkindParent: a'
		});
		const result = await loadKindRegistry(dir);
		expect(result.issues.some((i) => i.detail.includes('cycle'))).toBe(true);
	});

	it('skips underscore-prefixed and hidden files', async () => {
		const dir = await seedKindsDir({
			'_draft.yaml': 'singular: Draft',
			'.hidden.yaml': 'singular: Hidden',
			'place.yaml': 'singular: Place'
		});
		const result = await loadKindRegistry(dir);
		expect([...result.kinds.keys()]).toEqual(['place']);
	});

	it('rejects fields with the wrong shape', async () => {
		const dir = await seedKindsDir({ 'place.yaml': 'singular: Place\nkindParent: [not, a, string]' });
		const result = await loadKindRegistry(dir);
		expect(result.issues.some((i) => i.detail.includes('kindParent must be a string'))).toBe(true);
	});
});
