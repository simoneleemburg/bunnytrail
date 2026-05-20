import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildKindTree } from '$lib/types';
import { buildEdges, extractKindLinks, extractKindRefs, extractWikilinks, loadAll } from './loader';

/**
 * Most loader tests use a tiny in-memory kind registry so kind
 * validation is exercised under the same lenient-warn policy the
 * real app uses. Tests that don't care about the registry leave it
 * unset; the loader then treats every entity kind as "unregistered"
 * and emits warnings — that's the policy.
 */
async function seedKindsRegistry(kinds: Array<{ id: string; parent?: string }>): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'alteria-kinds-reg-'));
	// The registry is a tree on disk: each kind is a folder; nesting
	// expresses the parent/child relationship. Resolve children only
	// after their parents have been created so the path exists.
	const remaining = [...kinds];
	const created = new Map<string, string>(); // id -> abs path
	let safety = remaining.length * remaining.length + 1;
	while (remaining.length > 0 && safety-- > 0) {
		const idx = remaining.findIndex((k) => !k.parent || created.has(k.parent));
		if (idx < 0) throw new Error('seedKindsRegistry: unresolvable parents in fixture');
		const k = remaining.splice(idx, 1)[0];
		const parentDir = k.parent ? created.get(k.parent)! : dir;
		const kindDir = join(parentDir, k.id);
		await mkdir(kindDir, { recursive: true });
		const yaml = ['singular: ' + cap(k.id), 'plural: ' + cap(k.id) + 's'].join('\n');
		await writeFile(join(kindDir, '_kind.yaml'), yaml);
		created.set(k.id, kindDir);
	}
	return dir;
}

function cap(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

const ORIGINAL_KINDS_DIR = process.env.ALTERIA_KINDS_DIR;
beforeEach(() => {
	// Default: no registry — tests that need one set it explicitly.
	delete process.env.ALTERIA_KINDS_DIR;
});
afterEach(() => {
	if (ORIGINAL_KINDS_DIR !== undefined) {
		process.env.ALTERIA_KINDS_DIR = ORIGINAL_KINDS_DIR;
	} else {
		delete process.env.ALTERIA_KINDS_DIR;
	}
});

async function seedTempContent(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'alteria-'));

	await mkdir(join(dir, 'characters', 'kael'), { recursive: true });
	await mkdir(join(dir, 'places', 'duskmere'), { recursive: true });

	await writeFile(
		join(dir, 'characters', '_collection.yaml'),
		['title: Characters', 'description: People of Alteria.'].join('\n')
	);

	await writeFile(
		join(dir, 'characters', 'kael', 'index.yaml'),
		[
			'name: Kael of the Third Veil',
			'kind: character',
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

	await writeFile(
		join(dir, 'places', 'duskmere', 'index.yaml'),
		'name: Duskmere\nkind: place\ntags: [town]\n'
	);
	await writeFile(
		join(dir, 'places', 'duskmere', 'index.md'),
		'A border town at the edge of the Veil.'
	);

	return dir;
}

/**
 * A content tree exercising nested entities:
 *
 *   - A nested folder (`culture/languages/`) containing an entity.
 *   - An entity (`places/bayurinda/`) containing a child entity
 *     (`places/bayurinda/sharazan/`). The child inherits no kind
 *     from its parent — kinds are per-entity.
 */
async function seedNestedContent(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'alteria-nested-'));

	await mkdir(join(dir, 'culture', 'languages', 'tholingian'), { recursive: true });
	await writeFile(
		join(dir, 'culture', 'languages', 'tholingian', 'index.yaml'),
		'name: Tholingian\nkind: language'
	);
	await writeFile(
		join(dir, 'culture', 'languages', 'tholingian', 'index.md'),
		'The tongue spoken at the foot of the Pillars.'
	);

	await mkdir(join(dir, 'places', 'bayurinda', 'sharazan'), { recursive: true });
	await writeFile(join(dir, 'places', 'bayurinda', 'index.yaml'), 'name: Bayurinda\nkind: planet');
	await writeFile(join(dir, 'places', 'bayurinda', 'index.md'), 'The water-world.');
	await writeFile(
		join(dir, 'places', 'bayurinda', 'sharazan', 'index.yaml'),
		'name: Sharazan\nkind: settlement'
	);
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

	it('extracts multi-segment wikilinks (subfolders and nested entities)', () => {
		const ids = extractWikilinks(
			'See [[culture/languages/tholingian]] and [[places/bayurinda/sharazan|Sharazan]].'
		);
		expect(ids.sort()).toEqual(['culture/languages/tholingian', 'places/bayurinda/sharazan']);
	});

	it('ignores non-wikilink double brackets', () => {
		expect(extractWikilinks('[[NotAnId]] and [text](link)')).toEqual([]);
	});

	it('excludes [[kinds/<id>]] paths (those flow through extractKindLinks)', () => {
		const ids = extractWikilinks('See [[characters/kael]] and [[kinds/human]].');
		expect(ids.sort()).toEqual(['characters/kael']);
	});
});

describe('extractKindLinks', () => {
	it('extracts kind ids from [[kinds/<id>]] wikilinks, deduped', () => {
		const ids = extractKindLinks(
			'A [[kinds/human]] and another [[kinds/human|human]] and a [[kinds/naya]].'
		);
		expect(ids.sort()).toEqual(['human', 'naya']);
	});

	it('ignores entity wikilinks', () => {
		expect(extractKindLinks('See [[characters/kael]] only.')).toEqual([]);
	});

	it('ignores a bare [[kinds]] with no id', () => {
		// `[[kinds]]` doesn't match the `kinds/<id>` prefix.
		expect(extractKindLinks('Just [[kinds]] here.')).toEqual([]);
	});
});

describe('extractKindRefs', () => {
	it('picks fields whose values are all `kinds/<id>` strings', () => {
		const refs = extractKindRefs({
			name: 'Bayurinda',
			nativeBeings: ['kinds/human', 'kinds/serpent-humanoid'],
			tags: ['asthera', 'ocean']
		});
		expect(refs).toEqual({ nativeBeings: ['human', 'serpent-humanoid'] });
	});

	it('handles multiple kind-link fields on one entity', () => {
		const refs = extractKindRefs({
			nativeBeings: ['kinds/human'],
			nativePhenomena: ['kinds/binding', 'kinds/nearing']
		});
		expect(refs).toEqual({
			nativeBeings: ['human'],
			nativePhenomena: ['binding', 'nearing']
		});
	});

	it('rejects mixed lists strictly (one non-kinds entry disqualifies the field)', () => {
		// Strict separation: a list must be entirely `kinds/<id>` to
		// qualify. `tags: [kinds/human, asthera]` stays plain.
		const refs = extractKindRefs({
			tags: ['kinds/human', 'asthera']
		});
		expect(refs).toEqual({});
	});

	it('ignores non-list values, empty lists, and non-string entries', () => {
		expect(
			extractKindRefs({
				language: 'kinds/human', // scalar string, not a list
				nothing: [],
				bad: [{ kind: 'kinds/human' }]
			})
		).toEqual({});
	});

	it('rejects empty `kinds/` ids', () => {
		expect(extractKindRefs({ nativeBeings: ['kinds/'] })).toEqual({});
	});

	it('returns {} for non-object inputs', () => {
		expect(extractKindRefs(null)).toEqual({});
		expect(extractKindRefs('hello')).toEqual({});
		expect(extractKindRefs(undefined)).toEqual({});
	});
});

describe('loadAll', () => {
	it('loads entities with meta and body, reports broken links', async () => {
		const dir = await seedTempContent();
		const { entities, issues } = await loadAll(dir);

		expect(entities.size).toBe(2);
		const kael = entities.get('characters/kael')!;
		expect(kael.meta.name).toBe('Kael of the Third Veil');
		expect(kael.wikilinks.sort()).toEqual(['places/duskmere']);

		const broken = issues.filter((i) => i.kind === 'broken-link');
		expect(broken.some((i) => i.detail.includes('places/atlantis'))).toBe(true);
	});

	it('assigns entity.type to the containing folder path', async () => {
		const dir = await seedTempContent();
		const { entities } = await loadAll(dir);
		expect(entities.get('characters/kael')?.type).toBe('characters');
		expect(entities.get('places/duskmere')?.type).toBe('places');
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

	it('descends into nested folders and assigns the parent-folder path as type', async () => {
		const dir = await seedNestedContent();
		const { entities } = await loadAll(dir);

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

		// Sharazan's containing folder is `places/bayurinda`.
		expect(sharazan.type).toBe('places/bayurinda');
		expect(sharazan.parent).toBe('places/bayurinda');
		expect(bayurinda.children).toEqual(['places/bayurinda/sharazan']);
	});

	it('resolves wikilinks through nested paths', async () => {
		const dir = await seedNestedContent();
		const { entities, issues } = await loadAll(dir);

		const sharazan = entities.get('places/bayurinda/sharazan')!;
		expect(sharazan.wikilinks).toContain('culture/languages/tholingian');
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

describe('loadAll: kind validation', () => {
	it('warns on entities with no kind field', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-nokind-'));
		await mkdir(join(dir, 'places', 'mystery'), { recursive: true });
		await writeFile(join(dir, 'places', 'mystery', 'index.yaml'), 'name: Mystery');
		await writeFile(join(dir, 'places', 'mystery', 'index.md'), '?');
		const { issues } = await loadAll(dir);
		expect(
			issues.some(
				(i) =>
					i.kind === 'invalid-yaml' &&
					i.entity === 'places/mystery' &&
					i.detail.includes("no 'kind' field")
			)
		).toBe(true);
	});

	it('warns on entities with kinds not in the registry, but still loads them', async () => {
		process.env.ALTERIA_KINDS_DIR = await seedKindsRegistry([{ id: 'place' }]);
		const dir = await mkdtemp(join(tmpdir(), 'alteria-unkind-'));
		await mkdir(join(dir, 'places', 'a'), { recursive: true });
		await writeFile(join(dir, 'places', 'a', 'index.yaml'), 'name: A\nkind: not-registered');
		await writeFile(join(dir, 'places', 'a', 'index.md'), '.');
		const { entities, issues } = await loadAll(dir);
		expect(entities.has('places/a')).toBe(true);
		expect(
			issues.some(
				(i) =>
					i.kind === 'invalid-yaml' &&
					i.entity === 'places/a' &&
					i.detail.includes("kind 'not-registered' is not registered")
			)
		).toBe(true);
	});

	it('accepts registered kinds silently', async () => {
		process.env.ALTERIA_KINDS_DIR = await seedKindsRegistry([{ id: 'place' }]);
		const dir = await mkdtemp(join(tmpdir(), 'alteria-okind-'));
		await mkdir(join(dir, 'places', 'a'), { recursive: true });
		await writeFile(join(dir, 'places', 'a', 'index.yaml'), 'name: A\nkind: place');
		await writeFile(join(dir, 'places', 'a', 'index.md'), '.');
		const { issues } = await loadAll(dir);
		expect(issues.filter((i) => i.entity === 'places/a' && i.kind === 'invalid-yaml')).toEqual([]);
	});

	it('exposes the kind registry on the load result', async () => {
		process.env.ALTERIA_KINDS_DIR = await seedKindsRegistry([
			{ id: 'celestial-body' },
			{ id: 'star', parent: 'celestial-body' }
		]);
		const dir = await mkdtemp(join(tmpdir(), 'alteria-reg-'));
		const { kindRegistry } = await loadAll(dir);
		expect(kindRegistry.has('celestial-body')).toBe(true);
		expect(kindRegistry.get('star')?.parent).toBe('celestial-body');
	});
});

describe('buildKindTree (client-side helper)', () => {
	it('returns an empty tree from empty declarations', () => {
		const tree = buildKindTree(new Map());
		expect(tree.all()).toEqual([]);
		expect(tree.has('star')).toBe(false);
		expect(tree.isKindOf('star', 'celestial-body')).toBe(false);
	});

	it('builds a single-level hierarchy and walks descendants', () => {
		const tree = buildKindTree(
			new Map([
				['celestial-body', null],
				['star', 'celestial-body'],
				['planet', 'celestial-body'],
				['moon', 'celestial-body']
			])
		);
		expect(tree.all().sort()).toEqual(['celestial-body', 'moon', 'planet', 'star']);
		expect(tree.parent('star')).toBe('celestial-body');
		expect(tree.parent('celestial-body')).toBe(null);
		expect(tree.children('celestial-body').sort()).toEqual(['moon', 'planet', 'star']);
		expect([...tree.descendantsInclusive('celestial-body')].sort()).toEqual([
			'celestial-body',
			'moon',
			'planet',
			'star'
		]);
		expect(tree.isKindOf('star', 'celestial-body')).toBe(true);
		expect(tree.isKindOf('celestial-body', 'celestial-body')).toBe(true);
		expect(tree.isKindOf('star', 'star')).toBe(true);
		expect(tree.isKindOf('star', 'planet')).toBe(false);
	});

	it('walks multi-level ancestry', () => {
		const tree = buildKindTree(
			new Map([
				['construct', null],
				['eidolon', 'construct'],
				['world-pillar', 'eidolon']
			])
		);
		expect(tree.ancestors('world-pillar')).toEqual(['eidolon', 'construct']);
		expect(tree.isKindOf('world-pillar', 'construct')).toBe(true);
		expect([...tree.descendantsInclusive('construct')].sort()).toEqual([
			'construct',
			'eidolon',
			'world-pillar'
		]);
	});

	it('treats unknown parents defensively (no throw, parent becomes null)', () => {
		const tree = buildKindTree(new Map([['star', 'celestial-body']]));
		expect(tree.has('star')).toBe(true);
		expect(tree.parent('star')).toBe(null);
	});

	it('breaks cycles defensively without throwing', () => {
		const tree = buildKindTree(
			new Map([
				['a', 'b'],
				['b', 'c'],
				['c', 'a']
			])
		);
		// Cycle: ancestors() walks until it sees a repeat. We don't
		// assert a specific path here, just that it terminates.
		expect(() => tree.ancestors('a')).not.toThrow();
		expect(() => tree.descendantsInclusive('a')).not.toThrow();
	});

	it('treats unknown kinds as outside the tree', () => {
		const tree = buildKindTree(new Map([['star', null]]));
		expect(tree.has('not-a-kind')).toBe(false);
		expect(tree.ancestors('not-a-kind')).toEqual([]);
		expect([...tree.descendantsInclusive('not-a-kind')]).toEqual(['not-a-kind']);
		expect(tree.isKindOf('not-a-kind', 'star')).toBe(false);
		expect(tree.isKindOf('not-a-kind', 'not-a-kind')).toBe(true);
	});
});

describe('loadAll: collections', () => {
	it('records folders carrying a _collection.yaml', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-'));
		await mkdir(join(dir, 'places'), { recursive: true });
		await writeFile(
			join(dir, 'places', '_collection.yaml'),
			'title: The Places\ndescription: Where things happen.'
		);
		const { collections } = await loadAll(dir);
		const places = collections.get('places');
		expect(places?.meta.title).toBe('The Places');
		expect(places?.meta.description).toBe('Where things happen.');
		expect(places?.body).toBe(null);
	});

	it('records folders carrying only a _collection.md (body but default labels)', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-'));
		await mkdir(join(dir, 'fabric'), { recursive: true });
		await writeFile(join(dir, 'fabric', '_collection.md'), 'The fabric of things.\n');
		const { collections } = await loadAll(dir);
		const fabric = collections.get('fabric');
		expect(fabric?.meta).toEqual({});
		expect(fabric?.body).toContain('fabric of things');
	});

	it('reads the body alongside the yaml when both exist', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-'));
		await mkdir(join(dir, 'culture'), { recursive: true });
		await writeFile(join(dir, 'culture', '_collection.yaml'), 'title: Culture');
		await writeFile(join(dir, 'culture', '_collection.md'), 'Customs, languages, orders.\n');
		const { collections } = await loadAll(dir);
		const culture = collections.get('culture');
		expect(culture?.meta.title).toBe('Culture');
		expect(culture?.body).toContain('Customs');
	});

	it('flags malformed _collection.yaml but still walks the folder', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-'));
		await mkdir(join(dir, 'broken', 'inner'), { recursive: true });
		await writeFile(join(dir, 'broken', '_collection.yaml'), 'title: [unclosed');
		await writeFile(join(dir, 'broken', 'inner', 'index.yaml'), 'name: Inner\nkind: thing');
		const { issues, entities } = await loadAll(dir);
		expect(entities.has('broken/inner')).toBe(true);
		expect(issues.some((i) => i.detail.includes('_collection.yaml'))).toBe(true);
	});
});

describe('loadAll: chapters', () => {
	it('loads ordered chapters from <entity>/chapters/*.md and merges their wikilinks into the parent', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-chapters-'));
		await mkdir(join(dir, 'works', 'scrolls', 'chapters'), { recursive: true });
		await mkdir(join(dir, 'places', 'temple'), { recursive: true });
		await writeFile(
			join(dir, 'works', 'scrolls', 'index.yaml'),
			'name: The Scrolls\nkind: account'
		);
		await writeFile(join(dir, 'works', 'scrolls', 'index.md'), 'Cover prose.\n');
		await writeFile(join(dir, 'places', 'temple', 'index.yaml'), 'name: Temple\nkind: place');
		await writeFile(join(dir, 'places', 'temple', 'index.md'), '.');

		await writeFile(
			join(dir, 'works', 'scrolls', 'chapters', '02-second-thing.md'),
			'# Second Thing\n\nMore prose mentioning [[places/temple]].\n'
		);
		await writeFile(
			join(dir, 'works', 'scrolls', 'chapters', '01-first-thing.md'),
			'# First Thing\n\nOpening prose.\n'
		);
		await writeFile(
			join(dir, 'works', 'scrolls', 'chapters', '10-tenth-thing.md'),
			'# The Tenth\n\nLater prose.\n'
		);

		const { entities } = await loadAll(dir);
		const scrolls = entities.get('works/scrolls')!;
		expect(scrolls).toBeDefined();
		expect(scrolls.chapters.map((c) => c.slug)).toEqual([
			'first-thing',
			'second-thing',
			'tenth-thing'
		]);
		expect(scrolls.chapters.map((c) => c.order)).toEqual([1, 2, 10]);
		expect(scrolls.chapters.map((c) => c.title)).toEqual([
			'First Thing',
			'Second Thing',
			'The Tenth'
		]);
		// Wikilinks from chapters merge into the parent entity's
		// wikilinks so backlinks attribute to the work as a whole.
		expect(scrolls.wikilinks).toContain('places/temple');
	});

	it('flags malformed chapter filenames but still loads the entity', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-chapters-bad-'));
		await mkdir(join(dir, 'works', 'scrolls', 'chapters'), { recursive: true });
		await writeFile(
			join(dir, 'works', 'scrolls', 'index.yaml'),
			'name: The Scrolls\nkind: account'
		);
		await writeFile(join(dir, 'works', 'scrolls', 'index.md'), 'Cover prose.\n');
		await writeFile(
			join(dir, 'works', 'scrolls', 'chapters', 'no-prefix.md'),
			'# Untitled\n\nProse.\n'
		);
		await writeFile(join(dir, 'works', 'scrolls', 'chapters', '01-good.md'), '# Good\n\nProse.\n');

		const { entities, issues } = await loadAll(dir);
		const scrolls = entities.get('works/scrolls')!;
		expect(scrolls.chapters.map((c) => c.slug)).toEqual(['good']);
		expect(issues.some((i) => i.detail.includes('no-prefix.md'))).toBe(true);
	});

	it('falls back to the slug when no `# heading` is present', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-chapters-slug-'));
		await mkdir(join(dir, 'works', 'scrolls', 'chapters'), { recursive: true });
		await writeFile(
			join(dir, 'works', 'scrolls', 'index.yaml'),
			'name: The Scrolls\nkind: account'
		);
		await writeFile(join(dir, 'works', 'scrolls', 'index.md'), 'Cover prose.\n');
		await writeFile(
			join(dir, 'works', 'scrolls', 'chapters', '01-some-untitled-thing.md'),
			'No heading here, just prose.\n'
		);

		const { entities } = await loadAll(dir);
		const scrolls = entities.get('works/scrolls')!;
		expect(scrolls.chapters[0].title).toBe('Some Untitled Thing');
	});

	it('produces an empty chapters array when no chapters/ folder exists', async () => {
		const dir = await seedTempContent();
		const { entities } = await loadAll(dir);
		const kael = entities.get('characters/kael')!;
		expect(kael.chapters).toEqual([]);
	});
});
