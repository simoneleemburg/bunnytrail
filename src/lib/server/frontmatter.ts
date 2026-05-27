/**
 * Helpers for splitting YAML frontmatter from a markdown document.
 *
 * Frontmatter convention is the standard `---`-delimited block at
 * the very start of the file:
 *
 * ```md
 * ---
 * name: Sharazan
 * kind: place
 * ---
 *
 * The bone-white city...
 * ```
 *
 * Rules:
 *   - The opening fence must be on line 1 (no BOM, no leading
 *     whitespace).
 *   - The closing fence (`---` on its own line) must follow.
 *   - When no opening fence is present, or no closing fence is
 *     found, the file is treated as plain markdown — the raw text
 *     is returned as the body and frontmatter is `null`.
 *
 * The helper is intentionally tolerant of a trailing newline after
 * the opening fence and accepts CRLF as well as LF line endings.
 */

export interface FrontmatterSplit {
	/**
	 * The raw frontmatter text (between the fences, exclusive), or
	 * `null` when no frontmatter block is present. May be the empty
	 * string for an explicitly empty block (`---\n---\n`).
	 */
	frontmatter: string | null;
	/**
	 * The post-frontmatter body. When no frontmatter is present this
	 * is the original input unchanged.
	 */
	body: string;
}

const OPENING_FENCE_RE = /^---[ \t]*\r?\n/;
// Match a closing `---` line. Anchored by `^` (with `m` flag) so
// it can sit immediately after the opening fence (the empty
// frontmatter case `---\n---\n`) without requiring a preceding
// newline character.
const CLOSING_FENCE_RE = /^---[ \t]*(?:\r?\n|$)/m;

/**
 * Split a markdown document into its frontmatter (raw YAML text)
 * and body. Pure; no I/O. See module doc for the convention.
 *
 * A leading `---` with no closing fence later in the file is
 * treated as no-frontmatter rather than an error — that way a
 * markdown file that happens to start with a horizontal rule is
 * not penalised. Malformed YAML inside a well-fenced frontmatter
 * block surfaces when the caller hands the text to `parse()`.
 */
export function splitFrontmatter(raw: string): FrontmatterSplit {
	const openingMatch = raw.match(OPENING_FENCE_RE);
	if (!openingMatch || openingMatch.index !== 0) {
		return { frontmatter: null, body: raw };
	}

	const afterOpening = raw.slice(openingMatch[0].length);
	const closingMatch = afterOpening.match(CLOSING_FENCE_RE);
	if (!closingMatch || closingMatch.index === undefined) {
		// No closing fence — fall back to treating the whole input as
		// body. The leading `---` may just be a horizontal rule.
		return { frontmatter: null, body: raw };
	}

	const frontmatter = afterOpening.slice(0, closingMatch.index);
	const body = afterOpening.slice(closingMatch.index + closingMatch[0].length);
	return { frontmatter, body };
}

/**
 * Convenience: returns true iff the input begins with a
 * well-formed frontmatter block (opening + closing fences).
 */
export function hasFrontmatter(raw: string): boolean {
	return splitFrontmatter(raw).frontmatter !== null;
}
