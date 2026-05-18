# content/

This is the canonical worldbuilding data. The layout is:

```
content/
  <type>/                      e.g. characters, places
    _type.yaml                 (optional) labels + description for the type
    <slug>/                    one folder per entity, slug in kebab-case
      index.yaml               structured metadata (name, tags, relations, …)
      index.md                 long-form prose
      ...                      images, attachments, anything else
```

Entity ids are `<type>/<slug>`. Reference other entities from prose with
wikilinks: `[[cosmology/realms/nareth]]` or `[[cosmology/realms/nareth|the resonant]]`.

## Adding a new type

Create a folder under `content/`. That alone is enough — the loader picks
it up at boot and the nav appears automatically. Add a `_type.yaml` to
control the labels and write a short description:

```yaml
singular: Faction
plural: Factions
description: >-
  Powers and movements — sworn houses, guilds, cults, conspiracies.
```

All fields are optional. Without `_type.yaml`, labels are derived from
the folder name (`star-systems` → "Star Systems" / "Star System").

## Adding an entry

```
content/<type>/<slug>/
  index.yaml
  index.md
```

The `<slug>` directory name is the URL segment. Edit in your IDE. Save.
The site picks up changes on the next request.

## Reserved names

Anything starting with `_` or `.` inside `content/` is ignored by the
loader — useful for type-level files (`_type.yaml`), shared assets, or
local scratch folders.
