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

import type { CalendarSpec, CalendarDisplayEntry } from './server/world';
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
 * Partial tuples (fewer values than units) are valid — missing trailing
 * units are treated as "unspecified". Returns the validated date on
 * success, or a list of error messages.
 */
export function parseCalendarDate(
	date: CalendarDate,
	spec: CalendarSpec
): CalendarDateResult {
	const errors: string[] = [];
	const tokens = inputTokens(spec.input);

	if (date.value.length === 0) {
		errors.push(`Calendar '${date.calendar}': value must have at least one unit`);
		return { ok: false, errors };
	}

	if (date.value.length > spec.units.length) {
		errors.push(
			`Calendar '${date.calendar}': too many values — expected at most ${spec.units.length} (${tokens.join('-')}), got ${date.value.length}`
		);
		return { ok: false, errors };
	}

	for (let i = 0; i < date.value.length; i++) {
		const unit = spec.units[i];
		const val = date.value[i];

		if (!Number.isInteger(val) || val < 1) {
			errors.push(`Calendar '${date.calendar}': ${unit.unit} must be a positive integer, got ${val}`);
			continue;
		}

		// Unit with an irregular table: validate instance index against table length
		if (unit.irregular && unit.irregular.length > 0) {
			if (val > unit.irregular.length) {
				errors.push(
					`Calendar '${date.calendar}': ${unit.unit} ${val} exceeds the ${unit.irregular.length} defined segments`
				);
			}
			continue;
		}

		// Child of an irregular parent: validate against that parent segment's values (if known)
		const parentUnit = i > 0 ? spec.units[i - 1] : undefined;
		if (parentUnit?.irregular && parentUnit.irregular.length > 0) {
			const parentIndex = date.value[i - 1] - 1; // parent value is 1-based
			const parentEntry = parentUnit.irregular[parentIndex];
			if (parentEntry && parentEntry.values !== null && val > parentEntry.values) {
				errors.push(
					`Calendar '${date.calendar}': ${unit.unit} ${val} exceeds ${parentEntry.values} in ${parentUnit.unit} ${date.value[i - 1]}`
				);
			}
			continue;
		}

		// Fixed-per unit: validate against the per multiplier
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
 * Partial tuples (fewer values than units) are padded with `1` for all
 * missing trailing units, placing the date at the *start* of the
 * specified period. E.g. `[6, 143]` folds to the first day of
 * Sixth Eve, Year 143.
 */
export function toAbsoluteDay(date: CalendarDate, spec: CalendarSpec): number {
	// Pad the tuple to full length with 1s for unspecified trailing units.
	const n = spec.units.length;
	const vals = date.value.length < n
		? [...date.value, ...new Array(n - date.value.length).fill(1)]
		: date.value;
	const units = spec.units;

	// Build unit sizes (number of smallest units per each unit level).
	// Process bottom-up: the last unit has size 1; each parent = per * child.
	// For units whose size is governed by an irregular parent, we handle them
	// via the irregular table instead of a fixed per.
	const unitSize: number[] = new Array(n).fill(1);
	for (let i = n - 2; i >= 0; i--) {
		const childSize = unitSize[i + 1];
		const per = units[i + 1].per;
		if (typeof per === 'number') {
			unitSize[i] = per * childSize;
		} else {
			// Variable per (child of an irregular unit): handled below
			unitSize[i] = childSize; // placeholder
		}
	}

	// Find the first unit with an irregular table (if any).
	// When present, the child of that unit has a variable per, so we fold
	// the first two levels specially (sum prior segment values) and then
	// fold the remaining fixed-per levels normally.
	const irregUnitIdx = units.findIndex((u) => u.irregular && u.irregular.length > 0);

	if (irregUnitIdx !== -1 && n > irregUnitIdx + 1) {
		const irregUnit = units[irregUnitIdx];
		const segmentIdx = vals[irregUnitIdx] - 1; // 0-based
		const childWithinSegment = vals[irregUnitIdx + 1] - 1; // 0-based

		// Sum segment values from all prior segments to get absolute child count.
		let priorChildUnits = 0;
		for (let s = 0; s < segmentIdx && s < irregUnit.irregular!.length; s++) {
			const entry = irregUnit.irregular![s];
			// open-ended entries can only be the last, so we'll never need to
			// sum past them; bail safely if we somehow encounter one.
			if (entry.values === null) break;
			priorChildUnits += entry.values;
		}
		const absoluteChildUnit = priorChildUnits + childWithinSegment;

		// Compute the size of the child unit in smallest units (fixed-per chain below it).
		let childUnitSize = 1;
		for (let i = irregUnitIdx + 2; i < n; i++) {
			const per = units[i].per;
			if (typeof per === 'number') childUnitSize *= per;
		}

		// Compute the sub-child-unit offset from the remaining fixed-per levels.
		const fixedUnitSize: number[] = new Array(n).fill(1);
		for (let i = n - 2; i >= irregUnitIdx + 2; i--) {
			const per = units[i + 1].per;
			if (typeof per === 'number') {
				fixedUnitSize[i] = per * fixedUnitSize[i + 1];
			}
		}
		let subChildDay = 0;
		for (let i = irregUnitIdx + 2; i < n; i++) {
			subChildDay += (vals[i] - 1) * fixedUnitSize[i];
		}

		return absoluteChildUnit * childUnitSize + subChildDay;
	}

	// No irregular units — all units have fixed `per` multipliers. Simple fold.
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

function toOrdinalShort(n: number): string {
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
 * Render a token value according to its `CalendarTokenDef`, with an optional
 * inline hint from the template (e.g. `:ordinal-short`) that takes priority
 * over the def's `numeral` field. `mapped` always requires the def's `values`
 * array, so a hint of `mapped` without a def falls back to cardinal.
 */
function renderToken(
	value: number,
	tokenId: string,
	spec: CalendarSpec,
	hintOverride?: string
): string {
	const def = spec.tokens?.[tokenId];
	const numeral = hintOverride ?? def?.numeral ?? 'cardinal';

	switch (numeral) {
		case 'cardinal':
			return String(value);
		case 'ordinal':
			return toOrdinalWord(value);
		case 'ordinal-short':
			return toOrdinalShort(value);
		case 'roman':
			return toRoman(value);
		case 'mapped': {
			const values = def?.values ?? [];
			const idx = value - 1; // 1-based → 0-based
			return idx >= 0 && idx < values.length ? values[idx] : String(value);
		}
		default:
			return String(value);
	}
}

/** Pick the display string from a `CalendarDisplayEntry` for a given variant. */
function entryTemplate(entry: CalendarDisplayEntry, variant: 'heading' | 'display'): string | undefined {
	if (typeof entry === 'string') return entry;
	return entry[variant] ?? (variant === 'heading' ? entry.display : entry.heading);
}

/**
 * Format a `CalendarDate` using the spec's display template.
 *
 * `variant`:
 * - `'display'` (default) — picks the `display` key in a `displayByPrecision`
 *   object entry, or the plain string, or the top-level `display` fallback.
 * - `'heading'` — picks the `heading` key first, falls back to `display` key,
 *   then to the top-level `display`.
 *
 * Tokens for unspecified units render as empty string.
 *
 * Example:
 *   "Sixth Eve, Year 143 — Fifth Circle Rising, Day 12"
 */
export function formatCalendarDate(
	date: CalendarDate,
	spec: CalendarSpec,
	variant: 'heading' | 'display' = 'display'
): string {
	// Pick the template: precision-keyed entry first, fallback to display.
	const precision = date.value.length;
	const entry = spec.displayByPrecision?.[precision];
	const template = (entry !== undefined ? entryTemplate(entry, variant) : undefined) ?? spec.display;

	// Build a map from token letter → unit value (only for provided units).
	const tokens = inputTokens(spec.input);
	const tokenValues: Record<string, number> = {};
	for (let i = 0; i < tokens.length && i < date.value.length; i++) {
		tokenValues[tokens[i]] = date.value[i];
	}
	// Set of token letters that were actually provided (for partial-date check).
	const providedTokens = new Set(Object.keys(tokenValues));

	// Replace {TOKEN} or {TOKEN:hint} in the chosen template.
	// Tokens for unspecified units render as empty string.
	// The inline hint (e.g. :ordinal-short) overrides the spec's tokens def.
	return template.replace(/\{([A-Za-z0-9]+)(?::([^}]*))?\}/g, (_match, tok: string, hint: string | undefined) => {
		const upper = tok.toUpperCase();
		const key = providedTokens.has(upper) ? upper : providedTokens.has(tok) ? tok : null;
		if (key === null) return ''; // unit not provided — omit
		return renderToken(tokenValues[key], upper, spec, hint ?? undefined);
	});
}

/**
 * Convenience: format a `CalendarDate` given the full `CustomCalendarsConfig`
 * (looks up the spec by id). Returns the tuple as a dash-joined string if
 * the calendar id is not found.
 */
export function formatCalendarDateById(
	date: CalendarDate,
	calendars: Record<string, CalendarSpec>,
	variant: 'heading' | 'display' = 'display'
): string {
	const spec = calendars[date.calendar];
	if (!spec) return date.value.join('-');
	return formatCalendarDate(date, spec, variant);
}
