/**
 * Inverse labels for structured kind-link YAML fields.
 *
 * When an entity declares `nativeBeings: [kinds/human]` on its
 * YAML, the `/kinds/human` page shows that entity under a section
 * titled "Native to" — the *inverse* of the field name. The
 * relationship "this place has native beings X" reads, from X's
 * point of view, as "X is native to this place".
 *
 * The table below holds the curated inverse headings. Fields that
 * don't appear get a humanised fallback derived from the field
 * name (`endemicTo` → "Endemic to") so new fields work without a
 * code change, even if the wording reads a little off until it
 * graduates into the table.
 */

const INVERSE_LABELS: Record<string, string> = {
	nativeBeings: 'Native to',
	traits: 'Of trait:'
};

/**
 * The heading shown on a `/kinds/<id>` page for entities that
 * reference this kind via the named YAML field.
 *
 * Falls back to humanising the field name: `camelCase` and
 * `kebab-case` and `snake_case` all become space-separated words,
 * with the first letter capitalised. The fallback is intentionally
 * conservative — it always produces *something* readable, but it
 * doesn't try to grammatically invert the field. When the
 * generated label reads poorly, add an entry to `INVERSE_LABELS`.
 */
export function inverseLabelFor(field: string): string {
	const curated = INVERSE_LABELS[field];
	if (curated) return curated;
	const humanised = field
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/[-_]/g, ' ')
		.toLowerCase();
	return humanised.charAt(0).toUpperCase() + humanised.slice(1);
}
