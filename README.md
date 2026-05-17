# Alteria

A personal compendium for the worlds, characters, and ideas that make up
the collective universe of Alteria.

The canonical data lives in `content/` as paired Markdown + YAML files.
The site (SvelteKit) loads it into an in-memory graph on boot and renders
it as a browsable, cross-linked field-notebook.

## Run

```bash
npm install
npm run dev
# → http://localhost:5173
```

## Tests & checks

```bash
npm test          # vitest
npm run check     # svelte-check
npm run format    # prettier write
```

## Adding entries

Every entity is a pair of files under `content/<type>/`:

- `<slug>.yaml` — structured metadata (name, summary, tags, relations)
- `<slug>.md`   — long-form prose

Cross-reference other entries from prose using `[[type/slug]]` or
`[[type/slug|Display Name]]`. The site builds backlinks automatically.

See `content/README.md` for more.

## Layout

```
content/                        canonical worldbuilding data (source of truth)
src/
  lib/
    components/                 small, composable UI primitives
    server/
      loader.ts                 walks content/, parses YAML + MD
      graph.ts                  in-memory graph singleton
      markdown.ts               wikilink-aware markdown → HTML
      watcher.ts                dev-only file watcher
    styles/
      tokens.css                design tokens
      global.css                base typography & reset
    types.ts                    Entity, Edge, Relation, …
  routes/
    +page.svelte                landing
    [type]/+page.svelte         list of one type
    [type]/[slug]/+page.svelte  entity page
```

---

© All worldbuilding content under `content/` is the personal creative
work of the author. All rights reserved.
