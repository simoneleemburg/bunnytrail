import { dev } from '$app/environment';
import chokidar from 'chokidar';
import { blog } from './blog';
import { sources } from './sources';
import { graph } from './graph';
import { assets } from './assets';
import { CONTENT_DIR, BLOG_DIR, KINDS_DIR, SOURCES_DIR, ASSETS_DIR } from './globals';

/**
 * In dev, watch the worldbuilding source trees and reload the graph
 * whenever anything changes. Production builds skip this entirely —
 * the graph is built once at startup.
 *
 * We watch `content/` (entities + collections),
 * `content_meta/kinds/` (the kind registry), and
 * `content_meta/blog/` (the author's notebook) so edits to any of
 * them show up in the running dev server without a manual restart.
 * The blog is loaded into its own singleton — `graph.load()` and
 * `blog.load()` are independent — but they share one watcher and
 * one debounce window, since saving across trees is rare and a
 * tiny over-reload is cheaper than a second timer.
 *
 * Reloads are debounced so saving a YAML + MD pair together doesn't
 * trigger two rebuilds back-to-back.
 */
let started = false;

export function startWatcher(): void {
	if (!dev || started) return;
	started = true;

	let timer: ReturnType<typeof setTimeout> | null = null;
	const trigger = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			void graph.load().catch((err) => {
				console.error('[alteria] graph reload failed:', err);
			});
			void blog.load().catch((err) => {
				console.error('[alteria] blog reload failed:', err);
			});
			void sources.load().catch((err) => {
				console.error('[alteria] sources reload failed:', err);
			});
		}, 75);
	};

	const watcher = chokidar.watch([CONTENT_DIR, KINDS_DIR, BLOG_DIR, SOURCES_DIR], {
		ignoreInitial: true,
		ignored: (path) => path.endsWith('.DS_Store')
	});

	watcher.on('add', trigger).on('change', trigger).on('unlink', trigger);
	console.log(`[alteria] watching ${CONTENT_DIR}, ${KINDS_DIR}, ${BLOG_DIR}, and ${SOURCES_DIR}`);

	// Watch the assets directory separately — changes only invalidate
	// the asset cache, no graph rebuild needed.
	const assetTrigger = (path: string) => {
		const name = path.split('/').pop() ?? path;
		assets.invalidate(name);
		console.log(`[alteria] asset invalidated: ${name}`);
	};

	const assetWatcher = chokidar.watch(ASSETS_DIR, {
		ignoreInitial: true,
		ignored: (path) => path.endsWith('.DS_Store')
	});

	assetWatcher.on('add', assetTrigger).on('change', assetTrigger).on('unlink', assetTrigger);
	console.log(`[alteria] watching assets: ${ASSETS_DIR}`);
}
