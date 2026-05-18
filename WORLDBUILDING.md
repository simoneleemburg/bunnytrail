# WORLDBUILDING.md

Editorial standards for working in `content/`.

The compendium is the user's personal worldbuilding project. Agents
assist with structure, phrasing, and consistency — not with inventing
the world. This document records the rules that make the compendium
sound the way it does.

If you are an agent and you have only enough context for one rule:
**don't invent canon.** Everything else in this file is downstream of
that.

## The texture we are aiming for

The compendium is written as if compiled from many partial sources
across many centuries — a real archive, not a wiki. That has
specific consequences for voice:

- **Incomplete.** It is fine, and often correct, to record that
  something is not yet known. Gap-notes are first-class content.
- **Partisan in places.** Where real long-lived custodians of this
  material would plausibly disagree, the compendium records the
  contest rather than resolving it.
- **Honest about both.** Where something is settled in the world,
  it is written plainly. Where it isn't, the gap or the dispute is
  visible on the page, not hidden between entries.

The compendium has the texture of a real archive. It is not the
texture of a debate club, and it is not the texture of a wiki.

## The rules

### Don't invent canon

Editing prose for clarity, rhythm, and tone is fine. Adding new
facts about the world is not — even small ones. If the user's brief
says "rare serpent-humanoid lineage," don't extend it into specific
habitats, customs, or history. If a character or place needs more
detail than the brief provides, either ask the user, leave the text
short, or make the gap explicit (a parenthetical italic note like
_"How X came to Y is not yet recorded here."_ is preferred over
silent omission, so the gap is visible later).

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

Short entries are fine. A stub entry with a one-line summary and a
gap note is better than a paragraph of generic worldbuilding. The
compendium grows by being fed real material, not filler.

### Tags are for cross-cutting affinities, not duplicates of first-class fields

If `kind: planet` is set, don't also add `planet` to `tags`. Same
for `gender`, `era`, `status`, etc. Use tags for themes, motifs,
and connections that the structured fields don't already capture
(e.g. `ocean`, `ruins`, `pilgrimage`, `border`). Keeping tags clean
keeps them useful.

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
  controversy. Gap-notes are the right tool for "we don't know
  yet"; disputes are the right tool for "the in-world record itself
  disagrees."

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
  prompted? If not, remove or gap-note.
- Did I make any inferences? If yes, am I going to flag them in
  chat after the edit?
- Did I propagate a claim from one entry into another? If yes,
  surface the propagation in chat rather than burying it.
- Did I resolve an in-world disagreement that the rule on disputed
  truths says I should leave open? If yes, restore the contest.
- Did I add tags that duplicate first-class fields? If yes, drop
  them.
- Is the entry padded? If yes, prefer a gap-note to filler.

## When in doubt

Ask the user. Short entries, visible gap-notes, and "is this what
you meant?" are all cheaper than the cost of inventing canon that
the user then has to either accept against their judgement or
unwind.
