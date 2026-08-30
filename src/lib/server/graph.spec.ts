import { describe, expect, it } from 'vitest';
import type { Entity } from '$lib/types';
import { byRankThenName, byRankThenNameDesc, rankComparator } from './graph';

/** Minimal fake entity — the comparators only ever read `id`/`meta`. */
function fake(id: string, name: string, rank?: number): Entity {
	return { id, meta: { name, rank } } as unknown as Entity;
}

describe('byRankThenName', () => {
	it('sorts ranked entities ascending by rank', () => {
		const entities = [fake('a', 'Zeta', 3), fake('b', 'Alpha', 1), fake('c', 'Mu', 2)];
		expect(entities.sort(byRankThenName).map((e) => e.id)).toEqual(['b', 'c', 'a']);
	});

	it('sorts unranked entities alphabetically by name', () => {
		const entities = [fake('a', 'Zeta'), fake('b', 'Alpha'), fake('c', 'Mu')];
		expect(entities.sort(byRankThenName).map((e) => e.id)).toEqual(['b', 'c', 'a']);
	});

	it('always places ranked entities before unranked ones', () => {
		const entities = [fake('a', 'Alpha'), fake('b', 'Zeta', 99)];
		expect(entities.sort(byRankThenName).map((e) => e.id)).toEqual(['b', 'a']);
	});
});

describe('byRankThenNameDesc', () => {
	it('sorts ranked entities descending by rank', () => {
		const entities = [fake('a', 'Zeta', 3), fake('b', 'Alpha', 1), fake('c', 'Mu', 2)];
		expect(entities.sort(byRankThenNameDesc).map((e) => e.id)).toEqual(['a', 'c', 'b']);
	});

	it('sorts unranked entities reverse-alphabetically by name', () => {
		const entities = [fake('a', 'Zeta'), fake('b', 'Alpha'), fake('c', 'Mu')];
		expect(entities.sort(byRankThenNameDesc).map((e) => e.id)).toEqual(['a', 'c', 'b']);
	});

	it('still places ranked entities before unranked ones', () => {
		// Descending reverses ordering *within* each group, not the
		// ranked-before-unranked precedence itself.
		const entities = [fake('a', 'Alpha'), fake('b', 'Zeta', 99)];
		expect(entities.sort(byRankThenNameDesc).map((e) => e.id)).toEqual(['b', 'a']);
	});
});

describe('rankComparator', () => {
	it('returns the ascending comparator when descending is false', () => {
		expect(rankComparator(false)).toBe(byRankThenName);
	});

	it('returns the descending comparator when descending is true', () => {
		expect(rankComparator(true)).toBe(byRankThenNameDesc);
	});
});
