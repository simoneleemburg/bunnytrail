import { readFile, stat } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { EraConfig, EraDef, ClusterEras, HealthIssue } from '$lib/types';
import { defaultWorldConfigPath } from './globals';
import { splitFrontmatter } from './frontmatter';
import { renderPlainBody, type LinkResolver } from './markdown';

/**
 * Identity and chrome for the world being rendered.
 *
 * Authored as a single file at `<world>/content_meta/world.md`:
 *
 *     ---
 *     name: Alteria
 *     tagline: My sacred universe of imagination.
 *     shortName: Alteria          # optional; defaults to name
 *     allScopeLabel: All Alteria  # optional; defaults to "All ${name}"
 *     ornament:
 *       wordmark: logo.svg       # optional; asset filename for the masthead SVG logo
 *       world_mark: "❦"          # optional; glyph before the world name (text wordmark only)
 *       nav_sep: "✶"             # optional; separator glyph between nav links and Kinds; defaults to "·"
 *       glyph: "✶"               # optional; unicode glyph for fleurons sitewide
 *       svg: rule.svg            # optional; asset filename for SVG fleuron sitewide
 *       guides:
 *         glyph: "⌖"             # optional; override glyph for guide fleurons only
 *         svg: guide-mark.svg    # optional; override SVG for guide fleurons only
 *     ---
 *
 *     Three paragraphs of homepage lede prose, rendered as the hero
 *     paragraph block on the homepage.
 *
 * When the file is missing or malformed, the engine falls back to a
 * generic "Bunnytrail" identity so a freshly scaffolded world still
 * renders coherently — the author can fill in `world.md` at leisure.
 */

export interface OrnamentConfig {
	/**
	 * Asset filename for the masthead SVG logo, e.g. "logo.svg".
	 * When set, the engine inlines the SVG in place of the text wordmark.
	 * The link still carries `aria-label` with the world name.
	 * Replaces the previously hardcoded `"wordmark.svg"` lookup convention.
	 */
	wordmark: string | null;
	/**
	 * Separator glyph between the folder nav links and the Kinds link.
	 * Defaults to "·" when null. Set to a custom glyph (e.g. "✶") in
	 * world.md to theme the masthead separator without touching theme.css.
	 */
	navSep: string | null;
	/** Unicode glyph shown before the world name in the text wordmark.
	 * Only used when `wordmark` (SVG) is absent. When set, the engine
	 * injects `--wordmark-mark` and makes the `.wordmark-mark`
	 * pseudo-element visible via a `<style>` tag in `<svelte:head>`.
	 */
	worldMark: string | null;
	/** Unicode glyph, e.g. "✶". Fed into the --ornament-glyph CSS token. */
	glyph: string | null;
	/** Asset filename to load as an inline SVG, e.g. "rule.svg". */
	svg: string | null;
	/** Per-page-type overrides. Currently only guides is supported. */
	guides: {
		glyph: string | null;
		svg: string | null;
	};
}

/**
 * A single entry in an `irregular` segment table on a `CalendarUnit`.
 * When a unit is divided into irregularly-sized segments (e.g. eves with
 * different year-counts), each entry names one segment and declares how
 * many child units it contains.
 */
export interface IrregularEntry {
	/** 1-based reference number for this segment. */
	ref: number;
	/**
	 * How many child units this segment contains.
	 * `null` = open-ended (last/current segment, no upper bound).
	 * The engine uses this to compute absolute offsets for sorting.
	 */
	values: number | null;
}

/**
 * A single unit in the calendar hierarchy. Units are ordered big → small.
 * The top unit has no `per`; every other unit either declares a fixed `per`
 * or inherits its size from its parent's `irregular` table.
 */
export interface CalendarUnit {
	/** Lowercase unit identifier, e.g. "eve", "year", "circle", "arc", "day". */
	unit: string;
	/**
	 * How many of this unit fit inside one of the parent unit.
	 * Omit on the top-level unit or when the parent is irregular.
	 */
	per?: number | null;
	/**
	 * When set, this unit is divided into named, irregularly-sized segments.
	 * Each entry gives the number of child units for one segment instance.
	 * The last entry may have `values: null` for an open-ended current segment.
	 *
	 * Example: an "eve" unit with different year-counts per eve.
	 */
	irregular?: IrregularEntry[];
}

/**
 * A single token override for display rendering. Only needed when a token
 * should render as something other than a plain cardinal number.
 */
export interface CalendarTokenDef {
	/**
	 * How to render this unit by default (when no inline hint is given):
	 * - `cardinal`      — plain integer (default; no entry needed)
	 * - `ordinal`       — "First", "Second", etc.
	 * - `ordinal-short` — "1st", "2nd", "3rd", …
	 * - `roman`         — Roman numeral (I, II, III, …)
	 * - `mapped`        — look up from `values` array (1-based index)
	 */
	numeral: 'cardinal' | 'ordinal' | 'ordinal-short' | 'roman' | 'mapped';
	/**
	 * Default display strings for `mapped` (1-based index).
	 * Used by `{T:mapped}` and by `{T}` when `numeral: mapped`.
	 */
	values?: string[];
	/**
	 * Named display-string arrays for `mapped`.
	 * Each key is a mapping name; its value is a 1-based list of strings.
	 * Referenced in format templates as `{T:mapped.name}`.
	 *
	 * Example:
	 *   mappings:
	 *     short: [L, A, R]
	 *     long:  [Low, Rising, Returning]
	 *     label: [The Low Eve, The Rising Eve, The Returning Eve]
	 */
	mappings?: Record<string, string[]>;
}

/**
 * A single entry in `displayByPrecision`. Can be:
 * - a plain string — used for both heading and display variants
 * - an object with `heading` and/or `display` — lets you phrase the date
 *   differently in a page title vs. a timeline list entry.
 *   Missing variant falls back to the other, then to `CalendarSpec.display`.
 */
export type CalendarDisplayEntry =
	| string
	| { heading?: string; display?: string };


/**
 * A fully-specified custom calendar. The engine uses this to:
 *   1. Parse a date tuple from frontmatter (validate ranges).
 *   2. Fold a tuple to a single absolute-day integer (timeline sort key).
 *   3. Format a tuple to a display string via the `display` template.
 */
export interface CalendarSpec {
	/** Human-readable name, e.g. "The Revelant Calendar". */
	name?: string;
	/**
	 * Unit definitions ordered big → small.
	 * Example: [eve, year, circle, arc, day]
	 * A unit may carry an `irregular` table to declare variable segment sizes.
	 */
	units: CalendarUnit[];
	/**
	 * Separator-joined token ids that describe the input tuple order.
	 * E.g. "E-Y-C-A-D" means the tuple is [eve, year, circle, arc, day].
	 */
	input: string;
	/**
	 * Display template used when no `displayByPrecision` entry matches.
	 * Use `{TOKEN}` for cardinal rendering, `{TOKEN:hint}` to reference a
	 * `tokens` override. Literal text passes through unchanged.
	 * Example: "{E:ordinal} Eve, Year {Y} — {C:ordinal} Circle {A:mapped}, Day {D}"
	 */
	display: string;
	/**
	 * Optional per-precision display templates. Keys are the number of units
	 * provided in the date tuple (1 = top-unit only, 2 = top two units, …).
	 * Each entry is either a plain string (used for both heading and display
	 * variants) or `{ heading, display }` for distinct phrasing.
	 * Falls back to `display` when no entry matches, or when an object entry
	 * is missing the requested variant.
	 */
	displayByPrecision?: Record<number, CalendarDisplayEntry>;
	/**
	 * Token overrides. Keys are the uppercase token letters from `input`.
	 * Only needed for non-cardinal rendering. Cardinals need no entry.
	 */
	tokens?: Record<string, CalendarTokenDef>;
}

/**
 * The `customCalendars` block in `content_meta/world.md`.
 * Worlds may define multiple calendars; each entity or timeline may reference
 * one by its id (key in `calendars`). The `default` id is used when no
 * explicit calendar is specified.
 */
export interface CustomCalendarsConfig {
	/** Id of the calendar used when no explicit `calendar:` field is present. */
	default: string | null;
	/** Map from calendar id to its spec. */
	calendars: Record<string, CalendarSpec>;
}

export interface WorldConfig {
	name: string;
	shortName: string;
	/**
	 * Optional display title for the home page hero `<h1>`. When set,
	 * shown in place of `name` on the homepage only — useful when the
	 * masthead wordmark is a short identifier (e.g. "Leemburg") but the
	 * hero needs a more descriptive title (e.g. "Familiegeschiedenis").
	 * Falls back to `name` when absent.
	 */
	heroTitle: string | null;
	tagline: string;
	allScopeLabel: string;
	ornament: OrnamentConfig;
	/**
	 * UI language for built-in engine labels (nav items, section headings,
	 * empty states, etc.). Authored as `language: nl` in
	 * `content_meta/world.md`. Defaults to `'en'`.
	 */
	language: 'en' | 'nl';
	/**
	 * When `false` (the default), any relation kind used in content that
	 * is NOT listed in any `_ontology.yaml` `relations:` block emits a
	 * health-page warning. Set to `true` in `content_meta/world.md` to
	 * silence those warnings globally while the schema is being built out.
	 */
	allowUndefinedRelations: boolean;
	/**
	 * When `false` (the default), any property key used in content that
	 * is NOT declared in any `_kind.yaml` `properties:` block emits a
	 * health-page warning. Set to `true` in `content_meta/world.md` to
	 * silence those warnings globally while the schema is being built out.
	 */
	allowUndefinedProperties: boolean;
	/**
	 * When `true`, the client-side `beforeNavigate` hook skips painting
	 * `?scope=all` onto outgoing links. Useful for offline/static-served
	 * builds (e.g. Node.js Lab on iPad) where `?scope=all` triggers an SSR
	 * round-trip that is unnecessary and slow. Set `disableScopePainting: true`
	 * in `content_meta/world.md`.
	 */
	disableScopePainting: boolean;
	/**
	 * Optional era configuration. When present, enables the era picker
	 * in the masthead and the `era` field on entity cards.
	 */
	eras: EraConfig | null;
	/**
	 * Custom prompt shown on the passphrase gate form on the home page.
	 * Only visible when `BUNNYTRAIL_WORLD_SECRET` is set. Authored as
	 * `secret_prompt` in `content_meta/world.md` frontmatter.
	 * Falls back to a neutral default when absent.
	 */
	gatePrompt: string;
	/**
	 * Optional settings for the home page display.
	 */
	homePageSettings: HomePageSettings;
	/**
	 * Optional date display format for temporal relation fields.
	 * Authored as a token string in `content_meta/world.md`, e.g.:
	 *   `d mmm YYYY`  → "21 sep 1950"
	 *   `dd/mm/YYYY`  → "21/09/1950"
	 * Supported tokens: `d` (day), `dd` (zero-padded day),
	 * `mm` (zero-padded month), `mmm` (short month name),
	 * `mmmm` (long month name), `YYYY` (4-digit year), `YY` (2-digit year).
	 * When absent the ISO date string is shown as-is.
	 */
	dateFormat: string | null;
	/**
	 * World-defined custom calendar systems. Each calendar has a unique
	 * string id (map key) and a full `CalendarSpec`. Entities, timelines,
	 * and temporal relations may reference a calendar by id. When absent,
	 * all date handling falls back to ISO-8601 via `dateFormat`.
	 */
	customCalendars: CustomCalendarsConfig | null;
}

export interface HomePageSettings {
	/**
	 * When `true` (the default), the colophon shows the entity prose
	 * breakdown — "N met tekst · N stubs". Set to `false` in
	 * `content_meta/world.md` under `homePageSettings.showProseBreakdown`
	 * to hide it (e.g. when the world uses timelines/collections as its
	 * primary prose containers and the entity-only stub count is misleading).
	 */
	showProseBreakdown: boolean;
	/**
	 * When `true`, the colophon shows a count of image files found in the
	 * `content/` tree (jpg, jpeg, png, webp, gif, avif). Defaults to `false`.
	 * Set `homePageSettings.showImageCount: true` in `content_meta/world.md`.
	 */
	showImageCount: boolean;
}

const FALLBACK_NAME = 'Bunnytrail';
const FALLBACK_TAGLINE = '';

function fallbackOrnament(): OrnamentConfig {
	return {
		wordmark: null,
		worldMark: null,
		navSep: null,
		glyph: null,
		svg: null,
		guides: { glyph: null, svg: null }
	};
}

function fallbackConfig(): WorldConfig {
	return {
		name: FALLBACK_NAME,
		shortName: FALLBACK_NAME,
		heroTitle: null,
		tagline: FALLBACK_TAGLINE,
		allScopeLabel: `All ${FALLBACK_NAME}`,
		ornament: fallbackOrnament(),
		language: 'en',
		allowUndefinedRelations: true,
		allowUndefinedProperties: true,
		disableScopePainting: false,
		eras: null,
		gatePrompt: 'Enter the secret to continue.',
		homePageSettings: { showProseBreakdown: true, showImageCount: false },
		dateFormat: null,
		customCalendars: null
	};
}

export interface WorldLoadResult {
	config: WorldConfig;
	/** @deprecated use ledeBody — kept for test compatibility */
	ledeHtml: string | null;
	ledeBody: string;
	/** True iff a `world.md` was found on disk (vs. fallback). */
	present: boolean;
	issues: HealthIssue[];
}

export async function loadWorld(
	worldConfigPath: string = defaultWorldConfigPath()
): Promise<WorldLoadResult> {
	const issues: HealthIssue[] = [];
	const raw = await readOptional(worldConfigPath);
	if (raw === null) {
		return { config: fallbackConfig(), ledeHtml: null, ledeBody: '', present: false, issues };
	}

	const split = splitFrontmatter(raw);
	const metaSource = split.frontmatter ?? '';
	const body = split.body;

	let parsed: unknown = null;
	if (metaSource.trim() !== '') {
		try {
			parsed = parseYaml(metaSource);
		} catch (err) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `content_meta/world.md: ${err instanceof Error ? err.message : String(err)}`
			});
			parsed = null;
		}
	}
	if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
		issues.push({
			kind: 'invalid-yaml',
			detail: 'content_meta/world.md: frontmatter must be a mapping'
		});
		parsed = null;
	}

	const meta = (parsed ?? {}) as Record<string, unknown>;

	const name = readString(meta, 'name', issues) ?? FALLBACK_NAME;
	const tagline = readString(meta, 'tagline', issues) ?? FALLBACK_TAGLINE;
	const shortName = readString(meta, 'shortName', issues) ?? name;
	const heroTitle = readString(meta, 'heroTitle', issues) ?? null;
	const allScopeLabel = readString(meta, 'allScopeLabel', issues) ?? `All ${name}`;
	const ornament = readOrnament(meta, issues);
	const allowUndefinedRelations = readAllowUndefinedRelations(meta, issues);
	const allowUndefinedProperties = readAllowUndefinedProperties(meta, issues);
	const disableScopePainting = readBooleanFlag(meta, 'disableScopePainting', issues);
	const eras = readEras(meta, issues);
	const gatePrompt =
		readString(meta, 'secret_prompt', issues) ?? 'Enter the secret to continue.';
	const language = readLanguage(meta, issues);
	const homePageSettings = readHomePageSettings(meta, issues);
	const dateFormat = typeof meta['dateFormat'] === 'string' ? meta['dateFormat'] : null;
	const customCalendars = readCustomCalendars(meta, issues);

	const ledeBody = body.trim() === '' ? '' : body;
	const ledeHtml = ledeBody ? renderPlainBody(ledeBody) : null;

	return {
		config: { name, shortName, heroTitle, tagline, allScopeLabel, ornament, allowUndefinedRelations, allowUndefinedProperties, disableScopePainting, eras, gatePrompt, language, homePageSettings, dateFormat, customCalendars },
		ledeHtml,
		ledeBody,
		present: true,
		issues
	};
}

const SUPPORTED_LANGUAGES = ['en', 'nl'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function readLanguage(
	meta: Record<string, unknown>,
	issues: HealthIssue[]
): SupportedLanguage {
	const val = meta['language'];
	if (val === undefined || val === null) return 'en';
	if (typeof val !== 'string') {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/world.md: language must be a string when present`
		});
		return 'en';
	}
	const trimmed = val.trim().toLowerCase();
	if (!SUPPORTED_LANGUAGES.includes(trimmed as SupportedLanguage)) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/world.md: unsupported language "${trimmed}"; supported: ${SUPPORTED_LANGUAGES.join(', ')}`
		});
		return 'en';
	}
	return trimmed as SupportedLanguage;
}

function readString(
	meta: Record<string, unknown>,
	key: string,
	issues: HealthIssue[]
): string | null {
	const val = meta[key];
	if (val === undefined || val === null) return null;
	if (typeof val !== 'string') {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/world.md: ${key} must be a string when present`
		});
		return null;
	}
	const trimmed = val.trim();
	return trimmed === '' ? null : trimmed;
}

function readOrnament(meta: Record<string, unknown>, issues: HealthIssue[]): OrnamentConfig {
	const raw = meta['ornament'];
	if (raw === undefined || raw === null) return fallbackOrnament();
	if (typeof raw !== 'object' || Array.isArray(raw)) {
		issues.push({
			kind: 'invalid-yaml',
			detail: 'content_meta/world.md: ornament must be a mapping when present'
		});
		return fallbackOrnament();
	}
	const o = raw as Record<string, unknown>;

	const wordmark = readStringFrom(o, 'wordmark', 'ornament.wordmark', issues);
	const worldMark = readStringFrom(o, 'world_mark', 'ornament.world_mark', issues);
	const navSep = readStringFrom(o, 'nav_sep', 'ornament.nav_sep', issues);
	const glyph = readStringFrom(o, 'glyph', 'ornament.glyph', issues);
	const svg = readStringFrom(o, 'svg', 'ornament.svg', issues);

	const guidesRaw = o['guides'];
	let guides: OrnamentConfig['guides'] = { glyph: null, svg: null };
	if (guidesRaw !== undefined && guidesRaw !== null) {
		if (typeof guidesRaw !== 'object' || Array.isArray(guidesRaw)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: 'content_meta/world.md: ornament.guides must be a mapping when present'
			});
		} else {
			const g = guidesRaw as Record<string, unknown>;
			guides = {
				glyph: readStringFrom(g, 'glyph', 'ornament.guides.glyph', issues),
				svg: readStringFrom(g, 'svg', 'ornament.guides.svg', issues)
			};
		}
	}

	return { wordmark, worldMark, navSep, glyph, svg, guides };
}

function readBooleanFlag(
	meta: Record<string, unknown>,
	key: string,
	issues: HealthIssue[]
): boolean {
	const raw = meta[key];
	if (raw === undefined || raw === null) return false;
	if (typeof raw !== 'boolean') {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/world.md: ${key} must be a boolean when present`
		});
		return false;
	}
	return raw;
}

function readHomePageSettings(
	meta: Record<string, unknown>,
	issues: HealthIssue[]
): HomePageSettings {
	const raw = meta['homePageSettings'];
	if (raw === undefined || raw === null) return { showProseBreakdown: true, showImageCount: false };
	if (typeof raw !== 'object' || Array.isArray(raw)) {
		issues.push({
			kind: 'invalid-yaml',
			detail: 'content_meta/world.md: homePageSettings must be a mapping when present'
		});
		return { showProseBreakdown: true, showImageCount: false };
	}
	const o = raw as Record<string, unknown>;
	const showProseBreakdown =
		o['showProseBreakdown'] === false ? false : true;
	const showImageCount =
		o['showImageCount'] === true ? true : false;
	return { showProseBreakdown, showImageCount };
}

/**
 * Read the optional `allowUndefinedRelations` boolean from world.md frontmatter.
 * Defaults to `false` (strict) when absent — any relation kind not declared in
 * an `_ontology.yaml` `relations:` block will produce a health-page warning.
 * Set to `true` to silence those warnings globally while the schema is being
 * built out.
 */
function readAllowUndefinedRelations(
	meta: Record<string, unknown>,
	issues: HealthIssue[]
): boolean {
	return readBooleanFlag(meta, 'allowUndefinedRelations', issues);
}

/**
 * Read the optional `allowUndefinedProperties` boolean from world.md frontmatter.
 * Defaults to `false` (strict) when absent.
 */
function readAllowUndefinedProperties(
	meta: Record<string, unknown>,
	issues: HealthIssue[]
): boolean {
	return readBooleanFlag(meta, 'allowUndefinedProperties', issues);
}

/**
 * Parse the optional `eras:` block from world.md frontmatter.
 * Returns null when absent or malformed.
 */
function readEras(meta: Record<string, unknown>, issues: HealthIssue[]): EraConfig | null {
	const raw = meta['eras'];
	if (raw === undefined || raw === null) return null;
	if (typeof raw !== 'object' || Array.isArray(raw)) {
		issues.push({ kind: 'invalid-yaml', detail: 'content_meta/world.md: eras must be a mapping' });
		return null;
	}
	const o = raw as Record<string, unknown>;

	// --- definitions ---
	const defsRaw = o['definitions'];
	if (!Array.isArray(defsRaw)) {
		issues.push({ kind: 'invalid-yaml', detail: 'content_meta/world.md: eras.definitions must be an array' });
		return null;
	}
	const definitions: EraDef[] = [];
	const knownRefs = new Set<string>();
	for (let i = 0; i < defsRaw.length; i++) {
		const item = defsRaw[i];
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			issues.push({ kind: 'invalid-yaml', detail: `content_meta/world.md: eras.definitions[${i}] must be a mapping` });
			continue;
		}
		const d = item as Record<string, unknown>;
		const ref = typeof d['ref'] === 'string' ? d['ref'].trim() : null;
		const title = typeof d['title'] === 'string' ? d['title'].trim() : null;
		if (!ref || !title) {
			issues.push({ kind: 'invalid-yaml', detail: `content_meta/world.md: eras.definitions[${i}] requires both ref and title` });
			continue;
		}
		if (knownRefs.has(ref)) {
			issues.push({ kind: 'invalid-yaml', detail: `content_meta/world.md: eras.definitions: duplicate ref '${ref}'` });
			continue;
		}
		knownRefs.add(ref);
		const description = typeof d['description'] === 'string' ? d['description'].trim() : undefined;
		definitions.push({ ref, title, ...(description ? { description } : {}) });
	}

	// --- perCluster ---
	const perClusterRaw = o['perCluster'];
	const perCluster: Record<string, ClusterEras> = {};
	if (perClusterRaw !== undefined && perClusterRaw !== null) {
		if (typeof perClusterRaw !== 'object' || Array.isArray(perClusterRaw)) {
			issues.push({ kind: 'invalid-yaml', detail: 'content_meta/world.md: eras.perCluster must be a mapping' });
		} else {
			for (const [clusterId, clusterRaw] of Object.entries(perClusterRaw as Record<string, unknown>)) {
				if (!clusterRaw || typeof clusterRaw !== 'object' || Array.isArray(clusterRaw)) {
					issues.push({ kind: 'invalid-yaml', detail: `content_meta/world.md: eras.perCluster.${clusterId} must be a mapping` });
					continue;
				}
				const c = clusterRaw as Record<string, unknown>;
				const defaultRef = typeof c['default'] === 'string' ? c['default'].trim() : null;
				if (!defaultRef) {
					issues.push({ kind: 'invalid-yaml', detail: `content_meta/world.md: eras.perCluster.${clusterId}.default must be a string era ref` });
					continue;
				}
				if (!knownRefs.has(defaultRef)) {
					issues.push({ kind: 'invalid-yaml', detail: `content_meta/world.md: eras.perCluster.${clusterId}.default '${defaultRef}' is not a defined era ref` });
				}
				const erasRaw = c['eras'];
				if (!Array.isArray(erasRaw) || erasRaw.some((v) => typeof v !== 'string')) {
					issues.push({ kind: 'invalid-yaml', detail: `content_meta/world.md: eras.perCluster.${clusterId}.eras must be an array of era refs` });
					continue;
				}
				const eraRefs = erasRaw as string[];
				for (const ref of eraRefs) {
					if (!knownRefs.has(ref)) {
						issues.push({ kind: 'invalid-yaml', detail: `content_meta/world.md: eras.perCluster.${clusterId}.eras: unknown era ref '${ref}'` });
					}
				}
				perCluster[clusterId] = { default: defaultRef, eras: eraRefs };
			}
		}
	}

	return { definitions, perCluster };
}

/**
 * Parse the optional `customCalendars:` block from world.md frontmatter.
 * Returns null when absent or malformed at the top level.
 */
function readCustomCalendars(
	meta: Record<string, unknown>,
	issues: HealthIssue[]
): CustomCalendarsConfig | null {
	const raw = meta['customCalendars'];
	if (raw === undefined || raw === null) return null;
	if (typeof raw !== 'object' || Array.isArray(raw)) {
		issues.push({ kind: 'invalid-yaml', detail: 'content_meta/world.md: customCalendars must be a mapping' });
		return null;
	}
	const root = raw as Record<string, unknown>;

	const defaultId = typeof root['default'] === 'string' ? root['default'].trim() || null : null;

	const calsRaw = root['calendars'];
	if (calsRaw === undefined || calsRaw === null) {
		issues.push({ kind: 'invalid-yaml', detail: 'content_meta/world.md: customCalendars.calendars must be a mapping' });
		return null;
	}
	if (typeof calsRaw !== 'object' || Array.isArray(calsRaw)) {
		issues.push({ kind: 'invalid-yaml', detail: 'content_meta/world.md: customCalendars.calendars must be a mapping' });
		return null;
	}

	const calendars: Record<string, CalendarSpec> = {};
	for (const [calId, calRaw] of Object.entries(calsRaw as Record<string, unknown>)) {
		const spec = readCalendarSpec(calId, calRaw, issues);
		if (spec) calendars[calId] = spec;
	}

	if (defaultId && !calendars[defaultId]) {
		issues.push({ kind: 'invalid-yaml', detail: `content_meta/world.md: customCalendars.default '${defaultId}' is not a defined calendar` });
	}

	return { default: defaultId, calendars };
}

function readCalendarSpec(
	calId: string,
	raw: unknown,
	issues: HealthIssue[]
): CalendarSpec | null {
	const ctx = `content_meta/world.md: customCalendars.calendars.${calId}`;
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		issues.push({ kind: 'invalid-yaml', detail: `${ctx}: must be a mapping` });
		return null;
	}
	const o = raw as Record<string, unknown>;

	const name = typeof o['name'] === 'string' ? o['name'].trim() : undefined;
	const input = typeof o['input'] === 'string' ? o['input'].trim() : null;
	const display = typeof o['display'] === 'string' ? o['display'] : null;

	if (!input) {
		issues.push({ kind: 'invalid-yaml', detail: `${ctx}: input is required` });
		return null;
	}
	if (display === null) {
		issues.push({ kind: 'invalid-yaml', detail: `${ctx}: display is required` });
		return null;
	}

	// --- units ---
	const unitsRaw = o['units'];
	if (!Array.isArray(unitsRaw) || unitsRaw.length === 0) {
		issues.push({ kind: 'invalid-yaml', detail: `${ctx}: units must be a non-empty array` });
		return null;
	}
	const units: CalendarUnit[] = [];
	for (let i = 0; i < unitsRaw.length; i++) {
		const item = unitsRaw[i];
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			issues.push({ kind: 'invalid-yaml', detail: `${ctx}: units[${i}] must be a mapping` });
			continue;
		}
		const u = item as Record<string, unknown>;
		const unit = typeof u['unit'] === 'string' ? u['unit'].trim().toLowerCase() : null;
		if (!unit) {
			issues.push({ kind: 'invalid-yaml', detail: `${ctx}: units[${i}].unit is required` });
			continue;
		}
		const perRaw = u['per'];
		let per: number | null | undefined;
		if (perRaw === undefined) {
			per = undefined;
		} else if (perRaw === null) {
			per = null;
		} else if (typeof perRaw === 'number' && Number.isInteger(perRaw) && perRaw > 0) {
			per = perRaw;
		} else {
			issues.push({ kind: 'invalid-yaml', detail: `${ctx}: units[${i}].per must be a positive integer or null` });
			per = undefined;
		}

		// --- irregular ---
		const irregRaw = u['irregular'];
		let irregular: IrregularEntry[] | undefined;
		if (irregRaw !== undefined && irregRaw !== null) {
			if (!Array.isArray(irregRaw)) {
				issues.push({ kind: 'invalid-yaml', detail: `${ctx}: units[${i}].irregular must be an array` });
			} else {
				irregular = [];
				for (let j = 0; j < irregRaw.length; j++) {
					const entry = irregRaw[j];
					if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
						issues.push({ kind: 'invalid-yaml', detail: `${ctx}: units[${i}].irregular[${j}] must be a mapping` });
						continue;
					}
					const e = entry as Record<string, unknown>;
					const ref = typeof e['ref'] === 'number' ? e['ref'] : null;
					if (ref === null || !Number.isInteger(ref) || ref < 1) {
						issues.push({ kind: 'invalid-yaml', detail: `${ctx}: units[${i}].irregular[${j}].ref must be a positive integer` });
						continue;
					}
					const valRaw = e['values'];
					const values: number | null =
						valRaw === null
							? null
							: typeof valRaw === 'number' && Number.isInteger(valRaw) && valRaw > 0
								? valRaw
								: null;
					if (valRaw !== null && values === null) {
						issues.push({ kind: 'invalid-yaml', detail: `${ctx}: units[${i}].irregular[${j}].values must be a positive integer or null` });
					}
					irregular.push({ ref, values: valRaw === null ? null : values });
				}
			}
		}

		units.push({ unit, ...(per !== undefined ? { per } : {}), ...(irregular !== undefined ? { irregular } : {}) });
	}

	// --- tokens ---
	const tokensRaw = o['tokens'];
	let tokens: Record<string, CalendarTokenDef> | undefined;
	if (tokensRaw !== undefined && tokensRaw !== null) {
		if (typeof tokensRaw !== 'object' || Array.isArray(tokensRaw)) {
			issues.push({ kind: 'invalid-yaml', detail: `${ctx}: tokens must be a mapping` });
		} else {
			tokens = {};
			for (const [tok, defRaw] of Object.entries(tokensRaw as Record<string, unknown>)) {
				if (!defRaw || typeof defRaw !== 'object' || Array.isArray(defRaw)) {
					issues.push({ kind: 'invalid-yaml', detail: `${ctx}: tokens.${tok} must be a mapping` });
					continue;
				}
			const d = defRaw as Record<string, unknown>;
			const numeral = d['numeral'];
			const allowedNumerals = ['cardinal', 'ordinal', 'ordinal-short', 'roman', 'mapped'];
			if (!allowedNumerals.includes(numeral as string)) {
				issues.push({ kind: 'invalid-yaml', detail: `${ctx}: tokens.${tok}.numeral must be cardinal|ordinal|ordinal-short|roman|mapped` });
				continue;
			}
			const tokenDef: CalendarTokenDef = { numeral: numeral as CalendarTokenDef['numeral'] };

			// values — optional default mapped array
			if (d['values'] !== undefined) {
				const vals = d['values'];
				if (!Array.isArray(vals) || vals.some((v) => typeof v !== 'string')) {
					issues.push({ kind: 'invalid-yaml', detail: `${ctx}: tokens.${tok}.values must be a string array` });
					continue;
				}
				tokenDef.values = vals as string[];
			}

			// mappings — named mapped arrays, usable as {T:mapped.name}
			if (d['mappings'] !== undefined) {
				const mapsRaw = d['mappings'];
				if (typeof mapsRaw !== 'object' || Array.isArray(mapsRaw) || mapsRaw === null) {
					issues.push({ kind: 'invalid-yaml', detail: `${ctx}: tokens.${tok}.mappings must be a mapping of string arrays` });
					continue;
				}
				const mappings: Record<string, string[]> = {};
				let mappingsOk = true;
				for (const [name, arrRaw] of Object.entries(mapsRaw as Record<string, unknown>)) {
					if (!Array.isArray(arrRaw) || arrRaw.some((v) => typeof v !== 'string')) {
						issues.push({ kind: 'invalid-yaml', detail: `${ctx}: tokens.${tok}.mappings.${name} must be a string array` });
						mappingsOk = false;
						break;
					}
					mappings[name] = arrRaw as string[];
				}
				if (!mappingsOk) continue;
				tokenDef.mappings = mappings;
			}

			// Require at least values or mappings when numeral is mapped
			if (numeral === 'mapped' && !tokenDef.values && !tokenDef.mappings) {
				issues.push({ kind: 'invalid-yaml', detail: `${ctx}: tokens.${tok}: numeral 'mapped' requires values or mappings` });
				continue;
			}

			tokens[tok] = tokenDef;
			}
		}
	}

	// --- displayByPrecision ---
	const dpRaw = o['displayByPrecision'];
	let displayByPrecision: Record<number, CalendarDisplayEntry> | undefined;
	if (dpRaw !== undefined && dpRaw !== null) {
		if (typeof dpRaw !== 'object' || Array.isArray(dpRaw)) {
			issues.push({ kind: 'invalid-yaml', detail: `${ctx}: displayByPrecision must be a mapping` });
		} else {
			displayByPrecision = {};
			for (const [k, v] of Object.entries(dpRaw as Record<string, unknown>)) {
				const precision = parseInt(k, 10);
				if (isNaN(precision) || precision < 1) {
					issues.push({ kind: 'invalid-yaml', detail: `${ctx}: displayByPrecision key '${k}' must be a positive integer` });
					continue;
				}
				if (typeof v === 'string') {
					displayByPrecision[precision] = v;
				} else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
					const obj = v as Record<string, unknown>;
					const heading = typeof obj['heading'] === 'string' ? obj['heading'] : undefined;
					const display = typeof obj['display'] === 'string' ? obj['display'] : undefined;
					if (heading === undefined && display === undefined) {
						issues.push({ kind: 'invalid-yaml', detail: `${ctx}: displayByPrecision.${k} object must have at least one of 'heading' or 'display'` });
						continue;
					}
					displayByPrecision[precision] = { ...(heading !== undefined ? { heading } : {}), ...(display !== undefined ? { display } : {}) };
				} else {
					issues.push({ kind: 'invalid-yaml', detail: `${ctx}: displayByPrecision.${k} must be a string or { heading, display } object` });
				}
			}
		}
	}

	return { ...(name ? { name } : {}), units, input, display, ...(displayByPrecision ? { displayByPrecision } : {}), ...(tokens ? { tokens } : {}) };
}

function readStringFrom(
	obj: Record<string, unknown>,
	key: string,
	path: string,
	issues: HealthIssue[]
): string | null {
	const val = obj[key];
	if (val === undefined || val === null) return null;
	if (typeof val !== 'string') {
		issues.push({
			kind: 'invalid-yaml',
			detail: `content_meta/world.md: ${path} must be a string when present`
		});
		return null;
	}
	const trimmed = val.trim();
	return trimmed === '' ? null : trimmed;
}

async function readOptional(path: string): Promise<string | null> {
	try {
		const st = await stat(path);
		if (!st.isFile()) return null;
		return await readFile(path, 'utf8');
	} catch {
		return null;
	}
}

/**
 * In-memory world singleton, sibling to `graph`, `blog`, `guides`,
 * `sources`. Loaded once at boot; reloaded by the dev watcher when
 * `content_meta/world.md` changes. Pages call `await world.ready()`
 * from layout/load.ts, then use the synchronous accessors.
 */
class World {
	#config: WorldConfig = fallbackConfig();
	#ledeBody: string = '';
	#present = false;
	#issues: HealthIssue[] = [];
	#loaded = false;
	#loading: Promise<void> | null = null;

	async load(worldConfigPath: string = defaultWorldConfigPath()): Promise<void> {
		if (this.#loading) return this.#loading;
		this.#loading = (async () => {
			const { config, ledeHtml: _unused, ledeBody, present, issues } = await loadWorld(worldConfigPath);
			this.#config = config;
			this.#ledeBody = ledeBody;
			this.#present = present;
			this.#issues = issues;
			this.#loaded = true;
		})();
		try {
			await this.#loading;
		} finally {
			this.#loading = null;
		}
	}

	async ready(): Promise<void> {
		if (!this.#loaded) await this.load();
	}

	config(): WorldConfig {
		return { ...this.#config };
	}

	ledeHtml(resolveLink?: LinkResolver): string | null {
		if (!this.#ledeBody) return null;
		return renderPlainBody(this.#ledeBody, resolveLink);
	}

	/** True iff a world.md was found on disk (vs. running on fallback defaults). */
	present(): boolean {
		return this.#present;
	}

	issues(): HealthIssue[] {
		return [...this.#issues];
	}
}

export const world = new World();
