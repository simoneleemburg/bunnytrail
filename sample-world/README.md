# Embergrove — sample world

A tiny, synthetic world the **bunnytrail** engine ships with so
new contributors can run `npm run dev` and see something meaningful
at `http://localhost:5173` without having a real worldbuilding
content tree lying around.

Two clusters (`mistwood`, `tideholm`), six entities, two kinds,
one guide. Just enough to exercise:

- cluster nav and scope switching
- shelf nav (`/mistwood/people`, `/mistwood/places`)
- entity pages with wikilinks (`[[alder]]`, `[[stone-circle]]`)
- backlinks ("Mentioned by" sections)
- the `/kinds` taxonomy view
- both authoring layouts (frontmatter and sidecar — see
  `mistwood/places/stone-circle/`)
- the `/guides/welcome` landing

To point the engine at your own world instead, set
`BUNNYTRAIL_WORLD_DIR` to its absolute path. The loader will look
for `content/`, `content_meta/`, and `assets/` under that path.
