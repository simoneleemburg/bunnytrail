# Bunny World — sample world

A tiny, synthetic world the **bunnytrail** engine ships with so
new contributors can run `npm run dev` and see something meaningful
at `http://localhost:5173` without having a real worldbuilding
content tree lying around.

Two clusters (`mistwood`, `tideholm`), nine entities, three kinds
(`person`, `place`, `bunny`), one guide, and a soft pink-and-blue
theme. Just enough to exercise:

- cluster nav and scope switching
- shelf nav (`/mistwood/people`, `/mistwood/bunnies`, …)
- entity pages with wikilinks (`[[alder]]`, `[[pip]]`,
  `[[stone-circle]]`)
- backlinks ("Mentioned by" sections)
- the `/kinds` taxonomy view
- both authoring layouts (frontmatter and sidecar — see
  `mistwood/places/stone-circle/`)
- the `/guides/welcome` landing
- **per-entity theming hooks** — open `assets/theme.css` and
  `/guides/welcome` side by side. Each bunny carries its own
  signature pigment (rose / sky / lavender / butter) on every
  wikilink that points at them; the entire `bunny` kind picks
  up a soft-pink dotted underline anywhere it's mentioned. Both
  effects come from the engine's `bt-link` / `data-bt-slug` /
  `data-bt-kind` hooks documented in `bunnytrail/AGENTS.md`.

To point the engine at your own world instead, set
`BUNNYTRAIL_WORLD_DIR` to its absolute path. The loader will look
for `content/`, `content_meta/`, and `assets/` under that path.
