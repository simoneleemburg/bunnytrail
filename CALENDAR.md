# Custom Calendar System

Bunnytrail supports world-defined calendar systems. Calendars are
declared in `content_meta/world.md` and referenced from timeline
entries. The engine handles parsing, sorting, and display; the world
author controls every date format and naming convention.

## Declaring a calendar

Calendars live under `customCalendars` in `content_meta/world.md`:

```yaml
---
customCalendars:
  default: revelant          # calendar id used when no calendar is stated
  calendars:
    revelant:
      name: The Revelant Calendar
      eves:
        - { ref: 1, years: 88 }
        - { ref: 2, years: 120 }
        - { ref: 6, years: null }  # open-ended current Eve
      units:
        - { unit: eve }
        - { unit: year }
        - { unit: circle, per: 9 }
        - { unit: arc,    per: 3 }
        - { unit: day,    per: 21 }
      input: E-Y-C-A-D
      display: "{E:ordinal} Eve, Year {Y} — {C:ordinal} Circle {A:mapped}, Day {D}"
      tokens:
        E: { numeral: ordinal }
        C: { numeral: ordinal }
        A: { numeral: mapped, values: [Low, Rising, Returning] }
---
```

### `eves`

An ordered list of event-marked ages. Years restart from 1 inside
each Eve. Each entry needs:

| field   | type             | meaning                                      |
|---------|------------------|----------------------------------------------|
| `ref`   | integer          | 1-based Eve number                           |
| `years` | integer or `null`| how many years the Eve lasted; `null` = open |

The `eves` table is **load-bearing**: changing a past Eve's `years`
shifts every absolute-day sort key after it. Add Eves in order and
only amend closed entries when lore is retconned.

### `units`

Ordered big → small. The first unit is the largest (typically the
era or epoch). Each entry:

| field  | type    | meaning                                         |
|--------|---------|-------------------------------------------------|
| `unit` | string  | lowercase identifier used in labels             |
| `per`  | integer | how many of this unit fit in one parent unit    |

The top unit has no `per`. A unit whose size is governed by the
`eves` table (typically `year`) also omits `per`.

### `input`

A separator-joined string of uppercase token letters matching the
`units` order. Example: `E-Y-C-A-D` for five units. This defines
what each position in a date tuple means.

---

## Authoring dates in frontmatter

Inside a `_time.md` file:

```yaml
---
date:
  calendar: revelant
  value: [6, 143, 5, 2, 12]   # Eve 6, Year 143, Circle 5, Arc 2, Day 12
---
```

Or as a shorthand string:

```yaml
date: "6-143-5-2-12"
```

When no `calendar` key is given the world's `default` calendar is
used. When `BUNNYTRAIL_WORLD_DIR` has no `customCalendars` the date
is treated as a plain integer year.

### Partial dates

You may omit trailing units. `[6, 143]` means "somewhere in Year
143 of the Sixth Eve". The engine pads missing units with `1` for
sorting (so the entry appears at the start of its period) and renders
only the tokens that were provided.

```yaml
value: [6]          # eve-precision only
value: [6, 143]     # eve + year
value: [6, 143, 5]  # eve + year + circle
```

---

## Display templates

### `display`

The fallback template, used when no precision-keyed entry matches:

```yaml
display: "{E:ordinal} Eve, Year {Y} — {C:ordinal} Circle {A:mapped}, Day {D}"
```

Tokens use the format `{LETTER}` or `{LETTER:hint}`. Literal text
(spaces, punctuation, unit names) passes through unchanged. Tokens
for unspecified units render as an empty string.

### `displayByPrecision`

Optional map from the number of provided units to a display template.
Each entry is either a plain string (both variants use it) or an
object with separate `heading` and `display` keys:

```yaml
displayByPrecision:
  1: "{E:ordinal} Eve"                          # plain string
  2:
    heading: "{E:ordinal} Eve, Year {Y}"
    display: "Year {Y} of the {E:ordinal} Eve"
  5:
    heading: "{E:ordinal} Eve, Year {Y} — {C:ordinal} Circle {A:mapped}, Day {D}"
    display: "Year {Y}, {C:ordinal} Circle {A:mapped}, Day {D}"
```

**Resolution order** for a date with N units:

1. `displayByPrecision[N].heading` (or `.display`) if an object entry exists
2. The other key in the same object entry, if the requested variant is absent
3. `displayByPrecision[N]` if it is a plain string
4. Top-level `display`

### Variants

`formatCalendarDate` accepts a `variant` argument:

| variant     | used for                                              |
|-------------|-------------------------------------------------------|
| `'display'` | timeline list labels, nav strip labels (default)      |
| `'heading'` | dot-page `<h1>`, breadcrumbs, anywhere a title is set |

On the dot page, the `display` variant is shown as a small-caps
dateline below the summary — but only when it differs from the
heading label. If both variants produce the same string the dateline
is suppressed.

---

## Token numerals

Tokens render their integer value in one of five modes. Set the mode
in the `tokens` block or override it per-template with an inline hint.

| numeral          | example (value 5) | notes                                      |
|------------------|-------------------|--------------------------------------------|
| `cardinal`       | `5`               | default when no `tokens` entry exists      |
| `ordinal`        | `Fifth`           | English word ordinals up to 30, then numeric |
| `ordinal-short`  | `5th`             | numeric ordinal suffix (`1st`, `2nd`, …)   |
| `roman`          | `V`               | uppercase Roman numerals                   |
| `mapped`         | `Rising`          | 1-based lookup into a `values` list        |

### Inline hints

A hint in the template overrides the `tokens` def for that one
substitution:

```
{E:ordinal}        → Fifth   (word)
{E:ordinal-short}  → 5th     (numeric suffix)
{E:roman}          → V
{E:cardinal}       → 5
```

`mapped` always requires the `values` list from the `tokens` def; a
bare `{A:mapped}` without a def falls back to cardinal.

### `tokens` block

Only declare tokens that need non-cardinal rendering. Cardinal tokens
need no entry.

```yaml
tokens:
  E: { numeral: ordinal }
  C: { numeral: ordinal }
  A: { numeral: mapped, values: [Low, Rising, Returning] }
```

---

## Sorting

Dates are sorted by an **absolute-day** integer computed at load time:

```
absoluteYear = Σ(years of all prior Eves) + (year − 1)
absoluteDay  = absoluteYear × D_per_year
             + (circle − 1) × D_per_circle
             + (arc    − 1) × D_per_arc
             + (day    − 1)
```

where `D_per_*` are derived from the `units[].per` chain.

Partial dates pad missing units with `1` before folding, so a
year-precision entry sorts to the very start of that year.

Entries on different calendars within the same timeline are sorted
independently by their own calendar's fold. Cross-calendar sort
normalisation is not currently supported.

---

## Multiple calendars

A world may define as many calendars as it needs. Each timeline entry
declares which calendar its date belongs to:

```yaml
date:
  calendar: old-reckoning
  value: [3, 44, 2]
```

Calendar inheritance on timelines (dot `_time.md` → line `_time.md`
→ world default) means you can set `calendar: revelant` once on the
line and omit it from every dot.
