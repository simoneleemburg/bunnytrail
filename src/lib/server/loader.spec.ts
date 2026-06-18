import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildKindTree } from '$lib/types';
import {
	buildEdges,
	extractKindLinks,
	extractKindRefs,
	extractWikilinks,
	loadAll,
	resolveWikilink
} from './loader';

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

const ORIGINAL_KINDS_DIR = process.env.BUNNYTRAIL_KINDS_DIR;
beforeEach(() => {
	// Default: no registry — tests that need one set it explicitly.
	delete process.env.BUNNYTRAIL_KINDS_DIR;
});
afterEach(() => {
	if (ORIGINAL_KINDS_DIR !== undefined) {
		process.env.BUNNYTRAIL_KINDS_DIR = ORIGINAL_KINDS_DIR;
	} else {
		delete process.env.BUNNYTRAIL_KINDS_DIR;
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
		'Kael walks the [[places/duskmere|Duskmere]] roads and dreams of [[places/atlantis|Atlantis]].'
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
		expect(extractWikilinks('[text](link)')).toEqual([]);
	});

	it('normalises uppercase paths to lowercase so they surface as broken links', () => {
		expect(extractWikilinks('[[NotAnId|label]]')).toEqual(['notanid']);
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
		process.env.BUNNYTRAIL_KINDS_DIR = await seedKindsRegistry([{ id: 'place' }]);
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
		process.env.BUNNYTRAIL_KINDS_DIR = await seedKindsRegistry([{ id: 'place' }]);
		const dir = await mkdtemp(join(tmpdir(), 'alteria-okind-'));
		await mkdir(join(dir, 'places', 'a'), { recursive: true });
		await writeFile(join(dir, 'places', 'a', 'index.yaml'), 'name: A\nkind: place');
		await writeFile(join(dir, 'places', 'a', 'index.md'), '.');
		const { issues } = await loadAll(dir);
		expect(issues.filter((i) => i.entity === 'places/a' && i.kind === 'invalid-yaml')).toEqual([]);
	});

	it('exposes the kind registry on the load result', async () => {
		process.env.BUNNYTRAIL_KINDS_DIR = await seedKindsRegistry([
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

describe('loadAll frontmatter layout', () => {
	it('loads an entity from index.md with YAML frontmatter', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-front-'));
		await mkdir(join(dir, 'places', 'sharazan'), { recursive: true });
		await writeFile(
			join(dir, 'places', 'sharazan', 'index.md'),
			[
				'---',
				'name: Sharazan',
				'kind: settlement',
				'tags: [city]',
				'---',
				'',
				'A city of [[places/duskmere|Duskmere]] dialects.',
				''
			].join('\n')
		);
		await mkdir(join(dir, 'places', 'duskmere'), { recursive: true });
		await writeFile(
			join(dir, 'places', 'duskmere', 'index.md'),
			'---\nname: Duskmere\nkind: place\n---\n\nA border town.\n'
		);

		const { entities, issues } = await loadAll(dir);
		const sharazan = entities.get('places/sharazan');
		expect(sharazan).toBeDefined();
		expect(sharazan!.meta.name).toBe('Sharazan');
		expect(sharazan!.meta.kind).toBe('settlement');
		expect(sharazan!.meta.tags).toEqual(['city']);
		expect(sharazan!.body.startsWith('\nA city of')).toBe(true);
		expect(sharazan!.wikilinks).toEqual(['places/duskmere']);
		// metaPath should point at the .md file when frontmatter sourced
		expect(sharazan!.yamlPath.endsWith('places/sharazan/index.md')).toBe(true);
		// No broken-link issues for the entities under test. Kind-body
		// issues (no entity field) may appear when the loader picks up
		// the real kinds registry; exclude them from this assertion.
		expect(issues.filter((i) => i.kind === 'broken-link' && i.entity !== undefined)).toEqual([]);
	});

	it('emits a health issue when both index.yaml and index.md frontmatter are present', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-front-conflict-'));
		await mkdir(join(dir, 'places', 'twin'), { recursive: true });
		await writeFile(join(dir, 'places', 'twin', 'index.yaml'), 'name: Twin (yaml)\nkind: place\n');
		await writeFile(
			join(dir, 'places', 'twin', 'index.md'),
			'---\nname: Twin (frontmatter)\nkind: place\n---\n\nBody.\n'
		);

		const { entities, issues } = await loadAll(dir);
		expect(entities.has('places/twin')).toBe(false);
		const conflict = issues.find(
			(i) => i.entity === 'places/twin' && i.detail.includes('pick one')
		);
		expect(conflict).toBeDefined();
	});

	it('treats a leading --- without a closing fence as plain markdown', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-front-hr-'));
		await mkdir(join(dir, 'places', 'hr'), { recursive: true });
		await writeFile(join(dir, 'places', 'hr', 'index.yaml'), 'name: HR\nkind: place\n');
		await writeFile(
			join(dir, 'places', 'hr', 'index.md'),
			'---\n\nBody starting with a horizontal rule.\n'
		);
		const { entities, issues } = await loadAll(dir);
		const hr = entities.get('places/hr');
		expect(hr).toBeDefined();
		expect(hr!.body.startsWith('---')).toBe(true);
		// No conflict expected.
		expect(issues.find((i) => i.detail.includes('pick one'))).toBeUndefined();
	});

	it('loads a collection from _collection.md frontmatter', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-coll-front-'));
		await mkdir(join(dir, 'places'), { recursive: true });
		await writeFile(
			join(dir, 'places', '_collection.md'),
			[
				'---',
				'title: Places',
				'description: Where things happen.',
				'---',
				'',
				'A walkthrough of all places.',
				''
			].join('\n')
		);
		await mkdir(join(dir, 'places', 'town'), { recursive: true });
		await writeFile(join(dir, 'places', 'town', 'index.yaml'), 'name: Town\nkind: place\n');
		await writeFile(join(dir, 'places', 'town', 'index.md'), 'A town.\n');

		const { collections } = await loadAll(dir);
		const places = collections.get('places');
		expect(places).toBeDefined();
		expect(places!.meta.title).toBe('Places');
		expect(places!.meta.description).toBe('Where things happen.');
		expect(places!.body!.startsWith('\nA walkthrough')).toBe(true);
	});

	it('emits a health issue when both _collection.yaml and _collection.md frontmatter are present', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-coll-conflict-'));
		await mkdir(join(dir, 'places'), { recursive: true });
		await writeFile(join(dir, 'places', '_collection.yaml'), 'title: From YAML\n');
		await writeFile(
			join(dir, 'places', '_collection.md'),
			'---\ntitle: From Frontmatter\n---\n\nBody.\n'
		);
		await mkdir(join(dir, 'places', 'town'), { recursive: true });
		await writeFile(join(dir, 'places', 'town', 'index.yaml'), 'name: Town\nkind: place\n');
		await writeFile(join(dir, 'places', 'town', 'index.md'), 'A town.\n');

		const { collections, issues } = await loadAll(dir);
		expect(collections.has('places')).toBe(false);
		expect(issues.some((i) => i.detail.includes('pick one'))).toBe(true);
	});
});

describe('loadAll: cluster-scoped wikilinks', () => {
	/**
	 * Two clusters (`aurethia`, `earth`) plus a universal-substrate
	 * folder (`foundation`) declared via `_collection.md` frontmatter.
	 * Exercises in-cluster local resolution, cross-cluster strictness,
	 * universal fallback, and the cluster/universal split surfaced
	 * on the `LoadResult`.
	 */
	async function seedClusters(): Promise<string> {
		const dir = await mkdtemp(join(tmpdir(), 'alteria-clusters-'));

		// Universal substrate.
		await mkdir(join(dir, 'foundation', 'concepts', 'harmonia'), { recursive: true });
		await writeFile(
			join(dir, 'foundation', '_collection.md'),
			'---\ntitle: Foundation\nuniversal: true\n---\nUniversal substrate.\n'
		);
		await writeFile(
			join(dir, 'foundation', 'concepts', 'harmonia', 'index.yaml'),
			'name: Harmonia\nkind: concept\n'
		);
		await writeFile(
			join(dir, 'foundation', 'concepts', 'harmonia', 'index.md'),
			'A foundational concept.\n'
		);

		// Cluster A: aurethia.
		await mkdir(join(dir, 'aurethia', 'places', 'duskmere'), { recursive: true });
		await writeFile(
			join(dir, 'aurethia', 'places', 'duskmere', 'index.yaml'),
			'name: Duskmere\nkind: place\n'
		);
		await writeFile(join(dir, 'aurethia', 'places', 'duskmere', 'index.md'), 'A town.\n');

		await mkdir(join(dir, 'aurethia', 'characters', 'kael'), { recursive: true });
		await writeFile(
			join(dir, 'aurethia', 'characters', 'kael', 'index.yaml'),
			'name: Kael\nkind: character\n'
		);
		// Local bare slug, cross-cluster bare (broken), cross-cluster
		// full path (ok), universal bare slug (ok).
		await writeFile(
			join(dir, 'aurethia', 'characters', 'kael', 'index.md'),
			[
			'Kael walks [[duskmere|Duskmere]] roads,',
			'remembers [[shanghai|Shanghai]],',
			'visits [[earth/places/shanghai|Shanghai]],',
			'and meditates on [[harmonia|Harmonia]].'
			].join(' ')
		);

		// Cluster B: earth.
		await mkdir(join(dir, 'earth', 'places', 'shanghai'), { recursive: true });
		await writeFile(
			join(dir, 'earth', 'places', 'shanghai', 'index.yaml'),
			'name: Shanghai\nkind: place\n'
		);
		await writeFile(join(dir, 'earth', 'places', 'shanghai', 'index.md'), 'A city.\n');

		return dir;
	}

	it('derives clusters from top-level folders and excludes universal substrates', async () => {
		const dir = await seedClusters();
		const { clusters, universalFolders } = await loadAll(dir);
		expect([...clusters].sort()).toEqual(['aurethia', 'earth']);
		expect([...universalFolders].sort()).toEqual(['foundation']);
	});

	it('exposes universal-substrate sub-shelves via Graph.universalShelves()', async () => {
		const dir = await seedClusters();
		const { Graph } = await import('./graph');
		const g = new Graph();
		await g.load(dir);
		expect(g.universalShelves()).toEqual([{ root: 'foundation', shelf: 'concepts' }]);
		// `concepts` now also appears in unionShelves() because universal-
		// substrate folders participate in the union since the engine
		// change that enables combined cluster+universal shelf pages.
		expect(g.unionShelves()).toContain('concepts');
	});

	it('resolves cluster-local bare slugs without cluster prefix', async () => {
		const dir = await seedClusters();
		const { entities } = await loadAll(dir);
		const r = resolveWikilink(
			'duskmere',
			entities,
			'aurethia',
			new Set(['aurethia', 'earth']),
			new Set(['foundation'])
		);
		expect(r).toEqual({ id: 'aurethia/places/duskmere' });
	});

	it('does not resolve cross-cluster bare slugs (strict)', async () => {
		const dir = await seedClusters();
		const { entities } = await loadAll(dir);
		const r = resolveWikilink(
			'shanghai',
			entities,
			'aurethia',
			new Set(['aurethia', 'earth']),
			new Set(['foundation'])
		);
		expect(r.id).toBeNull();
		if (r.id === null) expect(r.reason).toBe('missing-in-cluster');
	});

	it('resolves full cross-cluster paths through the global branch', async () => {
		const dir = await seedClusters();
		const { entities } = await loadAll(dir);
		const r = resolveWikilink(
			'earth/places/shanghai',
			entities,
			'aurethia',
			new Set(['aurethia', 'earth']),
			new Set(['foundation'])
		);
		expect(r).toEqual({ id: 'earth/places/shanghai' });
	});

	it('falls back to universal substrate for bare slugs after in-cluster miss', async () => {
		const dir = await seedClusters();
		const { entities } = await loadAll(dir);
		const r = resolveWikilink(
			'harmonia',
			entities,
			'aurethia',
			new Set(['aurethia', 'earth']),
			new Set(['foundation'])
		);
		expect(r).toEqual({ id: 'foundation/concepts/harmonia' });
	});

	it('treats fromCluster=null (kind/tag/aggregate pages) as global', async () => {
		const dir = await seedClusters();
		const { entities } = await loadAll(dir);
		const r = resolveWikilink(
			'shanghai',
			entities,
			null,
			new Set(['aurethia', 'earth']),
			new Set(['foundation'])
		);
		expect(r).toEqual({ id: 'earth/places/shanghai' });
	});

	it('surfaces broken cluster-local links with a missing-in-cluster issue', async () => {
		const dir = await seedClusters();
		const { issues } = await loadAll(dir);
		const broken = issues.filter(
			(i) => i.kind === 'broken-link' && i.entity === 'aurethia/characters/kael'
		);
		// `[[shanghai]]` from aurethia is the only broken link; the
		// other three (`duskmere`, `earth/places/shanghai`, `harmonia`)
		// all resolve.
		expect(broken.length).toBe(1);
		expect(broken[0].detail).toContain('shanghai');
	});

	it('treats universal-substrate roots as their own scope (bare slugs resolve locally)', async () => {
		// From inside foundation/, a bare slug must resolve against
		// foundation/ itself, not leak to global suffix match. The
		// caller curries fromCluster='foundation' for pages under
		// foundation/ (see graph.clusterOf).
		const dir = await seedClusters();
		const { entities } = await loadAll(dir);
		const r = resolveWikilink(
			'harmonia',
			entities,
			'foundation',
			new Set(['aurethia', 'earth']),
			new Set(['foundation'])
		);
		expect(r).toEqual({ id: 'foundation/concepts/harmonia' });
	});
});

// ---------------------------------------------------------------------------
// validateLangLinks + validateUnlabelledWikilinks (via loadAll end-to-end)
// ---------------------------------------------------------------------------

/**
 * Seed a minimal content tree that exercises lang-tag and label validation:
 *
 *   languages/buunhic  — entity in a `languages` folder, has `code: bu`
 *   species/naya       — entity; slug `naya` passes langShape
 *   characters/freya   — body with:
 *                          [[bu]]         — valid lang code, no label needed ✓
 *                          [[naya|Naya]]  — labelled entity ref ✓
 *                          [[naya]]       — unlabelled entity ref → issue
 *                          [[xy]]         — unregistered lang code → issue
 */
async function seedLangLinkContent(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'alteria-lang-'));

	await mkdir(join(dir, 'languages', 'buunhic'), { recursive: true });
	await writeFile(
		join(dir, 'languages', 'buunhic', 'index.yaml'),
		'name: Buunhic\nkind: language\ncode: bu\n'
	);
	await writeFile(join(dir, 'languages', 'buunhic', 'index.md'), 'A northern tongue.');

	await mkdir(join(dir, 'species', 'naya'), { recursive: true });
	await writeFile(join(dir, 'species', 'naya', 'index.yaml'), 'name: Naya\nkind: species\n');
	await writeFile(join(dir, 'species', 'naya', 'index.md'), 'Ethereal beings of Nareth.');

	await mkdir(join(dir, 'characters', 'freya'), { recursive: true });
	await writeFile(join(dir, 'characters', 'freya', 'index.yaml'), 'name: Freya\nkind: character\n');
	await writeFile(
		join(dir, 'characters', 'freya', 'index.md'),
		'Freya [[bu]] is a knight. She knows the [[naya|Naya]] but also [[naya]] and [[xy]].'
	);

	return dir;
}

describe('validateLangLinks', () => {
	it('does not flag a registered language code', async () => {
		const dir = await seedLangLinkContent();
		const { issues } = await loadAll(dir);
		const langIssues = issues.filter(
			(i) => i.kind === 'broken-link' && i.detail.includes('unknown language code')
		);
		expect(langIssues.some((i) => i.detail.includes('[[bu]]'))).toBe(false);
	});

	it('emits a broken-link issue for an unregistered language code', async () => {
		const dir = await seedLangLinkContent();
		const { issues } = await loadAll(dir);
		const langIssues = issues.filter(
			(i) => i.kind === 'broken-link' && i.detail.includes('unknown language code')
		);
		expect(langIssues.some((i) => i.detail.includes('[[xy]]'))).toBe(true);
		expect(langIssues.every((i) => i.entity === 'characters/freya')).toBe(true);
	});

	it('does not flag a labelled entity wikilink as an unknown lang code', async () => {
		const dir = await seedLangLinkContent();
		const { issues } = await loadAll(dir);
		const langIssues = issues.filter(
			(i) => i.kind === 'broken-link' && i.detail.includes('unknown language code')
		);
		expect(langIssues.some((i) => i.detail.includes('[[naya]]'))).toBe(false);
	});
});

describe('validateUnlabelledWikilinks', () => {
	it('does not flag a lang-code bare wikilink', async () => {
		const dir = await seedLangLinkContent();
		const { issues } = await loadAll(dir);
		const unlabelled = issues.filter(
			(i) => i.kind === 'broken-link' && i.detail.includes('missing label')
		);
		expect(unlabelled.some((i) => i.detail.includes('[[bu]]'))).toBe(false);
	});

	it('flags an unlabelled entity wikilink', async () => {
		const dir = await seedLangLinkContent();
		const { issues } = await loadAll(dir);
		const unlabelled = issues.filter(
			(i) => i.kind === 'broken-link' && i.detail.includes('missing label')
		);
		expect(unlabelled.some((i) => i.detail.includes('[[naya]]'))).toBe(true);
		expect(unlabelled.find((i) => i.detail.includes('[[naya]]'))?.entity).toBe('characters/freya');
	});

	it('does not flag a labelled entity wikilink', async () => {
		const dir = await seedLangLinkContent();
		const { issues } = await loadAll(dir);
		const unlabelled = issues.filter(
			(i) => i.kind === 'broken-link' && i.detail.includes('missing label')
		);
		// [[naya|Naya]] has a label — must not appear
		expect(
			unlabelled.some((i) => i.detail.includes('[[naya]]') && i.detail.includes('|Naya'))
		).toBe(false);
	});
});
