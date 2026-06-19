import type { Collection, Entity, EntityId, HealthIssue, Kind, PropertyRegistry, RelationRegistry } from '$lib/types';
import { extractUnlabelledWikilinks, extractWikilinks, resolveWikilink } from './wikilinks';

/**
 * Everything needed to run post-walk validation. Passed as a single
 * object so callers don't need to thread many individual arguments.
 */
export interface ValidateArgs {
	entities: Map<EntityId, Entity>;
	collections: Map<string, Collection>;
	kindRegistry: Map<string, Kind>;
	clusterSet: Set<string>;
	universalSet: Set<string>;
	langCodes: Set<string>;
	/** Merged relation registry built from all `_ontology.yaml` files. Empty map = not configured. */
	relationRegistry: RelationRegistry;
	/** When false, relation kinds not in the registry emit health warnings. */
	allowUndefinedRelations: boolean;
	/** Merged property registry built from all `_kind.yaml` files. Empty map = not configured. */
	propertyRegistry: PropertyRegistry;
	/** When false, property keys not in the registry emit health warnings. */
	allowUndefinedProperties: boolean;
	issues: HealthIssue[];
}

/**
 * Derive the cluster and universal-substrate sets from the already-
 * loaded entity and collection maps.
 *
 * A *cluster* is a top-level folder under `content/` that is not
 * itself marked `universal: true` and that does not itself act as an
 * entity. Clusters are the editorial neighbourhoods of the world
 * (e.g. `mistwood`, `tideholm` in the sample world).
 *
 * A *universal substrate* is a top-level folder explicitly marked
 * with `universal: true` in its `_collection.{yaml,md}`. It is
 * reachable as a fallback from any cluster's bare-slug links and
 * never participates in cluster-scoping itself.
 */
export function deriveClusterSets(
	entities: Map<EntityId, Entity>,
	collections: Map<string, Collection>
): { clusterSet: Set<string>; universalSet: Set<string> } {
	const clusterSet = new Set<string>();
	const universalSet = new Set<string>();
	for (const id of entities.keys()) {
		const first = id.split('/')[0];
		if (!first) continue;
		if (entities.has(first)) continue;
		clusterSet.add(first);
	}
	for (const [p, collection] of collections) {
		if (p.includes('/')) continue; // top-level only
		if (collection.meta.universal === true) {
			universalSet.add(p);
			clusterSet.delete(p);
		}
	}
	return { clusterSet, universalSet };
}

/**
 * Build the language-code set used to suppress spurious broken-link
 * warnings for `[[ot]]`-style inline language tags. A code is only
 * honoured if it sits on an entity in a `languages` folder and is
 * 2–8 lowercase letters.
 */
export function buildLangCodes(entities: Map<EntityId, Entity>): Set<string> {
	const langCodes = new Set<string>();
	for (const e of entities.values()) {
		const isLang = e.type === 'languages' || e.type.endsWith('/languages');
		if (!isLang) continue;
		const code = (e.meta as { code?: unknown }).code;
		if (typeof code === 'string' && /^[a-z]{2,8}$/.test(code)) {
			langCodes.add(code);
		}
	}
	return langCodes;
}

/**
 * Resolve entity body wikilinks to canonical ids and emit broken-link
 * issues for any that cannot be resolved. Mutates `entity.wikilinks`
 * in place, replacing raw paths with resolved ids.
 */
export function validateEntityWikilinks(args: ValidateArgs): void {
	const { entities, clusterSet, universalSet, langCodes, issues } = args;
	for (const entity of entities.values()) {
		const resolved = new Set<EntityId>();
		const fromCluster = clusterOf(entity.id, clusterSet);
		for (const raw of entity.wikilinks) {
			if (langCodes.has(raw)) continue;
			const r = resolveWikilink(raw, entities, fromCluster, clusterSet, universalSet);
			if (r.id !== null) {
				resolved.add(r.id);
				continue;
			}
			issues.push(brokenWikilinkIssue(entity.id, raw, r, fromCluster, 'wikilink'));
		}
		entity.wikilinks = [...resolved];
	}
}

/** Detect broken relation targets and emit broken-link issues. */
export function validateRelations(args: ValidateArgs): void {
	const { entities, issues } = args;
	for (const entity of entities.values()) {
		for (const rel of entity.meta.relations ?? []) {
			if (!entities.has(rel.target)) {
				issues.push({
					kind: 'broken-link',
					entity: entity.id,
					detail: `relation ${rel.kind} → ${rel.target} (not found)`
				});
			}
			if (rel.role !== undefined && !entities.has(rel.role)) {
				issues.push({
					kind: 'broken-link',
					entity: entity.id,
					detail: `relation ${rel.kind} → ${rel.target}: role → ${rel.role} (not found)`
				});
			}
		}
	}
}

/**
 * Validate `[[kinds/<id>]]` wikilinks against the registry.
 * Unregistered kind targets get the same broken-link treatment as
 * broken entity wikilinks. Mutates `entity.kindLinks` in place,
 * replacing raw ids with validated ones.
 */
export function validateKindLinks(args: ValidateArgs): void {
	const { entities, kindRegistry, issues } = args;
	for (const entity of entities.values()) {
		const resolved: string[] = [];
		for (const raw of entity.kindLinks) {
			if (kindRegistry.has(raw)) {
				resolved.push(raw);
			} else {
				issues.push({
					kind: 'broken-link',
					entity: entity.id,
					detail: `wikilink → kinds/${raw} (not found)`
				});
			}
		}
		entity.kindLinks = resolved;
	}
}

/**
 * Validate structured kind-references declared in YAML (e.g.
 * `nativeBeings: [kinds/human]`). Unregistered ids emit a broken-link
 * issue and are dropped from `entity.kindRefs`, so the graph only
 * indexes resolved references.
 */
export function validateKindRefs(args: ValidateArgs): void {
	const { entities, kindRegistry, issues } = args;
	for (const entity of entities.values()) {
		const resolvedRefs: Record<string, string[]> = {};
		for (const [field, ids] of Object.entries(entity.kindRefs)) {
			const keep: string[] = [];
			for (const id of ids) {
				if (kindRegistry.has(id)) {
					keep.push(id);
				} else {
					issues.push({
						kind: 'broken-link',
						entity: entity.id,
						detail: `${field} → kinds/${id} (not found)`
					});
				}
			}
			if (keep.length > 0) resolvedRefs[field] = keep;
		}
		entity.kindRefs = resolvedRefs;
	}
}

/**
 * Validate entity kinds against the registry. Lenient: every entity
 * must declare a non-empty `kind`, and unregistered kinds emit a
 * health-page warning but still load.
 */
export function validateEntityKinds(args: ValidateArgs): void {
	const { entities, kindRegistry, issues } = args;
	for (const entity of entities.values()) {
		const k = (entity.meta as { kind?: unknown }).kind;
		if (typeof k !== 'string' || k.length === 0) {
			issues.push({
				kind: 'invalid-yaml',
				entity: entity.id,
				detail: `entity has no 'kind' field`
			});
			continue;
		}
		if (!kindRegistry.has(k)) {
			issues.push({
				kind: 'invalid-yaml',
				entity: entity.id,
				detail: `kind '${k}' is not registered in content_meta/kinds/`
			});
		}
	}
}

/**
 * Validate wikilinks in entity summary fields. Summaries are rendered
 * on cards and entity pages — broken links there are just as
 * confusing as broken links in prose.
 */
export function validateSummaryWikilinks(args: ValidateArgs): void {
	const { entities, clusterSet, universalSet, langCodes, issues } = args;
	for (const entity of entities.values()) {
		const summary = entity.meta.summary;
		if (!summary) continue;
		const fromCluster = clusterOf(entity.id, clusterSet);
		for (const raw of extractWikilinks(summary)) {
			if (langCodes.has(raw)) continue;
			const r = resolveWikilink(raw, entities, fromCluster, clusterSet, universalSet);
			if (r.id !== null) continue;
			issues.push(brokenWikilinkIssue(entity.id, raw, r, fromCluster, 'summary wikilink'));
		}
	}
}

/**
 * Validate wikilinks in collection bodies (_collection.md prose).
 * These are rendered on collection/shelf pages. Issues carry the
 * collection path in `detail` since collections have no entity id.
 */
export function validateCollectionWikilinks(args: ValidateArgs): void {
	const { entities, collections, clusterSet, universalSet, langCodes, issues } = args;
	for (const [collPath, collection] of collections) {
		if (!collection.body) continue;
		const topLevel = collPath.split('/')[0];
		const fromCluster = clusterSet.has(topLevel) ? topLevel : null;
		for (const raw of extractWikilinks(collection.body)) {
			if (langCodes.has(raw)) continue;
			const r = resolveWikilink(raw, entities, fromCluster, clusterSet, universalSet);
			if (r.id !== null) continue;
			issues.push(
				brokenWikilinkIssue(undefined, raw, r, fromCluster, `${collPath}/_collection.md: wikilink`)
			);
		}
	}
}

/**
 * Validate the `class` field on entities:
 *
 * 1. The class target must be a known entity (broken-link check).
 * 2. Only entities whose kind (or an ancestor kind) declares a `class`
 *    constraint in its `_kind.yaml` may carry a `class:` field. Entities
 *    of unconstrained kinds emit a `property-kind-mismatch` issue.
 * 3. When a kind-level `class` constraint exists, the class target entity's
 *    own `kind` must be the constrained kind or a descendant of it.
 *
 * Uses global resolution (class targets are typically universal-substrate
 * entities like `foundation/nature/…` reachable from any cluster).
 */
export function validateClassField(args: ValidateArgs): void {
	const { entities, kindRegistry, issues } = args;

	// Build ancestor set for a kind: self + all parents up to root.
	function ancestors(kindId: string): Set<string> {
		const result = new Set<string>();
		let cur: string | null = kindId;
		while (cur) {
			result.add(cur);
			cur = kindRegistry.get(cur)?.parent ?? null;
		}
		return result;
	}

	// Walk a kind's ancestry to find the nearest declared class constraint.
	function classConstraintFor(kindId: string): string | null {
		let cur: string | null = kindId;
		while (cur) {
			const k = kindRegistry.get(cur);
			if (!k) break;
			if (k.meta.class) return k.meta.class;
			cur = k.parent ?? null;
		}
		return null;
	}

	for (const entity of entities.values()) {
		const cls = entity.meta.class;
		if (typeof cls !== 'string' || !cls) continue;

		// Check 1: target must exist.
		if (!entities.has(cls)) {
			issues.push({
				kind: 'broken-link',
				entity: entity.id,
				detail: `class → ${cls} (not found)`
			});
			continue;
		}

		const entityKind = typeof entity.meta.kind === 'string' ? entity.meta.kind : null;
		const constraint = entityKind ? classConstraintFor(entityKind) : null;

		// Check 2: entity's kind must have a class constraint.
		if (!constraint) {
			issues.push({
				kind: 'property-kind-mismatch',
				entity: entity.id,
				detail: `entity has 'class: ${cls}' but kind '${entityKind ?? '(none)'}' does not declare a class constraint`
			});
			continue;
		}

		// Check 3: class target's kind must satisfy the constraint.
		const targetEntity = entities.get(cls)!;
		const targetKind = typeof targetEntity.meta.kind === 'string' ? targetEntity.meta.kind : null;
		const targetAncestors = targetKind ? ancestors(targetKind) : new Set<string>();
		if (!targetAncestors.has(constraint)) {
			issues.push({
				kind: 'property-kind-mismatch',
				entity: entity.id,
				detail: `class target '${cls}' has kind '${targetKind ?? '(none)'}' which is not '${constraint}' or a descendant (required by kind '${entityKind}')`
			});
		}
	}
}

/**
 * Validate `[[code]]`-style language tags across all text surfaces:
 * entity bodies, summaries, collection bodies, and kind bodies.
 *
 * Mirrors the decision tree in `markdown.ts` `rewriteBrackets()`:
 * a `[[token]]` is treated as a lang tag only when it matches the
 * lang-tag shape (`/^[a-z]{2,8}$/`) AND cannot be resolved as an
 * entity wikilink. If it also isn't in the registered `langCodes`
 * set, we emit a broken-link issue.
 *
 * This catches `[[ot]]` typos and references to language codes that
 * haven't been defined yet, while ignoring valid entity slugs that
 * happen to be short (e.g. `[[kael]]`, `[[harmonia]]`).
 */
export function validateLangLinks(args: ValidateArgs): void {
	const { entities, collections, kindRegistry, clusterSet, universalSet, langCodes, issues } =
		args;
	const langShape = /^[a-z]{2,8}$/;

	function checkBody(
		body: string,
		entityId: EntityId | undefined,
		fromCluster: string | null,
		surface: string
	): void {
		for (const raw of extractWikilinks(body)) {
			// Only interested in bare-slug tokens that match the lang-tag shape.
			if (!langShape.test(raw)) continue;
			// If it's a registered lang code, it's valid — skip.
			if (langCodes.has(raw)) continue;
			// If it resolves as a real entity from this context, it's an
			// entity wikilink — skip.
			const r = resolveWikilink(raw, entities, fromCluster, clusterSet, universalSet);
			if (r.id !== null) continue;
			// For missing-in-cluster, do a global check: if the slug suffix-
			// matches any entity anywhere in the graph, treat it as a
			// cross-cluster entity wikilink and defer to validateEntityWikilinks.
			if (r.reason === 'missing-in-cluster') {
				const global = resolveWikilink(raw, entities, null, clusterSet, universalSet);
				if (global.id !== null) continue;
			}
			issues.push({
				kind: 'broken-link',
				...(entityId !== undefined && { entity: entityId }),
				detail: `${surface} → [[${raw}]] (unknown language code)`
			});
		}
	}

	// Entity bodies
	for (const entity of entities.values()) {
		const fromCluster = clusterOf(entity.id, clusterSet);
		checkBody(entity.body, entity.id, fromCluster, 'language tag');
	}

	// Summaries
	for (const entity of entities.values()) {
		const summary = entity.meta.summary;
		if (!summary) continue;
		const fromCluster = clusterOf(entity.id, clusterSet);
		checkBody(summary, entity.id, fromCluster, 'language tag in summary');
	}

	// Collection bodies
	for (const [collPath, collection] of collections) {
		if (!collection.body) continue;
		const topLevel = collPath.split('/')[0];
		const fromCluster = clusterSet.has(topLevel) ? topLevel : null;
		checkBody(
			collection.body,
			undefined,
			fromCluster,
			`${collPath}/_collection.md: language tag`
		);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clusterOf(id: EntityId, clusterSet: Set<string>): string | null {
	const first = id.split('/')[0];
	return clusterSet.has(first) ? first : null;
}

type ResolveFailure = Extract<
	ReturnType<typeof resolveWikilink>,
	{ id: null }
>;

function brokenWikilinkIssue(
	entityId: EntityId | undefined,
	raw: string,
	r: ResolveFailure,
	fromCluster: string | null,
	label: string
): HealthIssue {
	if (r.reason === 'ambiguous' || r.reason === 'ambiguous-in-cluster') {
		const scope =
			r.reason === 'ambiguous-in-cluster' && fromCluster ? ` in cluster ${fromCluster}` : '';
		return {
			kind: 'broken-link',
			...(entityId !== undefined && { entity: entityId }),
			detail: `${label} → ${raw} (ambiguous${scope}: matches ${r.matches.join(', ')})`
		};
	}
	if (r.reason === 'missing-in-cluster' && fromCluster) {
		return {
			kind: 'broken-link',
			...(entityId !== undefined && { entity: entityId }),
			detail: `${label} → ${raw} (not found in cluster ${fromCluster}; for cross-cluster references write the full path starting with a cluster name)`
		};
	}
	return {
		kind: 'broken-link',
		...(entityId !== undefined && { entity: entityId }),
		detail: `${label} → ${raw} (not found)`
	};
}

/**
 * Validate entity relations against the world-level relation registry.
 *
 * Two checks:
 *   1. **Undefined kind** — when `allowUndefinedRelations` is false, any
 *      relation kind not present in the registry emits a warning.
 *   2. **Domain / codomain** — when the schema entry carries `domain` or
 *      `codomain` constraints, the source/target entity's `kind` must
 *      equal or be a descendant of at least one listed kind in the kind
 *      tree. Violations emit a `broken-link` issue (close enough for the
 *      health-page grouping; a dedicated `invalid-relation` kind would
 *      require a UI change).
 */
export function validateRelationSchema(args: ValidateArgs): void {
	const { entities, kindRegistry, relationRegistry, allowUndefinedRelations, issues } = args;

	// Pre-build ancestor map: kind id -> Set of ancestor ids (self + all parents)
	function ancestors(kindId: string): Set<string> {
		const result = new Set<string>();
		let current: string | null = kindId;
		while (current !== null) {
			result.add(current);
			current = kindRegistry.get(current)?.parent ?? null;
		}
		return result;
	}

	function satisfiesConstraint(entityKind: string | undefined, constraint: string[]): boolean {
		if (!entityKind) return false;
		const entityAncestors = ancestors(entityKind);
		return constraint.some((c) => entityAncestors.has(c));
	}

	for (const entity of entities.values()) {
		// Track which relation kinds have already emitted a domain issue for this
		// entity. The domain constraint is a source-entity-level fact (the entity's
		// kind either satisfies the domain or it doesn't), so one issue per
		// (entity, relation-kind) pair is sufficient regardless of how many
		// individual relation entries share that kind.
		const domainIssued = new Set<string>();

		for (const rel of entity.meta.relations ?? []) {
			const schema = relationRegistry.get(rel.kind);

			// Check 1: undefined relation kind
			if (!schema && !allowUndefinedRelations) {
				const slashIdx = rel.kind.indexOf('/');
				const ontologyFile = slashIdx !== -1
					? `content_meta/kinds/${rel.kind.slice(0, slashIdx)}/_ontology.yaml`
					: `content_meta/kinds/_ontology.yaml`;
				issues.push({
					kind: 'invalid-yaml',
					entity: entity.id,
					detail: `relation kind '${rel.kind}' is not defined in ${ontologyFile}`
				});
				continue; // skip constraint checks — no schema to check against
			}

			if (!schema) continue;

			// Check 2: domain constraint (source entity) — one issue per relation kind
			if (schema.domain && schema.domain.length > 0 && !domainIssued.has(rel.kind)) {
				const sourceKind = entity.meta.kind;
				if (!satisfiesConstraint(sourceKind, schema.domain)) {
					domainIssued.add(rel.kind);
					issues.push({
						kind: 'invalid-yaml',
						entity: entity.id,
						detail: `relation '${rel.kind}': source kind '${sourceKind ?? '(none)'}' does not satisfy domain [${schema.domain.join(', ')}]`
					});
				}
			}

			// Check 3: codomain constraint (target entity)
			if (schema.codomain && schema.codomain.length > 0) {
				const target = entities.get(rel.target);
				if (target) {
					const targetKind = target.meta.kind;
					if (!satisfiesConstraint(targetKind, schema.codomain)) {
						issues.push({
							kind: 'invalid-yaml',
							entity: entity.id,
							detail: `relation '${rel.kind}' → ${rel.target}: target kind '${targetKind ?? '(none)'}' does not satisfy codomain [${schema.codomain.join(', ')}]`
						});
					}
				}
				// broken target (entity not found) is already caught by validateRelations
			}
		}
	}
}

/**
 * Enforce the authoring rule: entity wikilinks must always carry a
 * pipe label (`[[path|Label]]`). Bare wikilinks without a label are
 * only permitted for inline language-code tags (e.g. `[[bu]]`).
 *
 * Checks entity bodies, summaries, and collection bodies.
 */
export function validateUnlabelledWikilinks(args: ValidateArgs): void {
	const { entities, collections, langCodes, issues } = args;

	function checkBody(
		body: string,
		entityId: EntityId | undefined,
		surface: string
	): void {
		for (const raw of extractUnlabelledWikilinks(body)) {
			if (langCodes.has(raw)) continue;
			issues.push({
				kind: 'broken-link',
				...(entityId !== undefined && { entity: entityId }),
				detail: `${surface} → [[${raw}]] (missing label — write [[${raw}|Label]])`
			});
		}
	}

	for (const entity of entities.values()) {
		if (!entity.body) continue;
		checkBody(entity.body, entity.id, 'unlabelled wikilink');
	}

	for (const entity of entities.values()) {
		const summary = entity.meta.summary;
		if (!summary) continue;
		checkBody(summary, entity.id, 'unlabelled wikilink in summary');
	}

	for (const [collPath, collection] of collections) {
		if (!collection.body) continue;
		checkBody(collection.body, undefined, `${collPath}/_collection.md: unlabelled wikilink`);
	}
}

/**
 * Validate property keys and values on every entity against the
 * world-level property registry.
 *
 * Three checks (mirroring `validateRelationSchema`):
 *  1. Undefined property key — emitted when the registry is non-empty
 *     and `allowUndefinedProperties` is false.
 *  2. Property-kind mismatch — the entity's kind is not in
 *     `schema.allowedKinds`.
 *  3. Property-value mismatch — the value is not in `schema.values`.
 */
/**
 * The set of field names that are part of the `EntityMeta` contract.
 * Any top-level key in entity frontmatter that is NOT in this set is
 * considered an unknown field and surfaced as a health warning.
 *
 * Keep in sync with the `EntityMeta` interface in `src/lib/types.ts`.
 */
const KNOWN_ENTITY_META_FIELDS = new Set([
	'name',
	'aliases',
	'summary',
	'tags',
	'era',
	'kind',
	'status',
	'rank',
	'rankDisplay',
	'code',
	'language',
	'sigil',
	'relations',
	'properties',
	'class',
	'book',
	'vocabulary',
	'statistics'
]);

/**
 * Flags any top-level frontmatter field on an entity that is not part of
 * the known `EntityMeta` contract. These are most likely old-style ad-hoc
 * fields (e.g. `gender: x` before the `properties:` migration) that should
 * be moved under `properties:`.
 */
export function validateUnknownEntityFields(args: ValidateArgs): void {
	const { entities, issues } = args;

	for (const entity of entities.values()) {
		const meta = entity.meta as Record<string, unknown>;
		for (const key of Object.keys(meta)) {
			if (!KNOWN_ENTITY_META_FIELDS.has(key)) {
				issues.push({
					kind: 'unknown-entity-field',
					entity: entity.id,
					detail: `unknown top-level field '${key}' — move it under 'properties:' if it is a custom attribute`
				});
			}
		}
	}
}

export function validatePropertySchema(args: ValidateArgs): void {
	const { entities, kindRegistry, propertyRegistry, allowUndefinedProperties, issues } = args;

	// Ancestor set for a kind: self + all parents up the hierarchy.
	function ancestors(kindId: string): Set<string> {
		const result = new Set<string>();
		let current: string | null = kindId;
		while (current !== null) {
			result.add(current);
			current = kindRegistry.get(current)?.parent ?? null;
		}
		return result;
	}

	for (const entity of entities.values()) {
		const props = entity.meta.properties;
		if (!props || typeof props !== 'object' || Array.isArray(props)) continue;

		for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
			const schemas = propertyRegistry.get(key);

			// Check 1: undefined property key
			if (!schemas && !allowUndefinedProperties) {
				issues.push({
					kind: 'undefined-property',
					entity: entity.id,
					detail: `property '${key}' is not declared in any _kind.yaml properties block`
				});
				continue; // skip further checks — no schema to check against
			}

			if (!schemas) continue;

			// Check 2: kind scope — entity's kind must satisfy at least one declaration.
			// A property key may be overloaded across unrelated kinds; it is valid as
			// long as the entity's kind (or any of its ancestors) matches any declaringKind.
			const entityKind = entity.meta.kind;
			const entityAncestors = entityKind ? ancestors(entityKind) : new Set<string>();
			const matchingSchemas = schemas.filter((s) => entityAncestors.has(s.declaringKind));

			if (matchingSchemas.length === 0) {
				// No declaration fits this entity's kind — report using all declaring kinds
				const declarers = schemas.map((s) => `'${s.declaringKind}'`).join(', ');
				issues.push({
					kind: 'property-kind-mismatch',
					entity: entity.id,
					detail: `property '${key}' is declared on kind ${declarers} — entity kind '${entityKind ?? '(none)'}' is not that kind or a descendant`
				});
				continue;
			}

			// Check 3: values constraint — apply against each matching declaration that has one.
			for (const schema of matchingSchemas) {
				if (schema.values && schema.values.length > 0) {
					const strVal = String(value);
					if (!schema.values.includes(strVal)) {
						issues.push({
							kind: 'property-value-mismatch',
							entity: entity.id,
							detail: `property '${key}': value '${strVal}' is not in allowed values [${schema.values.join(', ')}]`
						});
					}
				}
			}
		}
	}
}
