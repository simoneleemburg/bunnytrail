import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
	BookFormat,
	BookMeta,
	Chapter,
	Collection,
	CollectionMeta,
	Entity,
	EntityId,
	EntityMeta,
	HealthIssue,
	ResolvedBookMeta,
	Timeline,
	TimelineEntry,
	TimelineMeta
} from '$lib/types';
import type { CustomCalendarsConfig } from './world';
import { calendarDateFromRaw, parseCalendarDate, toAbsoluteDay } from '$lib/calendar';
import { splitFrontmatter } from './frontmatter';
import { extractKindLinks, extractKindRefs, extractWikilinks } from './wikilinks';

export interface WalkArgs {
	/** Absolute path to the folder being walked. */
	absDir: string;
	/** Path of this folder relative to `contentDir` (`''` for the root). */
	relPath: string;
	/** Closest enclosing *entity* id, or `null` if no enclosing entity. */
	parentEntity: EntityId | null;
	contentDir: string;
	entities: Map<EntityId, Entity>;
	issues: HealthIssue[];
	collections: Map<string, Collection>;
}

/**
 * Recursively walk a content directory, loading every entity and
 * collection it contains. Results are accumulated into the maps and
 * array passed via `WalkArgs`.
 *
 * A folder is classified by which marker files it contains:
 *
 *   - `index.yaml` (+/`-` md) → an entity. May itself contain child
 *                               entity folders.
 *   - `_collection.yaml`      → an editorial collection (browse
 *                               page metadata). Does not affect kind.
 *   - both                    → an entity that also acts as a
 *                               collection (rare).
 *   - neither                 → an implicit grouping; descended into.
 *
 * Each entity's `type` is the relative path of its containing folder
 * (one segment shorter than its `id`). Each entity's `id` is its
 * full path under `contentDir`. The `type` field no longer carries
 * kind semantics — it is just a folder-grouping convenience for
 * consumers and the language-detection heuristic.
 */
export async function walk(args: WalkArgs): Promise<void> {
	const { absDir, relPath, entities, issues, collections } = args;

	const indexYamlPath = join(absDir, 'index.yaml');
	const indexMdPath = join(absDir, 'index.md');
	const collectionYamlPath = join(absDir, '_collection.yaml');
	const collectionMdPath = join(absDir, '_collection.md');

	const hasIndexYaml = await exists(indexYamlPath);
	const hasIndexMd = await exists(indexMdPath);
	const hasCollectionYaml = await exists(collectionYamlPath);
	const hasCollectionMd = await exists(collectionMdPath);

	// Load _collection.yaml if present, or frontmatter from
	// _collection.md, to register an editorial collection.
	// Collections are pure browsing metadata. Skipped at the content
	// root (relPath === '').
	//
	// Two layouts are supported, mirroring entities:
	//
	//   1. Sidecar: `_collection.yaml` (+ optional `_collection.md`).
	//   2. Frontmatter: `_collection.md` with a `---`-delimited
	//      YAML block at the top.
	//
	// If both `_collection.yaml` and `_collection.md` frontmatter
	// are present, that's an authoring mistake: emit a health issue
	// and fall back to treating the folder as a collection with no
	// editorial metadata.
	if (relPath && (hasCollectionYaml || hasCollectionMd)) {
		const collectionMdRaw = hasCollectionMd ? await readFile(collectionMdPath, 'utf8') : null;
		const collectionMdSplit = collectionMdRaw !== null ? splitFrontmatter(collectionMdRaw) : null;
		const collectionHasFrontmatter =
			collectionMdSplit?.frontmatter !== null && collectionMdSplit?.frontmatter !== undefined;

		let meta: CollectionMeta = {};
		let body: string | null = null;
		let conflict = false;

		if (hasCollectionYaml && collectionHasFrontmatter) {
			conflict = true;
			issues.push({
				kind: 'invalid-yaml',
				detail: `${relPath}: both _collection.yaml and _collection.md frontmatter declare metadata; pick one`
			});
		} else if (hasCollectionYaml) {
			try {
				const raw = await readFile(collectionYamlPath, 'utf8');
				const parsed = parseYaml(raw);
				meta = (parsed && typeof parsed === 'object' ? parsed : {}) as CollectionMeta;
			} catch (err) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${collectionYamlPath}: ${err instanceof Error ? err.message : String(err)}`
				});
			}
			if (hasCollectionMd && collectionMdRaw !== null) {
				body = collectionMdRaw;
			}
		} else if (collectionHasFrontmatter && collectionMdSplit) {
			try {
				const parsed = parseYaml(collectionMdSplit.frontmatter ?? '');
				meta = (parsed && typeof parsed === 'object' ? parsed : {}) as CollectionMeta;
			} catch (err) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${collectionMdPath}: ${err instanceof Error ? err.message : String(err)}`
				});
			}
			body = collectionMdSplit.body;
		} else if (hasCollectionMd && collectionMdRaw !== null) {
			// Bare `_collection.md` with no frontmatter: collection with
			// default labels, raw markdown body.
			body = collectionMdRaw;
		}

		if (!conflict) {
			collections.set(relPath, { path: relPath, meta, body });
		}
	}

	// Load index.yaml if present, or frontmatter from index.md, to
	// classify the current folder as an entity.
	//
	// Two layouts are supported:
	//
	//   1. Sidecar (legacy): `index.yaml` carries the metadata,
	//      `index.md` carries the prose.
	//   2. Frontmatter:      `index.md` carries both — a standard
	//      `---`-delimited YAML block at the top, followed by the
	//      prose body.
	//
	// If both an `index.yaml` AND an `index.md` with a frontmatter
	// fence are present in the same folder, that's an authoring
	// mistake: emit an `invalid-yaml` issue and skip the entity so
	// the conflict surfaces loudly rather than one source silently
	// shadowing the other.
	let nextParentEntity = args.parentEntity;
	const mdRaw = hasIndexMd ? await readFile(indexMdPath, 'utf8') : null;
	const mdSplit = mdRaw !== null ? splitFrontmatter(mdRaw) : null;
	const hasMdFrontmatter = mdSplit?.frontmatter !== null && mdSplit?.frontmatter !== undefined;
	const isEntity = relPath !== '' && (hasIndexYaml || hasMdFrontmatter);

	if (isEntity) {
		const id: EntityId = relPath;
		const slug = leafOf(relPath);
		// `type` is the parent-folder path: one segment shorter than
		// `id`. For an entity directly under the content root, `type`
		// is the empty string.
		const entityType = parentOf(relPath);

		let meta: EntityMeta | null = null;
		// `metaPath` is what we report in diagnostics: the file the
		// metadata was actually parsed from. May be the `.md` file
		// when frontmatter is in use.
		let metaPath = indexYamlPath;
		let conflict = false;

		if (hasIndexYaml && hasMdFrontmatter) {
			conflict = true;
			issues.push({
				kind: 'invalid-yaml',
				entity: id,
				detail: `both index.yaml and index.md frontmatter declare metadata; pick one`
			});
		} else if (hasIndexYaml) {
			try {
				const raw = await readFile(indexYamlPath, 'utf8');
				meta = (parseYaml(raw) ?? {}) as EntityMeta;
				if (!meta.name) meta.name = slug;
			} catch (err) {
				issues.push({
					kind: 'invalid-yaml',
					entity: id,
					detail: err instanceof Error ? err.message : String(err)
				});
			}
		} else if (hasMdFrontmatter && mdSplit) {
			metaPath = indexMdPath;
			try {
				const parsed = parseYaml(mdSplit.frontmatter ?? '');
				meta = ((parsed && typeof parsed === 'object' ? parsed : {}) as EntityMeta) ?? null;
				if (meta && !meta.name) meta.name = slug;
			} catch (err) {
				issues.push({
					kind: 'invalid-yaml',
					entity: id,
					detail: `${indexMdPath}: ${err instanceof Error ? err.message : String(err)}`
				});
			}
		}

		// Determine the body. Frontmatter wins (its body is the
		// post-fence remainder). The sidecar layout uses the whole
		// file. When neither side carries an md, we still emit the
		// missing-md health issue exactly as before.
		let body = '';
		if (hasIndexMd) {
			body = hasMdFrontmatter && mdSplit ? mdSplit.body : (mdRaw ?? '');
		} else if (hasIndexYaml) {
			issues.push({ kind: 'missing-md', entity: id, detail: indexMdPath });
		}

		// Load `chapters/*.md` if present. Chapters are sub-pages of
		// the entity, not entities themselves. Their wikilinks merge
		// into the parent entity's `wikilinks` so backlinks attribute
		// to the work as a whole.
		const chapters = await loadChapters(join(absDir, 'chapters'), id, issues);
		const wikilinksFromBody = extractWikilinks(body);
		const wikilinksFromChapters = chapters.flatMap((c) => extractWikilinks(c.body));
		const mergedWikilinks = [...new Set([...wikilinksFromBody, ...wikilinksFromChapters])];
		const kindLinksFromBody = extractKindLinks(body);
		const kindLinksFromChapters = chapters.flatMap((c) => extractKindLinks(c.body));
		const mergedKindLinks = [...new Set([...kindLinksFromBody, ...kindLinksFromChapters])];

		// Optional sibling `craft.md` — author's-room companion. Read
		// raw and stash on the entity; deliberately *don't* merge any
		// wikilinks or kind-links it contains into the entity's graph
		// edges. Craft notes are about how the entity is written, not
		// what's true in-world; conflating them would corrupt
		// backlinks.
		const craftMdPath = join(absDir, 'craft.md');
		const craft = (await exists(craftMdPath)) ? await readFile(craftMdPath, 'utf8') : null;

		if (meta && !conflict) {
			// Normalise `era`: YAML string → [string], array → validated string[].
			// Non-string / non-array values are dropped with a warning.
			if (meta.era !== undefined) {
				const rawEra = meta.era as unknown;
				if (typeof rawEra === 'string') {
					(meta as Record<string, unknown>)['era'] = [rawEra];
				} else if (Array.isArray(rawEra)) {
					const valid = rawEra.filter((v): v is string => typeof v === 'string');
					if (valid.length !== rawEra.length) {
						issues.push({ kind: 'invalid-yaml', entity: id, detail: `era array contains non-string values — only strings are accepted` });
					}
					(meta as Record<string, unknown>)['era'] = valid.length > 0 ? valid : undefined;
				} else {
					issues.push({ kind: 'invalid-yaml', entity: id, detail: `era must be a string or array of strings` });
					(meta as Record<string, unknown>)['era'] = undefined;
				}
			}

			entities.set(id, {
				id,
				type: entityType,
				slug,
				meta,
				body,
				wikilinks: mergedWikilinks,
				kindLinks: mergedKindLinks,
				kindRefs: extractKindRefs(meta),
				yamlPath: metaPath,
				mdPath: indexMdPath,
				parent: args.parentEntity,
				children: [],
				chapters,
				book: chapters.length > 0 ? resolveBookMeta(meta.book) : null,
				craft
			});

			nextParentEntity = id;
		}
	}

	// Recurse into subdirectories.
	const dirents = await readDirents(absDir);
	for (const entry of dirents) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
		await walk({
			absDir: join(absDir, entry.name),
			relPath: childRel,
			parentEntity: nextParentEntity,
			contentDir: args.contentDir,
			entities,
			issues,
			collections
		});
	}
}

/**
 * Load chapter files from `<entity>/chapters/`. Each `*.md` file
 * with a `NN-<slug>.md` filename becomes a chapter; the numeric
 * prefix sets ordering. Files without a numeric prefix are skipped
 * with a `broken-link` issue (treated as malformed).
 *
 * Chapters are not entities — they have no kind, no relations, no
 * graph membership.
 */
async function loadChapters(
	chaptersDir: string,
	entityId: EntityId,
	issues: HealthIssue[]
): Promise<Chapter[]> {
	const dirents = await readDirents(chaptersDir);
	const out: Chapter[] = [];
	for (const entry of dirents) {
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith('.md')) continue;
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		const m = entry.name.match(/^(\d+)-([a-z0-9][a-z0-9-]*)\.md$/);
		if (!m) {
			issues.push({
				kind: 'invalid-yaml',
				entity: entityId,
				detail: `chapter filename must match \`NN-slug.md\`: ${join(chaptersDir, entry.name)}`
			});
			continue;
		}
		const order = parseInt(m[1], 10);
		const slug = m[2];
		const mdPath = join(chaptersDir, entry.name);
		let body = '';
		try {
			body = await readFile(mdPath, 'utf8');
		} catch (err) {
			issues.push({
				kind: 'invalid-yaml',
				entity: entityId,
				detail: `${mdPath}: ${err instanceof Error ? err.message : String(err)}`
			});
			continue;
		}
		const title = extractChapterTitle(body) ?? humaniseSlug(slug);
		// Strip the leading `# Heading` from the body so the chapter
		// page's own header (Chapter <numeral> / <title>) doesn't get
		// shadowed by a duplicate heading at the top of the prose.
		const prosed = stripLeadingHeading(body);
		out.push({ slug, order, title, body: prosed, mdPath });
	}
	out.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
	return out;
}

/**
 * Pull the first markdown `# Heading` from a chapter body to use as
 * its title. Returns `null` if no top-level heading is found.
 */
export function extractChapterTitle(body: string): string | null {
	const m = body.match(/^\s*#\s+(.+?)\s*$/m);
	return m ? m[1].trim() : null;
}

/**
 * Strip a leading `# Heading` (and any blank lines after it) from a
 * chapter body, leaving the prose proper. The chapter page's own
 * header already renders the chapter title; keeping the heading in
 * the body would render it twice. Only the *first* heading at the
 * top of the file is removed; `##` and lower headings inside the
 * body are preserved.
 */
export function stripLeadingHeading(body: string): string {
	return body.replace(/^\s*#\s+.+?\n+/, '');
}

function humaniseSlug(slug: string): string {
	return slug
		.split('-')
		.map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

/**
 * Default unit-naming per book format. The chapter page reads
 * these via `Entity.book` and renders the unit word in the eyebrow
 * and prev/next labels.
 */
const BOOK_FORMAT_DEFAULTS: Record<BookFormat, { singular: string; plural: string }> = {
	book: { singular: 'Chapter', plural: 'Chapters' },
	scrolls: { singular: 'Fragment', plural: 'Fragments' }
};

/**
 * Resolve author-facing `book:` YAML into a fully populated
 * `ResolvedBookMeta`. Unknown formats fall back to `book`; manual
 * `unitSingular` / `unitPlural` overrides win over the format
 * defaults.
 */
export function resolveBookMeta(raw: unknown): ResolvedBookMeta {
	const meta = (raw && typeof raw === 'object' ? raw : {}) as BookMeta;
	const formatRaw = typeof meta.format === 'string' ? meta.format : 'book';
	const format: BookFormat = formatRaw in BOOK_FORMAT_DEFAULTS ? (formatRaw as BookFormat) : 'book';
	const defaults = BOOK_FORMAT_DEFAULTS[format];
	return {
		format,
		unitSingular:
			typeof meta.unitSingular === 'string' && meta.unitSingular.trim()
				? meta.unitSingular.trim()
				: defaults.singular,
		unitPlural:
			typeof meta.unitPlural === 'string' && meta.unitPlural.trim()
				? meta.unitPlural.trim()
				: defaults.plural
	};
}

/**
 * Walk `contentDir` recursively, discovering every `_time.md` file.
 *
 * Two structural roles:
 *
 *   1. **Line** (`type: line` | `type: period` in frontmatter, or heuristic:
 *      the folder contains sub-folders that are themselves year-named and
 *      carry a `_time.md`). Produces a `Timeline` with its entries.
 *
 *   2. **Dot** (`year:` present, or sub-folder is a bare integer name).
 *      Not emitted independently — they are collected as `Timeline.entries`.
 *
 * A `_time.md` with `type: dot` (or just a `year:` field) at a top-level
 * content folder is silently ignored (orphan dot without a parent line).
 *
 * Results are accumulated into the `timelines` map, keyed by the line's
 * folder path relative to `contentDir`.
 */
export async function walkTimelines(
	contentDir: string,
	issues: HealthIssue[],
	customCalendars: CustomCalendarsConfig | null = null
): Promise<Map<string, Timeline>> {
	const timelines = new Map<string, Timeline>();
	await walkTimelinesDir(contentDir, '', contentDir, timelines, issues, customCalendars);
	return timelines;
}

async function walkTimelinesDir(
	absDir: string,
	relPath: string,
	contentDir: string,
	timelines: Map<string, Timeline>,
	issues: HealthIssue[],
	customCalendars: CustomCalendarsConfig | null
): Promise<void> {
	const timeMdPath = join(absDir, '_time.md');
	const hasTimeMd = await exists(timeMdPath);

	if (relPath && hasTimeMd) {
		const raw = await readFile(timeMdPath, 'utf8');
		const split = splitFrontmatter(raw);
		let meta: TimelineMeta = {};
		if (split.frontmatter !== null) {
			try {
				const parsed = parseYaml(split.frontmatter);
				meta = (parsed && typeof parsed === 'object' ? parsed : {}) as TimelineMeta;
			} catch (err) {
				issues.push({
					kind: 'invalid-yaml',
					detail: `${timeMdPath}: ${err instanceof Error ? err.message : String(err)}`
				});
			}
		}
		const body = split.body;

		// Decide role: `line`/`period` type, or dot (has `year:`) — or
		// infer from the folder name (pure integer → dot).
		const folderName = relPath.includes('/') ? relPath.slice(relPath.lastIndexOf('/') + 1) : relPath;
		const isYearFolder = /^-?\d+$/.test(folderName);
		const isLine =
			meta.type === 'line' ||
			meta.type === 'period' ||
			(!isYearFolder && meta.type !== 'dot' && meta.year === undefined);
		const isDot =
			meta.type === 'dot' || meta.year !== undefined || (isYearFolder && meta.type !== 'line');

		if (isLine) {
			// Load the dot entries from immediate sub-folders that carry a _time.md.
			// Folders may be year-named integers (e.g. "1954") for plain year entries,
			// or any name (e.g. "epoch-entry") when the dot carries an explicit `date:`
			// or `year:` field. Non-numeric named folders without a date/year are
			// silently skipped (NaN sort key would break ordering).
			const entries: TimelineEntry[] = [];
			const dirents = await readDirents(absDir);
			for (const entry of dirents) {
				if (!entry.isDirectory()) continue;
				const childName = entry.name;
				// Skip hidden/underscore dirs (consistent with entity walk).
				if (childName.startsWith('.') || childName.startsWith('_')) continue;
				const childAbsDir = join(absDir, childName);
				const childTimeMdPath = join(childAbsDir, '_time.md');
				if (!(await exists(childTimeMdPath))) continue;
				const childRaw = await readFile(childTimeMdPath, 'utf8');
				const childSplit = splitFrontmatter(childRaw);
				let childMeta: TimelineMeta = {};
				if (childSplit.frontmatter !== null) {
					try {
						const parsed = parseYaml(childSplit.frontmatter);
						childMeta = (parsed && typeof parsed === 'object' ? parsed : {}) as TimelineMeta;
					} catch (err) {
						issues.push({
							kind: 'invalid-yaml',
							detail: `${childTimeMdPath}: ${err instanceof Error ? err.message : String(err)}`
						});
						continue;
					}
				}
				// A child whose own `_time.md` declares `type: line`/`type: period`
				// is a nested sub-timeline, not a dot entry of this one. It's
				// picked up independently by the recursive walk below (and
				// surfaced to the UI as a `childTimeline`), so skip it here to
				// avoid double-counting it as both an entry and a child timeline.
				if (childMeta.type === 'line' || childMeta.type === 'period') continue;

				// Determine the year: explicit field first, folder name fallback.
				// The folder-name fallback only applies when the name is a bare
				// integer (e.g. "1954") — never parsed from a mixed name like
				// "1st-eve" (that would silently derive a bogus year from an
				// ordinal prefix). Non-numeric folders need an explicit `year:`
				// or `date:` field.
				let year: number;
				let calendarDate: import('$lib/calendar').CalendarDate | undefined;
				const childIsYearFolder = /^-?\d+$/.test(childName);
				const folderYear = childIsYearFolder ? parseInt(childName, 10) : NaN;

				// Resolve which calendar to use: dot meta > parent line meta > none
				const effectiveCalendarId =
					(typeof childMeta.calendar === 'string' ? childMeta.calendar : null) ??
					(typeof meta.calendar === 'string' ? meta.calendar : null) ??
					customCalendars?.default ??
					null;

				const rawDate = childMeta.date;
				if (rawDate !== undefined && rawDate !== null) {
					// Try to parse as a calendar date
					const parsed = calendarDateFromRaw(rawDate, effectiveCalendarId);
					if (parsed && customCalendars?.calendars[parsed.calendar]) {
						const spec = customCalendars.calendars[parsed.calendar];
						const result = parseCalendarDate(parsed, spec);
						if (result.ok) {
							calendarDate = result.date;
							year = toAbsoluteDay(result.date, spec);
						} else {
							for (const err of result.errors) {
								issues.push({ kind: 'invalid-yaml', detail: `${childTimeMdPath}: ${err}` });
							}
							year = typeof childMeta.year === 'number' ? childMeta.year : folderYear;
						}
					} else if (parsed && !customCalendars?.calendars[parsed.calendar]) {
						issues.push({
							kind: 'invalid-yaml',
							detail: `${childTimeMdPath}: unknown calendar '${parsed.calendar}'`
						});
						year = typeof childMeta.year === 'number' ? childMeta.year : folderYear;
					} else {
						// Not a calendar date (e.g. ISO string) — fall through to plain year
						year = typeof childMeta.year === 'number' ? childMeta.year : folderYear;
					}
				} else {
					year = typeof childMeta.year === 'number' ? childMeta.year : folderYear;
				}

				// If neither a calendar date nor an explicit year resolved, and the
				// folder name is non-numeric, skip — NaN sort key breaks ordering.
				if (!calendarDate && isNaN(year)) continue;

				const childRelPath = relPath ? `${relPath}/${childName}` : childName;
				entries.push({
					path: childRelPath,
					year,
					...(calendarDate ? { calendarDate } : {}),
					summary: typeof childMeta.summary === 'string' ? childMeta.summary : undefined,
					body: childSplit.body,
					mdPath: childTimeMdPath
				});
			}
			entries.sort((a, b) => a.year - b.year);
			const rawTarget = (meta as { target?: unknown }).target;
			const targets: string[] = Array.isArray(rawTarget)
				? rawTarget.filter((t): t is string => typeof t === 'string')
				: typeof rawTarget === 'string' && rawTarget.trim()
					? [rawTarget.trim()]
					: [];
			timelines.set(relPath, { path: relPath, meta, body, mdPath: timeMdPath, entries, targets });
		} else if (isDot) {
			// A lone dot at the top level: it will be collected by its parent's
			// line walk above. Nothing to emit here independently.
		}
	}

	// Always recurse into sub-directories (a line `_time.md` may be
	// arbitrarily deep; we don't want to stop early).
	const dirents = await readDirents(absDir);
	for (const entry of dirents) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
		const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
		await walkTimelinesDir(join(absDir, entry.name), childRel, contentDir, timelines, issues, customCalendars);
	}
}

export async function readDirents(dirPath: string): Promise<Dirent[]> {
	try {
		return (await readdir(dirPath, { withFileTypes: true })) as Dirent[];
	} catch {
		return [];
	}
}

export async function exists(filePath: string): Promise<boolean> {
	try {
		await stat(filePath);
		return true;
	} catch {
		return false;
	}
}

function leafOf(p: string): string {
	const idx = p.lastIndexOf('/');
	return idx < 0 ? p : p.slice(idx + 1);
}

function parentOf(p: string): string {
	const idx = p.lastIndexOf('/');
	return idx < 0 ? '' : p.slice(0, idx);
}
