import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ASSETS_DIR } from './globals';

/**
 * Bundled fallback: src/lib/assets/ inside the SvelteKit project.
 * Always available; used when ASSETS_DIR doesn't have the file.
 */
const BUNDLED_ASSETS_DIR = resolve(process.cwd(), 'src/lib/assets');

/**
 * Read a named asset file from the given directory.
 *
 * @param name       Filename, e.g. "mundus-map.svg". No path separators allowed.
 * @param assetsDir  Directory to read from.
 * @returns          File contents as a UTF-8 string, or null if not found.
 * @throws           On a name that looks like a path traversal attempt.
 */
export async function readAsset(name: string, assetsDir: string): Promise<string | null> {
	if (name.includes('/') || name.includes('\\') || name.includes('..')) {
		throw new Error(`readAsset: invalid asset name "${name}"`);
	}
	const path = resolve(assetsDir, name);
	try {
		const st = await stat(path);
		if (!st.isFile()) return null;
		return await readFile(path, 'utf-8');
	} catch {
		return null;
	}
}

/**
 * In-memory asset cache singleton.
 *
 * Reads from ASSETS_DIR first (the external world dir's assets/ when
 * BUNNYTRAIL_WORLD_DIR is configured), with a transparent fallback to the
 * bundled src/lib/assets/ if the file isn't found there. This means the
 * bundled file is always available during development even before the
 * external assets directory has been populated.
 *
 * The dev watcher calls `assets.invalidate(name)` when a file in ASSETS_DIR
 * changes, so the next request re-reads from disk.
 *
 * In production the cache is never invalidated; assets are read once and held
 * for the lifetime of the process.
 */
class AssetCache {
	#cache = new Map<string, string>();

	/**
	 * Return the cached content for `name`, reading from disk on the first
	 * access or after invalidation. Falls back to the bundled copy if the
	 * primary ASSETS_DIR doesn't have the file.
	 */
	async get(name: string): Promise<string | null> {
		if (this.#cache.has(name)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			return this.#cache.get(name)!;
		}

		// Try primary location first.
		let content = await readAsset(name, ASSETS_DIR);

		// Fall back to bundled copy if the primary location didn't have it
		// (e.g. BUNNYTRAIL_WORLD_DIR is set but assets/ hasn't been populated yet).
		if (content === null && ASSETS_DIR !== BUNDLED_ASSETS_DIR) {
			content = await readAsset(name, BUNDLED_ASSETS_DIR);
		}

		if (content !== null) this.#cache.set(name, content);
		return content;
	}

	/** Evict one entry so the next `get` re-reads from disk. */
	invalidate(name: string): void {
		this.#cache.delete(name);
	}

	/** Evict all entries. */
	invalidateAll(): void {
		this.#cache.clear();
	}

	/**
	 * Enumerate the union of asset filenames available across the
	 * configured ASSETS_DIR and the bundled fallback. Used by the
	 * /api/assets/[name] handler's prerender entries() so every
	 * static asset becomes a real file in the build output instead
	 * of relying on a serverless function (which adapter-vercel
	 * can't satisfy because the assets dir isn't bundled into the
	 * function's filesystem).
	 *
	 * Duplicates are de-duped; primary dir wins over fallback.
	 * Missing dirs are silently treated as empty.
	 */
	async names(): Promise<string[]> {
		const seen = new Set<string>();
		for (const dir of [ASSETS_DIR, BUNDLED_ASSETS_DIR]) {
			if (dir === ASSETS_DIR && dir === BUNDLED_ASSETS_DIR && seen.size > 0) break;
			try {
				const entries = await readdir(dir, { withFileTypes: true });
				for (const e of entries) {
					if (e.isFile()) seen.add(e.name);
				}
			} catch {
				// Dir doesn't exist — fine.
			}
		}
		return [...seen];
	}
}

export const assets = new AssetCache();
