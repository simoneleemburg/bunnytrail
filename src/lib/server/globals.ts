import { existsSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Where the world being rendered lives on disk.
 *
 * Resolution order:
 *   1. `BUNNYTRAIL_WORLD_DIR` env var, if set.
 *   2. `<cwd>/sample-world`, if that directory exists. This is the
 *      synthetic Embergrove fixture shipped with the engine repo —
 *      it lets `npm run dev` work out of the box on a fresh
 *      checkout, with no env configuration.
 *   3. `<cwd>` itself. Lets a consumer project that keeps
 *      `content/`, `content_meta/`, and `assets/` at its own root
 *      run without setting the env var.
 *
 * Individual subdirectories (`content/`, `content_meta/kinds/`, etc.)
 * are derived from this base by the dedicated `default*Dir`
 * functions below; each may still be overridden individually via
 * its own `BUNNYTRAIL_*_DIR` env var.
 */
function defaultWorldDir(): string {
	if (process.env.BUNNYTRAIL_WORLD_DIR) return process.env.BUNNYTRAIL_WORLD_DIR;
	const bundledSample = resolve(process.cwd(), 'sample-world');
	if (existsSync(bundledSample)) return bundledSample;
	return process.cwd();
}

const WORLD_DIR = defaultWorldDir();

/**
 * Where the canonical worldbuilding data lives, relative to the project root.
 * Override with BUNNYTRAIL_CONTENT_DIR for testing.
 */
export const CONTENT_DIR =
	process.env.BUNNYTRAIL_CONTENT_DIR ?? resolve(WORLD_DIR, 'content');

/**
 * Where the central kind registry lives. The directory mirrors the
 * kind hierarchy as a folder tree: each kind is a directory named
 * after its id, optionally containing `_kind.yaml` (label overrides
 * + description) and `_kind.md` (editorial prose). Nesting expresses
 * the parent/child relationship; there is no `kindParent` field.
 *
 * Override with `BUNNYTRAIL_KINDS_DIR` for testing.
 *
 * The registry sits outside `content/` on purpose: kinds are
 * structural metadata about the worldbuilding vocabulary, not
 * worldbuilding prose themselves. Their `.md` companions are the
 * one exception — short editorial blurbs that render on the kind's
 * own page.
 */
export function defaultKindsDir(): string {
	return (
		process.env.BUNNYTRAIL_KINDS_DIR ??
		resolve(WORLD_DIR, 'content_meta/kinds')
	);
}

/**
 * Back-compat export. Resolved at import time of the caller, which
 * is fine for production but should not be relied on in tests —
 * pass the dir to `loadKindRegistry` explicitly instead.
 */
export const KINDS_DIR = defaultKindsDir();

/**
 * Where the author's notebook lives. Each post is a directory under
 * `content_meta/blog/<slug>/` carrying:
 *
 *   - `index.yaml` — required. Frontmatter with `title`, `date`
 *     (ISO `YYYY-MM-DD`), and an optional string-array `tags`.
 *   - `index.md`   — required. The post body, plain markdown.
 *     Wikilink and collection-include directives do *not* resolve
 *     here; the blog is out-of-world authoring material and lives
 *     outside the worldbuilding graph.
 *   - Sibling files (images, attachments) are allowed but the
 *     loader doesn't track them.
 *
 * Override with `BUNNYTRAIL_BLOG_DIR` for testing.
 *
 * The blog sits alongside `content_meta/kinds/` for the same
 * reason: it is *about* the worldbuilding project rather than
 * being part of the worldbuilding itself. It is loaded separately
 * from the graph (its own singleton, its own watcher hook) so that
 * blog posts never leak into entity counts, tag indexes, or
 * cross-cluster aggregates.
 */
export function defaultBlogDir(): string {
	return (
		process.env.BUNNYTRAIL_BLOG_DIR ??
		resolve(WORLD_DIR, 'content_meta/blog')
	);
}

export const BLOG_DIR = defaultBlogDir();

/**
 * Where guides live. Each guide is a directory under
 * `content_meta/guides/<slug>/` carrying:
 *
 *   - `index.yaml` (or frontmatter inside `index.md`) — required.
 *     Fields: `title` (string), `summary` (string), optional
 *     `eyebrow` (string; defaults to "Start here").
 *   - `index.md` — required. The guide body. Unlike the blog,
 *     wikilinks DO resolve in guides: they are tours *of* the
 *     world and need first-class links into it.
 *   - Sibling files (images, SVG maps) are allowed and are
 *     resolved as entity-asset-style siblings via the same
 *     `![alt](foo.svg)` rewrite as collections and entities.
 *
 * Override with `BUNNYTRAIL_GUIDES_DIR` for testing.
 *
 * Guides sit alongside the blog as out-of-world meta-pages: they
 * are *about* the world (tours, landings, "start here" pages)
 * rather than part of it. Like the blog they live as their own
 * singleton, with their own watcher hook, and never leak into
 * entity counts or aggregates.
 */
export function defaultGuidesDir(): string {
	return (
		process.env.BUNNYTRAIL_GUIDES_DIR ??
		resolve(WORLD_DIR, 'content_meta/guides')
	);
}

export const GUIDES_DIR = defaultGuidesDir();

/**
 * Where the "source projects" catalogue lives. Each project sits
 * under `content_meta/sources/<slug>/index.yaml` carrying the
 * structured fields below. An optional `index.md` is allowed for
 * future per-project prose, but the loader does not require it and
 * the homepage section ignores it.
 *
 * Like the blog, this is out-of-world authoring material: it is
 * *about* the worldbuilding project — the feeder works that are
 * being integrated into the world — rather than part of the world
 * itself. It is loaded as its own singleton so source projects
 * never leak into entity counts, tag indexes, or any cross-cluster
 * aggregate.
 *
 * Override the directory with `BUNNYTRAIL_SOURCES_DIR` for testing.
 */
export function defaultSourcesDir(): string {
	return (
		process.env.BUNNYTRAIL_SOURCES_DIR ??
		resolve(WORLD_DIR, 'content_meta/sources')
	);
}

export const SOURCES_DIR = defaultSourcesDir();

/**
 * Where personal/cultural influence entries live. Each entry is a
 * directory under `content_meta/influences/<slug>/` carrying:
 *
 *   - `index.md` (with YAML frontmatter) or `index.yaml` sidecar —
 *     required. Only `title` is a required field; creator, year,
 *     kind, epigraph, image, and body are all optional.
 *   - Sibling image files (book covers, portraits, paintings …)
 *     served via `/api/influence-assets/[slug]/[filename]`.
 *
 * Override with `BUNNYTRAIL_INFLUENCES_DIR` for testing.
 */
export function defaultInfluencesDir(): string {
	return (
		process.env.BUNNYTRAIL_INFLUENCES_DIR ??
		resolve(WORLD_DIR, 'content_meta/influences')
	);
}

export const INFLUENCES_DIR = defaultInfluencesDir();

/**
 * Where pre-baked SVG assets (e.g. mundus-map.svg) live.
 *
 * Resolution order, mirroring `defaultWorldDir`:
 *   1. `BUNNYTRAIL_ASSETS_DIR`, if set.
 *   2. `<WORLD_DIR>/assets/`, if that directory exists. Lets a
 *      world owner ship its own asset folder alongside `content/`
 *      and have it picked up automatically.
 *   3. The bundled fallback under `src/lib/assets/` — the engine's
 *      own dev assets, used when nothing else is on offer.
 *
 * Override with `BUNNYTRAIL_ASSETS_DIR` for testing.
 */
export function defaultAssetsDir(): string {
	if (process.env.BUNNYTRAIL_ASSETS_DIR) return process.env.BUNNYTRAIL_ASSETS_DIR;
	const worldAssets = resolve(WORLD_DIR, 'assets');
	if (existsSync(worldAssets)) return worldAssets;
	return resolve(process.cwd(), 'src/lib/assets');
}

export const ASSETS_DIR = defaultAssetsDir();

/**
 * Where the world's identity manifest lives. A single markdown file
 * with YAML frontmatter declaring the world's name, tagline and
 * shortName, and a body that renders as the homepage hero lede.
 *
 * Override with `BUNNYTRAIL_WORLD_CONFIG` for testing.
 *
 * Missing file is a valid state — the engine falls back to a
 * generic "Bunnytrail" identity so a freshly scaffolded world still
 * renders. See `src/lib/server/world.ts`.
 */
export function defaultWorldConfigPath(): string {
	return (
		process.env.BUNNYTRAIL_WORLD_CONFIG ??
		resolve(WORLD_DIR, 'content_meta/world.md')
	);
}

export const WORLD_CONFIG_PATH = defaultWorldConfigPath();
