# TODO

Working notes on what's next for the Alteria compendium. Out-of-universe;
this file is not loaded by the site.

## Vocabulary

- **"Piloting" needs a better word.** Not sold on it for what an
  Eidolon Knight does — Nearing toward a bound Naya through a
  vessel, sustained dissociative contact, fit with the Naya's
  nature. "Piloting" reads too mechanical for what is structurally
  closer to riding, partnering, or attending. Whatever the term
  ends up being, it probably deserves its own entry rather than
  just being a section inside the Eidolon Knight page.
- **"Eidolon" may want renaming.** The word reads as borrowed
  (Greek-derived out of universe) and currently has no in-world
  language attached. Decide whether _Eidolon_ stays — as a
  Thallish word, an order's working term, or something else — or
  is replaced by another word. If it stays, it needs a
  language-of-origin attribution (or an explicit gap-note that
  the question is open). If it goes, the rename touches a lot of
  entries.

## Cosmology to add

- **Black hole / Void stuff.** The Dark Companion entry is in
  (`places/the-dark-companion`), and the Cognita map now shows the
  Hollow Binary across the long gulf. The entry deliberately gap-notes
  the connection to the broken god, the shattering, and fallen Naya;
  those connections still need their own framing. Once that framing
  exists, the Dark Companion entry and possibly Skyblood and the Void
  will need updating to point at it.
- **Fallen Naya, cosmic threats, entropy.** Material on Naya that
  have gone wrong in some larger-than-individual sense, on
  cosmology-scale threats, and on the cosmology's relationship
  with entropy. Currently the Void entry handles broken Naya at
  the dissolution scale; this is the bigger frame. Decide the
  relationship between fallen Naya and the broken-god material
  before writing — they may be the same thing or two distinct
  registers of the same shattering.
- **Moons.** Lock in the moons of Bayurinda — We know she has two of them, 
  but they're currently absent.
- **Pantheon.** Move in the entire pantheon. Amon and Danu are
  the obvious ones the existing entries already gesture at
  obliquely ("the shattered god," "the shattering"); there is more.
  Decide naming and entry structure before importing.

## Sources to integrate

- **World Anvil.** Pull across whatever from World Anvil should
  be kept. Triage first — not everything will survive the
  compendium's tone and "don't invent canon" rules.
- **Old conlang work (Thallish).** Thallish is confirmed as a
  named in-universe language (distinct from Old Tongue);
  _Asthera_ and _Nareth_ are Thallish words and are tagged
  `[[tha]]`. A stub language entry exists at
  `content/languages/thallish/`. Still to do: import the existing
  Thallish material; record which people speak it and on which
  world; explain how _Asthera_ and _Nareth_ became universal
  cosmological terms when other Thallish vocabulary did not.
- **Nebelheim setting material.** Move in the existing Nebelheim
  setting writing — most likely as expansion of the Nebelheim
  place entry plus character/social entries for specific
  Nebelheimic figures and institutions.

## New entities to add

- _(none currently)_

## Structural work

- **Model the missing kinds and clear unregistered-kind warnings.**
  `/health` currently lists 17 entities across 8 unregistered
  kinds: `action` (binding, eidolon-starfaring, nearing),
  `construct` (eidolons, world-pillars), `language` (all five
  language entries), `material` (skyblood, urouch, vochran),
  `order` (knights-of-bellona), `phenomenon` (nearborn), `role`
  (eidolon-knight), and `working partnership` (oracle-triad).
  The taxonomy currently has only `being/*` and `place/*` trunks;
  the rest need new trunks under `content_meta/kinds/`.
  - Decide the taxonomy: which of these eight are real trunks
    (`action`, `material`, `language`?), which are subdivisions
    of a broader trunk (is `working partnership` an `order`?
    is `role` a `culture/*` thing or a being-trunk thing?), and
    which need renaming altogether (`construct` reads vague —
    `eidolon` itself may be the kind, with world-pillars a
    subkind).
  - Author `_kind.yaml` (singular/plural overrides, description)
    and `_kind.md` (long-form, where it earns it) for each.
    Follow the meta/content rule — kind docs describe the
    abstraction, not the specific instances.
  - Fix any kind: fields on entities once their target kind
    exists. `/health` should be clean of "is not registered"
    warnings after this pass.
- **Redesign the orbits view as a system/body diagram.** The
  current orbits view-mode on collection pages is a filter chip
  alongside _Nested_ and _Flat_ — useful for inspecting the
  `member-of` / `orbits` tree but visually indistinguishable from
  the other modes. Replace it with a proper diagram:
  - On a **star system** page (`places/celestial/aureth-system/`,
    `places/celestial/hollow-binary/`), render a small map of the
    system itself — star(s) in the centre, planets on their
    orbital arcs, moons around their planets. Clickable.
  - On a **celestial body** page (planet, moon, star), render a
    contextual diagram showing what the body is part of: its
    parent system, its siblings, and its own children (moons of
    a planet, planets of a star). The current body is highlighted;
    everything else is a click away.
  - The data source is the existing `member-of` / `orbits` relations
    on entities, so this is a generalisation of the hand-coded
    Cognita map rather than a parallel system. Once it exists,
    the Cognita map at `/cognita` is either replaced by it
    (pointed at the Aureth system as the "home" view) or kept
    as an editorial flourish — decide once the generalised
    diagram is working.
  - Visual register should match the rest of the site: quiet,
    field-notebook ink-on-paper, not video-game UI. Hand-drawn
    feel where possible.
  - The filter-chip _Orbits_ view-mode on collection pages can
    then be removed; the diagram lives on the relevant entity /
    system page directly, not as a list-view variant.
- **Meta/content rule tension on kindred kinds.** WORLDBUILDING.md
  says meta must not reference specific instances, but the
  `naya`, `nguwari`, and especially `urouthi` `_kind.md` files
  all do — Nareth, Nuunlau, Bayurinda, Vochran, Urouch, the
  drowning, Deep Speech, the inscriptions. Urouthi is the most
  flagrant: most of its prose is a single-population history
  rather than a general kindred description. Decide whether to
  (a) loosen the rule for kindred kinds, (b) reshape these
  pages to keep only structural canon (anatomy, biology,
  capacities) and move instance-history to relevant
  `content/` pages (Nuunlau, a new "drowning" entry, etc.), or
  (c) accept these as documented exceptions and tighten the
  rule everywhere else. Worth deciding before the next kindred
  migration.
- **Multiple creation stories.** The compendium needs to be able
  to hold multiple creation stories and pieces of lore tied to
  specific cultural contexts, without flattening them into one
  "correct" version. Probably means a structural decision about
  how stories-told-by-cultures are represented — either as
  per-culture sections inside a single concept entry, or as
  separate `stories/` entities with provenance metadata, or
  something else. Think about it before importing pantheon and
  cosmogony material so the structure doesn't have to be
  retrofitted.
