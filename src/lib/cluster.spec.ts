import { describe, it, expect } from 'vitest';
import { readScope, translateUrl, paintAllScope, type ScopeContext } from './cluster';

const ctx: ScopeContext = {
	clusters: ['aurethia', 'earth'],
	unionShelves: ['characters', 'places', 'history'],
	clusterAwarePaths: ['kinds']
};

const params = (s = '') => new URLSearchParams(s);

describe('readScope', () => {
	describe('query takes precedence', () => {
		it('reads ?scope=all as null even when path has cluster prefix', () => {
			expect(readScope('/aurethia/characters/freya', params('scope=all'), ctx)).toBeNull();
		});

		it('reads ?scope=earth as earth even when path is aurethia', () => {
			expect(readScope('/aurethia/characters/freya', params('scope=earth'), ctx)).toBe('earth');
		});

		it('ignores unknown ?scope= values and falls back to path', () => {
			expect(readScope('/aurethia/characters/freya', params('scope=nope'), ctx)).toBe('aurethia');
		});
	});

	describe('path-derived scope', () => {
		it('reads cluster prefix as that cluster', () => {
			expect(readScope('/aurethia/characters/freya', params(), ctx)).toBe('aurethia');
		});

		it('returns null for cross-cluster aggregate shelf', () => {
			expect(readScope('/characters', params(), ctx)).toBeNull();
		});

		it('returns null for generic page (home)', () => {
			expect(readScope('/', params(), ctx)).toBeNull();
		});

		it('returns null for /kinds', () => {
			expect(readScope('/kinds', params(), ctx)).toBeNull();
		});

		it('returns null for /tags/<tag>', () => {
			expect(readScope('/tags/software-engineer', params(), ctx)).toBeNull();
		});
	});
});

describe('translateUrl', () => {
	const url = (pathname: string, search = '', hash = '') => ({ pathname, search, hash });

	describe('switching to All', () => {
		it('strips bare cluster root to /', () => {
			expect(translateUrl(url('/aurethia'), null, ctx)).toBe('/');
		});

		it('strips cluster + single shelf to aggregate', () => {
			expect(translateUrl(url('/aurethia/characters'), null, ctx)).toBe('/characters');
		});

		it('keeps deep cluster URL but marks ?scope=all', () => {
			expect(translateUrl(url('/aurethia/characters/freya'), null, ctx)).toBe(
				'/aurethia/characters/freya?scope=all'
			);
		});

		it('omits ?scope=all on already-aggregate URL', () => {
			expect(translateUrl(url('/characters'), null, ctx)).toBe('/characters');
		});

		it('preserves other query state', () => {
			expect(translateUrl(url('/aurethia/characters', 'view=tree'), null, ctx)).toBe(
				'/characters?view=tree'
			);
		});

		it('preserves hash', () => {
			expect(translateUrl(url('/aurethia/characters/freya', '', '#bio'), null, ctx)).toBe(
				'/aurethia/characters/freya?scope=all#bio'
			);
		});

		it('drops existing ?scope= and replaces', () => {
			expect(translateUrl(url('/aurethia/characters/freya', 'scope=earth'), null, ctx)).toBe(
				'/aurethia/characters/freya?scope=all'
			);
		});

		it('leaves generic pages alone', () => {
			expect(translateUrl(url('/kinds'), null, ctx)).toBe('/kinds');
		});
	});

	describe('switching to a specific cluster', () => {
		it('swaps cluster prefix', () => {
			expect(translateUrl(url('/aurethia/characters'), 'earth', ctx)).toBe('/earth/characters');
		});

		it('prepends cluster to aggregate shelf', () => {
			expect(translateUrl(url('/characters'), 'aurethia', ctx)).toBe('/aurethia/characters');
		});

		it('drops redundant ?scope=', () => {
			expect(translateUrl(url('/characters', 'scope=all'), 'aurethia', ctx)).toBe(
				'/aurethia/characters'
			);
		});

		it('keeps ?scope= when path cannot carry the cluster', () => {
			// `/health` is a generic page (not a union shelf, not a
			// cluster-aware path); selecting Aurethia has no path
			// representation, so we add ?scope=aurethia.
			expect(translateUrl(url('/health'), 'aurethia', ctx)).toBe('/health?scope=aurethia');
		});

		it('translates /kinds to /<cluster>/kinds', () => {
			// /kinds is a cluster-aware synthesized path: there's a
			// per-cluster variant at /<cluster>/kinds that filters to
			// instances within that cluster.
			expect(translateUrl(url('/kinds'), 'aurethia', ctx)).toBe('/aurethia/kinds');
		});

		it('translates /kinds/<id> to /<cluster>/kinds/<id>', () => {
			expect(translateUrl(url('/kinds/human'), 'aurethia', ctx)).toBe('/aurethia/kinds/human');
		});

		it('translates /<cluster>/kinds to /<other-cluster>/kinds', () => {
			expect(translateUrl(url('/aurethia/kinds'), 'earth', ctx)).toBe('/earth/kinds');
		});

		it('strips cluster prefix from /<cluster>/kinds when switching to All', () => {
			expect(translateUrl(url('/aurethia/kinds'), null, ctx)).toBe('/kinds');
		});

		it('strips cluster prefix from /<cluster>/kinds/<id> when switching to All', () => {
			expect(translateUrl(url('/aurethia/kinds/human'), null, ctx)).toBe('/kinds/human');
		});

		it('preserves other query state', () => {
			expect(translateUrl(url('/aurethia/characters', 'view=index'), 'earth', ctx)).toBe(
				'/earth/characters?view=index'
			);
		});
	});
});

describe('paintAllScope', () => {
	it('adds ?scope=all to URL with cluster prefix', () => {
		const url = new URL('http://localhost/aurethia/characters/freya');
		expect(paintAllScope(url, ctx).search).toBe('?scope=all');
	});

	it('leaves URLs without cluster prefix alone', () => {
		const url = new URL('http://localhost/characters');
		expect(paintAllScope(url, ctx).search).toBe('');
	});

	it('leaves URLs that already have ?scope= alone', () => {
		const url = new URL('http://localhost/aurethia/characters/freya?scope=earth');
		expect(paintAllScope(url, ctx).search).toBe('?scope=earth');
	});

	it('preserves other query state', () => {
		const url = new URL('http://localhost/aurethia/characters?view=tree');
		const out = paintAllScope(url, ctx);
		expect(out.searchParams.get('view')).toBe('tree');
		expect(out.searchParams.get('scope')).toBe('all');
	});
});
