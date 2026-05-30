# AGENTS.md

Operational instructions for AI coding agents working in this repository.

## Project in one paragraph

Alteria is a personal worldbuilding compendium. Alteria is the
universe; **clusters** of that universe live as top-level folders under
`content/` (currently `content/aurethia/` — the Aureth system and its
immediate neighbourhood — and `content/earth/`). Canonical data lives in
`content/` as one folder per entity. Each entity may be authored as
either:

- **Sidecar layout** (legacy): `index.yaml` for structured metadata
  plus `index.md` for prose; or
- **Frontmatter layout**: a single `index.md` that opens with a
  `---`-fenced YAML block, followed by the prose body.

Both layouts produce the same loaded entity; pick whichever is more
comfortable per file. **Don't mix them in the same folder** — having
both an `index.yaml` and an `index.md` with frontmatter is treated
as an authoring error and the entity is skipped with a health-page
issue. Sibling files (images, etc.) live alongside. Folders are
**collections** — narrative shelves of the field-notebook — and may
carry an optional `_collection.yaml` (or a `_collection.md` with
frontmatter) describing their display label and prose. The **kinds**
every entity declares (its taxonomic classification) live separately
in `content_meta/kinds/` as a nested folder tree, each node
optionally carrying a `_kind.yaml` and `_kind.md` (or, equivalently,
a single `_kind.md` with frontmatter). Kinds are universal — they
describe categories in the abstract and apply across clusters. On top
of `kind:`, instances may declare additional **lenses** — spatial,
temporal, account-relative, kind-affinity — as structured `relations:`
or named pointer fields. A SvelteKit site loads it all on boot into
an in-memory graph and renders it as a browsable, cross-linked
field-notebook. Cross-references in prose use `[[type/slug]]`
wikilinks; backlinks and inverse relations are built automatically.

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
  resolution and backlinks. For the full contract — bare slugs,
  anchors, language tags, kind links, the collection fold-out
  directive, ambiguity, and the global suffix-match resolution rule —
  see [`WIKILINKS.md`](./WIKILINKS.md).
- **Commit messages**: short, imperative subject (e.g.
  `add backlink rendering on entity pages`). No ticket prefixes — this
  project doesn't use an issue tracker.

## Worldbuilding content rules

When authoring or editing files under `content/`, read
[`WORLDBUILDING.md`](./WORLDBUILDING.md). It is the editorial
standard for this project: voice, silent absence, disputed truths,
intersections, the texture we are aiming for.

The highest-priority reminders, in case you only read this file:

- **Don't invent canon.** Worldbuilding is the user's domain.
  Editing prose for clarity is fine; adding new facts about the
  world — even small ones — is not.
- **Flag any inferences you do make** in chat, after the edit.
  Don't bury small worldbuilding claims in otherwise-routine
  prose.
- **Empty is better than padded.** A short entry beats a paragraph
  of generic worldbuilding. Don't narrate what's missing — Alteria
  is limitless by definition, so every entry is a fragment. If a
  missing thread feels worth returning to, add it to
  `QUESTIONS.md`.
- **Notice intersections; don't manufacture them.** Worlds come
  alive at the points where ideas connect — but the agent's job is
  to surface connections the user has already implied, not to
  invent new ones.
- **Content references meta; meta does not reference content.**
  Files under `content_meta/` describe general kinds; files under
  `content/` describe specific instances. A specific place may
  declare `nativeBeings: [kinds/human]`; the `human` kind doc may
  not name which planet it lives on. See WORLDBUILDING.md for the
  full rule.

Everything else — disputed truths, tag hygiene, the in-world
register, the practical pre-save checklist — is in
`WORLDBUILDING.md`.

## Where things live

The compendium is built on one foundational separation and a
number of optional lenses on top. See
[`WORLDBUILDING.md`](./WORLDBUILDING.md) for the editorial
treatment; this section covers the operational placement.

### Authoring layouts

Every entity, collection, and kind can be authored in either of
two equivalent layouts. Pick whichever feels more comfortable
per file; the loader produces the same in-memory shape from
both.

- **Sidecar** (legacy): structured fields in a `.yaml` file,
  prose in a sibling `.md` file. For an entity:
  `<slug>/index.yaml` + `<slug>/index.md`.
- **Frontmatter**: a single `.md` file that opens with a
  `---`-fenced YAML block, followed by the prose body. For an
  entity: `<slug>/index.md` only.

**Don't mix the two in one folder.** Both an `index.yaml` and an
`index.md` with frontmatter is treated as an authoring error —
the entity is skipped and an issue appears on the health page.
Same rule for `_collection.yaml` + `_collection.md`-with-frontmatter
and `_kind.yaml` + `_kind.md`-with-frontmatter.

A bare `_collection.md` or `_kind.md` with no frontmatter remains
a prose-only companion, exactly as before.

Path notation in this document uses `index.{yaml,md}` to mean
"either layout"; concrete examples in `content/` are free to use
whichever suits the entry.

**Foundational:**

- **Kinds** live in `content_meta/kinds/` as a nested folder
  tree. Each kind is abstract — what something _is_, in general.
  The parent kind is whichever folder it sits in; no
  `kindParent:` field needed.
- **Instances** live in `content/` as `<slug>/index.{yaml,md}`
  folders. Each instance declares one `kind:` (its taxonomy
  pointer) and lives at one folder path (its narrative shelf, for
  browsing — not a semantic claim).

**Lenses** are optional, additive views on instances. Each lens
is declared as a YAML field; the loader and renderer pick them
up automatically. The lenses in current use:

- **Spatial.** `relations: - kind: <verb>, target: <entity-id>`
  with verbs like `member-of`, `located-in`, `orbits`,
  `occurred-on`. Targets must be full entity ids; bare slugs are
  not resolved.
- **Temporal.** `relations: - kind: occurred-in, target:
aurethia/history/<age>` against the four registered ages (`mythic`,
  `pre-recorded`, `recorded`, `current`) under
  `content/aurethia/history/`.
- **Account-relative.** Declared on the account entity:
  `relations: - kind: records, target: aurethia/history/<event-id>`.
  The inverse appears on the event as "Recorded in: …".
- **Kind-affinity.** Named YAML fields with `kinds/<id>` values
  (`nativeBeings: [kinds/human]`, `traits: [kinds/nearborn]`).
  Curated inverse labels live in
  `src/lib/server/kindLinkLabels.ts`.

Cross-axis truth travels through declared fields, not folder
placement. If a place is home to a kind of being, say so with
`nativeBeings: [kinds/urouthi]` — not by nesting one under the
other. The same rule the other way: don't encode taxonomy in
folder paths (`places/celestial/planets/` was wrong — that was
kind-grouping masquerading as topology), and don't encode
specific instances in kind pages (see the meta/content rule in
WORLDBUILDING.md).

### Where to put new things

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
- **New event** → `content/aurethia/history/<slug>/index.{yaml,md}` with
  `kind: event`. Add temporal placement via
  `relations: - kind: occurred-in, target: aurethia/history/<age>` and
  spatial placement via
  `relations: - kind: occurred-on, target: <place-entity-id>`.
- **New age** → `content/aurethia/history/<slug>/index.{yaml,md}` with
  `kind: age`. The four current ages were chosen deliberately;
  adding a fifth is a worldbuilding decision, not routine.
- **New account** → `content/aurethia/history/accounts/<slug>/index.{yaml,md}`
  with `kind: account`. Add the events it records via `relations:
  - kind: records, target: aurethia/history/<event-id>`.
- **New relation verb** → just use it in YAML; the loader doesn't
  whitelist verbs. If the inverse direction wants a custom label,
  add it to `_EntityPage.svelte`'s `inverse` table. The fallback
  humanises the verb itself.
- **New kind-affinity field** → just use it in YAML with
  `kinds/<id>` values. For a custom inverse label on the kind's
  page, add an entry to `src/lib/server/kindLinkLabels.ts`.
- **New notebook post** (the author's-room blog at `/blog`) →
  `content_meta/blog/<slug>/index.{yaml,md}`. The blog is
  out-of-world authoring material — it lives outside the
  worldbuilding graph and has its own loader singleton
  (`src/lib/server/blog.ts`). Wikilinks do NOT resolve in blog
  prose; `[[anything]]` stays literal. Frontmatter requires
  `title` (string) and `date` (ISO `YYYY-MM-DD`); `tags` is an
  optional `string[]`. Posts don't appear in entity counts, tag
  indexes, or any cross-cluster aggregate, and the masthead nav
  doesn't link to `/blog` — only the home-page Notebook callout
  does.
- **New UI primitive** → `src/lib/components/`. Existing primitives:
  `EntityCard`, `EntityLink`, `PageHeader`, `PropertyList`, `Tag`.
- **Graph / loader logic** → `src/lib/server/`
  (`loader.ts`, `graph.ts`, `kinds.ts`, `blog.ts`, `markdown.ts`, `watcher.ts`).
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
