/**
 * Custom calendar support for Bunnytrail worlds.
 *
 * A world may define one or more named calendar systems in its
 * `content_meta/world.md` under the `customCalendars` key. Each calendar
 * is a sequence of units (big → small) with fixed multipliers, except for
 * the top-level "eve" unit which has a variable year count per eve declared
 * in an explicit `eves` table.
 *
 * This module is **client-safe** (no Node.js imports) and mirrors the
 * shape of `dates.ts` for ISO-8601 dates.
 *
 * Key operations:
 *   - `parseCalendarDate`   — validate a raw tuple against the spec
 *   - `toAbsoluteDay`       — fold a validated tuple to a sortable integer
 *   - `formatCalendarDate`  — render a validated tuple via the display template
 *   - `calendarDateFromRaw` — parse raw frontmatter into a CalendarDate
 */

import type { CalendarSpec, EveDef } from './server/world';
import { toRoman } from './types';

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * A structured calendar date: a reference to a named calendar plus the
 * ordered tuple of unit values (big → small, matching the calendar's `units`
 * array).
 *
 * Authored in frontmatter as:
 *   date: { calendar: revelant, value: [6, 143, 5, 2, 12] }
 * or as a shorthand string against the default calendar:
 *   date: "6-143-5-2-12"
 */
export interface CalendarDate {
	/** The calendar id as declared in `customCalendars.calendars`. */
	calendar: string;
	/**
	 * Ordered tuple of unit values (big → small).
	 * Length must equal the number of units in the calendar spec.
	 */
	value: number[];
}

/**
 * Result of `parseCalendarDate`. Either a validated `CalendarDate` or a
 * list of error messages for health-page reporting.
 */
export type CalendarDateResult =
	| { ok: true; date: CalendarDate }
	| { ok: false; errors: string[] };

// ── Input parsing ─────────────────────────────────────────────────────────────

/**
 * Extract the ordered list of token letters from a calendar's `input` string.
 * E.g. "E-Y-C-A-D" → ["E", "Y", "C", "A", "D"].
 * Tokens are any contiguous run of alphanumeric characters between separators.
 */
export function inputTokens(input: string): string[] {
	return input.match(/[A-Za-z0-9]+/g) ?? [];
}

/**
 * Parse a raw frontmatter value into a `CalendarDate`.
 *
 * Accepts:
 *   - An object `{ calendar: string, value: number[] | string }` — explicit form.
 *   - A string like "6-143-5-2-12" — shorthand; requires `defaultCalendar` to
 *     know which calendar to assign.
 *
 * Returns `null` when the value is not recognisable as a calendar date (e.g.
 * it's an ISO-8601 string "1950-01-15") so callers can fall through to ISO
 * handling.
 */
export function calendarDateFromRaw(
	raw: unknown,
	defaultCalendar: string | null
): CalendarDate | null {
	if (raw === null || raw === undefined) return null;

	// Explicit object form: { calendar: "revelant", value: [6, 143, 5, 2, 12] }
	if (typeof raw === 'object' && !Array.isArray(raw)) {
		const o = raw as Record<string, unknown>;
		const cal = typeof o['calendar'] === 'string' ? o['calendar'].trim() : null;
		if (!cal) return null;
		const valRaw = o['value'];
		const tuple = parseTuple(valRaw);
		if (!tuple) return null;
		return { calendar: cal, value: tuple };
	}

	// Shorthand string form: "6-143-5-2-12"
	if (typeof raw === 'string') {
		// Must not look like an ISO-8601 date (YYYY-MM-DD).
		if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return null;
		const tuple = parseTuple(raw);
		if (!tuple || !defaultCalendar) return null;
		return { calendar: defaultCalendar, value: tuple };
	}

	return null;
}

/** Parse a tuple from a number array or a separator-delimited string. */
function parseTuple(raw: unknown): number[] | null {
	if (Array.isArray(raw)) {
		if (raw.every((v) => typeof v === 'number' && Number.isInteger(v))) {
			return raw as number[];
		}
		return null;
	}
	if (typeof raw === 'string') {
		// Split on any run of non-digit characters used as separators.
		// Numbers themselves may be negative (leading minus), but in practice
		// calendar tuple values are always positive. We treat any '-' that sits
		// between two digit runs as a separator, not a minus sign.
		const parts = raw.trim().split(/[^0-9]+/);
		const nums: number[] = [];
		for (const p of parts) {
			if (p === '') continue;
			const n = parseInt(p, 10);
			if (isNaN(n)) return null;
			nums.push(n);
		}
		return nums.length > 0 ? nums : null;
	}
	return null;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a `CalendarDate` tuple against a `CalendarSpec`.
 * Returns the validated date on success, or a list of error messages.
 */
export function parseCalendarDate(
	date: CalendarDate,
	spec: CalendarSpec
): CalendarDateResult {
	const errors: string[] = [];
	const tokens = inputTokens(spec.input);

	if (date.value.length !== spec.units.length) {
		errors.push(
			`Calendar '${date.calendar}': expected ${spec.units.length} values (${tokens.join('-')}), got ${date.value.length}`
		);
		return { ok: false, errors };
	}

	for (let i = 0; i < spec.units.length; i++) {
		const unit = spec.units[i];
		const val = date.value[i];

		if (!Number.isInteger(val) || val < 1) {
			errors.push(`Calendar '${date.calendar}': ${unit.unit} must be a positive integer, got ${val}`);
			continue;
		}

		// Top unit (eve): validate against eves table length
		if (i === 0 && spec.eves && spec.eves.length > 0) {
			if (val > spec.eves.length) {
				errors.push(
					`Calendar '${date.calendar}': eve ${val} exceeds the ${spec.eves.length} defined eves`
				);
			}
			continue;
		}

		// Year within an eve: validate against that eve's years (if known)
		if (i === 1 && spec.eves && spec.eves.length > 0) {
			const eveIndex = date.value[0] - 1; // eve is 1-based
			const eveDef = spec.eves[eveIndex] as EveDef | undefined;
			if (eveDef && eveDef.years !== null && val > eveDef.years) {
				errors.push(
					`Calendar '${date.calendar}': year ${val} exceeds ${eveDef.years} years in Eve ${date.value[0]}`
				);
			}
			continue;
		}

		// Other units: validate against the `per` multiplier of this unit
		const per = unit.per;
		if (typeof per === 'number' && val > per) {
			errors.push(
				`Calendar '${date.calendar}': ${unit.unit} ${val} exceeds maximum of ${per}`
			);
		}
	}

	if (errors.length > 0) return { ok: false, errors };
	return { ok: true, date };
}

// ── Absolute-day fold ─────────────────────────────────────────────────────────

/**
 * Fold a validated calendar date tuple to a single sortable integer:
 * the absolute day count from the calendar's epoch (day 0 = first value of
 * every unit at 1).
 *
 * The fold multiplies out the unit hierarchy from smallest to largest.
 * For the Revelant calendar (eves → years → circles → arcs → days):
 *
 *   absoluteYear = Σ(years of all prior eves) + (year − 1)
 *   absoluteDay  = absoluteYear·(circles·arcs·days)
 *                + (circle−1)·(arcs·days)
 *                + (arc−1)·days
 *                + (day−1)
 *
 * Units without a `per` (the top unit, and year-within-eve when eves are
 * declared) are handled specially via the `eves` table.
 */
export function toAbsoluteDay(date: CalendarDate, spec: CalendarSpec): number {
	const vals = date.value;
	const units = spec.units;

	// Build unit sizes (number of smallest units per each unit level).
	// Process bottom-up: the last unit has size 1; each parent = per * child.
	// For the year unit (index 1 when eves exist), per is variable — we
	// handle it via the eves table instead.
	const n = units.length;
	const unitSize: number[] = new Array(n).fill(1);
	for (let i = n - 2; i >= 0; i--) {
		const childSize = unitSize[i + 1];
		const per = units[i + 1].per;
		if (typeof per === 'number') {
			unitSize[i] = per * childSize;
		} else {
			// Variable per (year-within-eve): we handle this below
			unitSize[i] = childSize; // placeholder
		}
	}

	// If the calendar has an eves table, the top two units (eve + year) fold
	// differently: year resets per eve, so we compute absolute year first.
	const hasEves = spec.eves && spec.eves.length > 0;

	if (hasEves && n >= 2) {
		const eveIndex = vals[0] - 1; // 0-based
		const yearWithinEve = vals[1] - 1; // 0-based

		// Sum all years from prior eves.
		let priorYears = 0;
		for (let e = 0; e < eveIndex && e < spec.eves!.length; e++) {
			const eveDef = spec.eves![e];
			// If years is null (open-ended), we can't compute further — just use
			// what we have (the open eve is always the last, so nothing is after it).
			if (eveDef.years === null) break;
			priorYears += eveDef.years;
		}
		const absoluteYear = priorYears + yearWithinEve;

		// Smallest-unit size for everything below "year" (i.e. the day multiplier
		// per year, e.g. 567 for 9×3×21).
		const daysPerYear = unitSize[2] !== undefined ? unitSize[1] : 1;
		// unitSize[1] was set to unitSize[2] (placeholder) above; recompute from
		// the remaining fixed units.
		let daysPerYearActual = 1;
		for (let i = 2; i < n; i++) {
			const per = units[i].per;
			if (typeof per === 'number') daysPerYearActual *= per;
		}
		// unitSize[2..n-1] are the days-per-unit for circle, arc, day, etc.
		// We need to compute the contribution of units[2..n-1].
		let subYearDay = 0;
		let multiplier = 1;
		// Walk from the smallest unit upwards (index n-1 down to 2).
		// unitSize[i] = number of smallest units in one of unit[i].
		const fixedUnitSize: number[] = new Array(n).fill(1);
		for (let i = n - 2; i >= 2; i--) {
			const per = units[i + 1].per;
			if (typeof per === 'number') {
				fixedUnitSize[i] = per * fixedUnitSize[i + 1];
			}
		}
		for (let i = 2; i < n; i++) {
			subYearDay += (vals[i] - 1) * fixedUnitSize[i];
		}

		return absoluteYear * daysPerYearActual + subYearDay;
	}

	// No eves — all units have fixed `per` multipliers. Simple fold.
	let result = 0;
	for (let i = 0; i < n; i++) {
		result += (vals[i] - 1) * unitSize[i];
	}
	return result;
}

// ── Display formatting ────────────────────────────────────────────────────────

// English ordinal suffixes (1st, 2nd, 3rd, 4th, …)
const EN_ORDINAL_WORDS = [
	'First', 'Second', 'Third', 'Fourth', 'Fifth',
	'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
	'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth',
	'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth',
	'Twenty-First', 'Twenty-Second', 'Twenty-Third', 'Twenty-Fourth', 'Twenty-Fifth',
	'Twenty-Sixth', 'Twenty-Seventh', 'Twenty-Eighth', 'Twenty-Ninth', 'Thirtieth'
];

function toOrdinalWord(n: number): string {
	if (n >= 1 && n <= EN_ORDINAL_WORDS.length) return EN_ORDINAL_WORDS[n - 1];
	// Fallback: numeric ordinal for large values
	const s = String(n);
	const last = n % 10;
	const tens = Math.floor(n / 10) % 10;
	if (tens === 1) return `${s}th`;
	if (last === 1) return `${s}st`;
	if (last === 2) return `${s}nd`;
	if (last === 3) return `${s}rd`;
	return `${s}th`;
}

/**
 * Render a token value according to its `CalendarTokenDef`.
 */
function renderToken(
	value: number,
	tokenId: string,
	spec: CalendarSpec
): string {
	const def = spec.tokens?.[tokenId];
	const numeral = def?.numeral ?? 'cardinal';

	switch (numeral) {
		case 'cardinal':
			return String(value);
		case 'ordinal':
			return toOrdinalWord(value);
		case 'roman':
			return toRoman(value);
		case 'mapped': {
			const values = def?.values ?? [];
			const idx = value - 1; // 1-based → 0-based
			return idx >= 0 && idx < values.length ? values[idx] : String(value);
		}
	}
}

/**
 * Format a `CalendarDate` to a display string using the calendar's `display`
 * template.
 *
 * The template uses `{TOKEN}` for the token's primary rendering (per its
 * `tokens` entry, or cardinal if absent). Literal text passes through unchanged.
 *
 * Example template: "{E:ordinal} Eve, Year {Y} — {C:ordinal} Circle {A:mapped}, Day {D}"
 * With tokens: E=6, Y=143, C=5, A=2, D=12 →
 *   "Sixth Eve, Year 143 — Fifth Circle Rising, Day 12"
 */
export function formatCalendarDate(date: CalendarDate, spec: CalendarSpec): string {
	// Build a map from token letter → unit value.
	const tokens = inputTokens(spec.input);
	const tokenValues: Record<string, number> = {};
	for (let i = 0; i < tokens.length && i < date.value.length; i++) {
		tokenValues[tokens[i]] = date.value[i];
	}

	// Replace {TOKEN} or {TOKEN:hint} in the display template.
	// The :hint is purely documentary (the actual rendering is controlled by
	// the `tokens` map on the spec), so we ignore it during rendering.
	return spec.display.replace(/\{([A-Za-z0-9]+)(?::[^}]*)?\}/g, (_match, tok: string) => {
		const upper = tok.toUpperCase();
		const value = tokenValues[upper] ?? tokenValues[tok];
		if (value === undefined) return _match; // unknown token: leave as-is
		return renderToken(value, upper, spec);
	});
}

/**
 * Convenience: format a `CalendarDate` given the full `CustomCalendarsConfig`
 * (looks up the spec by id). Returns the tuple as a dash-joined string if
 * the calendar id is not found.
 */
export function formatCalendarDateById(
	date: CalendarDate,
	calendars: Record<string, CalendarSpec>
): string {
	const spec = calendars[date.calendar];
	if (!spec) return date.value.join('-');
	return formatCalendarDate(date, spec);
}
