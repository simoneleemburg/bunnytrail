# AGENTS.md

Operational instructions for AI coding agents working in this repository.

## Project in one paragraph

Alteria is a personal worldbuilding compendium. Canonical data lives in
`content/` as one folder per entity:
`content/<...collection-path>/<slug>/index.yaml` holds structured
metadata and `index.md` holds the prose; sibling files (images, etc.)
live alongside. Folders are **collections** — narrative groupings, the
shelves of the field-notebook — and may carry an optional
`_collection.yaml` describing their display label and prose. The
**kinds** every entity declares (its taxonomic classification) live
separately in `content_meta/kinds/` as a nested folder tree, each node
optionally carrying a `_kind.yaml` and `_kind.md`. A SvelteKit site
loads it all on boot into an in-memory graph and renders it as a
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

## Worldbuilding content rules

When authoring or editing files under `content/`, read
[`WORLDBUILDING.md`](./WORLDBUILDING.md). It is the editorial
standard for this project: voice, gap-notes, disputed truths,
intersections, the texture we are aiming for.

The highest-priority reminders, in case you only read this file:

- **Don't invent canon.** Worldbuilding is the user's domain.
  Editing prose for clarity is fine; adding new facts about the
  world — even small ones — is not.
- **Flag any inferences you do make** in chat, after the edit.
  Don't bury small worldbuilding claims in otherwise-routine
  prose.
- **Empty is better than padded.** A stub with a gap-note beats a
  paragraph of generic worldbuilding.
- **Notice intersections; don't manufacture them.** Worlds come
  alive at the points where ideas connect — but the agent's job is
  to surface connections the user has already implied, not to
  invent new ones.

Everything else — disputed truths, tag hygiene, the in-world
register, the practical pre-save checklist — is in
`WORLDBUILDING.md`.

## Where things live

- **New worldbuilding entity** → `content/<...collection-path>/<slug>/index.{yaml,md}`
  (plus any companion files — images, attachments — in the same folder).
  The entity's `kind:` field must match a kind registered in
  `content_meta/kinds/`.
- **New collection (narrative grouping)** → create a directory under
  `content/`. The loader discovers collections from the filesystem at
  boot, so the nav and routes pick them up automatically. Display labels
  default to the folder name; override them by adding a
  `_collection.yaml` with `title:` and an optional `description:` (see
  `folderLabels` in `src/lib/types.ts`).
- **New kind (taxonomy node)** → create a folder somewhere under
  `content_meta/kinds/`, optionally with `_kind.yaml` (singular/plural
  overrides, description) and `_kind.md` (long-form prose). The parent
  kind is whichever folder it sits in; no `kindParent:` field needed.
- **New UI primitive** → `src/lib/components/`. Existing primitives:
  `EntityCard`, `EntityLink`, `PageHeader`, `PropertyList`, `Tag`.
- **Graph / loader logic** → `src/lib/server/`
  (`loader.ts`, `graph.ts`, `kinds.ts`, `markdown.ts`, `watcher.ts`).
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
