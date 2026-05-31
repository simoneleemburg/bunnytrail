<script lang="ts">
	/**
	 * Global click handler that picks up `[data-bt-svg-expand]`
	 * buttons emitted by `inlineSvgFigures` and pops the sibling
	 * SVG into a full-viewport `<dialog>`. Mounted once from the
	 * top-level `Layout.svelte` so it's available everywhere prose
	 * renders without wiring per-route.
	 *
	 * The inline figure stays as a "preview"; the lightbox is the
	 * canonical reading mode for maps. SVG content is cloned (not
	 * moved) so the inline figure remains intact when the dialog
	 * closes. The clone is wrapped in
	 * `.bt-inline-svg.bt-inline-svg--lightbox`, giving world CSS a
	 * stable hook to author per-mode rules ("show more labels in
	 * lightbox, hide chatty detail in the inline preview").
	 *
	 * Zoom + pan is implemented in JS rather than via native pinch:
	 *  - native viewport zoom scales the close button along with
	 *    the SVG, pushing it off-screen on iOS
	 *  - we want a current-scale signal exposed to CSS so authors
	 *    can do semantic zoom (progressive label reveal)
	 *
	 * The current scale is published on the wrapper as:
	 *   - CSS custom property `--bt-zoom` (raw number, 1..MAX)
	 *   - `data-bt-zoom-level` ∈ {low, mid, high}
	 * Content CSS keys off either to fade/hide details as the user
	 * zooms out.
	 *
	 * The dialog auto-closes on navigation (so mobile users can tap
	 * a wikilink inside the lightbox without ending up on the new
	 * page with the dialog still mounted over it).
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let dialog: HTMLDialogElement | null = $state(null);
	let zoomTarget: HTMLDivElement | null = $state(null);
	let stage: HTMLDivElement | null = $state(null);
	let captionText = $state('');

	// Zoom + pan are driven by manipulating the cloned SVG's
	// `viewBox` attribute directly rather than wrapping the SVG in
	// a CSS `transform: scale()` div. CSS-transformed SVG triggers
	// raster compositing — the browser rasterises the SVG once at
	// its natural size and then upscales the bitmap, which makes
	// everything blur/pixelate at high zoom. viewBox changes are
	// re-rasterised from the vector source at every frame, so the
	// figure stays crisp at any scale.
	let activeSvg: SVGSVGElement | null = null;
	let origVb = $state({ x: 0, y: 0, w: 0, h: 0 });
	let vb = $state({ x: 0, y: 0, w: 0, h: 0 });

	// Derived visual scale (used to publish `--bt-zoom` to CSS and
	// to drive the text-size cap). 1 = native viewBox, > 1 = zoomed in.
	let scale = $derived(origVb.w > 0 ? origVb.w / vb.w : 1);

	const MIN_SCALE = 1;
	const MAX_SCALE = 12;

	// Close on navigation. Reading `page.url.href` registers the
	// dependency; the effect re-fires on every route change.
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		page.url.href;
		if (dialog?.open) dialog.close();
	});

	// Map of `<text>` element → its intrinsic font-size in px,
	// captured the first time we see it (i.e. at the world's
	// per-figure baseline). We mutate `style.fontSize` past the
	// cap to counter-scale against `--bt-zoom`; resetting the
	// inline style restores the cascade-driven baseline.
	let textBaseSizes = new WeakMap<SVGTextElement, number>();

	/**
	 * Walk every `<text>` in the lightbox clone and update its
	 * inline `font-size` so the visual size pins at
	 * `intrinsic * --bt-text-cap` once `scale > cap`. Below the
	 * cap we clear the inline style so the world's CSS controls
	 * the size normally.
	 *
	 * Doing this in JS rather than CSS avoids two problems:
	 *  (1) CSS `transform: scale()` on text inside the figure's
	 *      own transform triggers raster compositing → blurry/
	 *      pixelated glyphs.
	 *  (2) A CSS `font-size` rule would have to outscope every
	 *      per-figure rule like `.bt-inline-svg--cognita-map
	 *      .planet-label`, which is a specificity arms race.
	 * Inline `style.fontSize` wins unconditionally.
	 */
	function applyTextCap(wrapper: HTMLElement, currentScale: number): void {
		const cap = Number.parseFloat(
			getComputedStyle(wrapper).getPropertyValue('--bt-text-cap').trim() || '1.8'
		);
		const factor = Math.min(cap, currentScale) / currentScale;
		const texts = wrapper.querySelectorAll<SVGTextElement>('text');
		for (const t of texts) {
			let base = textBaseSizes.get(t);
			if (base === undefined) {
				// Clear any previous inline font-size to read the
				// cascade-resolved baseline cleanly.
				const previous = t.style.fontSize;
				t.style.fontSize = '';
				base = Number.parseFloat(getComputedStyle(t).fontSize) || 0;
				if (previous) t.style.fontSize = previous;
				textBaseSizes.set(t, base);
			}
			if (factor >= 0.9999) {
				t.style.fontSize = '';
			} else {
				t.style.fontSize = `${base * factor}px`;
			}
		}
	}

	// Apply current viewBox + publish zoom signal.
	$effect(() => {
		// Reads pulled out of the gate so the effect tracks `vb`
		// from the first run, even before `activeSvg` is set. Without
		// this, the first invocation (activeSvg null) wouldn't
		// subscribe to vb and subsequent zoom mutations wouldn't
		// re-trigger the effect.
		const { x, y, w, h } = vb;
		const currentScale = scale;
		if (!zoomTarget) return;
		if (activeSvg && origVb.w > 0) {
			activeSvg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
		}
		zoomTarget.style.setProperty('--bt-zoom', String(currentScale));
		const wrapper = zoomTarget.firstElementChild as HTMLElement | null;
		if (wrapper) {
			wrapper.style.setProperty('--bt-zoom', String(currentScale));
			wrapper.dataset.btZoomLevel =
				currentScale < 2 ? 'low' : currentScale < 4 ? 'mid' : 'high';
			applyTextCap(wrapper, currentScale);
		}
	});

	function reset() {
		vb = { ...origVb };
	}

	/**
	 * Zoom toward a viewport-coordinate anchor (mouse or pinch
	 * midpoint). Computes the SVG-coord point under the anchor,
	 * then chooses a new viewBox that keeps that same SVG point
	 * under the same screen anchor at the new scale.
	 */
	function zoomAt(clientX: number, clientY: number, targetScale: number) {
		if (!activeSvg || origVb.w === 0) return;
		const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));
		const rect = activeSvg.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;
		// Anchor in SVG user coordinates, given the current viewBox.
		const ax = vb.x + ((clientX - rect.left) / rect.width) * vb.w;
		const ay = vb.y + ((clientY - rect.top) / rect.height) * vb.h;
		const newW = origVb.w / next;
		const newH = origVb.h / next;
		const newX = ax - ((clientX - rect.left) / rect.width) * newW;
		const newY = ay - ((clientY - rect.top) / rect.height) * newH;
		vb = { x: newX, y: newY, w: newW, h: newH };
		if (next <= MIN_SCALE + 0.001) reset();
	}

	/** Pan by a screen-pixel delta, converted to SVG user units. */
	function panBy(dx: number, dy: number) {
		if (!activeSvg || origVb.w === 0) return;
		const rect = activeSvg.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;
		vb = {
			x: vb.x - (dx * vb.w) / rect.width,
			y: vb.y - (dy * vb.h) / rect.height,
			w: vb.w,
			h: vb.h
		};
	}

	function onWheel(event: WheelEvent) {
		event.preventDefault();
		// Sensitivity tuned so a typical trackpad swipe crosses the
		// low→mid threshold in a single gesture.
		const factor = Math.exp(-event.deltaY * 0.005);
		zoomAt(event.clientX, event.clientY, scale * factor);
	}

	const pointers = new Map<number, { x: number; y: number }>();
	let pinchStartDist = 0;
	let pinchStartScale = 1;

	function onPointerDown(event: PointerEvent) {
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		// Only capture the pointer when we actually need to consume
		// subsequent pointer/mouse events ourselves — i.e. when a
		// pan is possible (zoomed in) or a pinch is starting. Capturing
		// unconditionally hijacks the browser's `click` synthesis from
		// pointer events, which breaks links inside the SVG.
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
			pinchStartScale = scale;
			(event.currentTarget as Element).setPointerCapture(event.pointerId);
		} else if (scale > MIN_SCALE) {
			(event.currentTarget as Element).setPointerCapture(event.pointerId);
		}
	}

	function onPointerMove(event: PointerEvent) {
		const prev = pointers.get(event.pointerId);
		if (!prev) return;
		const curr = { x: event.clientX, y: event.clientY };
		pointers.set(event.pointerId, curr);
		if (pointers.size === 2 && pinchStartDist > 0) {
			const [a, b] = [...pointers.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			const cx = (a.x + b.x) / 2;
			const cy = (a.y + b.y) / 2;
			zoomAt(cx, cy, pinchStartScale * (dist / pinchStartDist));
		} else if (pointers.size === 1 && scale > MIN_SCALE) {
			panBy(curr.x - prev.x, curr.y - prev.y);
		}
	}

	function onPointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		if (pointers.size < 2) pinchStartDist = 0;
	}

	function onDoubleClick(event: MouseEvent) {
		if (scale > MIN_SCALE + 0.01) reset();
		else zoomAt(event.clientX, event.clientY, 2.5);
	}

	onMount(() => {
		function onTriggerClick(event: MouseEvent) {
			const target = event.target as Element | null;
			if (!target) return;

			// Two entry points:
			//   1. Explicit click on the [data-bt-svg-expand] button
			//      (keyboard-accessible, visible on touch).
			//   2. Bare click anywhere inside an inline figure that
			//      isn't on a link or interactive descendant — the
			//      "Wikipedia-style click-image-to-enlarge" gesture.
			// The lightbox clone itself is `.bt-inline-svg--lightbox`;
			// excluding it prevents the in-lightbox SVG from
			// re-triggering open on every pan/click.
			const trigger = target.closest('[data-bt-svg-expand]');
			const figure = trigger
				? trigger.closest('figure.bt-inline-svg:not(.bt-inline-svg--lightbox)')
				: target.closest('figure.bt-inline-svg:not(.bt-inline-svg--lightbox)');
			if (!figure) return;
			if (!trigger) {
				// Background-click path: bail out if the click landed
				// on a link or any actionable element inside the SVG,
				// or on the figcaption (selectable text).
				if (target.closest('a, button, [role="link"], [role="button"], figcaption')) return;
				// Modifier-key or non-primary clicks are intentional
				// browser gestures (open-in-new-tab, context menu) —
				// don't hijack them.
				if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
			}
			const svg = figure.querySelector('svg');
			if (!svg || !dialog || !zoomTarget) return;

			event.preventDefault();
			const clone = svg.cloneNode(true) as SVGSVGElement;
			clone.removeAttribute('width');
			clone.removeAttribute('height');
			clone.style.width = '100%';
			clone.style.height = '100%';

			// Capture the original viewBox so reset/zoom math has a
			// stable reference. Prefer an explicit `viewBox`; fall
			// back to width/height (in user units) if absent, which
			// covers SVGs authored without an explicit viewBox.
			const vbAttr = svg.getAttribute('viewBox');
			let parsedVb = vbAttr?.trim().split(/[\s,]+/).map(Number);
			if (!parsedVb || parsedVb.length !== 4 || parsedVb.some((n) => Number.isNaN(n))) {
				const w = svg.viewBox.baseVal.width || (svg as SVGSVGElement).width.baseVal.value || 0;
				const h = svg.viewBox.baseVal.height || (svg as SVGSVGElement).height.baseVal.value || 0;
				parsedVb = [0, 0, w, h];
			}
			origVb = { x: parsedVb[0], y: parsedVb[1], w: parsedVb[2], h: parsedVb[3] };
			vb = { ...origVb };
			activeSvg = clone;
			textBaseSizes = new WeakMap();

			// World CSS targets the auto-scoped wrapper
			// `.bt-inline-svg--<svg-basename>`. We copy every
			// modifier class off the source figure so the clone
			// keeps the same per-figure styles applied, then add
			// `--lightbox` for rules scoped to the expanded view.
			const ctx = document.createElement('div');
			const sourceClasses = [...figure.classList].filter((c) =>
				c.startsWith('bt-inline-svg--')
			);
			ctx.className = ['bt-inline-svg', ...sourceClasses, 'bt-inline-svg--lightbox'].join(' ');
			ctx.dataset.btZoomLevel = 'low';
			ctx.style.setProperty('--bt-zoom', '1');
			ctx.appendChild(clone);
			zoomTarget.replaceChildren(ctx);

			const cap = figure.querySelector('figcaption');
			captionText = cap?.textContent?.trim() ?? '';
			dialog.showModal();
		}

		document.addEventListener('click', onTriggerClick);
		return () => document.removeEventListener('click', onTriggerClick);
	});

	function onDialogClick(event: MouseEvent) {
		if (event.target === dialog) dialog?.close();
	}

	function close() {
		dialog?.close();
	}
</script>

<dialog bind:this={dialog} class="bt-svg-lightbox" onclick={onDialogClick}>
	<div class="frame">
		<button type="button" class="close" onclick={close} aria-label="Close">✕</button>
		<div
			class="stage"
			role="presentation"
			bind:this={stage}
			onwheel={onWheel}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			ondblclick={onDoubleClick}
		>
			<div class="zoom-target" bind:this={zoomTarget}></div>
		</div>
		{#if captionText}
			<p class="caption">{captionText}</p>
		{/if}
	</div>
</dialog>

<style>
	.bt-svg-lightbox {
		width: 100vw;
		max-width: 100vw;
		height: 100vh;
		max-height: 100vh;
		margin: 0;
		padding: 0;
		border: 0;
		/* Parchment background so transparent SVGs (mundus, fabric)
		   remain readable. Maps that paint their own dark background
		   (cognita, clusters) cover the parchment via the SVG
		   element's own `background`. */
		background: var(--parchment);
		color: var(--ink);
		overflow: hidden;
		/* Suppress native viewport pinch-zoom so the close button
		   doesn't drift out of the viewport on iOS. Our own zoom
		   handler covers pinch via pointer events. */
		touch-action: none;
	}

	.bt-svg-lightbox::backdrop {
		background: rgba(20, 16, 12, 0.65);
	}

	.frame {
		position: relative;
		width: 100%;
		height: 100%;
		display: grid;
		grid-template-rows: 1fr auto;
		gap: var(--space-3);
		padding: var(--space-5);
		box-sizing: border-box;
	}

	.stage {
		position: relative;
		min-height: 0;
		overflow: hidden;
		touch-action: none;
		cursor: grab;
	}

	.stage:active {
		cursor: grabbing;
	}

	.zoom-target {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.zoom-target :global(.bt-inline-svg) {
		/* Cap the lightbox figure at the same width as the inline
		   figure. World CSS uses `cqw` for in-SVG font sizes; if
		   the container grew to viewport-width here, labels would
		   scale proportionally and collide with each other (the
		   labels' viewBox positions were authored for a specific
		   absolute size). Keeping the container width consistent
		   means the lightbox is a "focused" view at scale 1, and
		   zoom-in reveals more detail without distortion. */
		max-width: var(--figure-max-width);
		max-height: 100%;
		width: 100%;
		height: 100%;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.zoom-target :global(.bt-inline-svg svg) {
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
	}

	/* The inline figure's expand button leaks through the clone;
	   hide it inside the lightbox. */
	.zoom-target :global(.bt-inline-svg__expand) {
		display: none;
	}

	.caption {
		margin: 0;
		text-align: center;
		font-style: italic;
		font-size: var(--text-sm);
		color: var(--ink-soft);
	}

	.close {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--vellum);
		color: var(--ink-soft);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		font-size: 1.1rem;
		cursor: pointer;
		/* Sits above the stage; not affected by zoom transform. */
		z-index: 2;
	}

	.close:hover,
	.close:focus-visible {
		color: var(--accent);
		background: var(--parchment-soft);
		outline: none;
	}
</style>
