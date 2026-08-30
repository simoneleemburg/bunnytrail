import { describe, expect, it } from 'vitest';
import { compareCardRank } from './collectionPage.helpers';

type Item = { rank: number | null; label: string };

const getRank = (i: Item) => i.rank;
const getLabel = (i: Item) => i.label;

describe('compareCardRank', () => {
	it('sorts ranked items ascending by rank when descending is false', () => {
		const items: Item[] = [
			{ rank: 3, label: 'Zeta' },
			{ rank: 1, label: 'Alpha' },
			{ rank: 2, label: 'Mu' }
		];
		expect(items.sort(compareCardRank(getRank, getLabel, false)).map((i) => i.label)).toEqual([
			'Alpha',
			'Mu',
			'Zeta'
		]);
	});

	it('sorts ranked items descending by rank when descending is true', () => {
		const items: Item[] = [
			{ rank: 3, label: 'Zeta' },
			{ rank: 1, label: 'Alpha' },
			{ rank: 2, label: 'Mu' }
		];
		expect(items.sort(compareCardRank(getRank, getLabel, true)).map((i) => i.label)).toEqual([
			'Zeta',
			'Mu',
			'Alpha'
		]);
	});

	it('falls back to alphabetical (or reverse-alphabetical) order for unranked items', () => {
		const items: Item[] = [
			{ rank: null, label: 'Zeta' },
			{ rank: null, label: 'Alpha' },
			{ rank: null, label: 'Mu' }
		];
		expect(items.sort(compareCardRank(getRank, getLabel, false)).map((i) => i.label)).toEqual([
			'Alpha',
			'Mu',
			'Zeta'
		]);
		expect(items.sort(compareCardRank(getRank, getLabel, true)).map((i) => i.label)).toEqual([
			'Zeta',
			'Mu',
			'Alpha'
		]);
	});

	it('always places ranked items before unranked ones, regardless of direction', () => {
		const items: Item[] = [
			{ rank: null, label: 'Alpha' },
			{ rank: 99, label: 'Zeta' }
		];
		expect(items.sort(compareCardRank(getRank, getLabel, false)).map((i) => i.label)).toEqual([
			'Zeta',
			'Alpha'
		]);
		expect(items.sort(compareCardRank(getRank, getLabel, true)).map((i) => i.label)).toEqual([
			'Zeta',
			'Alpha'
		]);
	});
});
