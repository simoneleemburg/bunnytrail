# Ontology files

This document describes the current structure of ontology metadata in
Bunnytrail world directories. Any tool, agent, or script that reads or writes
`content_meta/kinds/` or `content_meta/world.md` must conform to this
structure.

## File structure

A folder under `content_meta/kinds/` is treated as an **ontology container**
when it contains `_ontology.yaml` and no `_kind.yaml`. Kind folders nested
inside it become members of that ontology (`Kind.group` is set to the
container folder's name).

A `_ontology.yaml` placed directly at the root of `content_meta/kinds/` (not
inside a subfolder) acts as the **root ontology** — its relations are registered
with bare (unprefixed) ids.

```
content_meta/kinds/
  _ontology.yaml            ← optional root ontology (global / unprefixed relations)
  <ontology-id>/
    _ontology.yaml          ← declares this folder as a named ontology
    <kind-id>/
      _kind.yaml            ← a kind; may declare properties
    <kind-id>/
      ...
  <kind-id>/                ← a kind with no ontology (group: null)
    _kind.yaml
```

One level only. Ontology folders cannot be nested inside other ontology
folders.

## `_ontology.yaml` schema

All fields are optional. An empty file (or absent file) is valid.

```yaml
title: Human-readable display name   # string | omit
description: Short editorial note    # string | omit

relations:
  <slug>:                           # bare slug — engine prepends <ontology-id>/
    outLabel: Label from source     # string, required
    inLabel: Label from target      # string, required
    domain: [kind-id, ...]          # array of kind ids | omit
    codomain: [kind-id, ...]        # array of kind ids | omit
```

For the root ontology (`content_meta/kinds/_ontology.yaml`), relation keys are
bare slugs with no prefix applied — they remain bare in the registry too.

When `title` is absent the engine falls back to a title-cased version of the
folder name.

### Relation id convention

Relation keys in `_ontology.yaml` are bare slugs. The engine prepends the
ontology folder name to form the full id used in the registry and in entity
YAML:

```yaml
# content_meta/kinds/cultural/_ontology.yaml
relations:
  member-of:                  ← authored as bare slug
    outLabel: Member of
    inLabel: Members
    codomain: [cultural-group, institution]
```

The engine registers this as `cultural/member-of`. Entity YAML must use the
full prefixed id:

```yaml
relations:
  - kind: cultural/member-of
    target: some-institution
```

## `_kind.yaml` schema

```yaml
singular: Display name singular      # string | omit
plural: Display name plural          # string | omit
description: Short editorial note    # string | omit

properties:
  <property-id>:                     # e.g. gender, notation
    label: Display label             # string, required
    values: [value, ...]             # enum of allowed values | omit
```

Properties declared on a kind are valid on that kind and all its descendants
via the kind hierarchy — no `allowedKinds` field is needed or supported.
Entity YAML uses the bare property id:

```yaml
properties:
  gender: woman
```

## `world.md` strictness toggles

`content_meta/world.md` holds two global strictness booleans. Both default to
`false` — strict mode — meaning undeclared relation kinds and property keys
produce health-page warnings.

```yaml
# content_meta/world.md
allowUndefinedRelations: false    # warn on relation kinds not in any _ontology.yaml
allowUndefinedProperties: false   # warn on property keys not in any _kind.yaml
```

Set either to `true` to silence warnings while the schema is being built out.
Neither the relation registry nor the property registry lives in `world.md`.

## Engine API

| Symbol | Type | Notes |
|---|---|---|
| `Ontology` | interface (`src/lib/types.ts`) | `{ id, title: string\|null, description: string\|null, relations: RelationRegistry }` |
| `KindMeta.properties` | `Record<string, { label, values? }> \| undefined` | Per-kind property declarations |
| `PropertySchema` | interface (`src/lib/types.ts`) | `{ label, declaringKind, values? }` — `declaringKind` set by loader |
| `graph.ontologyRegistry()` | `ReadonlyMap<string, Ontology>` | All loaded ontologies |
| `graph.ontology(id)` | `Ontology \| undefined` | Single lookup by folder name |
| `graph.relationRegistry()` | `RelationRegistry` | Merged registry from all ontologies |
| `graph.propertyRegistry()` | `PropertyRegistry` | Merged registry from all kinds |
| `Kind.group` | `string \| null` | Ontology id this kind belongs to, or null |
| `KindLoadResult.relations` | `RelationRegistry` | Merged relation registry |
| `KindLoadResult.properties` | `PropertyRegistry` | Merged property registry |
| `LoadResult.relations` | `RelationRegistry` | Threaded through from `KindLoadResult` |
| `LoadResult.properties` | `PropertyRegistry` | Threaded through from `KindLoadResult` |
| `OntologySection` | interface (`src/lib/routes/kinds/load.ts`) | View-model section on the kinds index page |
| `GraphData.ontologyOf` | `Record<string, string\|null>` | kind id → ontology id, for the graph filter bar |
| `GraphData.ontologyTitles` | `Record<string, string>` | ontology id → display title |

## Replaces

**`_kindgroup.yaml`** — ontology containers were previously declared with a
`_kindgroup.yaml` marker file. Rename any such files to `_ontology.yaml`. The
field set (`title`, `description`) is unchanged; `relations:` is new.

**`relations:` block in `world.md`** — the relation registry previously lived
as a flat `relations:` mapping in `content_meta/world.md`. It has moved into
the `relations:` block of each relevant `_ontology.yaml`. The
`allowUndefinedRelations` boolean remains in `world.md` as a global strictness
toggle; the registry itself does not.

**`properties:` block in `world.md`** — the property registry previously lived
as a `properties:` mapping in `content_meta/world.md` with an `allowedKinds`
field for scoping. It has moved into the `properties:` block of each relevant
`_kind.yaml`. Kind scope is now implicit via the kind hierarchy — `allowedKinds`
is no longer supported. The `allowUndefinedProperties` boolean remains in
`world.md`; the registry itself does not.
