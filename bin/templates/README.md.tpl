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

## Update the engine

```bash
npm update bunnytrail
npx bunnytrail sync   # regenerates src/routes/ shims if engine routes changed
git commit -am 'bump bunnytrail'
```
