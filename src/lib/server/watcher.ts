import { dev } from '$app/environment';
import chokidar from 'chokidar';
import { CONTENT_DIR } from './loader';
import { KINDS_DIR } from './kinds';
import { graph } from './graph';

/**
 * In dev, watch the worldbuilding source trees and reload the graph
 * whenever anything changes. Production builds skip this entirely —
 * the graph is built once at startup.
 *
 * We watch both `content/` (entities + collections) and
 * `content_meta/kinds/` (the kind registry) so that an edit to a
 * `_kind.yaml` or `_kind.md` shows up in the running dev server
 * without a manual restart.
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
		}, 75);
	};

	const watcher = chokidar.watch([CONTENT_DIR, KINDS_DIR], {
		ignoreInitial: true,
		ignored: (path) => path.endsWith('.DS_Store')
	});

	watcher.on('add', trigger).on('change', trigger).on('unlink', trigger);
	console.log(`[alteria] watching ${CONTENT_DIR} and ${KINDS_DIR}`);
}
