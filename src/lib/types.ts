/**
 * Core types for the Alteria worldbuilding graph.
 *
 * On disk, every entity is a pair of files:
 *   content/<type>/<slug>.yaml    — structured metadata (this file's shape)
 *   content/<type>/<slug>.md      — long-form prose (rendered as the page body)
 *
 * The id of an entity is `<type>/<slug>`. Slugs are kebab-case.
 *
 * Entity types are discovered at load time by scanning the immediate
 * subdirectories of `content/`. To add a new type, create a new folder —
 * no code change required.
 */

/**
 * The slug of a subdirectory under `content/`, used as both the URL segment
 * and the prefix of every entity id (`<type>/<slug>`).
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
}

/**
 * Derive display labels from a folder name.
 *
 * The folder name is assumed to be a plural noun in kebab-case (e.g.
 * `characters`, `star-systems`). We title-case it for the plural form and
 * apply a tiny naive de-pluralizer for the singular form. Authors who want
 * a different label can override later via a content config file; for now
 * this heuristic is plenty.
 */
export function labelsFor(type: EntityType): EntityTypeLabels {
	const plural = titleCase(type);
	const singular = naiveSingular(plural);
	return { singular, plural };
}

/**
 * Combine a type slug with optional author-supplied meta into a fully
 * resolved `EntityTypeInfo`. Missing labels fall back to the heuristic in
 * `labelsFor`.
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
		description: meta?.description ?? null
	};
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

/** A reference to another entity by `<type>/<slug>`. */
export type EntityId = string;

/** A typed relation from one entity to another. */
export interface Relation {
	/** The kind of relation, e.g. "member-of", "ally-of", "located-in", "child-of". */
	kind: string;
	/** Target entity id (`<type>/<slug>`). */
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
