/**
 * Core types for the Alteria worldbuilding graph.
 *
 * On disk, every entity lives in its own folder:
 *   content/<...path>/<slug>/index.yaml — structured metadata (this file's shape)
 *   content/<...path>/<slug>/index.md   — long-form prose (rendered as the page body)
 *
 * Folders may nest to arbitrary depth. The shape of a folder is determined
 * by which marker files it contains:
 *
 *   - `_type.yaml` only          → a type container (or subtype container)
 *   - `index.yaml`               → an entity (with optional `_type.yaml`,
 *                                  which would declare its children's type)
 *   - neither                    → an implicit grouping (allowed but rare)
 *
 * The id of an entity is its full path under `content/`, e.g.
 * `culture/languages/tholingian` or `places/bayurinda/sharazan`. The id
 * always ends in the entity's own slug; slugs are kebab-case. The
 * entity's `type` is the path to the nearest enclosing `_type.yaml`.
 *
 * Entity types are discovered at load time by walking `content/`. To
 * add a new type or subtype, create a folder with a `_type.yaml` in
 * it — no code change required.
 */

/**
 * The slug-path of a type: a `/`-joined chain of folder names with a
 * `_type.yaml`. Top-level types are a single segment (`characters`);
 * subtypes are multi-segment (`culture/languages`).
 */
export type EntityType = string;

/** Human-readable labels derived from a type slug. */
export interface EntityTypeLabels {
	singular: string;
	plural: string;
}

/**
 * Meta about an entity type, loaded from `content/<type>/_type.yaml` when
 * present. Every field is optional; the loader fills in sensible defaults
 * (see `labelsFor`) so authors only have to specify what they want to
 * override.
 *
 * `kind` and `kindParent` together place this type folder into the
 * kind hierarchy: `kind` is the kind every entity in this folder
 * declares as its own `meta.kind`; `kindParent` is the supertype kind
 * it descends from. Both are optional; top-level type folders that
 * contain heterogeneous kinds (e.g. /fabric, /places) typically
 * declare neither. See `KindTree` for the resulting structure.
 */
export interface EntityTypeMeta {
	/** Override the singular label. Defaults to a naive singularization. */
	singular?: string;
	/** Override the plural label. Defaults to a title-cased folder name. */
	plural?: string;
	/** A short description of what this type means / is for. */
	description?: string;
	/**
	 * The kind every entity directly under this folder declares. When
	 * present, the loader enforces that every entity in the folder
	 * has `meta.kind` matching this value. Also registers `kind` as a
	 * known kind in the kind tree, so other folders can name it as
	 * their `kindParent`.
	 */
	kind?: string;
	/**
	 * The parent of this folder's `kind` in the kind hierarchy.
	 * Requires `kind` to also be declared. The named parent must
	 * itself be declared as some other folder's `kind`. Cycles are
	 * detected at load time and rejected.
	 */
	kindParent?: string;
	/**
	 * Extra kinds this folder *declares* but doesn't own on disk.
	 * Useful when a supertype folder wants to register kinds whose
	 * entities live elsewhere — e.g. `places/celestial-bodies`
	 * declares `planet` and `moon` as descending from
	 * `celestial-body`, even though planets and moons currently
	 * live under `/places`. Each entry has the same shape as the
	 * top-level `kind` + `kindParent` pair, and is subject to the
	 * same cycle / missing-parent validation.
	 */
	subkinds?: Array<{ kind: string; kindParent?: string }>;
}

/** A fully-resolved type info, with defaults applied. */
export interface EntityTypeInfo {
	type: EntityType;
	labels: EntityTypeLabels;
	description: string | null;
	/** The parent type path, if this is a subtype. `null` for top-level types. */
	parent: EntityType | null;
	/** The depth of this type — 0 for top-level, 1 for one level of subtype, etc. */
	depth: number;
}

/**
 * Derive display labels from a type path. We label on the *leaf* segment
 * (the most specific part) and title-case it. Authors who want a
 * different label can override via `_type.yaml`.
 *
 * The leaf segment is assumed to be a plural noun in kebab-case (e.g.
 * `characters`, `star-systems`, `languages`).
 */
export function labelsFor(type: EntityType): EntityTypeLabels {
	const leaf = leafSegment(type);
	const plural = titleCase(leaf);
	const singular = naiveSingular(plural);
	return { singular, plural };
}

/**
 * Combine a type path with optional author-supplied meta into a fully
 * resolved `EntityTypeInfo`. Missing labels fall back to the heuristic
 * in `labelsFor`.
 */
export function resolveTypeInfo(
	type: EntityType,
	meta: EntityTypeMeta | null | undefined
): EntityTypeInfo {
	const defaults = labelsFor(type);
	return {
		type,
		labels: {
			singular: meta?.singular ?? defaults.singular,
			plural: meta?.plural ?? defaults.plural
		},
		description: meta?.description ?? null,
		parent: parentType(type),
		depth: type.split('/').length - 1
	};
}

/** The parent type path of a type, or `null` for top-level types. */
export function parentType(type: EntityType): EntityType | null {
	const idx = type.lastIndexOf('/');
	if (idx < 0) return null;
	return type.slice(0, idx);
}

/**
 * Editorial metadata for a registered kind, loaded from
 * `src/kinds/<kind>.yaml`. The registry is the long-term source of
 * truth for kinds; during the kinds-decoupling migration it runs in
 * parallel with the existing `_type.yaml`-derived `KindTree`. Once
 * cutover is complete the tree will be derived from this registry.
 *
 * An optional sibling `src/kinds/<kind>.md` file holds prose for the
 * kind's own page (the supertype-self-page that lists all entities
 * of that kind, regardless of which folder they live in).
 */
export interface KindMeta {
	/** Override the singular label. Defaults to title-cased kind id. */
	singular?: string;
	/** Override the plural label. Defaults to a naive pluralization. */
	plural?: string;
	/** A short editorial description shown on the kind's page. */
	description?: string;
	/**
	 * Parent kind in the kind hierarchy. Must itself be a registered
	 * kind. Omitted on root kinds.
	 */
	kindParent?: string;
}

/**
 * A loaded, validated kind from `src/kinds/`. The id is the file
 * stem (kebab-case). The body, when present, is the raw markdown
 * source of `src/kinds/<id>.md`; it is rendered on demand by the
 * markdown pipeline.
 */
export interface Kind {
	id: string;
	meta: KindMeta;
	/** Raw markdown body, or null if no `<id>.md` companion exists. */
	body: string | null;
}

/**
 * The kind hierarchy. Built once at load time from `_type.yaml`
 * declarations; queried by routes that want to filter by supertype,
 * walk descendants, or check is-a relationships.
 *
 * Kinds form a forest (multiple root kinds, no cycles, every kind
 * has zero or one parent). A kind is *known* if some `_type.yaml`
 * declared it via `kind:`; unknown kinds (free-form strings authors
 * use without registering) are not part of the tree and answer
 * every query trivially (they are their own ancestor, have no
 * descendants).
 */
export interface KindTree {
	/** Every known kind, in arbitrary order. */
	all(): string[];
	/** Whether the kind has been registered by some `_type.yaml`. */
	has(kind: string): boolean;
	/** The kind's parent in the hierarchy, or null if root / unknown. */
	parent(kind: string): string | null;
	/** Direct children of this kind. */
	children(kind: string): string[];
	/** All ancestors (parent, grandparent, …), nearest first. */
	ancestors(kind: string): string[];
	/**
	 * All descendants of this kind, including the kind itself. Useful
	 * for "show every entity whose kind is-a celestial-body" queries.
	 * Returns a Set for cheap membership tests.
	 */
	descendantsInclusive(kind: string): Set<string>;
	/**
	 * Whether `kind` is the same as or a descendant of `ancestor`.
	 * Returns false for unknown kinds (they are not in the tree).
	 */
	isKindOf(kind: string | null | undefined, ancestor: string): boolean;
}

/**
 * Build a KindTree from a map of registered kinds to their (possibly
 * null) parent. Validates: every named parent must itself be
 * registered, and no cycles. Throws on either condition — these are
 * structural errors that should fail loud at load time, not silently
 * skew the UI.
 */
export function buildKindTree(declarations: Map<string, string | null>): KindTree {
	// Validate: every named parent is registered.
	for (const [kind, parent] of declarations) {
		if (parent !== null && !declarations.has(parent)) {
			throw new Error(
				`kind '${kind}' declares parent '${parent}', but '${parent}' is not registered by any _type.yaml`
			);
		}
	}

	// Validate: no cycles. Walk each kind's ancestor chain; reject
	// if we revisit any kind.
	for (const kind of declarations.keys()) {
		const seen = new Set<string>([kind]);
		let cur = declarations.get(kind) ?? null;
		while (cur !== null) {
			if (seen.has(cur)) {
				throw new Error(`kind cycle detected involving '${kind}' → '${cur}'`);
			}
			seen.add(cur);
			cur = declarations.get(cur) ?? null;
		}
	}

	const childIdx = new Map<string, string[]>();
	for (const [kind, parent] of declarations) {
		if (parent === null) continue;
		const arr = childIdx.get(parent) ?? [];
		arr.push(kind);
		childIdx.set(parent, arr);
	}
	for (const arr of childIdx.values()) arr.sort();

	const ancestorsOf = (kind: string): string[] => {
		const out: string[] = [];
		let cur = declarations.get(kind) ?? null;
		while (cur !== null) {
			out.push(cur);
			cur = declarations.get(cur) ?? null;
		}
		return out;
	};

	const descendantsOf = (kind: string): Set<string> => {
		const out = new Set<string>([kind]);
		const queue = [kind];
		while (queue.length > 0) {
			const cur = queue.shift()!;
			for (const child of childIdx.get(cur) ?? []) {
				if (out.has(child)) continue;
				out.add(child);
				queue.push(child);
			}
		}
		return out;
	};

	return {
		all: () => [...declarations.keys()].sort(),
		has: (kind) => declarations.has(kind),
		parent: (kind) => declarations.get(kind) ?? null,
		children: (kind) => [...(childIdx.get(kind) ?? [])],
		ancestors: ancestorsOf,
		descendantsInclusive: descendantsOf,
		isKindOf: (kind, ancestor) => {
			if (!kind) return false;
			if (kind === ancestor) return true;
			if (!declarations.has(kind)) return false;
			return ancestorsOf(kind).includes(ancestor);
		}
	};
}

/** The last segment of a type path. */
export function leafSegment(type: EntityType): string {
	const idx = type.lastIndexOf('/');
	return idx < 0 ? type : type.slice(idx + 1);
}

function titleCase(slug: string): string {
	return slug
		.split('-')
		.map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
		.join(' ');
}

function naiveSingular(word: string): string {
	// Operate on the last whitespace-separated token so "Star Systems" → "Star System".
	const parts = word.split(' ');
	const last = parts[parts.length - 1];
	let singular = last;
	if (/ies$/i.test(last)) singular = last.replace(/ies$/i, 'y');
	else if (/ses$/i.test(last)) singular = last.replace(/es$/i, '');
	else if (/s$/i.test(last) && !/ss$/i.test(last)) singular = last.replace(/s$/i, '');
	parts[parts.length - 1] = singular;
	return parts.join(' ');
}

/** A reference to another entity by its full path id. */
export type EntityId = string;

/** A typed relation from one entity to another. */
export interface Relation {
	/** The kind of relation, e.g. "member-of", "ally-of", "located-in", "child-of". */
	kind: string;
	/** Target entity id (full path). */
	target: EntityId;
	/** Optional short note explaining the relation. */
	note?: string;
	/**
	 * Optional sort key for structural relations. Used today by the
	 * orbits view to lay out a system's children in canonical order
	 * (innermost-out, centre-first) rather than by alphabetical /
	 * kind-rank fallback. Lower numbers sort first; entities without
	 * an explicit order sort after those that have one.
	 */
	order?: number;
}

/** Meta loaded from the YAML sidecar. */
export interface EntityMeta {
	/** Display name. */
	name: string;
	/** Optional shorter name / nickname / honorific. */
	aliases?: string[];
	/** One-line summary for cards and lists. */
	summary?: string;
	/** Free-form tags. */
	tags?: string[];
	/** Era / period label (purely a string for now). */
	era?: string;
	/**
	 * Sub-type within an entity type — a free-form string used to keep
	 * collections legible as they grow. For places: "planet", "city",
	 * "ruin", "moon"; for characters: "mortal", "deity", "construct"; etc.
	 * Surfaced in cards and the property list, and groupable in list views.
	 */
	kind?: string;
	/**
	 * Gender, where it's part of who an entity is. Free-form so authors
	 * can write what they want — "trans man", "trans woman", "fluid",
	 * "non-binary", "agender", whatever fits. Surfaced in the property
	 * list, never inferred.
	 */
	gender?: string;
	/** "active" | "deceased" | "lost" | "ruined" | anything else. */
	status?: string;
	/**
	 * Short language code, used by entities of type `languages/`. The
	 * markdown renderer recognises `[[<code>]]` as an inline language
	 * tag and renders it as a small superscript link to the language's
	 * page. Codes are short, lowercase, and globally unique across all
	 * language entries (e.g. `ot` for the Old Tongue).
	 */
	code?: string;
	/**
	 * Language code of the entity's name, used when its name is in a
	 * non-English / non-English-equivalent language. The page header
	 * renders the code as a small superscript tag beside the title,
	 * leading back to the language entry. Refers to a `code` declared
	 * on an entity in the `languages` type (e.g. `language: ot` on a
	 * Naya whose name is in the Old Tongue).
	 */
	language?: string;
	/**
	 * Optional sigil glyph (typically an alchemical or astrological
	 * symbol) shown left of the title on the entity page and in the
	 * card eyebrow. Purely decorative; no semantic meaning beyond
	 * what the author assigns.
	 */
	sigil?: string;
	/** Structured relations. */
	relations?: Relation[];
	/** Arbitrary extra fields rendered in the property list sidebar. */
	[key: string]: unknown;
}

/** A loaded entity, ready to serve. */
export interface Entity {
	id: EntityId;
	type: EntityType;
	slug: string;
	meta: EntityMeta;
	/** Raw markdown body (unparsed). */
	body: string;
	/** Wikilink ids extracted from the body. */
	wikilinks: EntityId[];
	/** Absolute path to the YAML file on disk (for diagnostics). */
	yamlPath: string;
	/** Absolute path to the MD file on disk (for diagnostics). */
	mdPath: string;
	/**
	 * The id of the parent entity, if this entity's folder is nested
	 * inside another entity's folder. `null` for top-level entities
	 * within a type/subtype container.
	 */
	parent: EntityId | null;
	/** Direct child entity ids (filesystem-nested under this entity). */
	children: EntityId[];
}

/** A directed edge in the graph, with provenance. */
export interface Edge {
	from: EntityId;
	to: EntityId;
	/** Either a typed relation kind, or "wikilink" for prose mentions. */
	kind: string;
	note?: string;
	/** See `Relation.order`. */
	order?: number;
}

/** Health-check problems detected at load time. */
export interface HealthIssue {
	kind: 'broken-link' | 'orphan' | 'missing-md' | 'missing-yaml' | 'invalid-yaml';
	entity?: EntityId;
	detail: string;
}
