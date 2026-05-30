# AGENTS.md

Operational instructions for AI coding agents working in this repository.

## Project in one paragraph

Bunnytrail is a frontmatter-native knowledge-graph engine. It walks a
folder tree of YAML/Markdown entities at boot, builds an in-memory
graph (entities + kinds + relations + tags + backlinks), and renders
it as a browsable, cross-linked field-notebook. The reference world
is [Alteria](https://github.com/simoneleemburg/alteria_world) — a
personal worldbuilding compendium — but the engine is content-agnostic:
it ships zero canon and discovers everything from the configured world
directory (`BUNNYTRAIL_WORLD_DIR`).

## Two surfaces

Bunnytrail is consumed in two distinct ways, and changes need to
keep both healthy:

1. **Dogfood (this repo).** `src/routes/` contains thin SvelteKit
   shims that re-export from `src/lib/routes/`. Running `npm run dev`
   here boots the engine against whatever `BUNNYTRAIL_WORLD_DIR`
   points at, falling back to the bundled `sample-world/` fixture
   if unset. This is the fastest iteration loop for engine work.
2. **Consumer.** Worlds install bunnytrail as an npm dependency from
   GitHub (`bunnytrail: "github:simoneleemburg/bunnytrail#main"`) and
   scaffold a thin SvelteKit shell via `npx bunnytrail init`. The
   consumer's `src/routes/` is generated shims into the package's
   exports (`bunnytrail/routes/*`); the consumer's `src/hooks.server.ts`
   is just `import 'bunnytrail/hooks';`.

Engine code lives in `src/lib/`. Anything imported from `$lib/...`
inside `src/lib/routes/` must also be reachable through the package
`exports` map in `package.json` — otherwise it works in dogfood and
breaks in consumers. Most of the time `$lib/server/...`,
`$lib/components/...`, and `$lib/types` are what you need; all are
mapped.

## Commands

```bash
npm run dev           # SvelteKit dev server (localhost:5173)
npm run build         # Production build (engine dogfood)
npm test              # Vitest
npm run check         # svelte-check
npm run smoke:sample  # Loader smoke test against sample-world/
npm run package       # svelte-package → dist/  (what consumers install)
npm run format        # Prettier write
npm run format:check  # Prettier check
```

When the engine API changes — routes added, removed, or renamed —
regenerate dogfood shims with:

```bash
node scripts/generate-shims.mjs
```

For consumers, the same change requires `npm update bunnytrail &&
npx bunnytrail sync` on their end.

## Repo layout

```
src/
  lib/                          ← engine source (published to dist/)
    routes/                     ← real route impls (Page.svelte + load.ts + handler.ts)
    components/                 ← UI primitives (EntityCard, EntityLink, PageHeader, …)
    server/
      loader.ts                 walks <world>/content/
      graph.ts                  in-memory graph singleton
      kinds.ts                  taxonomy registry
      markdown.ts               wikilink-aware markdown → HTML
      inlineSvgs.ts             SVG figure inlining
      blog.ts                   out-of-world author notebook
      guides.ts                 out-of-world meta-guides
      watcher.ts                dev-only file watcher
      globals.ts                world dir resolution + fallbacks
    styles/                     design tokens + base CSS
    types.ts                    Entity, Edge, Relation, FolderLabels
    cluster.ts                  scope-from-URL derivation
    hooks.ts                    side-effect boot module (consumer entry)
  routes/                       ← shims into $lib/routes (generated, dogfood)
  hooks.server.ts               ← one-line `import '$lib/hooks';`
  app.html                      ← loads /api/assets/inline-svg.css

bin/                            ← CLI (`bunnytrail init` + `bunnytrail sync`)
  shims.ts                      shared shim generator (engine + consumer modes)
  init.ts                       scaffold a new world repo
  sync.ts                       regenerate consumer shims after engine update
  templates/                    static + .tpl files for `init`

sample-world/                   bundled fixture; default if BUNNYTRAIL_WORLD_DIR unset
scripts/
  generate-shims.mjs            delegator to bin/shims in engine mode
  smoke-sample-world.ts         loader smoke test
```

## Conventions

- **TypeScript everywhere.** No `any` without a comment explaining why.
- **Path aliases**: `$lib/*` → `src/lib/*` (SvelteKit default).
- **Formatting**: Prettier (`.prettierrc`). Run `npm run format` before
  committing.
- **Tests**: Vitest. Co-locate `*.spec.ts` next to the source.
- **Routes**: every route's real impl lives in `src/lib/routes/<name>/`
  as `load.ts` + `Page.svelte` (or `handler.ts` for endpoints). The
  shim under `src/routes/` is generated — don't hand-edit it.
- **Commit messages**: short, imperative subject. No ticket prefixes —
  this project doesn't use an issue tracker.

## Local dev tooling for agents

- **Headless browser** (`chrome-devtools-mcp`) is configured in
  `opencode.json`. When `npm run dev` is running, an agent can navigate
  to `http://localhost:5173`, take screenshots, inspect the DOM, read
  the console, and watch network traffic.
- **Working agreement** for agents using the browser:
  - Assume the user keeps `npm run dev` running. Don't try to start
    or stop it; if it isn't reachable, say so instead of attempting
    recovery.
  - Default base URL is `http://localhost:5173`.
  - Screenshots cost tokens — take them when verifying your own
    change, when asked, or when a console error needs visual context.
    Prefer console/network checks for "did my change break anything".

## Where to put new things

- **New engine route** → `src/lib/routes/<route>/` with `load.ts`
  + `Page.svelte` (or `handler.ts` for endpoints). Then add an entry
  to the `planShims` table in `bin/shims.ts`, run
  `node scripts/generate-shims.mjs`, and bump consumers via
  `npx bunnytrail sync`.
- **New UI primitive** → `src/lib/components/`. Existing primitives:
  `EntityCard`, `EntityLink`, `PageHeader`, `PropertyList`, `Tag`.
- **New loader feature / graph method** → `src/lib/server/`. Anything
  exposed to routes goes through `graph.ts`.
- **New entity/kind/lens semantics** → these are worldbuilding
  decisions, not engine decisions. Add support for the data shape
  here; the worldbuilding contract itself lives in the consumer repo
  (`alteria_world/STRUCTURE.md`, `WORLDBUILDING.md`, `WIKILINKS.md`).
- **New CLI subcommand** → drop a `bin/<name>.ts` exporting
  `run(argv): Promise<number>`, wire a case in `bin/bunnytrail.ts`.

## Wikilinks

The wikilink resolver lives in `src/lib/server/markdown.ts`. The
authoring contract — `[[type/slug]]`, anchors, language tags, kind
links, the collection fold-out directive, ambiguity, and the global
suffix-match resolution rule — is documented in the consumer repo
under `alteria_world/WIKILINKS.md`. Engine work that touches
resolution behaviour should update that contract doc in the consumer
repo as well.

## Shipping engine changes

1. Edit on this repo, run `npm run check` + the relevant tests.
2. Dogfood against `sample-world` (or your real world via
   `BUNNYTRAIL_WORLD_DIR`).
3. Commit + push to `main`. The repo is public; no publish step.
4. In the consumer: `npm update bunnytrail` (and `npx bunnytrail sync`
   if routes changed), commit + push. Vercel auto-deploys.

## Agent etiquette

- **Plan with TodoWrite** for multi-step changes.
- **Prefer editing** existing files over creating new ones.
- **Reach for the reusable components first.** Before writing a new
  card/list/link with bespoke CSS, check `src/lib/components/`. If a
  reusable is _almost_ right but its API doesn't fit, extend it
  rather than copy its chrome into a new component.
- **Don't scaffold new top-level files** (READMEs, configs) without
  being asked.
- **Keep changes small** and focused on a single concern.
