import { describe, expect, it } from 'vitest';
import { renderBody, renderSummary } from './markdown';

/** Build a resolver from a flat list of known canonical ids. */
function exactResolver(ids: Iterable<string>) {
	const set = new Set(ids);
	return (path: string) => (set.has(path) ? path : null);
}

/**
 * Match `<a href="<href>" …>`<label>`</a>` regardless of any
 * intermediate attributes (`class`, `data-bt-slug`, `data-bt-kind`,
 * `data-broken`, `title`). Tests pre-date the engine attaching
 * `bt-link` / `data-bt-*` hooks for theming, and we want them to
 * keep passing through future hook additions without churn.
 */
function expectLink(html: string, href: string, label: string) {
	const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`<a href="${escapedHref}"[^>]*>${escapedLabel}</a>`);
	expect(html).toMatch(re);
}

describe('renderBody', () => {
	const resolve = exactResolver(['characters/kael', 'places/duskmere']);
	const langs = new Map<string, string>([['ot', 'languages/old-tongue']]);

	it('renders an entity wikilink as a plain anchor', () => {
		const html = renderBody('See [[characters/kael]].', resolve, langs);
		expectLink(html, '/characters/kael', 'kael');
		expect(html).not.toContain('data-broken');
	});

	it('renders a labelled wikilink with the given label', () => {
		const html = renderBody('See [[characters/kael|Kael]].', resolve, langs);
		expectLink(html, '/characters/kael', 'Kael');
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
		expectLink(html, '/characters/kael', 'kael');
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
		expectLink(html, '/places/bayurinda/sharazan', 'Sharazan');
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
		expectLink(html, '/places/regions/nuunlau', 'Nuunlau');
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
		expectLink(html, '/characters/kael#early-life', 'Kael, early');
	});

	it('appends an anchor fragment to a bare-slug wikilink href', () => {
		const resolveBare = (path: string) =>
			path === 'bayurinda' ? 'places/celestial/aureth-system/bayurinda' : null;
		const html = renderBody('See [[bayurinda#peoples-of-bayurinda|deep]].', resolveBare, langs);
		expectLink(html, '/places/celestial/aureth-system/bayurinda#peoples-of-bayurinda', 'deep');
	});

	it('renders a same-page anchor wikilink as a relative anchor link', () => {
		const html = renderBody('See [[#section-two|the section]] below.', exactResolver([]), langs);
		expectLink(html, '#section-two', 'the section');
		expect(html).not.toContain('data-broken');
	});

	it('renders a [[kinds/<id>]] wikilink as a link to the kind page', () => {
		const kinds = new Set(['human']);
		const html = renderBody('They are [[kinds/human|human]] still.', resolve, langs, kinds);
		expectLink(html, '/kinds/human', 'human');
		expect(html).not.toContain('data-broken');
	});

	it('uses the kind id as default label for a kind wikilink', () => {
		const kinds = new Set(['human']);
		const html = renderBody('A [[kinds/human]] walks in.', resolve, langs, kinds);
		expectLink(html, '/kinds/human', 'human');
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

	describe('bt-link CSS hooks', () => {
		it('attaches bt-link class and data-bt-slug to resolved entity links', () => {
			const html = renderBody('See [[characters/kael]].', resolve, langs);
			// All resolved entity links carry the universal class and
			// the slug data attribute (last path segment).
			expect(html).toMatch(/<a [^>]*class="bt-link"[^>]*data-bt-slug="kael"[^>]*>kael<\/a>/);
		});

		it('attaches data-bt-kind and bt-link--kind-<id> when kindLookup returns a kind', () => {
			const kindLookup = (id: string) => (id === 'characters/kael' ? 'mortal' : undefined);
			const html = renderBody(
				'See [[characters/kael]].',
				resolve,
				langs,
				new Set(),
				undefined,
				undefined,
				kindLookup
			);
			expect(html).toMatch(/class="bt-link bt-link--kind-mortal"/);
			expect(html).toMatch(/data-bt-kind="mortal"/);
			expect(html).toMatch(/data-bt-slug="kael"/);
		});

		it('omits kind hooks when no kindLookup is provided', () => {
			const html = renderBody('See [[characters/kael]].', resolve, langs);
			expect(html).not.toContain('data-bt-kind');
			expect(html).not.toContain('bt-link--kind-');
			// But the universal class and slug are still there.
			expect(html).toContain('class="bt-link"');
			expect(html).toContain('data-bt-slug="kael"');
		});

		it('omits kind hooks when kindLookup returns undefined for an entity', () => {
			const kindLookup = (_id: string) => undefined;
			const html = renderBody(
				'See [[characters/kael]].',
				resolve,
				langs,
				new Set(),
				undefined,
				undefined,
				kindLookup
			);
			expect(html).not.toContain('data-bt-kind');
			expect(html).not.toContain('bt-link--kind-');
			expect(html).toContain('data-bt-slug="kael"');
		});

		it('decorates kind links with bt-link but no slug/kind hooks', () => {
			// /kinds/<id> is an engine route, not an entity id — it
			// gets the universal class for theming "kind chips in
			// prose" but no per-entity hooks.
			const kinds = new Set(['human']);
			const html = renderBody('They are [[kinds/human]] still.', resolve, langs, kinds);
			expect(html).toMatch(/<a [^>]*class="bt-link"[^>]*>human<\/a>/);
			expect(html).not.toContain('data-bt-slug');
			expect(html).not.toContain('data-bt-kind');
		});

		it('does not decorate same-page anchor links', () => {
			const html = renderBody('See [[#section|here]].', resolve, langs);
			// Same-page anchors aren't entity links — leave them alone.
			expect(html).toContain('<a href="#section">here</a>');
			expect(html).not.toContain('bt-link');
		});

		it('decorates broken wikilinks too (so theming applies before resolution)', () => {
			// A wikilink that didn't resolve still gets bt-link hooks
			// derived from the path the author wrote — the slug they
			// pointed at remains a useful theming key even when the
			// target hasn't been authored yet.
			const html = renderBody('See [[characters/nobody]].', resolve, langs);
			expect(html).toMatch(/data-broken="true"/);
			expect(html).toMatch(/data-bt-slug="nobody"/);
			expect(html).toMatch(/class="bt-link"/);
		});

		it('preserves data-broken when decorating a broken link', () => {
			const html = renderBody('See [[characters/nobody]].', resolve, langs);
			// Both attributes coexist on the same anchor.
			expect(html).toMatch(/<a [^>]*data-broken="true"[^>]*>nobody<\/a>/);
			expect(html).toMatch(/<a [^>]*class="bt-link"[^>]*>nobody<\/a>/);
		});
	});

	describe('[[collection:<path>]] fold-out directive', () => {
		const resolveCollection = (path: string) => {
			if (path === 'places/regions/nebelheim') {
				return {
					title: 'Regions of Nebelheim',
					href: '/places/regions/nebelheim',
					bodyHtml: '<p>Continents kept apart by seas, lava streams, and tundra.</p>'
				};
			}
			return null;
		};

		it('expands a known collection directive into a details block', () => {
			const html = renderBody(
				'## Regions\n\n[[collection:places/regions/nebelheim]]\n',
				resolve,
				langs,
				new Set(),
				resolveCollection
			);
			expect(html).toContain('<details class="collection-include">');
			expect(html).toContain('<summary>');
			expect(html).toContain('Regions of Nebelheim');
			expect(html).toContain('href="/places/regions/nebelheim"');
			expect(html).toContain('Continents kept apart');
		});

		it('marks an unknown collection directive as broken', () => {
			const html = renderBody(
				'[[collection:places/regions/nowhere]]\n',
				resolve,
				langs,
				new Set(),
				resolveCollection
			);
			expect(html).toContain('data-broken="true"');
			expect(html).toContain('collection:places/regions/nowhere');
		});

		it('ignores inline (non-line-start) directive occurrences', () => {
			const html = renderBody(
				'See nearby [[collection:places/regions/nebelheim]] for context.',
				resolve,
				langs,
				new Set(),
				resolveCollection
			);
			expect(html).not.toContain('<details');
			// And the text passes through as literal — neither expanded
			// nor turned into an entity wikilink. The brackets simply
			// don't match any of our patterns.
			expect(html).toContain('collection:places/regions/nebelheim');
		});

		it('marks the directive broken when no resolver is supplied', () => {
			const html = renderBody('[[collection:places/regions/nebelheim]]\n', resolve, langs);
			expect(html).toContain('data-broken="true"');
		});
	});

	describe('image src rewriting', () => {
		const base = 'aurethia/places/duskmere';

		it('rewrites a bare image filename to the entity-assets endpoint', () => {
			const html = renderBody('![map](map.svg)', resolve, langs, new Set(), undefined, base);
			expect(html).toContain(`src="/api/entity-assets/${base}/map.svg"`);
		});

		it('strips a leading ./ on sibling images', () => {
			const html = renderBody('![p](./photo.png)', resolve, langs, new Set(), undefined, base);
			expect(html).toContain(`src="/api/entity-assets/${base}/photo.png"`);
		});

		it('rewrites assets/<name> to /api/assets/<name>', () => {
			const html = renderBody(
				'![m](assets/fabric.svg)',
				resolve,
				langs,
				new Set(),
				undefined,
				base
			);
			expect(html).toContain('src="/api/assets/fabric.svg"');
		});

		it('leaves absolute URLs alone', () => {
			const html = renderBody(
				'![ext](https://example.com/x.png)',
				resolve,
				langs,
				new Set(),
				undefined,
				base
			);
			expect(html).toContain('src="https://example.com/x.png"');
		});

		it('leaves root-rooted paths alone', () => {
			const html = renderBody('![s](/static/foo.png)', resolve, langs, new Set(), undefined, base);
			expect(html).toContain('src="/static/foo.png"');
		});

		it('leaves bare srcs alone when no imageBaseDir is supplied', () => {
			const html = renderBody('![x](map.svg)', resolve, langs);
			expect(html).toContain('src="map.svg"');
		});

		it('does not rewrite non-image extensions', () => {
			const html = renderBody('![x](notes.txt)', resolve, langs, new Set(), undefined, base);
			expect(html).toContain('src="notes.txt"');
		});

		it('refuses path-traversal in srcs', () => {
			const html = renderBody('![x](../secret.png)', resolve, langs, new Set(), undefined, base);
			expect(html).toContain('src="../secret.png"');
			expect(html).not.toContain('/api/entity-assets');
		});

		it('rewrites a multi-segment content-relative path to /api/entity-assets', () => {
			const html = renderBody(
				'![map](foundation/fabric/primitives/mundus/mundus-map.svg)',
				resolve,
				langs
			);
			expect(html).toContain(
				'src="/api/entity-assets/foundation/fabric/primitives/mundus/mundus-map.svg"'
			);
		});

		it('rewrites a multi-segment content-relative path even without imageBaseDir', () => {
			// Guides call renderBody with no imageBaseDir; multi-segment paths
			// must still resolve.
			const html = renderBody(
				'![m](some/nested/path/image.png)',
				resolve,
				langs,
				new Set(),
				undefined,
				undefined
			);
			expect(html).toContain('src="/api/entity-assets/some/nested/path/image.png"');
		});

		it('does not rewrite multi-segment paths with path-traversal', () => {
			const html = renderBody('![x](some/../secret.png)', resolve, langs);
			// The `..` guard fires before Rule 2.5; src is left as-is.
			expect(html).toContain('src="some/../secret.png"');
			expect(html).not.toContain('/api/entity-assets');
		});

		it('rewrites a bare filename to /api/guide-assets when imageBaseEndpoint is guide-assets', () => {
			const html = renderBody(
				'![map](clusters-map.svg)',
				resolve,
				langs,
				new Set(),
				undefined,
				'cognita',
				undefined,
				'guide-assets'
			);
			expect(html).toContain('src="/api/guide-assets/cognita/clusters-map.svg"');
		});

		it('still rewrites multi-segment paths to /api/entity-assets regardless of endpoint', () => {
			// Rule 2.5 (multi-segment) always uses entity-assets; guide-assets
			// endpoint only affects bare filenames (Rule 3).
			const html = renderBody(
				'![m](foundation/fabric/primitives/mundus/map.svg)',
				resolve,
				langs,
				new Set(),
				undefined,
				'cognita',
				undefined,
				'guide-assets'
			);
			expect(html).toContain(
				'src="/api/entity-assets/foundation/fabric/primitives/mundus/map.svg"'
			);
		});
	});

	describe('wikilinks inside raw HTML chrome', () => {
		it('rescues a wikilink inside a <dt> block as a real anchor', () => {
			const html = renderBody(
				'<dl>\n  <dt>[[characters/kael|Kael]]</dt>\n  <dd>The hero.</dd>\n</dl>',
				resolve,
				langs
			);
			expectLink(html, '/characters/kael', 'Kael');
			expect(html).not.toContain('[Kael](');
		});

		it('rescues a wikilink inside a <dd> block as a real anchor', () => {
			const html = renderBody(
				'<dl>\n  <dt>Hero</dt>\n  <dd>See [[characters/kael|Kael]] for context.</dd>\n</dl>',
				resolve,
				langs
			);
			expectLink(html, '/characters/kael', 'Kael');
		});

		it('marks an unresolved wikilink inside chrome as broken', () => {
			const html = renderBody(
				'<dl>\n  <dt>[[characters/nobody|Ghost]]</dt>\n  <dd>x</dd>\n</dl>',
				resolve,
				langs
			);
			expect(html).toMatch(/<a href="\/characters\/nobody"[^>]*data-broken="true"[^>]*>Ghost<\/a>/);
		});

		it('rescues a plain markdown link inside chrome (no wikilink required)', () => {
			const html = renderBody(
				'<dl>\n  <dt>External</dt>\n  <dd>See [the docs](https://example.com).</dd>\n</dl>',
				resolve,
				langs
			);
			expect(html).toContain('<a href="https://example.com">the docs</a>');
		});

		it('rescues links inside <figcaption>', () => {
			const html = renderBody(
				'<figure>\n  <img src="/x.png" alt="x">\n  <figcaption>See [[characters/kael|Kael]].</figcaption>\n</figure>',
				resolve,
				langs
			);
			expectLink(html, '/characters/kael', 'Kael');
		});

		it('leaves [text](url) outside chrome tags alone (marked handles those)', () => {
			// Plain markdown links in ordinary prose should already be
			// real anchors after marked.parse — this test guards
			// against double-processing.
			const html = renderBody('See [Kael](/characters/kael) please.', resolve, langs);
			const matches = html.match(/<a href="\/characters\/kael"[^>]*>Kael<\/a>/g);
			expect(matches).toHaveLength(1);
		});
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
		expectLink(html, '/characters/kael', 'kael');
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
		expectLink(html, '/places/regions/nuunlau', 'Nuunlau');
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
