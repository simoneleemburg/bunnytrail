/**
 * Core types for the Alteria worldbuilding graph.
 *
 * On disk, every entity is a pair of files:
 *   content/<type>/<slug>.yaml    — structured metadata (this file's shape)
 *   content/<type>/<slug>.md      — long-form prose (rendered as the page body)
 *
 * The id of an entity is `<type>/<slug>`. Slugs are kebab-case.
 */

export type EntityType =
	| 'characters'
	| 'places'
	| 'factions'
	| 'events'
	| 'species'
	| 'items'
	| 'concepts'
	| 'timelines';

export const ENTITY_TYPES: EntityType[] = [
	'characters',
	'places',
	'factions',
	'events',
	'species',
	'items',
	'concepts',
	'timelines'
];

/** Human-readable singular labels for each type. */
export const ENTITY_TYPE_LABELS: Record<EntityType, { singular: string; plural: string }> = {
	characters: { singular: 'Character', plural: 'Characters' },
	places: { singular: 'Place', plural: 'Places' },
	factions: { singular: 'Faction', plural: 'Factions' },
	events: { singular: 'Event', plural: 'Events' },
	species: { singular: 'Species', plural: 'Species' },
	items: { singular: 'Item', plural: 'Items' },
	concepts: { singular: 'Concept', plural: 'Concepts' },
	timelines: { singular: 'Timeline', plural: 'Timelines' }
};

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
	/** "active" | "deceased" | "lost" | "ruined" | anything else. */
	status?: string;
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
