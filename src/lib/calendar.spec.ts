import { describe, it, expect } from 'vitest';
import {
	inputTokens,
	calendarDateFromRaw,
	parseCalendarDate,
	toAbsoluteDay,
	formatCalendarDate
} from './calendar';
import type { CalendarSpec } from './server/world';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * The Revelant Calendar (Alteria):
 *   Eve → Year (resets per Eve) → Circle (9/year) → Arc (3/circle) → Day (21/arc)
 *   567 days/year, 63 days/circle, 21 days/arc
 *
 * Eves:
 *   1st Eve: 88 years
 *   2nd Eve: 120 years
 *   3rd Eve: 95 years
 *   4th Eve: 60 years
 *   5th Eve: 200 years
 *   6th Eve: open-ended (current)
 *
 * Example date: Sixth Eve, Year 143 — Fifth Circle Rising, Day 12
 *   → tuple [6, 143, 5, 2, 12]
 */
const revelantSpec: CalendarSpec = {
	name: 'The Revelant Calendar',
	eves: [
		{ ref: 1, years: 88 },
		{ ref: 2, years: 120 },
		{ ref: 3, years: 95 },
		{ ref: 4, years: 60 },
		{ ref: 5, years: 200 },
		{ ref: 6, years: null }
	],
	units: [
		{ unit: 'eve' },
		{ unit: 'year' },
		{ unit: 'circle', per: 9 },
		{ unit: 'arc', per: 3 },
		{ unit: 'day', per: 21 }
	],
	input: 'E-Y-C-A-D',
	display: '{E:ordinal} Eve, Year {Y} — {C:ordinal} Circle {A:mapped}, Day {D}',
	tokens: {
		E: { numeral: 'ordinal' },
		C: { numeral: 'ordinal' },
		A: { numeral: 'mapped', values: ['Low', 'Rising', 'Returning'] }
	}
};

/**
 * A minimal 3-unit calendar for pure fold arithmetic testing.
 * Units: era (no per) → phase (4/era) → step (10/phase)
 * 40 steps/era.
 */
const simpleSpec: CalendarSpec = {
	units: [{ unit: 'era' }, { unit: 'phase', per: 4 }, { unit: 'step', per: 10 }],
	input: 'A-B-C',
	display: 'Era {A}, Phase {B}, Step {C}'
};

// ── inputTokens ───────────────────────────────────────────────────────────────

describe('inputTokens', () => {
	it('splits a dash-separated token string', () => {
		expect(inputTokens('E-Y-C-A-D')).toEqual(['E', 'Y', 'C', 'A', 'D']);
	});

	it('handles other separator characters', () => {
		expect(inputTokens('A/B/C')).toEqual(['A', 'B', 'C']);
	});

	it('handles single token', () => {
		expect(inputTokens('Y')).toEqual(['Y']);
	});
});

// ── calendarDateFromRaw ───────────────────────────────────────────────────────

describe('calendarDateFromRaw', () => {
	it('parses explicit object form', () => {
		const result = calendarDateFromRaw(
			{ calendar: 'revelant', value: [6, 143, 5, 2, 12] },
			null
		);
		expect(result).toEqual({ calendar: 'revelant', value: [6, 143, 5, 2, 12] });
	});

	it('parses shorthand string with default calendar', () => {
		const result = calendarDateFromRaw('6-143-5-2-12', 'revelant');
		expect(result).toEqual({ calendar: 'revelant', value: [6, 143, 5, 2, 12] });
	});

	it('returns null for ISO-8601 date strings', () => {
		expect(calendarDateFromRaw('1950-01-15', 'revelant')).toBeNull();
	});

	it('returns null for shorthand string without a default calendar', () => {
		expect(calendarDateFromRaw('6-143-5-2-12', null)).toBeNull();
	});

	it('returns null for unrecognised shapes', () => {
		expect(calendarDateFromRaw(42, 'revelant')).toBeNull();
		expect(calendarDateFromRaw(null, 'revelant')).toBeNull();
	});

	it('parses tuple in value field as array', () => {
		const result = calendarDateFromRaw({ calendar: 'revelant', value: [1, 1, 1, 1, 1] }, null);
		expect(result?.value).toEqual([1, 1, 1, 1, 1]);
	});
});

// ── parseCalendarDate ─────────────────────────────────────────────────────────

describe('parseCalendarDate', () => {
	it('validates a well-formed Revelant date', () => {
		const result = parseCalendarDate({ calendar: 'revelant', value: [6, 143, 5, 2, 12] }, revelantSpec);
		expect(result.ok).toBe(true);
	});

	it('rejects wrong tuple length — too many values', () => {
		// Too many is still an error
		const result = parseCalendarDate({ calendar: 'revelant', value: [6, 143, 5, 2, 12, 99] }, revelantSpec);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors[0]).toMatch(/too many/);
	});

	it('rejects eve out of range', () => {
		const result = parseCalendarDate({ calendar: 'revelant', value: [7, 1, 1, 1, 1] }, revelantSpec);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors[0]).toMatch(/eve 7/i);
	});

	it('rejects year exceeding the eve length', () => {
		// Eve 4 only has 60 years
		const result = parseCalendarDate({ calendar: 'revelant', value: [4, 61, 1, 1, 1] }, revelantSpec);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors[0]).toMatch(/60 years in Eve 4/);
	});

	it('accepts any year in the open-ended current eve', () => {
		// Eve 6 has years: null — no upper bound
		const result = parseCalendarDate({ calendar: 'revelant', value: [6, 9999, 1, 1, 1] }, revelantSpec);
		expect(result.ok).toBe(true);
	});

	it('rejects circle > 9', () => {
		const result = parseCalendarDate({ calendar: 'revelant', value: [1, 1, 10, 1, 1] }, revelantSpec);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors[0]).toMatch(/circle 10 exceeds maximum of 9/i);
	});

	it('rejects arc > 3', () => {
		const result = parseCalendarDate({ calendar: 'revelant', value: [1, 1, 1, 4, 1] }, revelantSpec);
		expect(result.ok).toBe(false);
	});

	it('rejects day > 21', () => {
		const result = parseCalendarDate({ calendar: 'revelant', value: [1, 1, 1, 1, 22] }, revelantSpec);
		expect(result.ok).toBe(false);
	});

	it('rejects non-positive values', () => {
		const result = parseCalendarDate({ calendar: 'revelant', value: [0, 1, 1, 1, 1] }, revelantSpec);
		expect(result.ok).toBe(false);
	});
});

// ── toAbsoluteDay ─────────────────────────────────────────────────────────────

describe('toAbsoluteDay', () => {
	// Epoch: Eve 1, Year 1, Circle 1, Arc 1, Day 1 → absolute day 0
	it('epoch date folds to 0', () => {
		const date = { calendar: 'revelant', value: [1, 1, 1, 1, 1] };
		expect(toAbsoluteDay(date, revelantSpec)).toBe(0);
	});

	it('increments by 1 per day', () => {
		const d1 = { calendar: 'revelant', value: [1, 1, 1, 1, 1] };
		const d2 = { calendar: 'revelant', value: [1, 1, 1, 1, 2] };
		expect(toAbsoluteDay(d2, revelantSpec) - toAbsoluteDay(d1, revelantSpec)).toBe(1);
	});

	it('increments by 21 per arc', () => {
		const d1 = { calendar: 'revelant', value: [1, 1, 1, 1, 1] };
		const d2 = { calendar: 'revelant', value: [1, 1, 1, 2, 1] };
		expect(toAbsoluteDay(d2, revelantSpec) - toAbsoluteDay(d1, revelantSpec)).toBe(21);
	});

	it('increments by 63 per circle (3 arcs × 21 days)', () => {
		const d1 = { calendar: 'revelant', value: [1, 1, 1, 1, 1] };
		const d2 = { calendar: 'revelant', value: [1, 1, 2, 1, 1] };
		expect(toAbsoluteDay(d2, revelantSpec) - toAbsoluteDay(d1, revelantSpec)).toBe(63);
	});

	it('increments by 567 per year (9 circles × 63 days)', () => {
		const d1 = { calendar: 'revelant', value: [1, 1, 1, 1, 1] };
		const d2 = { calendar: 'revelant', value: [1, 2, 1, 1, 1] };
		expect(toAbsoluteDay(d2, revelantSpec) - toAbsoluteDay(d1, revelantSpec)).toBe(567);
	});

	it('increments by 88×567 per Eve when crossing from Eve 1 to Eve 2', () => {
		const lastDayEve1 = { calendar: 'revelant', value: [1, 88, 9, 3, 21] };
		const firstDayEve2 = { calendar: 'revelant', value: [2, 1, 1, 1, 1] };
		// Eve 1 has 88 years → 88 × 567 = 49,896 days
		const gap = toAbsoluteDay(firstDayEve2, revelantSpec) - toAbsoluteDay(lastDayEve1, revelantSpec);
		expect(gap).toBe(1); // last day of Eve 1 + 1 = first day of Eve 2
	});

	it('absolute day for [1, 88, 9, 3, 21] = 88×567 − 1', () => {
		const d = { calendar: 'revelant', value: [1, 88, 9, 3, 21] };
		expect(toAbsoluteDay(d, revelantSpec)).toBe(88 * 567 - 1);
	});

	// Simple 3-unit calendar (no eves)
	it('simple spec: epoch folds to 0', () => {
		expect(toAbsoluteDay({ calendar: 'simple', value: [1, 1, 1] }, simpleSpec)).toBe(0);
	});

	it('simple spec: second era = 40 steps', () => {
		expect(toAbsoluteDay({ calendar: 'simple', value: [2, 1, 1] }, simpleSpec)).toBe(40);
	});

	it('simple spec: second phase within era 1 = 10 steps', () => {
		expect(toAbsoluteDay({ calendar: 'simple', value: [1, 2, 1] }, simpleSpec)).toBe(10);
	});

	// Ordering: earlier dates must have smaller absolute day
	it('earlier Revelant dates produce smaller sort keys', () => {
		const early = { calendar: 'revelant', value: [3, 10, 2, 1, 5] };
		const late = { calendar: 'revelant', value: [5, 150, 7, 3, 18] };
		expect(toAbsoluteDay(early, revelantSpec)).toBeLessThan(toAbsoluteDay(late, revelantSpec));
	});
});

// ── Partial dates ─────────────────────────────────────────────────────────────

describe('partial dates', () => {
	it('parseCalendarDate: accepts a partial tuple', () => {
		const result = parseCalendarDate({ calendar: 'revelant', value: [6, 143] }, revelantSpec);
		expect(result.ok).toBe(true);
	});

	it('parseCalendarDate: accepts a single-unit (eve-only) tuple', () => {
		const result = parseCalendarDate({ calendar: 'revelant', value: [3] }, revelantSpec);
		expect(result.ok).toBe(true);
	});

	it('parseCalendarDate: rejects an empty tuple', () => {
		const result = parseCalendarDate({ calendar: 'revelant', value: [] }, revelantSpec);
		expect(result.ok).toBe(false);
	});

	it('parseCalendarDate: rejects a tuple longer than the spec', () => {
		const result = parseCalendarDate({ calendar: 'revelant', value: [6, 143, 5, 2, 12, 99] }, revelantSpec);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors[0]).toMatch(/too many/);
	});

	it('toAbsoluteDay: partial [6, 143] folds to same as [6, 143, 1, 1, 1]', () => {
		const partial = { calendar: 'revelant', value: [6, 143] };
		const full = { calendar: 'revelant', value: [6, 143, 1, 1, 1] };
		expect(toAbsoluteDay(partial, revelantSpec)).toBe(toAbsoluteDay(full, revelantSpec));
	});

	it('toAbsoluteDay: partial sorts before more specific dates in same year', () => {
		const yearOnly = { calendar: 'revelant', value: [6, 143] };
		const specific = { calendar: 'revelant', value: [6, 143, 1, 1, 2] }; // day 2
		expect(toAbsoluteDay(yearOnly, revelantSpec)).toBeLessThan(toAbsoluteDay(specific, revelantSpec));
	});

	it('toAbsoluteDay: eve-only partial sorts before any year within that eve', () => {
		const eveOnly = { calendar: 'revelant', value: [3] };
		const firstDayEve3 = { calendar: 'revelant', value: [3, 1, 1, 1, 1] };
		expect(toAbsoluteDay(eveOnly, revelantSpec)).toBe(toAbsoluteDay(firstDayEve3, revelantSpec));
	});

	it('formatCalendarDate: partial [6, 143] — unspecified tokens render empty, literals stay', () => {
		const date = { calendar: 'revelant', value: [6, 143] };
		const result = formatCalendarDate(date, revelantSpec);
		expect(result).toContain('Sixth Eve');
		expect(result).toContain('Year 143');
		// The token {C:ordinal} renders empty, but the literal word "Circle" in the
		// template stays — the template is " Circle " not just "{C:ordinal}".
		// What's absent is the rendered ordinal value (e.g. "Fifth").
		expect(result).not.toMatch(/Fifth|First|Second|Third|Fourth/); // no circle ordinal
		expect(result).not.toMatch(/Low|Rising|Returning/); // no arc
	});

	it('formatCalendarDate: partial [6, 143, 5] shows circle but not arc/day', () => {
		const date = { calendar: 'revelant', value: [6, 143, 5] };
		const result = formatCalendarDate(date, revelantSpec);
		expect(result).toContain('Fifth');
		expect(result).not.toMatch(/Low|Rising|Returning/);
	});
});


// ── displayByPrecision ────────────────────────────────────────────────────────

describe('displayByPrecision', () => {
	// Plain-string entries (backwards-compatible)
	const specPlain: CalendarSpec = {
		...revelantSpec,
		displayByPrecision: {
			1: '{E:ordinal} Eve',
			2: '{E:ordinal} Eve, Year {Y}',
			3: '{E:ordinal} Eve, Year {Y} — {C:ordinal} Circle',
			5: '{E:ordinal} Eve, Year {Y} — {C:ordinal} Circle {A:mapped}, Day {D}'
		}
	};

	// Object entries with separate heading / display variants
	const specObj: CalendarSpec = {
		...revelantSpec,
		displayByPrecision: {
			1: { heading: 'The {E:ordinal} Eve', display: '{E:ordinal} Eve' },
			2: { heading: '{E:ordinal} Eve, Year {Y}', display: 'Year {Y} of the {E:ordinal} Eve' },
			5: { heading: '{E:ordinal} Eve, Year {Y} — {C:ordinal} Circle {A:mapped}, Day {D}', display: 'Year {Y}, {C:ordinal} Circle {A:mapped}, Day {D}' }
		}
	};

	// ── plain string entries ──────────────────────────────────────────────────
	it('plain: precision 1 display variant', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6] }, specPlain))
			.toBe('Sixth Eve');
	});
	it('plain: precision 1 heading variant same as display', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6] }, specPlain, 'heading'))
			.toBe('Sixth Eve');
	});
	it('plain: precision 2 display variant', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6, 143] }, specPlain))
			.toBe('Sixth Eve, Year 143');
	});
	it('plain: precision 3 display variant', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6, 143, 5] }, specPlain))
			.toBe('Sixth Eve, Year 143 — Fifth Circle');
	});
	it('plain: precision 4 falls back to top-level display (no 4-key entry)', () => {
		const result = formatCalendarDate({ calendar: 'revelant', value: [6, 143, 5, 2] }, specPlain);
		expect(result).toContain('Sixth Eve, Year 143');
		expect(result).toContain('Fifth Circle Rising');
		expect(result).not.toMatch(/Day \d/);
	});
	it('plain: precision 5 display variant', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6, 143, 5, 2, 12] }, specPlain))
			.toBe('Sixth Eve, Year 143 — Fifth Circle Rising, Day 12');
	});

	// ── object entries ────────────────────────────────────────────────────────
	it('object: precision 1 display variant', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6] }, specObj))
			.toBe('Sixth Eve');
	});
	it('object: precision 1 heading variant', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6] }, specObj, 'heading'))
			.toBe('The Sixth Eve');
	});
	it('object: precision 2 display variant', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6, 143] }, specObj))
			.toBe('Year 143 of the Sixth Eve');
	});
	it('object: precision 2 heading variant', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6, 143] }, specObj, 'heading'))
			.toBe('Sixth Eve, Year 143');
	});
	it('object: precision 5 display variant', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6, 143, 5, 2, 12] }, specObj))
			.toBe('Year 143, Fifth Circle Rising, Day 12');
	});
	it('object: precision 5 heading variant', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6, 143, 5, 2, 12] }, specObj, 'heading'))
			.toBe('Sixth Eve, Year 143 — Fifth Circle Rising, Day 12');
	});
	it('object with only heading key: display falls back to heading', () => {
		const spec: CalendarSpec = {
			...revelantSpec,
			displayByPrecision: { 2: { heading: '{E:ordinal} Eve, Year {Y}' } }
		};
		expect(formatCalendarDate({ calendar: 'revelant', value: [6, 143] }, spec))
			.toBe('Sixth Eve, Year 143');
	});
	it('object with only display key: heading falls back to display', () => {
		const spec: CalendarSpec = {
			...revelantSpec,
			displayByPrecision: { 2: { display: 'Year {Y} of the {E:ordinal} Eve' } }
		};
		expect(formatCalendarDate({ calendar: 'revelant', value: [6, 143] }, spec, 'heading'))
			.toBe('Year 143 of the Sixth Eve');
	});
	it('missing precision key falls back to top-level display for both variants', () => {
		expect(formatCalendarDate({ calendar: 'revelant', value: [6, 143] }, revelantSpec))
			.toContain('Sixth Eve, Year 143');
		expect(formatCalendarDate({ calendar: 'revelant', value: [6, 143] }, revelantSpec, 'heading'))
			.toContain('Sixth Eve, Year 143');
	});
});

describe('formatCalendarDate', () => {
	it('renders the example date correctly', () => {
		const date = { calendar: 'revelant', value: [6, 143, 5, 2, 12] };
		expect(formatCalendarDate(date, revelantSpec)).toBe(
			'Sixth Eve, Year 143 — Fifth Circle Rising, Day 12'
		);
	});

	it('renders ordinal tokens', () => {
		const date = { calendar: 'revelant', value: [1, 1, 1, 1, 1] };
		const result = formatCalendarDate(date, revelantSpec);
		expect(result).toMatch(/^First Eve/);
		expect(result).toMatch(/First Circle/);
	});

	it('renders mapped arc names', () => {
		const d1 = { calendar: 'revelant', value: [1, 1, 1, 1, 1] };
		const d2 = { calendar: 'revelant', value: [1, 1, 1, 2, 1] };
		const d3 = { calendar: 'revelant', value: [1, 1, 1, 3, 1] };
		expect(formatCalendarDate(d1, revelantSpec)).toMatch(/Low/);
		expect(formatCalendarDate(d2, revelantSpec)).toMatch(/Rising/);
		expect(formatCalendarDate(d3, revelantSpec)).toMatch(/Returning/);
	});

	it('renders cardinal token without override', () => {
		const date = { calendar: 'revelant', value: [1, 77, 1, 1, 1] };
		const result = formatCalendarDate(date, revelantSpec);
		expect(result).toContain('Year 77');
	});

	it('passes through — unspecified tokens render as empty string', () => {
		// Tokens for units not in the value render as '' (not left as {UNKNOWN})
		const spec: CalendarSpec = {
			units: [{ unit: 'year' }],
			input: 'Y',
			display: '{Y} / {UNKNOWN}'
		};
		const date = { calendar: 'test', value: [5] };
		// {UNKNOWN} is not a token in this spec's input — treated as unspecified → ''
		expect(formatCalendarDate(date, spec)).toBe('5 / ');
	});

	it('simple spec: renders without token overrides', () => {
		const date = { calendar: 'simple', value: [2, 3, 7] };
		expect(formatCalendarDate(date, simpleSpec)).toBe('Era 2, Phase 3, Step 7');
	});
});
