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
 * `$ALTERIA_WORLD_DIR` if set, else the project root.
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
import { join, resolve, relative, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';

const TREES = {
	content: { dir: 'content', meta: 'index.yaml', body: 'index.md', recurse: true },
	kinds: {
		dir: 'content_meta/kinds',
		meta: '_kind.yaml',
		body: '_kind.md',
		recurse: true
	},
	blog: {
		dir: 'content_meta/blog',
		meta: 'index.yaml',
		body: 'index.md',
		recurse: false
	},
	sources: {
		dir: 'content_meta/sources',
		meta: 'index.yaml',
		body: 'index.md',
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
	if (!hasYaml) return { action: 'skip', reason: `${bodyName} only (already frontmatter-shaped or prose-only)` };

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

async function migrateTree(rootDir, treeKey, opts) {
	const cfg = TREES[treeKey];
	const treeDir = join(rootDir, cfg.dir);
	if (!(await isDir(treeDir))) {
		return { tree: treeKey, scanned: 0, migrated: 0, skipped: 0, errors: 0 };
	}

	let scanned = 0;
	let migrated = 0;
	let skipped = 0;
	let errors = 0;

	for await (const dir of walkDirs(treeDir, cfg.recurse)) {
		const yamlPath = join(dir, cfg.meta);
		if (!(await exists(yamlPath))) continue;
		scanned++;

		const plan = await planMigration(dir, cfg.meta, cfg.body);
		const rel = relative(rootDir, dir) || '.';
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

		// migrate
		migrated++;
		const action = opts.write ? 'WRITE ' : 'plan  ';
		console.log(`  ${action} ${rel}  (${cfg.meta} + ${cfg.body} -> ${cfg.body})`);

		if (opts.write) {
			await writeFile(plan.mdPath, plan.content, 'utf8');
			await unlink(plan.yamlPath);
		}
	}

	return { tree: treeKey, scanned, migrated, skipped, errors };
}

async function main() {
	const args = parseArgs(process.argv);
	const root =
		args.root ?? process.env.ALTERIA_WORLD_DIR ?? resolve(process.cwd());
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
	console.log('');

	const summaries = [];
	for (const t of trees) {
		console.log(`[${t}]`);
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
