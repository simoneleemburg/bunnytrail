# Bunnytrail

A frontmatter-native knowledge-graph engine.

Bunnytrail loads a folder tree of YAML/Markdown entities into an
in-memory graph at boot and renders it as a browsable, cross-linked
field-notebook. Entities declare a `kind` (taxonomic classification)
and any number of `relations` and named pointer fields (lenses —
spatial, temporal, account-relative, kind-affinity). Cross-references
in prose use `[[type/slug]]` wikilinks; backlinks and inverse
relations are built automatically.

The reference world is [Alteria](https://github.com/leemburg/alteria_world)
— a personal worldbuilding compendium — but Bunnytrail is content-agnostic:
the engine ships zero canon and discovers everything from the
configured world directory.

## Run

```bash
npm install
npm run dev
# → http://localhost:5173
```

The world directory is configured via `BUNNYTRAIL_WORLD_DIR` (in `.env`
or the shell environment). Per-tree overrides (`BUNNYTRAIL_CONTENT_DIR`,
`BUNNYTRAIL_KINDS_DIR`, `BUNNYTRAIL_BLOG_DIR`, `BUNNYTRAIL_GUIDES_DIR`,
`BUNNYTRAIL_SOURCES_DIR`, `BUNNYTRAIL_ASSETS_DIR`) are honoured when set.

## Tests & checks

```bash
npm test          # vitest
npm run check     # svelte-check
npm run format    # prettier write
```

## Layout

```
src/
  lib/
    components/                 small, composable UI primitives
    server/
      loader.ts                 walks content/, parses YAML + MD
      graph.ts                  in-memory graph singleton
      markdown.ts               wikilink-aware markdown → HTML
      watcher.ts                dev-only file watcher
      guides.ts                 out-of-world meta-guides
      blog.ts                   out-of-world author notebook
      kinds.ts                  taxonomy registry
    styles/
      tokens.css                design tokens
      global.css                base typography & reset
    types.ts                    Entity, Edge, Relation, …
  routes/
    +page.svelte                landing
    [...path]/+page.svelte      entity / collection / craft / chapter
    guides/[slug]/+page.svelte  meta-guide
    blog/[slug]/+page.svelte    notebook post
    health/+page.svelte         link / kind / relation validation
```
