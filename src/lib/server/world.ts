import { readFile, stat } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { EraConfig, EraDef, ClusterEras, HealthIssue } from '$lib/types';
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
		gatePrompt: 'Enter the secret to continue.'
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

	const ledeHtml = body.trim() === '' ? null : renderPlainBody(body);

	return {
		config: { name, shortName, heroTitle, tagline, allScopeLabel, ornament, allowUndefinedRelations, allowUndefinedProperties, disableScopePainting, eras, gatePrompt, language },
		ledeHtml,
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
