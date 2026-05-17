# AGENTS.md

Operational instructions for AI coding agents working in this repository.

## Project in one paragraph

Alteria is a personal worldbuilding compendium. Canonical data lives in
`content/` as one folder per entity: `content/<type>/<slug>/index.yaml`
holds structured metadata and `index.md` holds the prose; sibling files
(images, etc.) live alongside. Each type folder may also have a
`_type.yaml` describing the labels + meaning of the type. A SvelteKit
site loads it all on boot into an in-memory graph and renders it as a
browsable, cross-linked field-notebook. Cross-references use
`[[type/slug]]` wikilinks; backlinks are built automatically.

## Commands

```bash
npm run dev           # SvelteKit dev server (localhost:5173)
npm run build         # Production build
npm test              # Vitest
npm run check         # svelte-check
npm run format        # Prettier write
npm run format:check  # Prettier check
```

## Local dev tooling for agents

- **Headless browser** (`chrome-devtools-mcp`) is configured in
  `opencode.json`. When `npm run dev` is running, an agent can navigate to
  `http://localhost:5173`, take screenshots, inspect the DOM, read the
  console, and watch network traffic.
- **Working agreement** for agents using the browser:
  - Assume the user keeps `npm run dev` running. Don't try to start or
    stop it; if it isn't reachable, say so instead of attempting recovery.
  - Default base URL is `http://localhost:5173`.
  - Screenshots cost tokens — take them when verifying your own change,
    when asked, or when a console error needs visual context. Prefer
    console/network checks for "did my change break anything".

## Conventions

- **TypeScript everywhere.** No `any` without a comment explaining why.
- **Path aliases**: `$lib/*` → `src/lib/*` (SvelteKit default).
- **Formatting**: Prettier (`.prettierrc`). Run `npm run format` before
  committing.
- **Tests**: Vitest. Co-locate `*.spec.ts` next to the source.
- **Content is the source of truth.** Don't hand-edit generated artifacts;
  fix the loader or the source files under `content/`.
- **Wikilinks**: use `[[type/slug]]` or `[[type/slug|Display Name]]` in
  prose. The markdown renderer (`src/lib/server/markdown.ts`) handles
  resolution and backlinks.
- **Commit messages**: short, imperative subject (e.g.
  `add backlink rendering on entity pages`). No ticket prefixes — this
  project doesn't use an issue tracker.

## Where things live

- **New worldbuilding entity** → `content/<type>/<slug>/index.{yaml,md}`
  (plus any companion files — images, attachments — in the same folder)
- **New entity type** → create a directory under `content/`. The loader
  discovers types from the filesystem at boot, so the nav and routes pick
  it up automatically. Display labels are derived from the folder name
  (see `labelsFor` in `src/lib/types.ts`).
- **New UI primitive** → `src/lib/components/`. Existing primitives:
  `EntityCard`, `EntityLink`, `PageHeader`, `PropertyList`, `Tag`.
- **Graph / loader logic** → `src/lib/server/`
  (`loader.ts`, `graph.ts`, `markdown.ts`, `watcher.ts`).
- **Design tokens / base styles** → `src/lib/styles/`.

## Agent etiquette

- **Plan with TodoWrite** for multi-step changes.
- **Prefer editing** existing files over creating new ones.
- **Reach for the reusable components first.** Before writing a new
  card/list/link with bespoke CSS, check `src/lib/components/`. If a
  reusable is _almost_ right but its API doesn't fit, extend it rather
  than copy its chrome into a new component.
- **Don't scaffold new top-level files** (READMEs, configs) without being
  asked.
- **Keep changes small** and focused on a single concern.
