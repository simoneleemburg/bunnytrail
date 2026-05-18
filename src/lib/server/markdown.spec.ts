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
});
