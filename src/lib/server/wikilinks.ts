import type { EntityId } from '$lib/types';

/**
 * Match `[[type/slug]]` or `[[type/<sub>/.../slug]]` (optionally
 * labelled) in markdown bodies. The path is one or more segments
 * (kebab-case or any mix of alphanumerics and hyphens) joined by `/`.
 *
 * Also catches bare slugs, optional `#anchor` fragments, and
 * optional `|label` suffixes. The anchor and label are dropped here;
 * only the path part flows into wikilink resolution. Bare lang-code
 * matches (e.g. `[[ot]]`) are also caught — consumers filter those
 * out by checking against the language-code set before resolving.
 *
 * Paths are normalised to lowercase before being returned so that
 * authors who accidentally capitalise a slug (e.g. `[[Naya]]`) get
 * a broken-link issue rather than a silently ignored wikilink.
 */
export const WIKILINK_RE =
	/\[\[([A-Za-z][A-Za-z0-9-]*(?:\/[A-Za-z0-9-]+)*)(?:#[a-z0-9][a-z0-9-]*)?(?:\|[^\]]+)?\]\]/g;

/**
 * Extract entity wikilink ids from a markdown body. Accepts paths
 * of any depth (e.g. `[[culture/languages/tholingian]]`). Returns
 * the *raw* paths as written; resolution to canonical ids is
 * performed separately (see `resolveWikilink`).
 *
 * `[[kinds/<id>]]` paths are deliberately excluded: those don't
 * resolve to entities and have their own extractor
 * (`extractKindLinks`) and index. Without this filter they would
 * fall through to wikilink resolution and raise spurious
 * broken-link warnings.
 */
export function extractWikilinks(body: string): EntityId[] {
	const out = new Set<EntityId>();
	for (const m of body.matchAll(WIKILINK_RE)) {
		const p = m[1].toLowerCase();
		if (p.startsWith('kinds/')) continue;
		out.add(p);
	}
	return [...out];
}

/**
 * Extract kind ids referenced from a markdown body via
 * `[[kinds/<id>]]` wikilinks. Returns the raw kind ids (the part
 * after `kinds/`); validation against the registry is performed
 * separately so the body itself doesn't need to know which kinds
 * are registered.
 */
/**
 * Extract wikilink paths that have **no** pipe label, e.g. `[[naya]]`
 * or `[[aurethia/nature/species/naya]]` but NOT `[[naya|Naya]]`.
 * Used to surface unlabelled entity references as health issues.
 * Lang-code filtering is left to the caller.
 */
export function extractUnlabelledWikilinks(body: string): string[] {
	// Matches [[path]] and [[path#anchor]] but NOT [[path|label]]
	const re =
		/\[\[([A-Za-z][A-Za-z0-9-]*(?:\/[A-Za-z0-9-]+)*)(?:#[a-z0-9][a-z0-9-]*)?\]\]/g;
	const out = new Set<string>();
	for (const m of body.matchAll(re)) {
		const p = m[1].toLowerCase();
		if (p.startsWith('kinds/')) continue;
		out.add(p);
	}
	return [...out];
}

export function extractKindLinks(body: string): string[] {
	const out = new Set<string>();
	for (const m of body.matchAll(WIKILINK_RE)) {
		const p = m[1].toLowerCase();
		if (!p.startsWith('kinds/')) continue;
		const id = p.slice('kinds/'.length);
		if (id) out.add(id);
	}
	return [...out];
}

/**
 * Inspect a parsed YAML `meta` object and pick out fields whose
 * value is a non-empty list of strings, every entry beginning with
 * `kinds/`. Each such field is treated as a *kind-link list*: the
 * trailing ids are extracted and returned, grouped by field name.
 *
 * The shape rule is deliberately strict — a mixed list like
 * `[kinds/human, asthera]` does *not* qualify, so authors get a
 * clean separation between kind-references and other tokens. New
 * field names cost zero code: any `<fieldName>: [kinds/<id>, …]`
 * automatically participates.
 *
 * Returns `{}` if no field qualifies. Does not touch `meta`.
 */
export function extractKindRefs(meta: unknown): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	if (!meta || typeof meta !== 'object') return out;
	for (const [field, value] of Object.entries(meta as Record<string, unknown>)) {
		if (!Array.isArray(value) || value.length === 0) continue;
		const ids: string[] = [];
		let qualifies = true;
		for (const v of value) {
			if (typeof v !== 'string' || !v.startsWith('kinds/')) {
				qualifies = false;
				break;
			}
			const id = v.slice('kinds/'.length);
			if (!id) {
				qualifies = false;
				break;
			}
			ids.push(id);
		}
		if (qualifies) out[field] = ids;
	}
	return out;
}

/**
 * Resolve a wikilink path to a canonical entity id.
 *
 * The algorithm is cluster-scoped when `fromCluster` is set and the
 * raw path does not itself begin with a known cluster or universal
 * substrate name; otherwise it falls back to global resolution.
 *
 * Order:
 *
 *   1. **Cluster-prefixed or no-cluster context** — if `rawPath`
 *      starts with a known cluster id or a universal-substrate id,
 *      or if `fromCluster` is `null`, resolve globally:
 *        a. Exact match.
 *        b. Suffix match across all entities. Exactly one → use it.
 *        c. Else → `missing` / `ambiguous`.
 *
 *   2. **Cluster-local** — otherwise the path is treated as relative
 *      to `fromCluster`:
 *        a. Exact match against `<fromCluster>/<rawPath>`.
 *        b. Suffix match restricted to ids in `<fromCluster>/`.
 *           Exactly one in-cluster → use it.
 *        c. Universal-substrate fallback: try exact and suffix match
 *           across every universal root combined. Exactly one match
 *           → use it.
 *        d. Else → `missing-in-cluster` / `ambiguous-in-cluster`.
 *
 * Bare-slug `[[foo]]` is supported via the suffix match. Authors who
 * need cross-cluster references must write the full path beginning
 * with a cluster id (e.g. `[[earth/places/sharazan]]`) — that hits
 * branch 1.
 */
export type WikilinkResolveResult =
	| { id: EntityId }
	| {
			id: null;
			reason: 'missing' | 'ambiguous' | 'missing-in-cluster' | 'ambiguous-in-cluster';
			matches: EntityId[];
	  };

export function resolveWikilink(
	rawPath: string,
	entities: ReadonlyMap<EntityId, unknown>,
	fromCluster: string | null = null,
	clusters: ReadonlySet<string> = new Set(),
	universal: ReadonlySet<string> = new Set()
): WikilinkResolveResult {
	const firstSeg = rawPath.split('/')[0];
	const isPrefixed = clusters.has(firstSeg) || universal.has(firstSeg);

	if (isPrefixed || fromCluster === null) {
		return resolveGlobal(rawPath, entities);
	}

	// (a) Cluster-local exact.
	const localExact = `${fromCluster}/${rawPath}`;
	if (entities.has(localExact)) return { id: localExact };

	// (b) Cluster-local suffix.
	const prefix = `${fromCluster}/`;
	const suffix = `/${rawPath}`;
	const localMatches: EntityId[] = [];
	for (const id of entities.keys()) {
		if (id.startsWith(prefix) && id.endsWith(suffix)) localMatches.push(id);
	}
	if (localMatches.length === 1) return { id: localMatches[0] };
	if (localMatches.length > 1) {
		return { id: null, reason: 'ambiguous-in-cluster', matches: localMatches };
	}

	// (c) Universal-substrate fallback across all universal roots.
	const universalMatches: EntityId[] = [];
	for (const root of universal) {
		const exact = `${root}/${rawPath}`;
		if (entities.has(exact)) universalMatches.push(exact);
	}
	if (universalMatches.length === 0) {
		for (const root of universal) {
			const rootPrefix = `${root}/`;
			for (const id of entities.keys()) {
				if (id.startsWith(rootPrefix) && id.endsWith(suffix)) universalMatches.push(id);
			}
		}
	}
	if (universalMatches.length === 1) return { id: universalMatches[0] };
	if (universalMatches.length > 1) {
		return { id: null, reason: 'ambiguous-in-cluster', matches: universalMatches };
	}

	return { id: null, reason: 'missing-in-cluster', matches: [] };
}

function resolveGlobal(
	rawPath: string,
	entities: ReadonlyMap<EntityId, unknown>
): WikilinkResolveResult {
	if (entities.has(rawPath)) return { id: rawPath };
	const suffix = `/${rawPath}`;
	const matches: EntityId[] = [];
	for (const id of entities.keys()) {
		if (id.endsWith(suffix)) matches.push(id);
	}
	if (matches.length === 1) return { id: matches[0] };
	if (matches.length === 0) return { id: null, reason: 'missing', matches };
	return { id: null, reason: 'ambiguous', matches };
}
