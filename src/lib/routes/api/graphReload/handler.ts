import { dev } from '$app/environment';
import { graph } from '$lib/server/graph';

/**
 * GET /api/graph-reload
 *
 * Dev-only Server-Sent Events stream that pushes the graph version
 * number whenever the file watcher triggers a graph reload.
 *
 * The client subscribes once (via `EventSource`) and calls
 * `invalidateAll()` whenever a new version arrives. This is the
 * signal that causes SvelteKit to re-run all active `load()`
 * functions and refresh the page data without a full browser reload.
 *
 * In production this endpoint returns 404 — there is no live
 * reloading in a prerendered build and the SSE connection would
 * never receive an event anyway.
 *
 * Protocol:
 *   - On connect: sends the current version immediately so the
 *     client can establish its baseline.
 *   - On each graph reload: sends `data: <version>\n\n`.
 *   - Heartbeat comment every 15 s keeps the connection alive
 *     through proxies and browsers that close idle streams.
 */
export function GET(): Response {
	if (!dev) {
		return new Response('Not found', { status: 404 });
	}

	const encoder = new TextEncoder();
	let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let onReload: (() => void) | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(ctrl) {
			controller = ctrl;

			const send = (data: string) => {
				if (!controller) return;
				try {
					controller.enqueue(encoder.encode(data));
				} catch {
					// Stream already closed — ignore.
				}
			};

			// Baseline version so the client knows what to compare against.
			send(`data: ${graph.version}\n\n`);

			onReload = () => send(`data: ${graph.version}\n\n`);
			graph.onReload(onReload);

			// 15-second heartbeat keeps the connection alive through nginx
			// and browser idle-stream close timeouts.
			heartbeat = setInterval(() => send(': heartbeat\n\n'), 15_000);
		},
		cancel() {
			// Client disconnected — clean up listeners and timers.
			if (heartbeat) clearInterval(heartbeat);
			if (onReload) graph.offReload(onReload);
			controller = null;
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
