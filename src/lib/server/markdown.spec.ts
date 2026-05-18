import { describe, expect, it } from 'vitest';
import { renderBody } from './markdown';

describe('renderBody', () => {
	const known = new Set<string>(['characters/kael', 'places/duskmere']);
	const langs = new Map<string, string>([['ot', 'languages/old-tongue']]);

	it('renders an entity wikilink as a plain anchor', () => {
		const html = renderBody('See [[characters/kael]].', known, langs);
		expect(html).toContain('<a href="/characters/kael">kael</a>');
		expect(html).not.toContain('data-broken');
	});

	it('renders a labelled wikilink with the given label', () => {
		const html = renderBody('See [[characters/kael|Kael]].', known, langs);
		expect(html).toContain('<a href="/characters/kael">Kael</a>');
	});

	it('marks unknown wikilinks as broken', () => {
		const html = renderBody('See [[characters/nobody]].', known, langs);
		expect(html).toContain('data-broken="true"');
		expect(html).toContain('href="/characters/nobody"');
	});

	it('renders a known language code as a superscript anchor', () => {
		const html = renderBody('Viynangor Viyar [[ot]] is a Naya.', known, langs);
		expect(html).toContain('<sup class="lang-tag">');
		expect(html).toContain('<a href="/languages/old-tongue"');
		expect(html).toContain('>ot</a>');
		expect(html).not.toMatch(/lang-tag[^>]*data-broken/);
	});

	it('marks unknown language codes as broken but still renders', () => {
		const html = renderBody('Something [[nbl]] in the air.', known, langs);
		expect(html).toMatch(/<sup class="lang-tag" data-broken="true"[^>]*>nbl<\/sup>/);
	});

	it('does not confuse a language code with a wikilink', () => {
		const html = renderBody('Just [[ot]] here.', known, langs);
		// Should be a sup, not an anchor to /ot/... or anything bracketed.
		expect(html).toContain('<sup class="lang-tag">');
		expect(html).not.toContain('href="/ot');
	});

	it('handles a wikilink and a lang tag in the same line', () => {
		const html = renderBody('See [[characters/kael]] [[ot]] for more.', known, langs);
		expect(html).toContain('<a href="/characters/kael">kael</a>');
		expect(html).toContain('<sup class="lang-tag">');
	});

	it('renders ordinary markdown unchanged', () => {
		const html = renderBody('# Hello\n\n_world_', known, langs);
		expect(html).toContain('<h1 id="hello">Hello</h1>');
		expect(html).toContain('<em>world</em>');
	});

	it('adds id attributes to headings, slugified from their text', () => {
		const html = renderBody('## On the name\n\n### Sibling tongues', known, langs);
		expect(html).toContain('<h2 id="on-the-name">On the name</h2>');
		expect(html).toContain('<h3 id="sibling-tongues">Sibling tongues</h3>');
	});

	it('disambiguates duplicate heading slugs with -2, -3, …', () => {
		const html = renderBody('## Notes\n\n## Notes\n\n## Notes', known, langs);
		expect(html).toContain('<h2 id="notes">Notes</h2>');
		expect(html).toContain('<h2 id="notes-2">Notes</h2>');
		expect(html).toContain('<h2 id="notes-3">Notes</h2>');
	});

	it('strips diacritics and punctuation when slugifying headings', () => {
		const html = renderBody('## Bayurinda — drowned, but not silent', known, langs);
		expect(html).toContain('id="bayurinda-drowned-but-not-silent"');
	});
});
