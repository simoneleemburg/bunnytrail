# Alteria Engine

The engine behind Alteria.
A personal compendium for the worlds, characters, and ideas.

The canonical data lives in a separate project, as a collection of frontmatter files.
The site (SvelteKit) loads it into an in-memory graph on boot and renders
it as a browsable, cross-linked field-notebook.

The location of the world project is configured in the `ALTERIA_WORLD_DIR` env variable.
This variable can be passed in or picked up from a `.env` file in the project's root.

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
    styles/
      tokens.css                design tokens
      global.css                base typography & reset
    types.ts                    Entity, Edge, Relation, …
  routes/
    +page.svelte                landing
    [type]/+page.svelte         list of one type
    [type]/[slug]/+page.svelte  entity page
```
