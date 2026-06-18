import { readFile, stat } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { HealthIssue, RelationRegistry, RelationSchema } from '$lib/types';
import { defaultWorldConfigPath } from './globals';
import { splitFrontmatter } from './frontmatter';
import { renderPlainBody } from './markdown';

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

export interface WorldConfig {
	name: string;
	shortName: string;
	tagline: string;
	allScopeLabel: string;
	ornament: OrnamentConfig;
	/**
	 * World-level relation registry parsed from the `relations:` block
	 * in `content_meta/world.md`. Keys are relation kind ids; values
	 * carry labels and optional domain/codomain kind constraints.
	 * Empty map when not configured.
	 */
	relations: RelationRegistry;
	/**
	 * When `false` (the default when the `relations:` block is present),
	 * any relation kind used in content that is NOT listed in the
	 * registry emits a health-page warning. Set to `true` to silence
	 * those warnings while the schema is still being built out.
	 * Has no effect when the `relations:` block is absent entirely.
	 */
	allowUndefinedRelations: boolean;
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
		tagline: FALLBACK_TAGLINE,
		allScopeLabel: `All ${FALLBACK_NAME}`,
		ornament: fallbackOrnament(),
		relations: new Map(),
		allowUndefinedRelations: true
	};
}

export interface WorldLoadResult {
	config: WorldConfig;
	ledeHtml: string | null;
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
		return { config: fallbackConfig(), ledeHtml: null, present: false, issues };
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
	const allScopeLabel = readString(meta, 'allScopeLabel', issues) ?? `All ${name}`;
	const ornament = readOrnament(meta, issues);
	const { relations, allowUndefinedRelations } = readRelations(meta, issues);

	const ledeHtml = body.trim() === '' ? null : renderPlainBody(body);

	return {
		config: { name, shortName, tagline, allScopeLabel, ornament, relations, allowUndefinedRelations },
		ledeHtml,
		present: true,
		issues
	};
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

/**
 * Parse the optional `relations:` block from world.md frontmatter.
 *
 * Expected shape:
 *
 *     relations:
 *       member-of:
 *         outLabel: Member of
 *         inLabel: Members
 *         domain: [person, character]
 *         codomain: [group, institution]
 *       related-to:
 *         outLabel: Related to
 *         inLabel: Related to
 *
 * `allowUndefinedRelations` is read from a sibling key; defaults to
 * `false` when the `relations:` block is present (strict mode), `true`
 * when the block is absent (no opinion).
 */
function readRelations(
	meta: Record<string, unknown>,
	issues: HealthIssue[]
): { relations: RelationRegistry; allowUndefinedRelations: boolean } {
	const raw = meta['relations'];
	const hasBlock = raw !== undefined && raw !== null;

	// allowUndefinedRelations: explicit bool, or derived from whether block exists
	let allowUndefinedRelations = !hasBlock;
	const allowRaw = meta['allowUndefinedRelations'];
	if (allowRaw !== undefined && allowRaw !== null) {
		if (typeof allowRaw !== 'boolean') {
			issues.push({
				kind: 'invalid-yaml',
				detail: 'content_meta/world.md: allowUndefinedRelations must be a boolean when present'
			});
		} else {
			allowUndefinedRelations = allowRaw;
		}
	}

	if (!hasBlock) return { relations: new Map(), allowUndefinedRelations };

	if (typeof raw !== 'object' || Array.isArray(raw)) {
		issues.push({
			kind: 'invalid-yaml',
			detail: 'content_meta/world.md: relations must be a mapping when present'
		});
		return { relations: new Map(), allowUndefinedRelations };
	}

	const registry: RelationRegistry = new Map();
	const block = raw as Record<string, unknown>;

	for (const [kindId, entry] of Object.entries(block)) {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `content_meta/world.md: relations.${kindId} must be a mapping`
			});
			continue;
		}
		const e = entry as Record<string, unknown>;

		const outLabel = readStringFrom(e, 'outLabel', `relations.${kindId}.outLabel`, issues);
		const inLabel = readStringFrom(e, 'inLabel', `relations.${kindId}.inLabel`, issues);
		if (!outLabel || !inLabel) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `content_meta/world.md: relations.${kindId} requires both outLabel and inLabel`
			});
			continue;
		}

		const schema: RelationSchema = { outLabel, inLabel };

		for (const constraintKey of ['domain', 'codomain'] as const) {
			const cv = e[constraintKey];
			if (cv === undefined || cv === null) continue;
			if (!Array.isArray(cv) || cv.some((v) => typeof v !== 'string')) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `content_meta/world.md: relations.${kindId}.${constraintKey} must be an array of kind ids`
				});
				continue;
			}
			schema[constraintKey] = cv as string[];
		}

		registry.set(kindId, schema);
	}

	return { relations: registry, allowUndefinedRelations };
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
	#ledeHtml: string | null = null;
	#present = false;
	#issues: HealthIssue[] = [];
	#loaded = false;
	#loading: Promise<void> | null = null;

	async load(worldConfigPath: string = defaultWorldConfigPath()): Promise<void> {
		if (this.#loading) return this.#loading;
		this.#loading = (async () => {
			const { config, ledeHtml, present, issues } = await loadWorld(worldConfigPath);
			this.#config = config;
			this.#ledeHtml = ledeHtml;
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

	ledeHtml(): string | null {
		return this.#ledeHtml;
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
