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

## Worldbuilding content rules

These rules apply when authoring or editing files under `content/`.
Worldbuilding is the user's domain; agents assist with structure,
phrasing, and consistency, not with inventing the world.

- **Don't invent canon.** Editing prose for clarity, rhythm, and
  tone is fine. Adding new facts about the world is not — even small
  ones. If the user's brief says "rare serpent-humanoid lineage,"
  don't extend it into specific habitats, customs, or history. If a
  character or place needs more detail than the brief provides,
  either ask the user, leave the text short, or make the gap
  explicit (a parenthetical italic note like _"How X came to Y is
  not yet recorded here."_ is preferred over silent omission, so
  the gap is visible later).
- **Flag any inferences you do make.** When an inference is
  unavoidable — e.g. a section needs a connecting sentence to read
  coherently — call it out in chat after the edit. Don't bury small
  worldbuilding claims in otherwise-routine prose.
- **Cite the user's prompt.** If you're paraphrasing something the
  user wrote, stay close to their phrasing and don't expand its
  scope. "Identity tied to transformation" should not become
  "identity expressed through ritualised transit-rites" without a
  prompt.
- **Tags are for cross-cutting affinities, not duplicates of
  first-class fields.** If `kind: planet` is set, don't also add
  `planet` to `tags`. Same for `gender`, `era`, `status`, etc. Use
  tags for themes, motifs, and connections that the structured
  fields don't already capture (e.g. `ocean`, `ruins`, `pilgrimage`,
  `border`). Keeping tags clean keeps them useful.
- **Empty is better than padded.** Short entries are fine. A stub
  entry with a one-line summary and a gap note is better than a
  paragraph of generic worldbuilding. The compendium grows by being
  fed real material, not filler.
- **Disputed truths are a feature, not a bug.** The compendium is
  written as if compiled from many partial sources across many
  centuries. There is, in many cases, no single authoritative
  answer — only surviving partial truths, contradicting points of
  view, and traditions that disagree. This is the deliberate
  style. When a fact is contested in-world, record the contest:
  attribute the dominant reading to "long tradition" or to a
  named position, name the dispute, and resist the urge to
  resolve it on the user's behalf. Phrases like _"by long
  tradition, …; this is disputed,"_ _"some accounts hold …, others
  hold …,"_ and _"the question is not settled here"_ are
  preferred over a single confident voice. The compendium has the
  texture of a real archive: incomplete, partisan in places, and
  honest about both.

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
