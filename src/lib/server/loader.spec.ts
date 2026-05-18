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

/**
 * A content tree exercising both kinds of nesting:
 *
 *   - A subtype (`culture/languages/`) with an entity under it.
 *   - An entity (`places/bayurinda/`) containing a child entity
 *     (`places/bayurinda/sharazan/`) — note: no `_type.yaml`, so
 *     Sharazan inherits the `places` type, not a subtype.
 */
async function seedNestedContent(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'alteria-nested-'));

	// culture/ (type) → languages/ (subtype) → tholingian/ (entity)
	await mkdir(join(dir, 'culture', 'languages', 'tholingian'), { recursive: true });
	await writeFile(
		join(dir, 'culture', '_type.yaml'),
		['singular: Cultural Form', 'plural: Culture'].join('\n')
	);
	await writeFile(
		join(dir, 'culture', 'languages', '_type.yaml'),
		['singular: Language', 'plural: Languages'].join('\n')
	);
	await writeFile(join(dir, 'culture', 'languages', 'tholingian', 'index.yaml'), 'name: Tholingian');
	await writeFile(
		join(dir, 'culture', 'languages', 'tholingian', 'index.md'),
		'The tongue spoken at the foot of the Pillars.'
	);

	// places/ (type) → bayurinda/ (entity, also container) → sharazan/ (entity)
	await mkdir(join(dir, 'places', 'bayurinda', 'sharazan'), { recursive: true });
	await writeFile(join(dir, 'places', '_type.yaml'), 'singular: Place\nplural: Places');
	await writeFile(join(dir, 'places', 'bayurinda', 'index.yaml'), 'name: Bayurinda\nkind: planet');
	await writeFile(join(dir, 'places', 'bayurinda', 'index.md'), 'The water-world.');
	await writeFile(join(dir, 'places', 'bayurinda', 'sharazan', 'index.yaml'), 'name: Sharazan');
	await writeFile(
		join(dir, 'places', 'bayurinda', 'sharazan', 'index.md'),
		'A city of [[culture/languages/tholingian|Tholingian]] dialects.'
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

	it('extracts multi-segment wikilinks (subtypes and nested entities)', () => {
		const ids = extractWikilinks(
			'See [[culture/languages/tholingian]] and [[places/bayurinda/sharazan|Sharazan]].'
		);
		expect(ids.sort()).toEqual(['culture/languages/tholingian', 'places/bayurinda/sharazan']);
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
		// `wikilinks` holds resolved canonical ids only; the broken
		// reference to `places/atlantis` is dropped here and surfaced
		// via `issues` below instead.
		expect(kael.wikilinks.sort()).toEqual(['places/duskmere']);

		const broken = issues.filter((i) => i.kind === 'broken-link');
		expect(broken.some((i) => i.detail.includes('places/atlantis'))).toBe(true);
	});

	it('discovers types from subdirectories and skips underscore-prefixed entries', async () => {
		const dir = await seedTempContent();
		const { types } = await loadAll(dir);
		// `places` has no _type.yaml in this fixture but is still
		// discovered as a top-level type-by-convention.
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

	it('discovers subtypes and assigns nested entities to the deepest enclosing type', async () => {
		const dir = await seedNestedContent();
		const { entities, types } = await loadAll(dir);

		expect(types.sort()).toEqual(['culture', 'culture/languages', 'places']);

		const tholingian = entities.get('culture/languages/tholingian')!;
		expect(tholingian).toBeDefined();
		expect(tholingian.type).toBe('culture/languages');
		expect(tholingian.slug).toBe('tholingian');
		expect(tholingian.parent).toBe(null);
	});

	it('treats entity-folders containing other entity-folders as parents', async () => {
		const dir = await seedNestedContent();
		const { entities } = await loadAll(dir);

		const bayurinda = entities.get('places/bayurinda')!;
		const sharazan = entities.get('places/bayurinda/sharazan')!;

		// Sharazan is a Place (same type as Bayurinda), not a subtype.
		expect(sharazan.type).toBe('places');
		expect(sharazan.parent).toBe('places/bayurinda');
		expect(bayurinda.children).toEqual(['places/bayurinda/sharazan']);
	});

	it('resolves wikilinks through nested paths', async () => {
		const dir = await seedNestedContent();
		const { entities, issues } = await loadAll(dir);

		const sharazan = entities.get('places/bayurinda/sharazan')!;
		expect(sharazan.wikilinks).toContain('culture/languages/tholingian');
		// The target exists, so no broken-link issue should be raised.
		expect(
			issues.some(
				(i) =>
					i.kind === 'broken-link' &&
					i.entity === 'places/bayurinda/sharazan' &&
					i.detail.includes('culture/languages/tholingian')
			)
		).toBe(false);
	});
});

