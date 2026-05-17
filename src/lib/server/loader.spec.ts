import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEdges, extractWikilinks, loadAll } from './loader';

async function seedTempContent(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'alteria-'));

	await mkdir(join(dir, 'characters', 'kael'), { recursive: true });
	await mkdir(join(dir, 'places', 'duskmere'), { recursive: true });

	await writeFile(
		join(dir, 'characters', '_type.yaml'),
		['singular: Character', 'plural: Characters', 'description: People of Alteria.'].join('\n')
	);

	await writeFile(
		join(dir, 'characters', 'kael', 'index.yaml'),
		[
			'name: Kael of the Third Veil',
			'aliases: [The Veiled, Kael]',
			'summary: A wanderer of the borderlands.',
			'tags: [wanderer, veil]',
			'relations:',
			'  - kind: born-in',
			'    target: places/duskmere'
		].join('\n')
	);
	await writeFile(
		join(dir, 'characters', 'kael', 'index.md'),
		'Kael walks the [[places/duskmere|Duskmere]] roads and dreams of [[places/atlantis]].'
	);

	await writeFile(join(dir, 'places', 'duskmere', 'index.yaml'), 'name: Duskmere\ntags: [town]\n');
	await writeFile(
		join(dir, 'places', 'duskmere', 'index.md'),
		'A border town at the edge of the Veil.'
	);

	return dir;
}

describe('extractWikilinks', () => {
	it('finds plain and labelled wikilinks, deduped', () => {
		const ids = extractWikilinks(
			'See [[places/duskmere]] and [[places/duskmere|Duskmere]] and [[characters/kael|Kael]].'
		);
		expect(ids.sort()).toEqual(['characters/kael', 'places/duskmere']);
	});

	it('ignores non-wikilink double brackets', () => {
		expect(extractWikilinks('[[NotAnId]] and [text](link)')).toEqual([]);
	});
});

describe('loadAll', () => {
	it('loads entities with meta and body, reports broken links', async () => {
		const dir = await seedTempContent();
		const { entities, issues } = await loadAll(dir);

		expect(entities.size).toBe(2);
		const kael = entities.get('characters/kael')!;
		expect(kael.meta.name).toBe('Kael of the Third Veil');
		expect(kael.wikilinks.sort()).toEqual(['places/atlantis', 'places/duskmere']);

		const broken = issues.filter((i) => i.kind === 'broken-link');
		expect(broken.some((i) => i.detail.includes('places/atlantis'))).toBe(true);
	});

	it('discovers types from subdirectories and skips underscore-prefixed entries', async () => {
		const dir = await seedTempContent();
		const { types } = await loadAll(dir);
		expect(types).toEqual(['characters', 'places']);
	});

	it('loads per-type meta from _type.yaml when present', async () => {
		const dir = await seedTempContent();
		const { typeMeta } = await loadAll(dir);
		expect(typeMeta.get('characters')).toEqual({
			singular: 'Character',
			plural: 'Characters',
			description: 'People of Alteria.'
		});
		expect(typeMeta.has('places')).toBe(false);
	});

	it('builds forward and reverse edge indexes', async () => {
		const dir = await seedTempContent();
		const { entities } = await loadAll(dir);
		const { out, in: inIdx } = buildEdges(entities);

		const outFromKael = out.get('characters/kael') ?? [];
		expect(outFromKael.some((e) => e.kind === 'born-in' && e.to === 'places/duskmere')).toBe(true);
		expect(outFromKael.some((e) => e.kind === 'wikilink' && e.to === 'places/duskmere')).toBe(true);

		const inToDuskmere = inIdx.get('places/duskmere') ?? [];
		expect(inToDuskmere.length).toBeGreaterThanOrEqual(2);
	});
});
