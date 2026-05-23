import { resolve } from "path";

/**
 * Where the canonical worldbuilding data lives, relative to the project root.
 * Override with ALTERIA_CONTENT_DIR for testing.
 */
export const CONTENT_DIR = process.env.ALTERIA_CONTENT_DIR ?? resolve(process.env.ALTERIA_WORLD_DIR ?? process.cwd(), 'content');


/**
 * Where the central kind registry lives. The directory mirrors the
 * kind hierarchy as a folder tree: each kind is a directory named
 * after its id, optionally containing `_kind.yaml` (label overrides
 * + description) and `_kind.md` (editorial prose). Nesting expresses
 * the parent/child relationship; there is no `kindParent` field.
 *
 * Override with `ALTERIA_KINDS_DIR` for testing.
 *
 * The registry sits outside `content/` on purpose: kinds are
 * structural metadata about the worldbuilding vocabulary, not
 * worldbuilding prose themselves. Their `.md` companions are the
 * one exception — short editorial blurbs that render on the kind's
 * own page.
 */
export function defaultKindsDir(): string {
    return process.env.ALTERIA_KINDS_DIR ?? resolve(process.env.ALTERIA_WORLD_DIR ?? process.cwd(), 'content_meta/kinds');
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
 * Override with `ALTERIA_BLOG_DIR` for testing.
 *
 * The blog sits alongside `content_meta/kinds/` for the same
 * reason: it is *about* the worldbuilding project rather than
 * being part of the worldbuilding itself. It is loaded separately
 * from the graph (its own singleton, its own watcher hook) so that
 * blog posts never leak into entity counts, tag indexes, or
 * cross-cluster aggregates.
 */
export function defaultBlogDir(): string {
	return process.env.ALTERIA_BLOG_DIR ?? resolve(process.env.ALTERIA_WORLD_DIR ?? process.cwd(), 'content_meta/blog');
}

export const BLOG_DIR = defaultBlogDir();