# WORLDBUILDING.md

Editorial standards for working in `content/`.

The compendium is the user's personal worldbuilding project. Agents
assist with structure, phrasing, and consistency — not with inventing
the world. This document records the rules that make the compendium
sound the way it does.

If you are an agent and you have only enough context for one rule:
**don't invent canon.** Everything else in this file is downstream of
that.

## The universe and its regions

**Alteria is the universe** — the whole cosmology, including every
region in it, charted or not. Within Alteria, **regions** are the
distinct cosmological neighbourhoods that have been given a place
in the compendium so far. Regions live as top-level folders under
`content/`.

There is currently one region:

- **Aurethia** (`content/aurethia/`) — the Aureth system and its
  immediate neighbourhood. Mythic, resonance-aware, the part of
  Alteria the field-notebook has charted in depth.

The phrase **Alteria Cognita** — already in use on the site — names
"the part of Alteria that has been charted." It is a frame, not a
folder: today it covers Aurethia; if another region is added later,
Alteria Cognita grows to cover it too.

A few consequences of this split that matter for editorial work:

- **The substrate is universal.** The phenomena described by
  Aurethia's records — resonance, Nearing, the Naya, urouch — are
  expressions of the actual physics of the universe, not local
  specialities of one corner of it. Other regions of Alteria may
  perceive the substrate poorly, or describe it under different
  vocabularies, or fail to recognise it as a shared layer at all;
  none of that makes the substrate localised.
- **Kinds are universal.** `content_meta/kinds/` describes
  categories in the abstract — what a human is, what a phenomenon
  is. Kinds apply across regions; they are not scoped to one
  region's records. A kind that has so far only been observed in
  Aurethia (e.g. `kinds/nearborn`) is still defined as a universal
  category; its current pattern of attestation is an empirical
  fact about the world's records, not a definitional restriction.
- **Cross-region contact is permitted in principle.** The
  cosmology does not forbid it. No specific contact event is
  canonical unless the user has stated one. Weird-history
  interpretations, anomalous-archaeology readings, and
  cross-region accounts are valid content categories — recorded as
  `kind: account` entries with appropriate framing — but they are
  not licence to invent canon, only licence to record disputed
  framings the user has set up.
- **Don't rewrite existing prose to retrofit the new model.** Older
  entries that say "Alteria" where they now technically mean
  "Aurethia" stay as they are. Naming reconciliation is editorial
  work the user does entry by entry; an agent's job is to use the
  right names in *new* prose and structural fields, not to sweep
  through the archive.
- **Keep the meta/content rule intact, scaled up.** Just as a kind
  doc must not name a specific instance, a region's records must
  not silently extend their reach into the substrate or into
  another region. A claim about Aurethia is a claim about Aurethia;
  a claim about the universe-as-such is a claim about the
  universe.

## The texture we are aiming for

The compendium is written as if compiled from many partial sources
across many centuries — a real archive, not a wiki. That has
specific consequences for voice:

- **Incomplete.** Most of the world is not yet recorded here, and
  that is the default state. The compendium reflects what has been
  given a place — no more. Absence is silent; we don't narrate
  what's missing.
- **Partisan in places.** Where real long-lived custodians of this
  material would plausibly disagree, the compendium records the
  contest rather than resolving it.
- **Honest about what is here.** Where something is settled in the
  world, it is written plainly. Where the in-world record disputes
  itself, the dispute is visible on the page rather than smoothed
  into a single account.

The compendium has the texture of a real archive. It is not the
texture of a debate club, and it is not the texture of a wiki.

## The rules

### Don't invent canon

Editing prose for clarity, rhythm, and tone is fine. Adding new
facts about the world is not — even small ones. If the user's brief
says "rare amphibious people," don't extend it into specific
habitats, customs, or history. If a character or place needs more
detail than the brief provides, either ask the user or leave the
text short. Don't narrate what's missing: silent omission is the
correct treatment, and the world is limitless by definition — every
entry is necessarily a fragment. If a missing thread feels worth
returning to, add it to `QUESTIONS.md` instead of flagging it in
the prose.

### Flag any inferences you do make

When an inference is unavoidable — e.g. a section needs a connecting
sentence to read coherently — call it out in chat after the edit.
Don't bury small worldbuilding claims in otherwise-routine prose.

### Cite the user's prompt

If you're paraphrasing something the user wrote, stay close to their
phrasing and don't expand its scope. "Identity tied to
transformation" should not become "identity expressed through
ritualised transit-rites" without a prompt.

### Empty is better than padded

Short entries are fine. A one-line summary beats a paragraph of
generic worldbuilding. The compendium grows by being fed real
material, not filler — and the absent material is silently absent,
not narrated as absent.

### Tags are for cross-cutting affinities, not duplicates of first-class fields

If `kind: planet` is set, don't also add `planet` to `tags`. Same
for `gender`, `era`, `status`, etc. Use tags for themes, motifs,
and connections that the structured fields don't already capture
(e.g. `ocean`, `ruins`, `pilgrimage`, `border`). Keeping tags clean
keeps them useful.

### Kinds, instances, and lenses

The compendium is built on one foundational separation and a
number of optional ones layered on top.

The foundational separation is between **kinds** and
**instances**:

- **Kinds** live in `content_meta/kinds/` and describe categories
  in the abstract — what a human is, what a phenomenon is, what
  makes something a celestial body. Kinds are general; they exist
  apart from any specific thing.
- **Instances** live in `content/` and describe specific things —
  this person, this planet, this language, this event, this
  account. Every instance declares exactly one `kind:` (its
  membership in the taxonomy) and lives at one folder location
  (its narrative shelf, for browsing).

`kind:` is single, mandatory, and foundational. Folder location
is editorial — pick the shelf that makes the entry easy to find
while browsing, with no semantic claim attached.

On top of that, instances may carry **lenses** — additional
structured views, each declared as an optional field. Lenses are
multiple, optional, and dimensional. The lenses currently in use:

- **Spatial.** Where the instance sits in the world's geography
  and structure. Declared via
  `relations: - kind: <verb>, target: <entity-id>` (e.g.
  `member-of`, `located-in`, `orbits`, `occurred-on`). Folder
  placement is not a substitute — a moon isn't "in" the planet
  just because the folder nests; the spatial claim is the
  relation.
- **Temporal.** When in the world's editorial timeline. Declared
  via `relations: - kind: occurred-in, target: history/<age>`,
  pointing at one of the registered ages
  (`history/mythic`, `history/pre-recorded`,
  `history/recorded`, `history/current`).
- **Account-relative.** Which in-world records hold an event,
  in what order. Declared on the _account's_ page via
  `relations: - kind: records, target: history/<event-id>`. The
  same event may appear in multiple accounts with different
  emphasis, ordering, and prose; the compendium gathers them
  without choosing.
- **Kind-affinity.** Cross-cutting structured pointers from an
  instance to one or more kinds. Declared as named YAML fields
  with `kinds/<id>` values (e.g. `nativeBeings: [kinds/human]`,
  `traits: [kinds/nearborn]`). Each named field has a curated
  inverse label (see `src/lib/server/kindLinkLabels.ts`) that
  controls how the back-reference reads on the kind's page.

A new lens earns its place when there is a _kind_ of relation
the world repeatedly carries that the existing lenses don't.
Adding a new lens is small (a relation verb, perhaps an inverse
label); it should still be a deliberate choice, not a habit of
shape-shifting.

### Content references meta; meta does not reference content

The taxonomy under `content_meta/` describes **general** categories
— what a human is in the abstract, what a phenomenon is, what makes
something a celestial body. The instances under `content/` describe
**specific** things — this person, this planet, this language.

The reference relationship is strictly one-directional:

- **Content may reference meta freely.** A character's prose can
  say "she is [[kinds/human|human]] still"; a place's YAML can
  declare `nativeBeings: [kinds/human]`; a culture's prose can
  link to the kind page for the kind of phenomenon it venerates.
- **Meta must never reference a specific instance.** The `human`
  kind doc must not name which planets humans live on, which
  kingdoms they founded, which Naya they bond, or which tongues
  they speak. Those are facts about specific places, factions, and
  events — they belong on the relevant `content/` page.

The test is the abstraction question: **would this sentence stop
being true if I deleted that specific place / character / language
from the compendium?** If yes, it's an instance fact and belongs in
`content/`. If no, it's a general fact and can stay in
`content_meta/`.

Variants are still meta. If humans of Asthera and humans of
Nebelheim are meaningfully different _as a kindred_ — different
biology, different lifespan, different intrinsic abilities — that's
a sub-kind under `content_meta/kinds/being/mortal/human/`, not
content. If they differ only in _what they have done with their
lives_ — culture, language, history, polities — those facts live in
`content/` on the relevant places, peoples, and characters.

Allowed (lives in `content_meta/kinds/being/mortal/human/_kind.md`):

> Humans are short-lived by the standards of the longer-lived
> kindreds, and reproduce sexually within their own kind. They are
> attested in several variants across the worlds, distinguished
> chiefly by lifespan and by their relationship to dreaming.

Not allowed in the same file:

> Humans on Asthera mostly live in the kingdoms of the southern
> continent; on Nebelheim they speak Old Tongue as a liturgical
> language.

The same direction applies to relations. A "where is this kind
native?" fact is recorded on the **place** as
`nativeBeings: [kinds/<id>]` (or the appropriate
`native…: kinds/<id>` field for other kind families), pointing into
the registry. A kind doc never declares "this kindred is native to
[that planet]" — that would be the meta layer reaching down into a
specific instance, which is exactly the direction this rule
forbids.

### Disputed truths are a feature, not a bug — when they belong

For the kinds of facts that real long-lived cultures, archives, and
institutions actually disagree about — origin stories, the meaning
of ruins, the lineage of a practice, what a Naya "really" is, the
proper name of a place known to several peoples, how a war was won
and by whom — there is often no single authoritative answer. Record
the contest: attribute the dominant reading to "long tradition" or
to a named position, name the dispute, and resist the urge to
resolve it on the user's behalf. Phrases like _"by long tradition,
…; this is disputed,"_ _"some accounts hold …, others hold …,"_
and _"the question is not settled here"_ are preferred over a
single confident voice.

This is _not_ a license to invent contradiction for flavour. The
test is in-world plausibility of disagreement: would real custodians
of this material, given the kind of evidence they have, plausibly
disagree? If yes, write the dispute. If no, write it plainly. Some
things genuinely do not admit of dispute and should not be hedged:

- mechanics and physics that are the same for everyone (a Pillar
  launches or it doesn't; the Dark Companion is a black hole; two
  moons hang over Bayurinda);
- structural facts of the compendium itself (who is in the Oracle
  Triad, which world a character is from, what a wikilink resolves
  to);
- facts the user has stated as canon — those are canonical unless
  the user later says they are disputed; don't invent a contrarian
  reading to "balance" a prompt;
- stub material — a short entry doesn't need a manufactured
  controversy. Silent omission is the right treatment for "we
  don't know yet"; disputes are the right tool for "the in-world
  record itself disagrees."

## Intersections

A worldbuilding principle, borrowed from Brandon Sanderson among
others: **worlds come alive at the intersections.** A single idea
in isolation reads as decoration. The same idea connected to two,
three, five other parts of the world starts to read as load-bearing
— as something the world actually rests on rather than something
the author thought up.

This compendium is at its best where intersections do real work:

- the drowning on Bayurinda → the lost surface civilisation → the
  inscriptions on the ocean floor → the deep's centuries-long
  reconstruction → the Old Tongue as it is now used everywhere →
  the Oracle Triad's distinctive labour of translating Naya into
  Old Tongue names;
- the Naya being natively of Nareth → needing a vessel to persist
  in Asthera → the Eidolon being what gives them one → the Knight
  being a third party to that pact, not its participant → the
  consent question being about the Naya's relationship to the
  vessel, not to the Knight;
- being Nearborn as the in-world reading of trans identity →
  Nearing as practice → piloting as sustained Nearing toward a
  bound Naya → adaptive identity as what piloting actually demands
  → the order's screening problem of distinguishing "Nearborn" in
  the cultural sense from "Nearborn enough to pilot."

Notice that these chains were not invented to be chains. Each step
is a separate decision in the world; the connection emerges because
the decisions are consistent with each other.

**The agent's job around intersections is to notice, not to
manufacture.**

In practice:

- **When editing one entry, consider what its claims imply about
  adjacent entries.** If a new fact about Bayurinda implies
  something about the Old Tongue, the Triad, or the deep, surface
  the implication for the user — don't quietly propagate it into
  the other entries, and don't quietly suppress it.
- **When the user adds a single new idea, look for the connections
  they have already implied** rather than the ones you could
  invent. The user said _Asthera and Nareth are Thallish_. The
  connections that follow honestly are: those words are tagged
  `[[tha]]`; the Old Tongue entry's claim about their attribution
  needs updating; a Thallish language entry needs to exist for the
  tag to resolve. The connections that do _not_ follow honestly:
  who speaks Thallish, what world they live on, how the words
  travelled. Those are new ideas the user has not added.
- **When adding cross-references, prefer load-bearing connections
  to decorative ones.** A `[[cosmology/nearing|Nearing]]` link
  inside the Eidolon Knight entry is load-bearing: piloting _is_
  Nearing. A `[[places/sharazan|Sharazan]]` link in an entry that
  just mentions Sharazan in passing is decoration. Both are
  permitted; the first is what makes the world feel real.
- **When the user resists a connection you proposed, drop it.**
  The user is the one with the model of the whole; an agent's
  pattern-match on "this would connect to that" is not the same
  signal. Discard cleanly.

The point is not that the world should be maximally
inter-referential. It is that the connections that exist should be
ones the world actually has, and they should be visible.

## Practical checklist before saving an edit

- Did I add any new facts about the world? If yes, was each one
  prompted? If not, remove it. If it's a thread worth returning
  to, add it to `QUESTIONS.md`.
- Did I make any inferences? If yes, am I going to flag them in
  chat after the edit?
- Did I propagate a claim from one entry into another? If yes,
  surface the propagation in chat rather than burying it.
- Did I resolve an in-world disagreement that the rule on disputed
  truths says I should leave open? If yes, restore the contest.
- Did I add tags that duplicate first-class fields? If yes, drop
  them.
- Did I leave `kind` off the YAML? If yes, fill it in — every
  entity must declare its kind.
- If I'm editing under `content_meta/`, did I name a specific
  place, person, language, or event? If yes, that fact belongs in
  `content/`, not in the meta layer.
- If I added a "native to" / "lives in" / "found on" relation, does
  it point from `content/` outward (toward a kind or another
  content entity), not from a meta doc inward at a specific place?
- Is the entry padded? If yes, cut it back. Don't replace filler
  with a note about what's missing — just let it be short.

## When in doubt

Ask the user. Short entries, an open question logged in
`QUESTIONS.md`, and "is this what you meant?" are all cheaper than
the cost of inventing canon that the user then has to either accept
against their judgement or unwind.
