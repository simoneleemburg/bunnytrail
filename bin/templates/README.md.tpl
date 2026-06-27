# __NAME__

A worldbuilding compendium powered by [bunnytrail](https://github.com/simoneleemburg/bunnytrail).

## Layout

```
content/             your worldbuilding entities (one folder per entity)
content_meta/        kinds taxonomy, blog posts, guides
assets/              optional: world-wide styles / images
src/                 thin SvelteKit shell — routes are shims into bunnytrail
```

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
```

The engine reads `BUNNYTRAIL_WORLD_DIR` from `.env` (defaults to this
repo's root, which is what you want).

## Deploy

This repo is configured for Vercel via `adapter-vercel`. Push to a
branch connected to a Vercel project; the site prerenders entirely at
build time.

### Gating the world (optional)

To put the world behind a passphrase:

1. Set `BUNNYTRAIL_WORLD_SECRET` (the passphrase) in the Vercel
   **runtime** environment. This drives the auth check.
2. Set `BUNNYTRAIL_SSR=1` in the Vercel **build** environment — or
   prepend it to the `buildCommand` in `vercel.json`
   (`"BUNNYTRAIL_SSR=1 npm run build && …"`). This flips the site from
   prerendered to SSR so the auth hook runs on every request.

Both are required for a gated deploy. `BUNNYTRAIL_WORLD_SECRET` is
sensitive (runtime-only, invisible to the build), which is why the
render mode is driven by the separate, build-visible `BUNNYTRAIL_SSR`.
Leave both unset for a public, fully-prerendered world.

## Update the engine

```bash
npm update bunnytrail
npx bunnytrail sync   # regenerates src/routes/ shims if engine routes changed
git commit -am 'bump bunnytrail'
```
