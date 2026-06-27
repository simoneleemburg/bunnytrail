/**
 * Core types for a Bunnytrail worldbuilding graph.
 *
 * On disk, every entity lives in its own folder:
 *   content/<...path>/<slug>/index.yaml — structured metadata (this file's shape)
 *   content/<...path>/<slug>/index.md   — long-form prose (rendered as the page body)
 *
 * Folders may nest to arbitrary depth. The shape of a folder is determined
 * by which marker files it contains:
 *
 *   - `_collection.yaml`   → editorial metadata for a browse page (a
 *                            *collection*). Pure browsing structure;
 *                            says nothing about the *kind* of the
 *                            entities it contains.
 *   - `index.yaml`         → an entity (may also act as a collection).
 *   - neither              → an implicit grouping (still browseable).
 *
 * The id of an entity is its full path under `content/`, e.g.
 * `culture/languages/tholingian` or `places/bayurinda/sharazan`. The id
 * always ends in the entity's own slug; slugs are kebab-case. The
 * entity's `type` is the path of its containing folder — a grouping
 * convenience for browse pages, not a semantic classification.
 *
 * Kinds are declared centrally in `content_meta/kinds/` (the registry); every
 * entity carries a `kind` field that the loader validates against
 * that registry.
 */

/**
 * The slug-path of an entity's containing folder. Single-segment for
 * top-level folders (`characters`); multi-segment for nested ones
 * (`culture/languages`). An empty string for entities at the content
 * root (rare).
 *
 * Kept around as a structural grouping hint for browse pages, tag
 * pages, and the language-code heuristic. Not a semantic kind.
 */
export type EntityType = string;

/**
 * Editorial metadata for a registered kind, loaded from
 * `content_meta/kinds/<…>/<kind>/_kind.yaml`. The registry is the
 * sole source of truth for kind metadata and hierarchy; the folder
 * tree expresses parent/child relationships.
 *
 * An optional sibling `_kind.md` file holds prose for the kind's
 * own page (the page that lists all entities of that kind,
 * regardless of which content folder they live in).
 */
export interface KindMeta {
	/** Override the singular label. Defaults to title-cased kind id. */
	singular?: string;
	/** Override the plural label. Defaults to a naive pluralization. */
	plural?: string;
	/** A short editorial description shown on the kind's page. */
	description?: string;
	/**
	 * Property schemas declared on this kind. Keys are property ids
	 * (e.g. `"gender"`); values carry a required `label` and optional
	 * `values` enum. Scope is implicit: these properties are valid on
	 * this kind and all its descendants via the kind hierarchy.
	 */
	properties?: Record<string, { label: string; values?: string[] }>;
	/**
	 * The kind id that constrains which class entities of this kind may
	 * be assigned. When set, every entity of this kind (or any descendant
	 * kind) that carries a `class:` field must reference an entity whose
	 * own `kind` is the declared class kind or a descendant of it.
	 * Entities whose kind has no `class` constraint are not allowed to
	 * set `class:` at all.
	 *
	 * Example: `class: humanoid` on the `person` kind means every
	 * `person` entity's `class:` must point to a `humanoid`-kinded entity.
	 */
	class?: string;
	/**
	 * When `true`, entities of this kind (and any descendant kind) that
	 * carry no explicit `era:` field are assigned the cluster's default
	 * era at load time. This means they are included in (and filtered by)
	 * the era picker rather than always being visible regardless of the
	 * active era filter.
	 *
	 * Example: `eraBounded: true` on the `character` kind means every
	 * character without an explicit era is implicitly in the cluster's
	 * default era (e.g. `current`).
	 */
	eraBounded?: boolean;
}

/**
 * A loaded, validated kind from `content_meta/kinds/`. The id is the folder
 * name (kebab-case). The body, when present, is the raw markdown
 * source of `_kind.md` next to the yaml; it is rendered on demand
 * by the markdown pipeline. The hierarchy is purely structural:
 * `parent` is the id of the containing folder's kind, or null for
 * root kinds.
 */
export interface Kind {
	id: string;
	meta: KindMeta;
	/** Parent kind id (the enclosing folder), or null at the root. */
	parent: string | null;
	/**
	 * The id of the ontology this kind belongs to, or null when ungrouped.
	 */
	group: string | null;
}

/**
 * An organisational group of kinds, declared via `_ontology.yaml` inside
 * a folder under `content_meta/kinds/`. Ontologies provide display-level
 * separation on the kinds index page and the graph filter bar; they are
 * **not** kinds themselves and do not participate in the kind hierarchy.
 *
 * One layer only: ontologies cannot be nested. A folder with `_ontology.yaml`
 * and no `_kind.yaml` / `_kind.md` is an ontology container; the valid-id
 * subdirectories inside it become member kinds (with `group` set to this
 * ontology's id).
 */
export interface Ontology {
	id: string;
	/** Display title. Defaults to the title-cased folder name when absent. */
	title: string | null;
	/** Optional short editorial description. */
	description: string | null;
	/**
	 * Relation schemas declared in this ontology's `_ontology.yaml`.
	 * Keys are the full prefixed relation ids (`<ontology-id>/<slug>` for
	 * named ontologies, bare slug for the root ontology). Empty map when
	 * no `relations:` block is present.
	 */
	relations: RelationRegistry;
}

/** A single named era defined in `content_meta/world.md`. */
export interface EraDef {
	/** Short identifier used in entity frontmatter and URL params, e.g. `'mythic'`. */
	ref: string;
	/** Human-readable title shown in the UI, e.g. `'The Mythic Age'`. */
	title: string;
	/** Optional editorial description. */
	description?: string;
}

/** Per-cluster era configuration defined in `content_meta/world.md`. */
export interface ClusterEras {
	/** Ref of the era that entities without an explicit era belong to. */
	default: string;
	/** Ordered list of era refs to show in the era picker for this cluster. */
	eras: string[];
}

/**
 * The full era configuration from `content_meta/world.md`.
 * Controls the era picker in the masthead.
 */
export interface EraConfig {
	definitions: EraDef[];
	/** Map from cluster id → per-cluster era config. */
	perCluster: Record<string, ClusterEras>;
}

/**
 * Editorial metadata for a content collection — a folder under
 * `content/` that groups entities together for browsing. Loaded
 * from an optional `<folder>/_collection.yaml`. Every field is
 * optional; the renderer falls back to a title-cased folder name
 * when labels are absent.
 *
 * Collections are pure browsing structure: they say nothing about
 * the *kind* of the entities they contain. A `places/celestial`
 * collection might be retitled "The Sky" or split into "Inner System"
 * and "Outer System" without disturbing the kind tree.
 */
/**
 * How a rank integer is rendered in the fleuron and kind chip.
 *   'arabic' — show the raw number (default)
 *   'roman'  — convert to uppercase roman numeral (I, II, III …)
 *   'none'   — show the normal ornament glyph; rank still drives nav
 */
export type RankDisplay = 'arabic' | 'roman' | 'none';

/**
 * Convert a positive integer to an uppercase roman numeral string.
 * Returns the arabic string for values outside the roman range (< 1 or > 3999).
 */
export function toRoman(n: number): string {
	if (n < 1 || n > 3999) return String(n);
	const vals: [number, string][] = [
		[1000, 'M'],
		[900, 'CM'],
		[500, 'D'],
		[400, 'CD'],
		[100, 'C'],
		[90, 'XC'],
		[50, 'L'],
		[40, 'XL'],
		[10, 'X'],
		[9, 'IX'],
		[5, 'V'],
		[4, 'IV'],
		[1, 'I']
	];
	let result = '';
	for (const [val, sym] of vals) {
		while (n >= val) {
			result += sym;
			n -= val;
		}
	}
	return result;
}

export interface CollectionMeta {
	/** The collection's display title. Defaults to a title-cased folder name. */
	title?: string;
	/** A short editorial description shown at the top of the collection page. */
	description?: string;
	/**
	 * Explicit sort order for sibling collections. Lower numbers appear
	 * first. When set, the collection page shows a rank glyph in the
	 * fleuron and prev/next navigation to ranked siblings.
	 */
	rank?: number;
	/**
	 * Controls how the rank integer is rendered in the fleuron for this
	 * collection *and* for ranked entities inside it. Defaults to 'arabic'.
	 * 'none' suppresses the rank glyph entirely (ornament shows instead)
	 * but still enables prev/next navigation.
	 */
	rankDisplay?: RankDisplay;
	/**
	 * When set on a *top-level* collection (a folder directly under
	 * `content/`), marks that folder as a **universal substrate**
	 * rather than a peer cluster. Universal substrates are not
	 * clusters: they sit outside the cluster set, and cluster-local
	 * wikilink resolution falls back to them when no in-cluster
	 * match is found. Use for shared metaphysics/fabric content
	 * referenced as bare slugs from every cluster.
	 *
	 * Has no effect on non-top-level collections; sub-collections
	 * inherit their cluster from their containing top-level folder.
	 */
	universal?: boolean;
}

/**
 * A loaded collection. `path` is the folder path relative to
 * `content/` (e.g. `places/celestial`). `body` is the raw
 * markdown source of an optional sibling `_collection.md`, rendered
 * on demand.
 */
export interface Collection {
	path: string;
	meta: CollectionMeta;
	/** Raw markdown body, or null if no `_collection.md` companion exists. */
	body: string | null;
}

/** A folder display label, derived from a collection or a folder path. */
export interface FolderLabels {
	singular: string;
	plural: string;
}

/**
 * Lightweight kind-tree wrapper for client-side queries. Built from
 * the wire-format `kind -> parent | null` map serialised by the
 * server. Used by the collection page's kind-chip filter to resolve
 * ancestor / descendant relationships without re-fetching.
 */
export interface KindTree {
	all(): string[];
	has(kind: string): boolean;
	parent(kind: string): string | null;
	children(kind: string): string[];
	ancestors(kind: string): string[];
	descendantsInclusive(kind: string): Set<string>;
	isKindOf(kind: string | null | undefined, ancestor: string): boolean;
}

/**
 * Build a `KindTree` from a `kind -> parent | null` map. Defensive:
 * unknown parents are treated as null (root), cycles are broken at
 * detection. The server-side registry guards both, but this helper
 * runs on the client too and accepts whatever the wire sent.
 */
export function buildKindTree(declarations: Map<string, string | null>): KindTree {
	const childIdx = new Map<string, string[]>();
	for (const [kind, parent] of declarations) {
		if (parent === null) continue;
		if (!declarations.has(parent)) continue;
		const arr = childIdx.get(parent) ?? [];
		arr.push(kind);
		childIdx.set(parent, arr);
	}
	for (const arr of childIdx.values()) arr.sort();

	const parentOf = (kind: string): string | null => {
		const p = declarations.get(kind) ?? null;
		return p !== null && declarations.has(p) ? p : null;
	};

	const ancestorsOf = (kind: string): string[] => {
		const out: string[] = [];
		const seen = new Set<string>([kind]);
		let cur = parentOf(kind);
		while (cur !== null && !seen.has(cur)) {
			out.push(cur);
			seen.add(cur);
			cur = parentOf(cur);
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
		parent: parentOf,
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

/**
 * Title-case a kebab-case slug: `celestial-bodies` → `Celestial Bodies`.
 */
export function titleCaseSlug(slug: string): string {
	return slug
		.split('-')
		.map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
		.join(' ');
}

/**
 * Naive singularize: operates on the last whitespace-separated token.
 * "Star Systems" → "Star System"; "Cities" → "City".
 */
export function naiveSingular(word: string): string {
	const parts = word.split(' ');
	const last = parts[parts.length - 1];
	let singular = last;
	if (/ies$/i.test(last)) singular = last.replace(/ies$/i, 'y');
	else if (/ses$/i.test(last)) singular = last.replace(/es$/i, '');
	else if (/s$/i.test(last) && !/ss$/i.test(last)) singular = last.replace(/s$/i, '');
	parts[parts.length - 1] = singular;
	return parts.join(' ');
}

/**
 * Derive `{ singular, plural }` labels for a folder, given the folder's
 * leaf segment (e.g. `celestial-bodies`) and an optional override
 * title from `_collection.yaml`. Plural defaults to the title-cased
 * leaf; singular defaults to a naive singularization of the plural.
 */
export function folderLabels(leafSlug: string, title?: string | null): FolderLabels {
	const plural = title?.trim() || titleCaseSlug(leafSlug);
	const singular = naiveSingular(plural);
	return { singular, plural };
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
	/**
	 * Optional qualifier — the entity id of a role or position
	 * the source entity holds *within* the target. For example, a
	 * `member-of` relation from a person to a group can carry
	 * `qualifier: <path>/runtha` to express that the person is the herd
	 * leader, not just a plain member. Multiple members of the same
	 * group with different qualifiers can then be sub-grouped by qualifier on
	 * the group's entity page.
	 */
	qualifier?: EntityId;
}

/**
 * Whether an entity is a class definition or a concrete instance.
 * Defaults to `'instance'` when omitted.
 *
 * - `'class'` — a category or type that other entities can be instances of.
 *   Accepts `plural:`, and may be referenced via `class:` by instance entities.
 * - `'instance'` — a concrete entity. May carry `class:` to point at a class
 *   entity; `plural:` is not meaningful here.
 */
export type EntityKind = 'class' | 'instance';

/** Meta loaded from the YAML sidecar. */
export interface EntityMeta {
	/** Display name. Used externally — in cards, links, breadcrumbs, titles. */
	name: string;
	/**
	 * Optional page title shown as the `<h1>` on the entity's own page.
	 * Falls back to `name` when absent. Use this when the public-facing
	 * name (e.g. "Jan 1954") should stay short for cards and links, but
	 * the entity page itself deserves a more descriptive heading (e.g. "Jan").
	 */
	title?: string;
	/**
	 * Whether this entity is a class definition or a concrete instance.
	 * Defaults to `'instance'` when omitted.
	 * - `'class'`: a category/type; accepts `plural:`. Instance entities may
	 *   reference it via `class: <id>`.
	 * - `'instance'`: a concrete entity; may carry `class:`. `plural:` is
	 *   not accepted.
	 */
	type?: EntityKind;
	/**
	 * Plural form of the entity name. Only valid on `type: class` entities.
	 * Displayed in the page title alongside the singular name when present:
	 * "Human / Humans". When absent the title falls back to "Human (class)".
	 */
	plural?: string;
	/** Optional shorter name / nickname / honorific. */
	aliases?: string[];
	/** One-line summary for cards and lists. */
	summary?: string;
	/** Free-form tags. */
	tags?: string[];
	/** Era / period label(s). Normalised from YAML (string → [string]) at load time. */
	era?: string[];
	/**
	 * The kind of this entity — the primary semantic classification.
	 * Must match an id in the central registry (`content_meta/kinds/`) to
	 * appear under that kind's page; unregistered values still load
	 * but raise a health-page warning and only appear under the
	 * "Unregistered" section on `/kinds`.
	 */
	kind?: string;
	/** "active" | "deceased" | "lost" | "ruined" | anything else. */
	status?: string;
	/**
	 * Optional sort position within a collection. Lower numbers sort
	 * first; unranked entities follow all ranked ones, sorted
	 * alphabetically. Displayed alongside the kind chip as "AXIOM · 2".
	 */
	rank?: number;
	/**
	 * Short language code, used by entities in a `languages` folder.
	 * The markdown renderer recognises `[[<code>]]` as an inline
	 * language tag and renders it as a small superscript link to the
	 * language's page. Codes are short, lowercase, and globally
	 * unique across all language entries (e.g. `ot` for the Old
	 * Tongue).
	 */
	code?: string;
	/**
	 * Language code of the entity's name, used when its name is in a
	 * non-English / non-English-equivalent language. The page header
	 * renders the code as a small superscript tag beside the title,
	 * leading back to the language entry.
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
	/**
	 * Structured property values, authored as a `properties:` YAML block.
	 * Keys are property ids (e.g. `gender`, `notation`); values are the
	 * authored property values. Validated against the world-level property
	 * registry at load time.
	 */
	properties?: Record<string, unknown>;
	/**
	 * Entity-level class: the id of an entity (typically a nature entity
	 * like `foundation/nature/mortals/human`) that this entity is an
	 * instance of. Acts as a virtual sub-kind — displayed in the kind
	 * pill on cards and the entity page header as the class entity's
	 * name (e.g. "Human"), links to the class entity's page, and used
	 * as the primary filter discriminator on collection pages.
	 *
	 * Must resolve to a known entity id. Replaces the equivalent
	 * `kindred` relation pattern.
	 */
	class?: string;
	/**
	 * Optional book-mode configuration for entities that carry a
	 * `chapters/` subfolder of prose pages. Controls how those pages
	 * are labelled and rendered.
	 *
	 *   - `format`: a named visual + naming preset.
	 *     - `book` (default): "Chapter <N>", display serif.
	 *     - `scrolls`: "Fragment <N>", archaic manuscript serif.
	 *
	 *   - `unitSingular` / `unitPlural`: optional manual overrides
	 *     for the unit word. Useful when `format` doesn't already
	 *     name what these pages are (e.g. "Letter", "Entry",
	 *     "Canto"). When omitted the format's defaults apply.
	 */
	book?: BookMeta;
	/**
	 * Vocabulary entries for this entity. On a `language` entity these are
	 * words native to that language. On any other entity, each entry must
	 * carry a `language:` field (short code or entity id) to associate it
	 * with a language. Collected and exposed via `graph.vocabularyForLang()`.
	 */
	vocabulary?: Array<{
		word?: string;
		meaning?: string;
		pos?: string;
		notes?: string;
		language?: string;
	}>;
	/**
	 * Population statistics blocks. Each element groups a population entry
	 * with optional `within: <worldId>` sub-group membership and a
	 * `population` array of slices (species percentages / counts).
	 * Read by `graph.buildPresenceIndex()`.
	 */
	statistics?: Array<Record<string, unknown>>;
	/** Arbitrary extra fields rendered in the property list sidebar. */
	[key: string]: unknown;
}

/**
 * Author-facing book-mode config. Mirrored into the loaded entity
 * (resolved against defaults) as `Entity.book`.
 */
export interface BookMeta {
	format?: BookFormat;
	unitSingular?: string;
	unitPlural?: string;
}

/**
 * Named book-mode preset. New presets bind a unit name and a
 * visual register; the chapter page picks them up via a
 * `[data-book-format=…]` attribute.
 */
export type BookFormat = 'book' | 'scrolls';

/** A loaded entity, ready to serve. */
export interface Entity {
	id: EntityId;
	/**
	 * The containing folder path. A grouping hint for browse / tag /
	 * language-detection consumers; not a semantic kind.
	 */
	type: EntityType;
	slug: string;
	meta: EntityMeta;
	/** Raw markdown body (unparsed). */
	body: string;
	/** Wikilink ids extracted from the body. */
	wikilinks: EntityId[];
	/**
	 * Kind ids referenced from the body via `[[kinds/<id>]]` wikilinks.
	 * Captured separately from `wikilinks` because they target the
	 * registry, not the entity map. Used to build the backlinks
	 * section on `/kinds/<id>` pages.
	 */
	kindLinks: string[];
	/**
	 * Structured kind references declared in YAML. The key is the
	 * field name on `meta` (e.g. `nativeBeings`); the value is the
	 * list of resolved kind ids that field pointed at via
	 * `kinds/<id>` strings. Only registered kinds appear here;
	 * unresolved ones surface as `broken-link` health issues.
	 *
	 * The raw `meta[field]` is left untouched so diagnostics still
	 * see what the author wrote.
	 */
	kindRefs: Record<string, string[]>;
	/** Absolute path to the YAML file on disk (for diagnostics). */
	yamlPath: string;
	/** Absolute path to the MD file on disk (for diagnostics). */
	mdPath: string;
	/**
	 * The id of the parent entity, if this entity's folder is nested
	 * inside another entity's folder. `null` for top-level entities.
	 */
	parent: EntityId | null;
	/** Direct child entity ids (filesystem-nested under this entity). */
	children: EntityId[];
	/**
	 * Ordered chapter list, when the entity carries a `chapters/`
	 * subfolder of `*.md` files. Chapters are not entities — they
	 * have no kind, no relations, no graph membership. Their prose is
	 * rendered as a sub-page of the entity, and any wikilinks they
	 * contain merge into the parent entity's `wikilinks` so backlinks
	 * still attribute to the work as a whole.
	 *
	 * Empty when no `chapters/` folder is present.
	 */
	chapters: Chapter[];
	/**
	 * Resolved book-mode config: present when this entity is
	 * book-shaped (has at least one chapter). Resolves the
	 * author-facing `BookMeta` against defaults so consumers get a
	 * fully-populated shape — `format`, `unitSingular`,
	 * `unitPlural` are always set when `book` is non-null.
	 */
	book: ResolvedBookMeta | null;
	/**
	 * Optional sibling `craft.md` body — an author's-room companion
	 * document for the entity. Held alongside in-world prose without
	 * being part of it: characters' inner architecture, voice
	 * samples, manipulation registers — material that informs how an
	 * entity is written but is not what an in-world observer would
	 * record. Surfaces as a separate sub-page on the entity.
	 *
	 * Wikilinks and kind-links inside the craft body are *not*
	 * merged into the entity's `wikilinks` / `kindLinks`: craft
	 * notes are deliberately excluded from the canonical
	 * cross-reference graph so backlinks reflect what's true
	 * in-world, not what the author has been thinking about.
	 *
	 * `null` when no `craft.md` exists.
	 */
	craft: string | null;
}

/**
 * Fully resolved book-mode config attached to a loaded entity.
 * Defaults are filled in by the loader so the renderer doesn't
 * have to know the preset table.
 */
export interface ResolvedBookMeta {
	format: BookFormat;
	unitSingular: string;
	unitPlural: string;
}

/**
 * A chapter / fragment / page within a book-shaped entity. Loaded
 * from `<entity>/chapters/<NN-slug>.md`. Filename prefix `NN-`
 * (one or more digits, hyphen) is required and drives ordering.
 */
export interface Chapter {
	/** Slug from filename (without the `NN-` prefix or `.md` suffix). */
	slug: string;
	/** Numeric ordering from the filename prefix. */
	order: number;
	/** Display title. Derived from the first `# heading`, falling back to the slug. */
	title: string;
	/** Raw markdown body. */
	body: string;
	/** Absolute path on disk (for diagnostics). */
	mdPath: string;
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
	/** See `Relation.qualifier`. */
	qualifier?: EntityId;
}

/** Health-check problems detected at load time. */
export interface HealthIssue {
	kind:
		| 'broken-link'
		| 'orphan'
		| 'missing-md'
		| 'missing-yaml'
		| 'invalid-yaml'
		| 'undefined-property'
		| 'property-kind-mismatch'
		| 'property-value-mismatch'
		| 'unknown-entity-field'
		| 'unknown-kind-ref';
	entity?: EntityId;
	detail: string;
}

// ── Relation edge labels ──────────────────────────────────────────────────────
//
// Single source of truth for how typed edges are labelled, used by both the
// entity page (About tab) and the graph ego-view edge labels.
//
// `outLabel`  — read from the *source* entity's perspective  ("Nora Patel → instance-of → Human")
// `inLabel`   — read from the *target* entity's perspective  ("Human ← instance-of ← Nora Patel")

export interface RelationLabels {
	outLabel: string;
	inLabel: string;
}

/**
 * Per-relation-kind schema entry authored in `content_meta/world.md`.
 *
 * `domain`          — kind ids the *source* entity must satisfy (at or below in
 *                     the kind tree). Omit to allow any source.
 * `codomain`        — kind ids the *target* entity must satisfy. Omit to allow any target.
 * `qualifierDomain` — kind ids the `qualifier` entity must satisfy. Omit to allow
 *                     any qualifier kind. Fires only when a qualifier is present and
 *                     resolves to a known entity.
 *
 * Kind matching is hierarchical: an entity satisfies a constraint if its
 * `kind` equals the listed id OR is a descendant of it in the kind tree.
 */
export interface RelationSchema extends RelationLabels {
	domain?: string[];
	codomain?: string[];
	/**
	 * When set, any instance of this relation that carries a `qualifier:` field
	 * must have the qualifier entity's `kind` equal or be a descendant of at least
	 * one of the listed kind ids.
	 *
	 * Fires only when the qualifier is present and resolves to a known entity;
	 * unresolvable qualifiers are caught by the broken-link check instead.
	 * Does not imply `qualifier: required`.
	 */
	qualifierDomain?: string[];
	/**
	 * When set to `'required'`, every instance of this relation must carry
	 * a `qualifier:` field. Missing qualifier emits a health-page warning.
	 *
	 * Orthogonal to `qualifierGovernedBy`: you can require a qualifier without
	 * constraining which backing edge it must satisfy, or constrain the backing
	 * edge without forcing a qualifier to be present on every instance.
	 */
	qualifier?: 'required';
	/**
	 * When set, any instance of this relation that carries a `qualifier:` field
	 * must have that qualifier entity hold an outgoing relation of the kind named
	 * here pointing at the **same target** (or its class chain).
	 *
	 * Example: `member-of` with `qualifierGovernedBy: cultural/role-in` requires
	 * that the `qualifier` entity on the `member-of` edge has a `cultural/role-in`
	 * edge to the same institution. Violations emit a health-page warning.
	 *
	 * Value is the full prefixed relation id, e.g. `cultural/role-in`.
	 * Does not imply `qualifier: required` — set both when instances must always
	 * carry a qualifier AND that qualifier must satisfy the backing-edge constraint.
	 */
	qualifierGovernedBy?: string;
	/**
	 * When set, the source entity's **class chain** must contain an entity that
	 * holds an outgoing relation of the kind named here pointing at the target
	 * (or its class chain). This expresses a structural pre-condition on the
	 * relation: e.g. `part-of-group` with `governedBy: cultural/part-of-structure`
	 * requires that the source group's structure (its `class:`) already has a
	 * `part-of-structure` edge to the target group's structure.
	 *
	 * Value is the full prefixed relation id, e.g. `cultural/part-of-structure`.
	 */
	governedBy?: string;
}

/** The full world-level relation registry as loaded from world.md. */
export type RelationRegistry = Map<string, RelationSchema>;

/**
 * Per-property-id schema entry declared in a `_kind.yaml` `properties:` block.
 *
 * `declaringKind` — the kind id whose `_kind.yaml` declared this property.
 *                   Scope is implicit: the property is valid on that kind and
 *                   all its descendants via the kind hierarchy.
 * `values`        — enum of allowed values. Omit to allow any value.
 */
export interface PropertySchema {
	/** Display name, e.g. "Gender". Required. */
	label: string;
	/**
	 * The kind id whose `_kind.yaml` declared this property. Set by the
	 * loader — not authored directly. Used by the validator to check that
	 * the entity's kind is the declaring kind or a descendant of it.
	 */
	declaringKind: string;
	/** Enum of allowed values, e.g. ["woman","man","fluid"]. Omit for any value. */
	values?: string[];
}

/** The full property registry built from all `_kind.yaml` files.
 *  A property key may be declared on multiple unrelated kinds (overloading);
 *  the array holds one entry per declaring kind. */
export type PropertyRegistry = Map<string, PropertySchema[]>;

// Engine-level defaults for relation labels. Only the synthetic `wikilink`
// edge kind (emitted by the loader, not authored) is defined here — its
// labels are needed even when no world schema is present. All other relation
// kinds should be defined in the world's `content_meta/world.md` schema;
// any kind not found there falls back to the humanise-slug path in
// `relationLabel()`.
export const ENGINE_RELATION_DEFAULTS: Record<string, RelationLabels> = {
	'wikilink': { outLabel: 'Mentions', inLabel: 'Mentioned by' },
};

/**
 * Return the human-readable label for a relation edge, from the perspective
 * of a given entity.
 *
 * @param kind      - The relation kind string (e.g. `"located-in"`).
 * @param direction - `"out"` if the entity is the *source* of the edge,
 *                   `"in"` if it is the *target*.
 * @param registry  - Optional world-level registry; consulted first.
 */
export function relationLabel(
	kind: string,
	direction: 'out' | 'in',
	registry?: RelationRegistry
): string {
	const worldEntry = registry?.get(kind);
	if (worldEntry) return direction === 'out' ? worldEntry.outLabel : worldEntry.inLabel;
	const engineEntry = ENGINE_RELATION_DEFAULTS[kind];
	if (engineEntry) return direction === 'out' ? engineEntry.outLabel : engineEntry.inLabel;
	// Fallback: humanise the raw kind slug
	return kind.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

// ── Vocabulary ────────────────────────────────────────────────────────────────
//
// A single word/term in a language, collected either from the language entity's
// own `vocabulary:` frontmatter block, or from any other entity that carries a
// `vocabulary:` block with a `language:` field pointing at a language.

export interface VocabEntry {
	/** The word or term in the language. */
	word: string;
	/** English gloss or definition. */
	meaning: string | null;
	/** Part of speech (noun, verb, proper noun, …). */
	pos: string | null;
	/** Usage notes, etymology, context. */
	notes: string | null;
	/** Short language code (e.g. "bu"), for display as an inline pill. */
	langCode: string | null;
	/** URL to the language entity page, for the pill link. */
	langHref: string | null;
	/**
	 * Entity that contributed this entry. Null when the entry comes from the
	 * language entity's own `vocabulary:` block.
	 */
	sourceId: string | null;
	sourceName: string | null;
	sourceHref: string | null;
}
