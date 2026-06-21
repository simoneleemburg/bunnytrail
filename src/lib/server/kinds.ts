import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { HealthIssue, Kind, Ontology, KindMeta, RelationRegistry, RelationSchema, PropertyRegistry } from '$lib/types';
import { titleCaseSlug } from '$lib/types';
import { defaultKindsDir } from './globals';

const KIND_ID_RE = /^[a-z][a-z0-9-]*$/;

export interface KindLoadResult {
	/** All loaded kinds, keyed by id. */
	kinds: Map<string, Kind>;
	/** All loaded ontologies, keyed by id. */
	ontologies: Map<string, Ontology>;
	/**
	 * Merged relation registry built from every `_ontology.yaml` that
	 * carries a `relations:` block. Keys are the full prefixed ids —
	 * `<ontology-id>/<slug>` for named ontologies, bare slug for the
	 * root ontology (a `_ontology.yaml` placed directly under
	 * `content_meta/kinds/`).
	 */
	relations: RelationRegistry;
	/**
	 * Merged property registry built from every `_kind.yaml` that
	 * carries a `properties:` block. Keys are property ids; values carry
	 * the label, optional values enum, and the declaring kind id.
	 * Scope is implicit via the kind hierarchy — a property declared on
	 * kind X is valid on X and all its descendants.
	 */
	properties: PropertyRegistry;
	/** Any problems encountered (malformed yaml, bad folder name). */
	issues: HealthIssue[];
}

/**
 * Walk `content_meta/kinds/` (or `BUNNYTRAIL_KINDS_DIR`) recursively and return
 * every declared kind. Each subdirectory whose name passes `KIND_ID_RE` is a
 * kind; its `_kind.yaml` (if present) supplies label and description overrides.
 * A kind with no marker file is still registered with default labels — the
 * folder existing is enough.
 *
 * A subdirectory that contains `_ontology.yaml` (and no `_kind.yaml`) is
 * treated as an organisational **ontology**, not a kind. Ontologies are one level
 * deep: kind folders inside an ontology folder become members of that ontology
 * (their `group` field is set to the ontology id). Ontologies do not affect the
 * kind hierarchy (`parent` is independent).
 *
 * A `_ontology.yaml` placed directly at the root of `content_meta/kinds/`
 * (not inside a subfolder) acts as the **root ontology** and may declare
 * global relations with bare (unprefixed) ids.
 *
 * If the registry directory does not exist, returns an empty registry with
 * no issues — callers should treat absence as "no kinds registered yet".
 */
export async function loadKindRegistry(
	kindsDir: string = defaultKindsDir()
): Promise<KindLoadResult> {
	const kinds = new Map<string, Kind>();
	const ontologies = new Map<string, Ontology>();
	const relations: RelationRegistry = new Map();
	const properties: PropertyRegistry = new Map();
	const issues: HealthIssue[] = [];

	const rootExists = await dirExists(kindsDir);
	if (!rootExists) return { kinds, ontologies, relations, properties, issues };

	// Load root-level _ontology.yaml (global relations, no prefix).
	const rootOntologyPath = join(kindsDir, '_ontology.yaml');
	if (await fileExists(rootOntologyPath)) {
		const rootRelations = await readOntologyRelations(rootOntologyPath, null, kindsDir, issues);
		for (const [id, schema] of rootRelations) relations.set(id, schema);
	}

	await walk(kindsDir, null, null, kinds, ontologies, relations, properties, issues, kindsDir);

	return { kinds, ontologies, relations, properties, issues };
}

async function walk(
	absDir: string,
	parent: string | null,
	group: string | null,
	kinds: Map<string, Kind>,
	ontologies: Map<string, Ontology>,
	relations: RelationRegistry,
	properties: PropertyRegistry,
	issues: HealthIssue[],
	rootDir: string
): Promise<void> {
	let entries: Dirent[];
	try {
		entries = (await readdir(absDir, { withFileTypes: true })) as Dirent[];
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(absDir, rootDir)}: cannot read directory (${err instanceof Error ? err.message : String(err)})`
		});
		return;
	}

	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		if (!entry.isDirectory()) continue;

		const id = entry.name;
		if (!KIND_ID_RE.test(id)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(join(absDir, id), rootDir)}: kind id must be kebab-case starting with a letter`
			});
			continue;
		}

		const childDir = join(absDir, id);

		// A folder with `_ontology.yaml` and no `_kind.yaml` is an ontology container.
		// Ontologies are only allowed at the top level (parent === null) and cannot nest.
		const isGroup = await isOntologyFolder(childDir);

		if (isGroup) {
			if (parent !== null) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${relTo(childDir, rootDir)}: _ontology.yaml is only supported at the top level of content_meta/kinds/`
				});
				continue;
			}
			if (group !== null) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${relTo(childDir, rootDir)}: ontologies cannot be nested`
				});
				continue;
			}

			if (ontologies.has(id)) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${relTo(childDir, rootDir)}: ontology '${id}' is declared more than once`
				});
			} else {
				const ontology = await loadOntologyFile(childDir, id, rootDir, issues);
				ontologies.set(id, ontology);
				// Merge this ontology's relations into the global registry.
				for (const [relId, schema] of ontology.relations) relations.set(relId, schema);
			}

			await walk(childDir, null, id, kinds, ontologies, relations, properties, issues, rootDir);
			continue;
		}

		// Regular kind folder.
		const meta = await loadKindMeta(childDir, id, rootDir, issues);

		if (kinds.has(id)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(childDir, rootDir)}: kind '${id}' is declared more than once`
			});
		} else {
			kinds.set(id, { id, meta, parent, group });
			// Merge this kind's declared properties into the global registry.
			if (meta.properties) {
				for (const [propId, entry] of Object.entries(meta.properties)) {
					const schema = { label: entry.label, declaringKind: id, values: entry.values };
					const existing = properties.get(propId);
					if (existing) {
						existing.push(schema);
					} else {
						properties.set(propId, [schema]);
					}
				}
			}
		}

		await walk(childDir, id, group, kinds, ontologies, relations, properties, issues, rootDir);
	}
}

/**
 * Return true when the folder should be treated as an ontology container:
 * has `_ontology.yaml` and no `_kind.yaml`.
 */
async function isOntologyFolder(dir: string): Promise<boolean> {
	const hasGroupFile = await fileExists(join(dir, '_ontology.yaml'));
	if (!hasGroupFile) return false;
	const hasKindYaml = await fileExists(join(dir, '_kind.yaml'));
	return !hasKindYaml;
}

/** Known top-level keys in an `_ontology.yaml` file. */
const KNOWN_ONTOLOGY_FIELDS = new Set(['title', 'description', 'relations']);

/** Known keys inside a single relation entry in `_ontology.yaml`. */
const KNOWN_RELATION_ENTRY_FIELDS = new Set([
	'outLabel', 'inLabel',
	'domain', 'codomain', 'qualifierDomain',
	'governedBy', 'qualifierGovernedBy', 'qualifier'
]);

/**
 * Load a `_ontology.yaml` file and return an `Ontology`.
 */
async function loadOntologyFile(
	dir: string,
	id: string,
	rootDir: string,
	issues: HealthIssue[]
): Promise<Ontology> {
	const yamlPath = join(dir, '_ontology.yaml');
	const raw = await readOptional(yamlPath);
	if (raw === null) return { id, title: null, description: null, relations: new Map() };

	let parsed: unknown;
	try {
		parsed = parseYaml(raw);
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(yamlPath, rootDir)}: ${err instanceof Error ? err.message : String(err)}`
		});
		return { id, title: null, description: null, relations: new Map() };
	}

	const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	const title = typeof obj.title === 'string' ? obj.title : null;
	const description = typeof obj.description === 'string' ? obj.description : null;

	for (const field of ['title', 'description'] as const) {
		if (obj[field] !== undefined && typeof obj[field] !== 'string') {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(yamlPath, rootDir)}: ${field} must be a string`
			});
		}
	}

	// Unknown top-level fields.
	for (const key of Object.keys(obj)) {
		if (!KNOWN_ONTOLOGY_FIELDS.has(key)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(yamlPath, rootDir)}: unknown field '${key}'`
			});
		}
	}

	const relations = parseOntologyRelations(obj, id, yamlPath, rootDir, issues);

	return { id, title, description, relations };
}

/**
 * Parse the optional `relations:` block from an already-parsed `_ontology.yaml`
 * object. Relation ids are prefixed with `<ontologyId>/` so they are globally
 * unique. Returns an empty map when the block is absent.
 */
function parseOntologyRelations(
	obj: Record<string, unknown>,
	ontologyId: string,
	yamlPath: string,
	rootDir: string,
	issues: HealthIssue[]
): RelationRegistry {
	const registry: RelationRegistry = new Map();
	const raw = obj['relations'];
	if (raw === undefined || raw === null) return registry;

	if (typeof raw !== 'object' || Array.isArray(raw)) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(yamlPath, rootDir)}: relations must be a mapping when present`
		});
		return registry;
	}

	const block = raw as Record<string, unknown>;

	for (const [slug, entry] of Object.entries(block)) {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(yamlPath, rootDir)}: relations.${slug} must be a mapping`
			});
			continue;
		}
		const e = entry as Record<string, unknown>;
		const context = `${relTo(yamlPath, rootDir)}: relations.${slug}`;

		const outLabel = readStringFrom(e, 'outLabel', `${context}.outLabel`, issues);
		const inLabel = readStringFrom(e, 'inLabel', `${context}.inLabel`, issues);
		if (!outLabel || !inLabel) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${context} requires both outLabel and inLabel`
			});
			continue;
		}

		const schema: RelationSchema = { outLabel, inLabel };

		for (const constraintKey of ['domain', 'codomain', 'qualifierDomain'] as const) {
			const cv = e[constraintKey];
			if (cv === undefined || cv === null) continue;
			if (!Array.isArray(cv) || cv.some((v) => typeof v !== 'string')) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${context}.${constraintKey} must be an array of kind ids`
				});
				continue;
			}
			schema[constraintKey] = cv as string[];
		}

		const governedBy = readStringFrom(e, 'governedBy', `${context}.governedBy`, issues);
		if (governedBy) schema.governedBy = governedBy;

		const qualifierGovernedBy1 = readStringFrom(e, 'qualifierGovernedBy', `${context}.qualifierGovernedBy`, issues);
		if (qualifierGovernedBy1) schema.qualifierGovernedBy = qualifierGovernedBy1;

		const qualifierVal = e['qualifier'];
		if (qualifierVal !== undefined && qualifierVal !== null) {
			if (qualifierVal !== 'required') {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${context}.qualifier must be 'required' when present`
				});
			} else {
				schema.qualifier = 'required';
			}
		}

		// Unknown fields inside the relation entry.
		for (const key of Object.keys(e)) {
			if (!KNOWN_RELATION_ENTRY_FIELDS.has(key)) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${context}: unknown field '${key}'`
				});
			}
		}

		// Prefix with ontology id: "cultural/member-of".
		const fullId = `${ontologyId}/${slug}`;
		registry.set(fullId, schema);
	}

	return registry;
}

/**
 * Read and parse the `relations:` block from a standalone `_ontology.yaml`
 * path (used for the root ontology, where no ontology id prefix is applied).
 * Returns a map of bare relation ids → schemas.
 */
async function readOntologyRelations(
	yamlPath: string,
	ontologyId: string | null,
	rootDir: string,
	issues: HealthIssue[]
): Promise<RelationRegistry> {
	const raw = await readOptional(yamlPath);
	if (raw === null) return new Map();

	let parsed: unknown;
	try {
		parsed = parseYaml(raw);
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(yamlPath, rootDir)}: ${err instanceof Error ? err.message : String(err)}`
		});
		return new Map();
	}

	const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};

	// Unknown top-level fields.
	for (const key of Object.keys(obj)) {
		if (!KNOWN_ONTOLOGY_FIELDS.has(key)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(yamlPath, rootDir)}: unknown field '${key}'`
			});
		}
	}

	// For root ontology: ontologyId is null, so we use a sentinel that gets
	// stripped — pass empty string and do bare-slug insertion below.
	const registry: RelationRegistry = new Map();
	const rawRel = obj['relations'];
	if (rawRel === undefined || rawRel === null) return registry;

	if (typeof rawRel !== 'object' || Array.isArray(rawRel)) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(yamlPath, rootDir)}: relations must be a mapping when present`
		});
		return registry;
	}

	const block = rawRel as Record<string, unknown>;

	for (const [slug, entry] of Object.entries(block)) {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(yamlPath, rootDir)}: relations.${slug} must be a mapping`
			});
			continue;
		}
		const e = entry as Record<string, unknown>;
		const context = `${relTo(yamlPath, rootDir)}: relations.${slug}`;

		const outLabel = readStringFrom(e, 'outLabel', `${context}.outLabel`, issues);
		const inLabel = readStringFrom(e, 'inLabel', `${context}.inLabel`, issues);
		if (!outLabel || !inLabel) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${context} requires both outLabel and inLabel`
			});
			continue;
		}

		const schema: RelationSchema = { outLabel, inLabel };

		for (const constraintKey of ['domain', 'codomain', 'qualifierDomain'] as const) {
			const cv = e[constraintKey];
			if (cv === undefined || cv === null) continue;
			if (!Array.isArray(cv) || cv.some((v) => typeof v !== 'string')) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${context}.${constraintKey} must be an array of kind ids`
				});
				continue;
			}
			schema[constraintKey] = cv as string[];
		}

		const governedBy = readStringFrom(e, 'governedBy', `${context}.governedBy`, issues);
		if (governedBy) schema.governedBy = governedBy;

		const qualifierGovernedBy2 = readStringFrom(e, 'qualifierGovernedBy', `${context}.qualifierGovernedBy`, issues);
		if (qualifierGovernedBy2) schema.qualifierGovernedBy = qualifierGovernedBy2;

		const qualifierVal = e['qualifier'];
		if (qualifierVal !== undefined && qualifierVal !== null) {
			if (qualifierVal !== 'required') {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${context}.qualifier must be 'required' when present`
				});
			} else {
				schema.qualifier = 'required';
			}
		}

		// Unknown fields inside the relation entry.
		for (const key of Object.keys(e)) {
			if (!KNOWN_RELATION_ENTRY_FIELDS.has(key)) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${context}: unknown field '${key}'`
				});
			}
		}

		// Root ontology: bare slug. Named ontology: prefixed.
		const fullId = ontologyId !== null ? `${ontologyId}/${slug}` : slug;
		registry.set(fullId, schema);
	}

	return registry;
}

/**
 * Load a kind's `_kind.yaml` metadata. Returns an empty `KindMeta` when
 * the file is absent — the folder existing is enough to register a kind.
 */
async function loadKindMeta(
	kindDir: string,
	id: string,
	rootDir: string,
	issues: HealthIssue[]
): Promise<KindMeta> {
	const yamlPath = join(kindDir, '_kind.yaml');
	const raw = await readOptional(yamlPath);
	void id;
	return raw !== null ? parseKindMeta(raw, yamlPath, rootDir, issues) : {};
}

/**
 * Parse + validate a YAML document into a `KindMeta`.
 */
function parseKindMeta(
	raw: string,
	yamlPath: string,
	rootDir: string,
	issues: HealthIssue[]
): KindMeta {
	let parsed: unknown;
	try {
		parsed = parseYaml(raw);
	} catch (err) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(yamlPath, rootDir)}: ${err instanceof Error ? err.message : String(err)}`
		});
		return {};
	}
	const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};

	if (obj.kindParent !== undefined) {
		issues.push({
			kind: 'invalid-yaml',
			detail: `${relTo(yamlPath, rootDir)}: 'kindParent' is no longer supported — parent kind is derived from the folder hierarchy`
		});
	}

	const meta: KindMeta = {};

	for (const field of ['singular', 'plural', 'description', 'class'] as const) {
		const value = obj[field];
		if (value === undefined) continue;
		if (typeof value !== 'string') {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(yamlPath, rootDir)}: ${field} must be a string`
			});
		} else {
			meta[field] = value;
		}
	}

	// Parse optional properties block.
	const rawProps = obj['properties'];
	if (rawProps !== undefined && rawProps !== null) {
		if (typeof rawProps !== 'object' || Array.isArray(rawProps)) {
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relTo(yamlPath, rootDir)}: properties must be a mapping when present`
			});
		} else {
			const propsBlock = rawProps as Record<string, unknown>;
			const properties: KindMeta['properties'] = {};
			for (const [propId, entry] of Object.entries(propsBlock)) {
				if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
					issues.push({
						kind: 'invalid-yaml',
						detail: `${relTo(yamlPath, rootDir)}: properties.${propId} must be a mapping`
					});
					continue;
				}
				const e = entry as Record<string, unknown>;
				const label = readStringFrom(e, 'label', `${relTo(yamlPath, rootDir)}: properties.${propId}.label`, issues);
				if (!label) {
					issues.push({
						kind: 'invalid-yaml',
						detail: `${relTo(yamlPath, rootDir)}: properties.${propId} requires a label`
					});
					continue;
				}
				let values: string[] | undefined;
				const rawValues = e['values'];
				if (rawValues !== undefined && rawValues !== null) {
					if (!Array.isArray(rawValues) || rawValues.some((v) => typeof v !== 'string')) {
						issues.push({
							kind: 'invalid-yaml',
							detail: `${relTo(yamlPath, rootDir)}: properties.${propId}.values must be an array of strings`
						});
					} else {
						values = rawValues as string[];
					}
				}
				properties[propId] = values !== undefined ? { label, values } : { label };
			}
			if (Object.keys(properties).length > 0) meta.properties = properties;
		}
	}

	return meta;
}

function readStringFrom(
	obj: Record<string, unknown>,
	key: string,
	path: string,
	issues: HealthIssue[]
): string | null {
	const val = obj[key];
	if (val === undefined || val === null) return null;
	if (typeof val !== 'string') {
		issues.push({ kind: 'invalid-yaml', detail: `${path} must be a string when present` });
		return null;
	}
	const trimmed = val.trim();
	return trimmed === '' ? null : trimmed;
}

async function readOptional(path: string): Promise<string | null> {
	try {
		const st = await stat(path);
		if (!st.isFile()) return null;
		return await readFile(path, 'utf8');
	} catch {
		return null;
	}
}

async function fileExists(path: string): Promise<boolean> {
	try {
		const st = await stat(path);
		return st.isFile();
	} catch {
		return false;
	}
}

async function dirExists(path: string): Promise<boolean> {
	try {
		const st = await stat(path);
		return st.isDirectory();
	} catch {
		return false;
	}
}

function relTo(absPath: string, rootDir: string): string {
	if (absPath === rootDir) return 'content_meta/kinds';
	if (absPath.startsWith(rootDir + '/'))
		return `content_meta/kinds/${absPath.slice(rootDir.length + 1)}`;
	return absPath;
}

// Keep resolve in scope — used transitively by defaultKindsDir import path
void resolve;
