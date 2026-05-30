/* eslint-disable @typescript-eslint/no-unused-expressions */
/**
 * One-shot wikilink migration audit.
 *
 * Loads all content with the current (global) resolver, then re-resolves
 * every raw wikilink with a simulated cluster-scoped resolver to find
 * the deltas:
 *
 *   - "will break"   – currently resolves cross-cluster via global
 *                      suffix; under cluster-scoped rules it would
 *                      become broken.
 *   - "newly resolves" – currently ambiguous globally but unique
 *                        within its source cluster, so cluster-scoping
 *                        would unblock it.
 *   - "changes target" – resolves in both systems, but to a different
 *                        entity.
 *
 * Run with:  npx tsx scripts/audit-wikilinks.ts
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTENT_DIR } from '../src/lib/server/globals.js';
import { loadAll } from '../src/lib/server/loader.js';

const WIKILINK_RE =
	/\[\[([a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*)(?:#[a-z0-9][a-z0-9-]*)?(?:\|[^\]]+)?\]\]/g;

interface GlobalResolve {
	id: string | null;
	reason?: 'missing' | 'ambiguous';
	matches: string[];
}

function resolveGlobal(rawPath: string, ids: ReadonlySet<string>): GlobalResolve {
	if (ids.has(rawPath)) return { id: rawPath, matches: [] };
	const suffix = `/${rawPath}`;
	const matches: string[] = [];
	for (const id of ids) if (id.endsWith(suffix)) matches.push(id);
	if (matches.length === 1) return { id: matches[0], matches };
	return { id: null, reason: matches.length ? 'ambiguous' : 'missing', matches };
}

interface ClusterResolve {
	id: string | null;
	reason?: 'missing-in-cluster' | 'ambiguous-in-cluster' | 'missing' | 'ambiguous';
	matches: string[];
}

function resolveClusterScoped(
	rawPath: string,
	ids: ReadonlySet<string>,
	fromCluster: string | null,
	clusters: ReadonlySet<string>,
	universal: ReadonlySet<string>
): ClusterResolve {
	const firstSeg = rawPath.split('/')[0];
	const isClusterPrefixed = clusters.has(firstSeg) || universal.has(firstSeg);

	if (isClusterPrefixed || fromCluster === null) {
		const g = resolveGlobal(rawPath, ids);
		return { id: g.id, reason: g.reason, matches: g.matches };
	}

	// (a) Cluster-local exact + suffix.
	const localExact = `${fromCluster}/${rawPath}`;
	if (ids.has(localExact)) return { id: localExact, matches: [] };
	const prefix = `${fromCluster}/`;
	const suffix = `/${rawPath}`;
	const local: string[] = [];
	for (const id of ids) if (id.startsWith(prefix) && id.endsWith(suffix)) local.push(id);
	if (local.length === 1) return { id: local[0], matches: local };
	if (local.length > 1) return { id: null, reason: 'ambiguous-in-cluster', matches: local };

	// (b) Universal substrate fallback: try exact, then suffix match,
	//     across all universal top-level folders combined.
	const sub: string[] = [];
	for (const root of universal) {
		const exact = `${root}/${rawPath}`;
		if (ids.has(exact)) sub.push(exact);
		else for (const id of ids) if (id.startsWith(`${root}/`) && id.endsWith(suffix)) sub.push(id);
	}
	if (sub.length === 1) return { id: sub[0], matches: sub };
	if (sub.length > 1) return { id: null, reason: 'ambiguous-in-cluster', matches: sub };

	return { id: null, reason: 'missing-in-cluster', matches: [] };
}

async function readBody(entityId: string, mdPath: string, yamlPath: string): Promise<string> {
	// Re-read the source body so we can see the raw text exactly as
	// authored (the loaded entity.body has been frontmatter-stripped,
	// which is fine for wikilink extraction).
	try {
		return await readFile(mdPath, 'utf8');
	} catch {
		try {
			return await readFile(yamlPath, 'utf8');
		} catch {
			return '';
		}
	}
}

interface Delta {
	from: string;
	raw: string;
	wasGlobal: string | null;
	wasGlobalReason: string;
	nowCluster: string | null;
	nowClusterReason: string;
}

async function main(): Promise<void> {
	const { entities } = await loadAll(CONTENT_DIR);
	const ids: ReadonlySet<string> = new Set(entities.keys());

	// Discover clusters: first segment of every entity id, as long as
	// it isn't itself an entity. (That second clause prunes flat-layout
	// roots; in production it's a no-op since clusters never have a
	// top-level index.yaml.)
	const clusters = new Set<string>();
	for (const id of ids) {
		const first = id.split('/')[0];
		if (!first) continue;
		if (entities.has(first)) continue;
		clusters.add(first);
	}

	// Hardcoded universal substrate for the audit; the loader will
	// derive this from `_collection.{yaml,md}` `universal: true`.
	const universal = new Set<string>(['foundation']);
	for (const u of universal) clusters.delete(u);

	console.log(`Clusters:  ${[...clusters].sort().join(', ')}`);
	console.log(`Universal: ${[...universal].sort().join(', ')}`);
	console.log(`Entities:  ${ids.size}`);
	console.log('');

	const willBreak: Delta[] = [];
	const newlyResolves: Delta[] = [];
	const changesTarget: Delta[] = [];
	let totalLinks = 0;

	for (const entity of entities.values()) {
		const body = await readBody(entity.id, entity.mdPath, entity.yamlPath);
		const chapterBodies = entity.chapters.map((c) => c.body);
		const allText = [body, ...chapterBodies].join('\n');

		const seen = new Set<string>();
		const fromCluster = clusters.has(entity.id.split('/')[0]) ? entity.id.split('/')[0] : null;

		for (const m of allText.matchAll(WIKILINK_RE)) {
			const raw = m[1];
			if (raw.startsWith('kinds/')) continue;
			if (seen.has(raw)) continue;
			seen.add(raw);
			totalLinks++;

			const global = resolveGlobal(raw, ids);
			const cluster = resolveClusterScoped(raw, ids, fromCluster, clusters, universal);

			const delta: Delta = {
				from: entity.id,
				raw,
				wasGlobal: global.id,
				wasGlobalReason: global.reason ?? 'ok',
				nowCluster: cluster.id,
				nowClusterReason: cluster.reason ?? 'ok'
			};

			if (global.id && !cluster.id) {
				willBreak.push(delta);
			} else if (!global.id && cluster.id) {
				newlyResolves.push(delta);
			} else if (global.id && cluster.id && global.id !== cluster.id) {
				changesTarget.push(delta);
			}
		}
	}

	console.log(`Total unique (entity, link) pairs scanned: ${totalLinks}`);
	console.log('');

	console.log(`=== WILL BREAK (${willBreak.length}) ===`);
	console.log('Currently resolves globally; would be broken under cluster-scoping.');
	console.log('These usually mean "bare-slug link found a match in a different cluster".');
	console.log('');
	for (const d of willBreak) {
		console.log(`  ${d.from}`);
		console.log(`    [[${d.raw}]]  →  was: ${d.wasGlobal}  (${d.nowClusterReason})`);
	}
	console.log('');

	console.log(`=== NEWLY RESOLVES (${newlyResolves.length}) ===`);
	console.log('Currently broken/ambiguous globally; resolves uniquely within the source cluster.');
	console.log('');
	for (const d of newlyResolves) {
		console.log(`  ${d.from}`);
		console.log(`    [[${d.raw}]]  →  now: ${d.nowCluster}  (was: ${d.wasGlobalReason})`);
	}
	console.log('');

	console.log(`=== CHANGES TARGET (${changesTarget.length}) ===`);
	console.log('Resolves in both, but to different entities.');
	console.log('');
	for (const d of changesTarget) {
		console.log(`  ${d.from}`);
		console.log(`    [[${d.raw}]]  →  was: ${d.wasGlobal}  →  now: ${d.nowCluster}`);
	}
	console.log('');

	console.log('=== summary ===');
	console.log(`  will break:       ${willBreak.length}`);
	console.log(`  newly resolves:   ${newlyResolves.length}`);
	console.log(`  changes target:   ${changesTarget.length}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
