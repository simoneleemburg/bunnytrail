# WIKILINKS.md

The full contract for `[[…]]` syntax in Alteria prose. Pulled from the
actual implementation in `src/lib/server/loader.ts` and
`src/lib/server/markdown.ts` — this file is the reference, not those.

If you only read one line: **bare slugs resolve inside the writing
entity's cluster**, with a fallback to any universal-substrate folder.
Cross-cluster references must spell the full path. Cluster-prefixed
paths and links written from pages without a cluster (kinds, tags,
aggregate views) resolve globally.

## Clusters and the universal substrate

A **cluster** is a top-level folder under `content/` — currently
`aurethia` and `earth`. The cluster set is derived at load time from
the first segment of every entity id (excluding folders that are
themselves entities), so adding a new top-level cluster requires no
code change.

A **universal substrate** is a top-level folder that opts out of being
a cluster by declaring `universal: true` in its `_collection.{yaml,md}`
metadata. The compendium's universal layer is `foundation/`. Entities
under a universal substrate sit "underneath" every cluster — bare-slug
links from any cluster fall through to the universal layer if they
don't resolve locally.

The cluster of a wikilink is the cluster of the **page rendering the
link**. Most rendering happens from inside an entity page, where the
cluster is the entity id's first segment. Universal-substrate roots
(e.g. `foundation`) count as their own scope: a bare slug written
inside `foundation/` resolves against `foundation/` first, exactly as
a bare slug inside `aurethia/` resolves against `aurethia/`. Kind
pages, tag pages, the everything-index, and other aggregate views
have no cluster — links in their prose use global resolution (see
below).

## Supported forms

| Form                             | Example                                | Resolves                                                                                | Renders as                                              |
| -------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Full path                        | `[[places/sharazan]]`                  | Exact id, then global suffix match                                                      | `<a href="/places/sharazan">sharazan</a>`               |
| Multi-segment path               | `[[aurethia/history/the-naming]]`      | Same                                                                                    | `<a href="/aurethia/history/the-naming">the naming</a>` |
| Path with display label          | `[[places/sharazan\|Sharazan]]`        | Same                                                                                    | `<a href="/places/sharazan">Sharazan</a>`               |
| Bare slug                        | `[[nuunlau]]`                          | Cluster-local, then universal substrate (or global if rendered from a non-cluster page) | `<a href="/…/nuunlau">nuunlau</a>`                      |
| Path + heading anchor            | `[[characters/kael#oaths]]`            | Path resolved; anchor appended verbatim                                                 | `<a href="/characters/kael#oaths">kael</a>`             |
| Path + anchor + label            | `[[characters/kael#oaths\|his oaths]]` | Same                                                                                    | `<a href="/characters/kael#oaths">his oaths</a>`        |
| Same-page anchor                 | `[[#on-the-name\|the name]]`           | Heading on the current page                                                             | `<a href="#on-the-name">the name</a>`                   |
| Kind link                        | `[[kinds/human]]`                      | Validated against the kind registry                                                     | `<a href="/kinds/human">human</a>`                      |
| Kind link + label                | `[[kinds/human\|human]]`               | Same                                                                                    | `<a href="/kinds/human">human</a>`                      |
| Language tag                     | `[[tha]]`                              | 2–8 lowercase letters; must match a registered `meta.code`                              | `<sup class="lang-tag"><a href="/…">tha</a></sup>`      |
| Collection fold-out (whole-line) | `[[collection:places/bayurinda]]`      | Path of a known collection                                                              | `<details class="collection-include">…</details>`       |

**The label order is `target|label`**, not `label|target`. Easy mistake
if you're coming from Obsidian or MediaWiki.

## Display text defaults

If you don't supply a label, the rendered text is the **last `/`-segment
with hyphens turned into spaces**. So `[[characters/kael-of-ashes]]`
renders as `kael of ashes`. Add `|Kael` if you want it cased.

## Resolution algorithm

Given a raw path `P` and a rendering cluster `C` (possibly null):

1. **Global branch.** Used when either:
   - `P`'s first segment is a known cluster id or universal-substrate id
     (e.g. `[[aurethia/...]]`, `[[foundation/...]]`); or
   - `C` is null (kind / tag / aggregate pages).

   Then:
   - **Exact match.** Is `P` identical to a known entity id? Use it.
   - **Suffix match.** Is there exactly one known id ending in `/P`?
     Use it. Two or more → ambiguous; zero → broken.

2. **Cluster-local branch.** Otherwise (`C` is a cluster and `P` is
   unprefixed):
   - **Local exact.** Is `<C>/<P>` a known id? Use it.
   - **Local suffix.** Exactly one id with prefix `<C>/` ending in
     `/P`? Use it. Two or more → ambiguous-in-cluster.
   - **Universal fallback.** Try `<U>/<P>` exact then suffix across
     every universal-substrate root `U`. Exactly one → use it; two or
     more → ambiguous-in-cluster.
   - Otherwise → missing-in-cluster.

Consequences:

- **Bare slugs are scoped.** `[[duskmere]]` written inside
  `aurethia/characters/kael` resolves to `aurethia/.../duskmere` if it
  exists. The same slug appearing on a page in `earth/` would resolve
  to an `earth/.../duskmere` — bare slugs no longer collide across
  clusters.
- **Cross-cluster references are explicit.** From an `aurethia/` page,
  the only way to reach `earth/places/shanghai` is to write the full
  path. Bare `[[shanghai]]` will not silently jump clusters.
- **Universal slugs travel.** From any cluster, `[[harmonia]]` resolves
  to `foundation/concepts/harmonia` as long as there's no
  cluster-local `harmonia` taking precedence.
- **Cluster-local takes precedence over universal.** If both
  `aurethia/.../source` and `foundation/concepts/source` exist, a page
  in `aurethia/` writing `[[source]]` lands on the local one.
- **Links survive entity moves within a cluster.** Suffix matching
  still works inside the cluster, so renaming `aurethia/places/sharazan`
  → `aurethia/places/bayurinda/sharazan` doesn't break
  `[[places/sharazan]]` from sibling pages.
- **Cluster-prefixed paths always resolve globally.** Writing
  `[[aurethia/places/duskmere]]` from anywhere — including from inside
  `aurethia/` itself — uses the global branch. No surprises.

### Authoring guidance

- Bare slugs are fine for the common case: linking to entities in your
  own cluster, or to universal substrate concepts.
- Reach for a full `cluster/type/slug` path when you mean a specific
  entity in another cluster, or when the slug is ambiguous within your
  cluster.
- Don't try to outsmart the universal fallback. If `[[harmonia]]` is
  meant to point at the foundation entry, just write `[[harmonia]]` —
  there's no need to write `[[foundation/concepts/harmonia]]` unless
  the bare slug is shadowed by a local entity.

## What "ambiguous" means

A link is ambiguous when more than one entity matches the resolution
step that would otherwise have won. In the cluster-local branch this
is reported as `ambiguous-in-cluster`; in the global branch as
`ambiguous`. In both cases the system does not pick the first; the
link is treated as broken on both sides:

- **At render time**, you get a broken anchor — `<a href="…"
data-broken="true">` — same styling as any unresolved link.
- **At load time**, a `broken-link` issue is recorded on the health page:
  `wikilink → <raw> (ambiguous: matches a, b, c)`. No backlink edge is
  written.

To fix an ambiguous link: spell out enough of the path to make it
unique. Usually two segments is plenty (`[[places/sharazan]]` rather
than `[[sharazan]]`).

## What "broken" means

A link is broken when:

- it resolves to no entity (`missing` globally, or `missing-in-cluster`
  with no universal fallback hit); or
- it's ambiguous (above); or
- it's a `[[kinds/<id>]]` whose id isn't registered; or
- it's a language tag `[[xx]]` whose code isn't registered; or
- it's a `[[collection:<path>]]` to an unknown collection.

The health-page issue messages distinguish these cases:

- `wikilink → <raw> (not found)` — global miss.
- `wikilink → <raw> (not found in cluster <C>; for cross-cluster references write the full path starting with a cluster name)`
  — bare slug with no local or universal match.
- `wikilink → <raw> (ambiguous: matches a, b, c)` — global ambiguity.
- `wikilink → <raw> (ambiguous in cluster <C>: matches a, b, c)` —
  local or universal ambiguity.

All broken links **render visibly** (`data-broken="true"`) and **show up
on the health page** as `broken-link` issues. Builds aren't blocked.

## What is silently ignored

A few forms match the brackets but fall through every classifier and end
up as the literal text `[[…]]` in the rendered HTML, with no health
issue and no warning:

- Uppercase or mixed-case content (`[[NotAnId]]`, `[[Sharazan]]`)
- Whitespace inside the brackets (`[[with spaces]]`)
- A path starting with a digit (`[[3-ages]]`)
- A leading underscore

If your link doesn't appear at all in the output, this is almost
certainly why. **Lowercase, kebab-case, no spaces.**

## Anchors

Heading anchors on the target page are kebab-case slugs derived from the
heading text (NFKD-normalised, diacritics stripped, non-alphanumerics →
hyphens, lowercased). Duplicate headings get `-2`, `-3`, … so
`[[type/slug#on-the-name]]` actually scrolls.

The anchor itself must be kebab-case: `[a-z0-9][a-z0-9-]*`. Malformed
anchors (uppercase, leading hyphen) are silently dropped from the href.

Anchors are **not allowed on language tags** — `[[tha#anything]]` falls
through to the "broken or literal" path.

## Language tags

`[[xx]]` where `xx` is 2–8 lowercase letters renders as a small
superscript link to the language entity, **provided** an entity exists
somewhere whose `meta.code` matches that string exactly.

- **Lang wins over slug.** If `[[ot]]` could resolve as both a
  registered language code and a bare slug, the language tag wins.
- **Render-time only.** Because the loader skips lang-code-shaped paths
  before resolution, a `[[tha]]` token does **not** produce a backlink
  edge to the Thallish entry. Backlinks to languages only arrive via
  explicit `[[languages/thallish]]` links or structured `relations:`.

If you write `[[ot]]` and there's no language entity with `meta.code:
ot`, you get a visibly-broken lang tag (`<sup class="lang-tag"
data-broken>`), not a fallthrough.

## Kind links

`[[kinds/<id>]]` routes to `/kinds/<id>` and is validated against the
kind registry built from `content_meta/kinds/`. Treat them like any
other entity link in prose — labels and anchors work the same way.

Note: kind references in structured YAML (`nativeBeings: [kinds/human]`,
`traits: [kinds/nearborn]`) are a separate mechanism and have their own
inverse-label conventions (see `src/lib/server/kindLinkLabels.ts`).

## Collection fold-out directive

`[[collection:<path>]]` on a line by itself expands to a `<details>`
block listing the contents of that collection inline:

```markdown
Some prose.

[[collection:places/bayurinda]]

More prose.
```

Rules:

- Must be on its own line (leading/trailing whitespace OK). Inline
  occurrences are left literal.
- One level of recursion only — a collection included inside another
  inclusion is rendered without further fold-outs.
- Unknown collection path renders as a broken link.

## Backlinks and chapter merging

Every successfully-resolved wikilink produces a `wikilink` edge in the
graph. The "Backlinks" section on an entity page is built from the
reverse index of those edges plus the inverse of structured relations.

For book-shaped entities, wikilinks written inside `chapters/*.md` are
**merged onto the parent entity** — backlinks always attribute to the
work as a whole, never to the chapter file.

## Blog opt-out

Prose under `content_meta/blog/` is rendered by `renderPlainBody`, which
skips wikilink rewriting entirely. `[[anything]]` stays literal. The
blog lives outside the worldbuilding graph.

## When in doubt

- **Lowercase, kebab-case, no spaces.** If your link isn't appearing,
  this is the cause nine times out of ten.
- **Bare slugs are cluster-local.** If you need to reach another
  cluster, spell the full `cluster/type/slug` path.
- **Universal substrates (`foundation/`) are the exception.** Bare
  slugs fall through to them automatically.
- **Check the health page** at `/health` after authoring — broken,
  ambiguous, and cluster-miss links are all listed there with the exact
  raw path that failed.
