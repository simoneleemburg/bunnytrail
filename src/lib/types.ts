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
 */
export interface EntityTypeMeta {
	/** Override the singular label. Defaults to a naive singularization. */
	singular?: string;
	/** Override the plural label. Defaults to a title-cased folder name. */
	plural?: string;
	/** A short description of what this type means / is for. */
	description?: string;
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
}

/** Health-check problems detected at load time. */
export interface HealthIssue {
	kind: 'broken-link' | 'orphan' | 'missing-md' | 'missing-yaml' | 'invalid-yaml';
	entity?: EntityId;
	detail: string;
}
