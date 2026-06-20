import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadKindRegistry } from './kinds';

/**
 * Seed a kinds registry on disk. `tree` is an object whose keys are
 * folder paths relative to the registry root, and whose values are
 * either `null` (just create the folder), or `{ yaml? }` to
 * write `_kind.yaml` inside it.
 */
async function seedKindsDir(
	tree: Record<string, null | { yaml?: string }>
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'alteria-kinds-'));
	for (const [path, files] of Object.entries(tree)) {
		const abs = join(dir, path);
		await mkdir(abs, { recursive: true });
		if (files?.yaml !== undefined) await writeFile(join(abs, '_kind.yaml'), files.yaml);
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
			_draft: null,
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
		expect(
			result.issues.some((i) => i.detail.includes("'kindParent' is no longer supported"))
		).toBe(true);
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

describe('loadKindRegistry — ontology relations with governedBy', () => {
	async function seedOntologyDir(ontologyYaml: string, kindsUnder: string[]): Promise<string> {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-kinds-onto-'));
		const ontoDir = join(dir, 'cultural');
		await mkdir(ontoDir, { recursive: true });
		await import('node:fs/promises').then(({ writeFile }) =>
			writeFile(join(ontoDir, '_ontology.yaml'), ontologyYaml)
		);
		for (const k of kindsUnder) {
			const kDir = join(ontoDir, k);
			await mkdir(kDir, { recursive: true });
		}
		return dir;
	}

	it('parses governedBy on a relation and stores it in the schema', async () => {
		const yaml = [
			'title: Cultural',
			'relations:',
			'  role-in:',
			'    outLabel: Role in',
			'    inLabel: Roles',
			'    domain: [role]',
			'    codomain: [social-structure]',
		'  member-of:',
		'    outLabel: Member of',
		'    inLabel: Members',
		'    qualifier: required',
		'    governedBy: cultural/role-in',
			'    domain: [character]',
			'    codomain: [cultural-group]'
		].join('\n');
		const dir = await seedOntologyDir(yaml, ['role', 'character', 'cultural-group', 'social-structure']);
		const result = await loadKindRegistry(dir);
		expect(result.issues).toEqual([]);
		const memberOf = result.relations.get('cultural/member-of');
		expect(memberOf?.qualifier).toBe('required');
		expect(memberOf?.governedBy).toBe('cultural/role-in');
		// governedBy and qualifier on role-in itself are absent
		const roleIn = result.relations.get('cultural/role-in');
		expect(roleIn?.governedBy).toBeUndefined();
		expect(roleIn?.qualifier).toBeUndefined();
	});

	it('parses qualifier: required without governedBy', async () => {
		const yaml = [
			'title: Cultural',
			'relations:',
			'  member-of:',
			'    outLabel: Member of',
			'    inLabel: Members',
			'    qualifier: required',
			'    domain: [character]',
			'    codomain: [cultural-group]'
		].join('\n');
		const dir = await seedOntologyDir(yaml, ['character', 'cultural-group']);
		const result = await loadKindRegistry(dir);
		expect(result.issues).toEqual([]);
		const memberOf = result.relations.get('cultural/member-of');
		expect(memberOf?.qualifier).toBe('required');
		expect(memberOf?.governedBy).toBeUndefined();
	});

	it('emits an issue for qualifier with an invalid value', async () => {
		const yaml = [
			'title: Cultural',
			'relations:',
			'  member-of:',
			'    outLabel: Member of',
			'    inLabel: Members',
			'    qualifier: optional'
		].join('\n');
		const dir = await seedOntologyDir(yaml, []);
		const result = await loadKindRegistry(dir);
		expect(result.issues.some((i) => i.detail.includes("must be 'required'"))).toBe(true);
		expect(result.relations.get('cultural/member-of')?.qualifier).toBeUndefined();
	});

	it('emits no issue when governedBy is absent', async () => {
		const yaml = [
			'title: Cultural',
			'relations:',
			'  member-of:',
			'    outLabel: Member of',
			'    inLabel: Members',
			'    domain: [character]',
			'    codomain: [cultural-group]'
		].join('\n');
		const dir = await seedOntologyDir(yaml, ['character', 'cultural-group']);
		const result = await loadKindRegistry(dir);
		expect(result.issues).toEqual([]);
		expect(result.relations.get('cultural/member-of')?.governedBy).toBeUndefined();
	});

	it('parses qualifierDomain as an array of kind ids', async () => {
		const yaml = [
			'title: Cultural',
			'relations:',
			'  originated-on:',
			'    outLabel: Originated on',
			'    inLabel: Origin of',
			'    qualifier: required',
			'    qualifierDomain: [creation-process]'
		].join('\n');
		const dir = await seedOntologyDir(yaml, ['creation-process']);
		const result = await loadKindRegistry(dir);
		expect(result.issues).toEqual([]);
		const schema = result.relations.get('cultural/originated-on');
		expect(schema?.qualifier).toBe('required');
		expect(schema?.qualifierDomain).toEqual(['creation-process']);
	});

	it('emits an issue when qualifierDomain is not an array', async () => {
		const yaml = [
			'title: Cultural',
			'relations:',
			'  originated-on:',
			'    outLabel: Originated on',
			'    inLabel: Origin of',
			'    qualifierDomain: creation-process'
		].join('\n');
		const dir = await seedOntologyDir(yaml, []);
		const result = await loadKindRegistry(dir);
		expect(result.issues.some((i) => i.detail.includes('qualifierDomain') && i.detail.includes('array'))).toBe(true);
		expect(result.relations.get('cultural/originated-on')?.qualifierDomain).toBeUndefined();
	});
});
