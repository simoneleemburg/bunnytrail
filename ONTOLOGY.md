# Ontology files

## What changed

`_kindgroup.yaml` has been renamed to `_ontology.yaml` across the engine and
all world directories. The file format and field set are unchanged.

## File structure

A folder under `content_meta/kinds/` is treated as an **ontology container**
when it contains `_ontology.yaml` and no `_kind.yaml`. Kind folders nested
inside it become members of that ontology (`Kind.group` is set to the
container folder's name).

```
content_meta/kinds/
  <ontology-id>/
    _ontology.yaml        ← declares this folder as an ontology
    <kind-id>/
      _kind.yaml          ← a kind that belongs to this ontology
    <kind-id>/
      ...
  <kind-id>/              ← a kind with no ontology (group: null)
    _kind.yaml
```

One level only. Ontology folders cannot be nested inside other ontology
folders.

## `_ontology.yaml` schema

Both fields are optional. An empty file (or absent file) is valid.

```yaml
title: Human-readable display name   # string | omit
description: Short editorial note    # string | omit
```

When `title` is absent the engine falls back to a title-cased version of the
folder name.

## Engine API

| Symbol | Type | Notes |
|---|---|---|
| `Ontology` | interface (`src/lib/types.ts`) | `{ id, title: string\|null, description: string\|null }` |
| `graph.ontologyRegistry()` | `ReadonlyMap<string, Ontology>` | All loaded ontologies |
| `graph.ontology(id)` | `Ontology \| undefined` | Single lookup by folder name |
| `Kind.group` | `string \| null` | Ontology id this kind belongs to, or null |
| `OntologySection` | interface (`src/lib/routes/kinds/load.ts`) | View-model section on the kinds index page |
| `GraphData.ontologyOf` | `Record<string, string\|null>` | kind id → ontology id, for the graph filter bar |
| `GraphData.ontologyTitles` | `Record<string, string>` | ontology id → display title |

## Migration from `_kindgroup.yaml`

Any tool or agent that previously created or read `_kindgroup.yaml` files must
use `_ontology.yaml` instead. The file contents are identical — only the
filename changed.
