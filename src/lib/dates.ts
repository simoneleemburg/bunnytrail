/**
 * Date formatting for temporal relation fields.
 *
 * Converts an ISO-8601 date string (`YYYY-MM-DD`) to a display string using
 * a world-authored format token pattern and the world's UI language locale.
 *
 * Supported tokens (applied longest-match first to avoid ambiguity):
 *   `mmmm` — long month name   ("september" / "September")
 *   `mmm`  — short month name  ("sep" / "Sep")
 *   `YYYY` — 4-digit year      ("1950")
 *   `YY`   — 2-digit year      ("50")
 *   `dd`   — zero-padded day   ("09")
 *   `d`    — bare day          ("9")
 *   `mm`   — zero-padded month ("09")
 *
 * Falls back to the raw ISO string when:
 *   - `dateFormat` is null or empty
 *   - `isoDate` is not a valid `YYYY-MM-DD` string
 */
export function formatDate(
	isoDate: string,
	dateFormat: string | null | undefined,
	language: string
): string {
	if (!dateFormat) return isoDate;

	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
	if (!m) return isoDate;

	const [, yyyy, mm, dd] = m;
	const year = parseInt(yyyy, 10);
	const month = parseInt(mm, 10); // 1-based
	const day = parseInt(dd, 10);

	// Resolve locale from language code (e.g. 'nl' → 'nl-NL').
	// Use a simple BCP 47 tag — Intl accepts bare language subtags.
	const locale = language;

	// Build month name formatters lazily via Intl.
	const shortMonth = (): string =>
		new Intl.DateTimeFormat(locale, { month: 'short' }).format(
			new Date(year, month - 1, 1)
		);

	const longMonth = (): string =>
		new Intl.DateTimeFormat(locale, { month: 'long' }).format(
			new Date(year, month - 1, 1)
		);

	// Replace tokens longest-match first.
	return dateFormat
		.replace(/mmmm/g, longMonth())
		.replace(/mmm/g, shortMonth())
		.replace(/YYYY/g, yyyy)
		.replace(/YY/g, yyyy.slice(2))
		.replace(/dd/g, dd)
		.replace(/d/g, String(day))
		.replace(/mm/g, mm);
}
