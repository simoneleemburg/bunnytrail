import { describe, expect, it } from 'vitest';
import { renderBody, renderSummary } from './markdown';

/** Build a resolver from a flat list of known canonical ids. */
function exactResolver(ids: Iterable<string>) {
	const set = new Set(ids);
	return (path: string) => (set.has(path) ? path : null);
}

describe('renderBody', () => {
	const resolve = exactResolver(['characters/kael', 'places/duskmere']);
	const langs = new Map<string, string>([['ot', 'languages/old-tongue']]);

	it('renders an entity wikilink as a plain anchor', () => {
		const html = renderBody('See [[characters/kael]].', resolve, langs);
		expect(html).toContain('<a href="/characters/kael">kael</a>');
		expect(html).not.toContain('data-broken');
	});

	it('renders a labelled wikilink with the given label', () => {
		const html = renderBody('See [[characters/kael|Kael]].', resolve, langs);
		expect(html).toContain('<a href="/characters/kael">Kael</a>');
	});

	it('marks unknown wikilinks as broken', () => {
		const html = renderBody('See [[characters/nobody]].', resolve, langs);
		expect(html).toContain('data-broken="true"');
		expect(html).toContain('href="/characters/nobody"');
	});

	it('renders a known language code as a superscript anchor', () => {
		const html = renderBody('Viynangor Viyar [[ot]] is a Naya.', resolve, langs);
		expect(html).toContain('<sup class="lang-tag">');
		expect(html).toContain('<a href="/languages/old-tongue"');
		expect(html).toContain('>ot</a>');
		expect(html).not.toMatch(/lang-tag[^>]*data-broken/);
	});

	it('marks unknown language codes as broken but still renders', () => {
		const html = renderBody('Something [[nbl]] in the air.', resolve, langs);
		expect(html).toMatch(/<sup class="lang-tag" data-broken="true"[^>]*>nbl<\/sup>/);
	});

	it('does not confuse a language code with a wikilink', () => {
		const html = renderBody('Just [[ot]] here.', resolve, langs);
		// Should be a sup, not an anchor to /ot/... or anything bracketed.
		expect(html).toContain('<sup class="lang-tag">');
		expect(html).not.toContain('href="/ot');
	});

	it('handles a wikilink and a lang tag in the same line', () => {
		const html = renderBody('See [[characters/kael]] [[ot]] for more.', resolve, langs);
		expect(html).toContain('<a href="/characters/kael">kael</a>');
		expect(html).toContain('<sup class="lang-tag">');
	});

	it('renders ordinary markdown unchanged', () => {
		const html = renderBody('# Hello\n\n_world_', resolve, langs);
		expect(html).toContain('<h1 id="hello">Hello</h1>');
		expect(html).toContain('<em>world</em>');
	});

	it('adds id attributes to headings, slugified from their text', () => {
		const html = renderBody('## On the name\n\n### Sibling tongues', resolve, langs);
		expect(html).toContain('<h2 id="on-the-name">On the name</h2>');
		expect(html).toContain('<h3 id="sibling-tongues">Sibling tongues</h3>');
	});

	it('disambiguates duplicate heading slugs with -2, -3, …', () => {
		const html = renderBody('## Notes\n\n## Notes\n\n## Notes', resolve, langs);
		expect(html).toContain('<h2 id="notes">Notes</h2>');
		expect(html).toContain('<h2 id="notes-2">Notes</h2>');
		expect(html).toContain('<h2 id="notes-3">Notes</h2>');
	});

	it('strips diacritics and punctuation when slugifying headings', () => {
		const html = renderBody('## Bayurinda — drowned, but not silent', resolve, langs);
		expect(html).toContain('id="bayurinda-drowned-but-not-silent"');
	});

	it('rewrites a wikilink to the resolved canonical id, not the raw path', () => {
		// `[[places/sharazan]]` written before a move, resolver returns
		// the new canonical id `places/bayurinda/sharazan`. The
		// rendered anchor should point at the new location.
		const resolveWithMove = (path: string) => {
			if (path === 'places/sharazan') return 'places/bayurinda/sharazan';
			return null;
		};
		const html = renderBody('See [[places/sharazan|Sharazan]].', resolveWithMove, langs);
		expect(html).toContain('<a href="/places/bayurinda/sharazan">Sharazan</a>');
		expect(html).not.toContain('href="/places/sharazan"');
	});

	it('resolves a bare-slug wikilink via the suffix-aware resolver', () => {
		// Mimic the production resolver's suffix-match: `[[nuunlau]]`
		// finds `places/regions/nuunlau` even though no slash is in
		// the source.
		const resolveBare = (path: string) => {
			if (path === 'nuunlau') return 'places/regions/nuunlau';
			return null;
		};
		const html = renderBody('See [[nuunlau|Nuunlau]] for context.', resolveBare, langs);
		expect(html).toContain('<a href="/places/regions/nuunlau">Nuunlau</a>');
	});

	it('prefers a registered language code over a bare-slug wikilink', () => {
		// `[[ot]]` is both lang-code shaped and slug-shaped. Lang
		// wins when it is registered, even if a bare-slug resolver
		// would also have matched.
		const resolveAny = (_path: string) => 'characters/ot-the-character';
		const html = renderBody('See [[ot]] for context.', resolveAny, langs);
		expect(html).toContain('<sup class="lang-tag">');
		expect(html).toContain('href="/languages/old-tongue"');
		expect(html).not.toContain('characters/ot-the-character');
	});

	it('treats a bare lang-shaped token that does not resolve as a broken lang tag', () => {
		const html = renderBody('Something [[nbl]] here.', exactResolver([]), langs);
		expect(html).toMatch(/<sup class="lang-tag" data-broken="true"[^>]*>nbl<\/sup>/);
	});

	it('treats a longer bare slug as a broken wikilink, not a broken lang tag', () => {
		// `bayurinda` is 9 chars — outside lang-code shape — so an
		// unresolved bare slug should surface as a broken wikilink.
		const html = renderBody('See [[bayurinda]] for context.', exactResolver([]), langs);
		expect(html).toContain('data-broken="true"');
		expect(html).not.toContain('lang-tag');
	});

	it('appends an anchor fragment to a wikilink href', () => {
		const html = renderBody('See [[characters/kael#early-life|Kael, early]].', resolve, langs);
		expect(html).toContain('<a href="/characters/kael#early-life">Kael, early</a>');
	});

	it('appends an anchor fragment to a bare-slug wikilink href', () => {
		const resolveBare = (path: string) =>
			path === 'bayurinda' ? 'places/celestial/aureth-system/bayurinda' : null;
		const html = renderBody('See [[bayurinda#peoples-of-bayurinda|deep]].', resolveBare, langs);
		expect(html).toContain(
			'<a href="/places/celestial/aureth-system/bayurinda#peoples-of-bayurinda">deep</a>'
		);
	});

	it('renders a same-page anchor wikilink as a relative anchor link', () => {
		const html = renderBody('See [[#section-two|the section]] below.', exactResolver([]), langs);
		expect(html).toContain('<a href="#section-two">the section</a>');
		expect(html).not.toContain('data-broken');
	});

	it('renders a [[kinds/<id>]] wikilink as a link to the kind page', () => {
		const kinds = new Set(['human']);
		const html = renderBody('They are [[kinds/human|human]] still.', resolve, langs, kinds);
		expect(html).toContain('<a href="/kinds/human">human</a>');
		expect(html).not.toContain('data-broken');
	});

	it('uses the kind id as default label for a kind wikilink', () => {
		const kinds = new Set(['human']);
		const html = renderBody('A [[kinds/human]] walks in.', resolve, langs, kinds);
		expect(html).toContain('<a href="/kinds/human">human</a>');
	});

	it('marks an unregistered [[kinds/<id>]] wikilink as broken', () => {
		const kinds = new Set(['human']);
		const html = renderBody('A [[kinds/nope]] appears.', resolve, langs, kinds);
		expect(html).toContain('data-broken="true"');
		expect(html).toContain('href="/kinds/nope"');
	});

	it('does not try to resolve a kind wikilink as an entity', () => {
		// Even with an empty kind registry, `kinds/human` must not be
		// resolved against the entity map — it should render broken,
		// pointing at /kinds/human, not /kinds/human-as-entity.
		const html = renderBody('A [[kinds/human]] walks in.', resolve, langs);
		expect(html).toContain('data-broken="true"');
		expect(html).toContain('href="/kinds/human"');
	});
});

describe('renderSummary', () => {
	const resolve = exactResolver(['characters/kael', 'places/duskmere']);
	const langs = new Map<string, string>([['ot', 'languages/old-tongue']]);

	it('renders markdown italics inline', () => {
		const html = renderSummary('The word _Naya_ is Bayurindan.', resolve, langs);
		expect(html).toContain('<em>Naya</em>');
	});

	it('does not wrap the summary in a <p>', () => {
		const html = renderSummary('A short summary.', resolve, langs);
		expect(html).not.toContain('<p>');
		expect(html).toBe('A short summary.');
	});

	it('renders wikilinks as anchors when stripLinks is false', () => {
		const html = renderSummary('See [[characters/kael]] for context.', resolve, langs);
		expect(html).toContain('<a href="/characters/kael">kael</a>');
	});

	it('renders language tags as superscript anchors when stripLinks is false', () => {
		const html = renderSummary('A word [[ot]] in passing.', resolve, langs);
		expect(html).toContain('<sup class="lang-tag">');
		expect(html).toContain('<a href="/languages/old-tongue"');
	});

	it('strips wikilinks to their label text when stripLinks is true', () => {
		const html = renderSummary('See [[characters/kael|Kael]] for context.', resolve, langs, {
			stripLinks: true
		});
		expect(html).toContain('Kael');
		expect(html).not.toContain('<a ');
	});

	it('strips markdown links to their label when stripLinks is true', () => {
		const html = renderSummary('A language of [Alteria Cognita](/cognita).', resolve, langs, {
			stripLinks: true
		});
		expect(html).toContain('Alteria Cognita');
		expect(html).not.toContain('<a ');
		expect(html).not.toContain('/cognita');
	});

	it('strips the anchor from language tags when stripLinks is true', () => {
		const html = renderSummary('A word [[ot]] in passing.', resolve, langs, { stripLinks: true });
		expect(html).toContain('<sup class="lang-tag"');
		expect(html).toContain('>ot</sup>');
		expect(html).not.toContain('<a ');
	});

	it('marks unknown wikilinks as broken', () => {
		const html = renderSummary('See [[characters/nobody]].', resolve, langs);
		expect(html).toContain('data-broken="true"');
	});

	it('resolves a bare-slug wikilink via the suffix-aware resolver', () => {
		const resolveBare = (path: string) => {
			if (path === 'nuunlau') return 'places/regions/nuunlau';
			return null;
		};
		const html = renderSummary('The deep-water region of [[nuunlau|Nuunlau]].', resolveBare, langs);
		expect(html).toContain('<a href="/places/regions/nuunlau">Nuunlau</a>');
	});

	it('strips a bare-slug wikilink to its label when stripLinks is true', () => {
		const resolveBare = (path: string) => (path === 'nuunlau' ? 'places/regions/nuunlau' : null);
		const html = renderSummary(
			'The deep-water region of [[nuunlau|Nuunlau]].',
			resolveBare,
			langs,
			{ stripLinks: true }
		);
		expect(html).toContain('Nuunlau');
		expect(html).not.toContain('<a ');
	});
});
