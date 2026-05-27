#!/usr/bin/env node
/**
 * migrate-to-frontmatter.js
 *
 * Convert sidecar (`*.yaml` + `*.md`) authoring pairs into a single
 * `*.md` file with YAML frontmatter at the top. Operates on:
 *
 *   - entities:    `<entity>/index.yaml`     + optional `<entity>/index.md`
 *   - collections: `<dir>/_collection.yaml`  + optional `<dir>/_collection.md`
 *   - kinds:       `<kind>/_kind.yaml`       + optional `<kind>/_kind.md`
 *   - blog posts:  `<post>/index.yaml`       + `<post>/index.md`
 *   - sources:     `<project>/index.yaml`    + optional `<project>/index.md`
 *
 * The script preserves the YAML *verbatim* between `---` fences, so
 * key order, comments, and quoting style are not rewritten. It then
 * appends the existing markdown body. The original `.yaml` is deleted.
 *
 * It is conservative:
 *
 *   - Dry-run by default. Pass `--write` to actually modify files.
 *   - Skips any folder whose `.md` already contains frontmatter
 *     (fence on the very first line) — those are already migrated
 *     or have a hand-authored fence we should not stomp on.
 *   - Skips any folder where only one of the pair exists, with the
 *     exception of bare `_collection.md` / `_kind.md` (kept as-is)
 *     and the body-less entity case (warned, not migrated).
 *   - Skips and reports any YAML that fails to parse as a mapping.
 *
 * Defaults: walks `content/`, `content_meta/kinds/`, `content_meta/blog/`,
 * and `content_meta/sources/` under the world root. The world root is
 * resolved as: `--root <path>` (CLI), then `$ALTERIA_WORLD_DIR`, then
 * the current working directory. The script loads `.env` at startup
 * via `dotenv` (matching `src/lib/server/globals.ts`), so the same
 * `.env` the dev server reads also drives the migration.
 *
 * Per-tree env vars (`ALTERIA_CONTENT_DIR`, `ALTERIA_KINDS_DIR`,
 * `ALTERIA_BLOG_DIR`, `ALTERIA_SOURCES_DIR`) are honoured when set:
 * each takes precedence over `<root>/<default-subpath>` for its tree.
 *
 * Usage:
 *
 *   node scripts/migrate-to-frontmatter.js                # dry run
 *   node scripts/migrate-to-frontmatter.js --write        # apply
 *   node scripts/migrate-to-frontmatter.js --root <path>  # explicit root
 *   node scripts/migrate-to-frontmatter.js --only content # one tree
 *
 * `--only` accepts: `content`, `kinds`, `blog`, `sources`. Repeat
 * the flag to migrate several specific trees.
 */

import { readdir, readFile, stat, writeFile, unlink } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import dotenv from 'dotenv';

// Load `.env` the same way `src/lib/server/globals.ts` does, so a
// user running the migration sees the same `ALTERIA_WORLD_DIR` (and
// per-tree overrides) the dev server uses. dotenv won't overwrite
// values that are already set in the process environment, so an
// explicit `ALTERIA_WORLD_DIR=… node scripts/...` still wins.
dotenv.config();

const TREES = {
	content: {
		// Subpath under the world root. Used when no explicit
		// per-tree env var override is in effect.
		dir: 'content',
		// Per-tree env var override, matching `src/lib/server/globals.ts`.
		// When set, it takes precedence over `<root>/<dir>`.
		env: 'ALTERIA_CONTENT_DIR',
		// Each entry is a (meta, body) pair to look for inside every
		// folder. The content tree carries two: entity files
		// (`index.yaml`/`index.md`) and collection files
		// (`_collection.yaml`/`_collection.md`).
		pairs: [
			{ meta: 'index.yaml', body: 'index.md' },
			{ meta: '_collection.yaml', body: '_collection.md' }
		],
		recurse: true
	},
	kinds: {
		dir: 'content_meta/kinds',
		env: 'ALTERIA_KINDS_DIR',
		pairs: [{ meta: '_kind.yaml', body: '_kind.md' }],
		recurse: true
	},
	blog: {
		dir: 'content_meta/blog',
		env: 'ALTERIA_BLOG_DIR',
		pairs: [{ meta: 'index.yaml', body: 'index.md' }],
		recurse: false
	},
	sources: {
		dir: 'content_meta/sources',
		env: 'ALTERIA_SOURCES_DIR',
		pairs: [{ meta: 'index.yaml', body: 'index.md' }],
		recurse: false
	}
};

function parseArgs(argv) {
	const args = { write: false, root: null, only: [] };
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--write') args.write = true;
		else if (a === '--root') args.root = argv[++i];
		else if (a === '--only') args.only.push(argv[++i]);
		else if (a === '-h' || a === '--help') {
			printUsage();
			process.exit(0);
		} else {
			console.error(`unknown argument: ${a}`);
			printUsage();
			process.exit(2);
		}
	}
	return args;
}

function printUsage() {
	console.error(
		[
			'usage: node scripts/migrate-to-frontmatter.js [options]',
			'',
			'  --write          actually modify files (default: dry run)',
			'  --root <path>    world root (default: $ALTERIA_WORLD_DIR or cwd)',
			'  --only <tree>    one of: content, kinds, blog, sources',
			'                   (may be passed multiple times; default: all)',
			'  -h, --help       show this help'
		].join('\n')
	);
}

async function exists(p) {
	try {
		await stat(p);
		return true;
	} catch {
		return false;
	}
}

async function isDir(p) {
	try {
		const st = await stat(p);
		return st.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Walk a directory recursively, yielding every directory path
 * (including the root). Skips dot- and underscore-prefixed
 * subdirectories (matches the loader's discovery rules; the
 * `_collection`/`_kind` *files* are read inside the parent dir,
 * not by recursing into a `_…` folder).
 */
async function* walkDirs(root, recurse) {
	if (!(await isDir(root))) return;
	yield root;
	if (!recurse) {
		// One level only: yield each immediate subdirectory once.
		const entries = await readdir(root, { withFileTypes: true });
		for (const e of entries) {
			if (!e.isDirectory()) continue;
			if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
			yield join(root, e.name);
		}
		return;
	}
	const stack = [root];
	while (stack.length > 0) {
		const cur = stack.pop();
		const entries = await readdir(cur, { withFileTypes: true });
		for (const e of entries) {
			if (!e.isDirectory()) continue;
			if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
			const sub = join(cur, e.name);
			yield sub;
			stack.push(sub);
		}
	}
}

const FRONTMATTER_FENCE = /^---[ \t]*\r?\n/;

/**
 * Build the merged `index.md` (or `_collection.md`, `_kind.md`)
 * contents from a raw YAML string and a body string. The YAML is
 * inserted verbatim between fences. A single blank line separates
 * the closing fence from the body.
 */
function buildMergedContent(yamlRaw, body) {
	// Trim a trailing newline off the YAML so the closing fence
	// always sits on its own line at the same column. Don't touch
	// internal whitespace.
	const yaml = yamlRaw.replace(/\r?\n+$/, '');
	const trimmedBody = body.replace(/^\r?\n+/, ''); // body should not start with leading blank lines after the fence
	const sep = trimmedBody.length > 0 ? '\n\n' : '\n';
	return `---\n${yaml}\n---${sep}${trimmedBody}`;
}

/**
 * Inspect a single folder and decide what to do. Returns one of:
 *
 *   { action: 'skip', reason: string }
 *   { action: 'migrate', yamlPath, mdPath, content }
 *   { action: 'error',   reason: string }
 */
async function planMigration(dir, metaName, bodyName) {
	const yamlPath = join(dir, metaName);
	const mdPath = join(dir, bodyName);
	const hasYaml = await exists(yamlPath);
	const hasMd = await exists(mdPath);

	if (!hasYaml && !hasMd) return { action: 'skip', reason: 'no marker files' };
	if (!hasYaml)
		return {
			action: 'skip',
			reason: `${bodyName} only (already frontmatter-shaped or prose-only)`
		};

	let mdRaw = '';
	if (hasMd) {
		mdRaw = await readFile(mdPath, 'utf8');
		if (FRONTMATTER_FENCE.test(mdRaw)) {
			return {
				action: 'error',
				reason: `${bodyName} already has a frontmatter fence; refusing to merge with ${metaName}`
			};
		}
	}

	const yamlRaw = await readFile(yamlPath, 'utf8');

	// Light parse to make sure we're not concatenating garbage. We
	// don't use the parsed value — the migration writes the YAML
	// verbatim — but if it doesn't parse the result wouldn't either.
	let parsed;
	try {
		parsed = parseYaml(yamlRaw);
	} catch (err) {
		return { action: 'error', reason: `${metaName} does not parse: ${err.message}` };
	}
	if (parsed !== null && parsed !== undefined && typeof parsed !== 'object') {
		return {
			action: 'error',
			reason: `${metaName} is not a mapping (got ${typeof parsed})`
		};
	}

	const content = buildMergedContent(yamlRaw, mdRaw);
	return { action: 'migrate', yamlPath, mdPath, content };
}

/**
 * Resolve the absolute directory for a given tree.
 *
 * Precedence, mirroring `src/lib/server/globals.ts`:
 *
 *   1. The tree's per-tree env var (`ALTERIA_CONTENT_DIR`,
 *      `ALTERIA_KINDS_DIR`, etc.) when set.
 *   2. `<rootDir>/<tree.dir>` otherwise.
 *
 * The world root itself is resolved separately in `main()` (CLI
 * `--root`, then `ALTERIA_WORLD_DIR`, then cwd).
 */
function treeDirFor(rootDir, cfg) {
	const override = process.env[cfg.env];
	if (override && override.length > 0) return override;
	return join(rootDir, cfg.dir);
}

async function migrateTree(rootDir, treeKey, opts) {
	const cfg = TREES[treeKey];
	const treeDir = treeDirFor(rootDir, cfg);
	if (!(await isDir(treeDir))) {
		return { tree: treeKey, dir: treeDir, scanned: 0, migrated: 0, skipped: 0, errors: 0 };
	}

	let scanned = 0;
	let migrated = 0;
	let skipped = 0;
	let errors = 0;

	for await (const dir of walkDirs(treeDir, cfg.recurse)) {
		for (const pair of cfg.pairs) {
			const yamlPath = join(dir, pair.meta);
			if (!(await exists(yamlPath))) continue;
			scanned++;

			const plan = await planMigration(dir, pair.meta, pair.body);
			const rel = relative(rootDir, dir) || relative(treeDir, dir) || '.';
			if (plan.action === 'skip') {
				skipped++;
				if (opts.verbose) console.log(`  skip   ${rel}: ${plan.reason}`);
				continue;
			}
			if (plan.action === 'error') {
				errors++;
				console.warn(`  ERROR  ${rel}: ${plan.reason}`);
				continue;
			}

			migrated++;
			const action = opts.write ? 'WRITE ' : 'plan  ';
			console.log(`  ${action} ${rel}  (${pair.meta} + ${pair.body} -> ${pair.body})`);

			if (opts.write) {
				await writeFile(plan.mdPath, plan.content, 'utf8');
				await unlink(plan.yamlPath);
			}
		}
	}

	return { tree: treeKey, dir: treeDir, scanned, migrated, skipped, errors };
}

async function main() {
	const args = parseArgs(process.argv);
	// World root: explicit --root, then $ALTERIA_WORLD_DIR (loaded
	// from .env above), then the current working directory.
	const root = args.root ?? process.env.ALTERIA_WORLD_DIR ?? resolve(process.cwd());
	const trees = args.only.length > 0 ? args.only : Object.keys(TREES);

	for (const t of trees) {
		if (!(t in TREES)) {
			console.error(`unknown tree: ${t}`);
			process.exit(2);
		}
	}

	console.log(`migrate-to-frontmatter`);
	console.log(`  root:  ${root}`);
	console.log(`  mode:  ${args.write ? 'WRITE (will modify files)' : 'dry run'}`);
	console.log(`  trees: ${trees.join(', ')}`);
	// Surface any per-tree env overrides so the user can see exactly
	// which directories will be touched. Silent when nothing is
	// overridden.
	const overrides = trees
		.map((t) => ({ tree: t, env: TREES[t].env, value: process.env[TREES[t].env] }))
		.filter((o) => o.value && o.value.length > 0);
	if (overrides.length > 0) {
		console.log(`  overrides:`);
		for (const o of overrides) console.log(`    ${o.env}=${o.value}`);
	}
	console.log('');

	const summaries = [];
	for (const t of trees) {
		const cfg = TREES[t];
		const dir = treeDirFor(root, cfg);
		console.log(`[${t}]  ${dir}`);
		const summary = await migrateTree(root, t, { write: args.write, verbose: false });
		summaries.push(summary);
		console.log('');
	}

	console.log('summary');
	for (const s of summaries) {
		console.log(
			`  ${s.tree.padEnd(8)}  scanned=${s.scanned}  migrated=${s.migrated}  skipped=${s.skipped}  errors=${s.errors}`
		);
	}

	const totalErrors = summaries.reduce((acc, s) => acc + s.errors, 0);
	if (totalErrors > 0) {
		console.log('');
		console.log(`${totalErrors} folder(s) reported errors; review and resolve manually.`);
		process.exit(1);
	}
	if (!args.write) {
		console.log('');
		console.log('dry run only — no files were modified. Re-run with --write to apply.');
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
