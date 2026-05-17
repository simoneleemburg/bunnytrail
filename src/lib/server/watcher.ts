import { dev } from '$app/environment';
import chokidar from 'chokidar';
import { CONTENT_DIR } from './loader';
import { graph } from './graph';

/**
 * In dev, watch `content/` and reload the graph whenever a file changes.
 * Production builds skip this entirely — the graph is built once at startup.
 *
 * We debounce reloads so that saving a YAML + MD pair together doesn't trigger
 * two rebuilds back-to-back.
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

	const watcher = chokidar.watch(CONTENT_DIR, {
		ignoreInitial: true,
		ignored: (path) => path.endsWith('.DS_Store')
	});

	watcher.on('add', trigger).on('change', trigger).on('unlink', trigger);
	console.log(`[alteria] watching ${CONTENT_DIR}`);
}
