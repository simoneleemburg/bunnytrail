---
title: Welcome to Bunny World
summary: A two-minute tour of the bunnytrail sample world, with bunnies.
eyebrow: Sample fixture
---

This is the **Bunny World** sample, shipped with the
[bunnytrail](https://github.com/simoneleemburg/bunnytrail) engine.
It exists to give the engine something to render at first run —
and to show off its theming hooks with a small cast of bunnies.

There are two clusters — switch between them in the masthead:

- **Mistwood** — a quiet forest realm. Meet [[alder]] and
  [[briar]], visit the [[stone-circle]], and say hello to
  [[pip]], [[clover]], and [[mulberry]].
- **Tideholm** — a harbor town with one harbor-master,
  [[meren]], and one butter-coloured dune bunny, [[saffron]].

## A theming demo

Notice how each bunny's name appears in its own colour wherever
it's mentioned in this guide:

- [[pip]] reads in cherry-rose,
- [[clover]] in forget-me-not blue,
- [[mulberry]] in lavender, and
- [[saffron]] in soft butter.

That's not magic. The engine attaches a `bt-link` class and a
`data-bt-slug="<name>"` attribute to every wikilink in rendered
prose, and the world's `assets/theme.css` matches on those to
give each bunny their signature colour. The same hooks let a
world theme by entity *kind* (`data-bt-kind`) — try it out by
opening `sample-world/assets/theme.css` and adjusting the
palette.

The tinting is also scoped: it fires here in the welcome guide
and on each bunny's own page, but a passing mention from a
non-bunny page stays the standard link colour. That scoping
uses `data-bt-section`, the layout-level attribute the engine
sets on `<main>` from the URL's first path segment.

When you're ready to start your own world, set
`BUNNYTRAIL_WORLD_DIR` to point at a different folder. The
loader will look for `content/`, `content_meta/`, and `assets/`
under that path.
