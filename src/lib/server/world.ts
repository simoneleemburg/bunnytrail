import { readFile, stat } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { HealthIssue } from '$lib/types';
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
 *     ---
 *
 *     Three paragraphs of homepage lede prose, rendered as the hero
 *     paragraph block on the homepage.
 *
 * When the file is missing or malformed, the engine falls back to a
 * generic "Bunnytrail" identity so a freshly scaffolded world still
 * renders coherently — the author can fill in `world.md` at leisure.
 */
export interface WorldConfig {
	name: string;
	shortName: string;
	tagline: string;
	allScopeLabel: string;
}

const FALLBACK_NAME = 'Bunnytrail';
const FALLBACK_TAGLINE = '';

function fallbackConfig(): WorldConfig {
	return {
		name: FALLBACK_NAME,
		shortName: FALLBACK_NAME,
		tagline: FALLBACK_TAGLINE,
		allScopeLabel: `All ${FALLBACK_NAME}`
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

	const ledeHtml = body.trim() === '' ? null : renderPlainBody(body);

	return {
		config: { name, shortName, tagline, allScopeLabel },
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
