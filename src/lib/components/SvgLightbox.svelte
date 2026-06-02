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
	import type { N } from 'vitest/dist/chunks/environment.LoooBwUu.js';

	// Max zoom level, clamped on fast trackpad pinch or wheel gestures.
	const MAX_SCALE = 12;

	const SEMANTIC_ZOOM_THRESHOLDS = [1, 2, 4, 8, 12];
	const SEMANTIC_ZOOM_LEVELS = ['min', 'low', 'mid', 'high', 'max'] as const;

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

	// Visual scale, published to CSS as `--bt-zoom`. 1 = cover-fit
	// (the wrapper exactly covers the stage in both dimensions; the
	// larger axis overflows and is clipped). > 1 zooms in via
	// viewBox shrink. < 1 zooms out via CSS `transform: scale()` on
	// the wrapper — vector downscale stays crisp, and at minScale
	// the entire SVG fits within the stage in both dimensions so the
	// user can see corners that were clipped at cover-fit.
	let scale = $state(1);

	// Lower bound for `scale`, recomputed per-figure in
	// sizeWrapperToStage so that minScale corresponds to "whole SVG
	// fits within stage". Maps with a stage aspect close to their
	// own (clusters, cognita on landscape) have minScale ≈ 1; tall
	// portrait viewports zoomed into wide SVGs (mundus on mobile)
	// land around 0.5–0.6.
	let minScale = $state(1);
	// Close on navigation. Reading `page.url.href` registers the
	// dependency; the effect re-fires on every route change.
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		page.url.href;
		if (dialog?.open) {
			dialog.close();
			clearHeldKeys();
		}
	});

	// Map of `<text>` element → its intrinsic font-size in px,
	// captured the first time we see it (i.e. at the world's
	// per-figure baseline). We mutate `style.fontSize` past the
	// cap to counter-scale against `--bt-zoom`; resetting the
	// inline style restores the cascade-driven baseline.
	let textBaseSizes = new WeakMap<SVGTextElement, number>();

	/**
	 * Walk every `<text>` in the lightbox clone and update its
	 * inline `font-size` so the visual glyph size grows as a smooth
	 * power curve of the zoom level rather than tracking it 1:1.
	 *
	 *   visual = base · scale^k       with k = log(cap) / log(MAX)
	 *
	 * So at scale=1 visual=base (the curve meets the no-override
	 * regime smoothly), at scale=MAX visual=cap·base (the same
	 * asymptote as a hard cap would give), and in between the
	 * derivative is continuous — no kink at any threshold. The
	 * piecewise `min(cap, scale)` version we had before produced a
	 * visible jump at scale=cap because the visual derivative
	 * dropped to zero instantly; on trackpads that crosses the
	 * threshold one wheel tick at a time and reads as text snapping.
	 *
	 * Setting `style.fontSize` directly (rather than via CSS rules
	 * keyed on `--bt-zoom`) avoids two failure modes:
	 *  (1) CSS `transform: scale()` on text inside the figure's
	 *      own zoom would trigger raster compositing → blurry text.
	 *  (2) A CSS `font-size` rule would have to outscope every
	 *      per-figure world rule like `.bt-inline-svg--cognita-map
	 *      .planet-label`, which is a specificity arms race.
	 * Inline `style.fontSize` wins unconditionally.
	 *
	 * Sub-cover zoom (scale < 1) is handled by a wrapper CSS
	 * transform that already shrinks text proportionally; we leave
	 * `fontSize` untouched there.
	 */
	function applyTextCap(wrapper: HTMLElement, currentScale: number): void {
		const cap = Number.parseFloat(
			getComputedStyle(wrapper).getPropertyValue('--bt-text-cap').trim() || '1.8'
		);
		const texts = wrapper.querySelectorAll<SVGTextElement>('text');
		// At or below cover-fit, defer to the cascade — wrapper
		// transform handles visual shrink. At cap ≤ 1 (a world
		// deliberately pinning text size), and at scale=1, the
		// curve below also returns factor=1, but short-circuiting
		// here saves the per-text getComputedStyle on the dominant
		// path.
		if (currentScale <= 1 || cap <= 1) {
			for (const t of texts) t.style.fontSize = '';
			return;
		}
		const k = Math.log(cap) / Math.log(MAX_SCALE);
		const factor = Math.pow(currentScale, k - 1);
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

	// Apply current viewBox + transform + publish zoom signal.
	$effect(() => {
		// Reads pulled out of the gate so the effect tracks `vb`
		// and `scale` from the first run, even before `activeSvg`
		// is set.
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
			const currentTierIdx = (() => {
				const found = SEMANTIC_ZOOM_THRESHOLDS.findIndex(
					(threshold: number) => currentScale <= threshold
				);
				return found === -1 ? SEMANTIC_ZOOM_LEVELS.length - 1 : found;
			})();
			wrapper.dataset.btZoomLevel = SEMANTIC_ZOOM_LEVELS[currentTierIdx];
			// Cumulative tier flags: every tier ≤ current is stamped
			// as a separate data attribute, so authors can write
			// `[data-bt-zoom-mid] [data-bt-reveal='mid']` (matches at
			// mid + high + max) without enumerating each higher tier
			// in the selector. Used by global.css to drive both
			// `data-bt-reveal` and `data-bt-hide` symmetrically.
			for (let i = 0; i < SEMANTIC_ZOOM_LEVELS.length; i++) {
				const attr = `bt-zoom-${SEMANTIC_ZOOM_LEVELS[i]}`;
				if (i <= currentTierIdx) wrapper.setAttribute(`data-${attr}`, '');
				else wrapper.removeAttribute(`data-${attr}`);
			}
			// Sub-cover zoom-out is done with a CSS transform on the
			// wrapper rather than viewBox math: at scale < 1 the
			// entire SVG already fits within the wrapper, so we just
			// shrink the wrapper visually. Downscaling vectors via
			// CSS transform doesn't trigger the bitmap blur problem
			// that upscaling does (the rasteriser still has more
			// source than target pixels).
			if (currentScale < 1) {
				wrapper.style.transform = `scale(${currentScale})`;
				wrapper.style.transformOrigin = 'center center';
			} else {
				wrapper.style.transform = '';
			}
			applyTextCap(wrapper, currentScale);
		}
	});

	function reset() {
		vb = { ...origVb };
		scale = 1;
	}

	/**
	 * Size the lightbox wrapper so it covers the stage in both
	 * dimensions (the smaller stage axis fits exactly; the larger
	 * one overflows and is clipped by `.stage { overflow: hidden }`,
	 * so the user pans to reveal off-screen edges). Called on open
	 * and on viewport resize. We compute imperatively because
	 * `.bt-inline-svg` sets `container-type: inline-size` for the
	 * world's cqw-driven font sizes — that makes cq units inside
	 * the wrapper resolve to its own size, so the obvious
	 * `max(100cqw, 100cqh*aspect)` CSS expression is circular.
	 */
	function sizeWrapperToStage() {
		if (!stage || !zoomTarget) return;
		const wrapper = zoomTarget.firstElementChild as HTMLElement | null;
		if (!wrapper) return;
		const aspect = origVb.w > 0 && origVb.h > 0 ? origVb.w / origVb.h : 1;
		const stageRect = stage.getBoundingClientRect();
		const coverW = Math.max(stageRect.width, stageRect.height * aspect);
		const coverH = Math.max(stageRect.height, stageRect.width / aspect);
		wrapper.style.width = `${coverW}px`;
		wrapper.style.height = `${coverH}px`;
		wrapper.style.maxWidth = 'none';
		wrapper.style.maxHeight = 'none';
		// minScale = "shrink factor at which the cover-fit wrapper
		// fits within the stage in both dimensions" → the user can
		// pinch out far enough to see every corner of the SVG,
		// including the axis that was clipped at cover-fit.
		minScale =
			coverW > 0 && coverH > 0
				? Math.min(stageRect.width / coverW, stageRect.height / coverH)
				: 1;
		// On resize, if the user is already zoomed below the new
		// floor (e.g. they rotated to landscape), clamp upward.
		if (scale < minScale) scale = minScale;
	}

	/**
	 * Zoom toward a viewport-coordinate anchor (mouse or pinch
	 * midpoint). Computes the SVG-coord point under the anchor,
	 * then chooses a new viewBox that keeps that same SVG point
	 * under the same screen anchor at the new scale.
	 */
	function zoomAt(clientX: number, clientY: number, targetScale: number) {
		if (!activeSvg || origVb.w === 0) return;
		const next = Math.max(minScale, Math.min(MAX_SCALE, targetScale));
		if (next < 1) {
			// Sub-cover zoom-out: viewBox stays at the natural
			// extent and the wrapper is CSS-scaled down. Anchor
			// math doesn't apply — the whole SVG is visible so
			// "zoom toward the cursor" reduces to "shrink in place".
			vb = { ...origVb };
			scale = next;
			return;
		}
		// scale ≥ 1: viewBox-based zoom toward the anchor.
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
		scale = next;
	}

	/** Pan by a screen-pixel delta, converted to SVG user units. */
	function panBy(dx: number, dy: number) {
		if (!activeSvg || origVb.w === 0) return;
		// Below cover-fit the entire SVG is visible; panning would
		// just drag empty space, so we no-op.
		if (scale < 1) return;
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
	const pointerStarts = new Map<number, { x: number; y: number }>();
	const panActive = new Set<number>();
	const PAN_THRESHOLD = 6;
	let pinchStartDist = 0;
	let pinchStartScale = 1;

	function onPointerDown(event: PointerEvent) {
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		pointerStarts.set(event.pointerId, { x: event.clientX, y: event.clientY });
		// Pinch needs immediate capture so we keep getting move events
		// on both fingers; pan capture is deferred until the user
		// actually crosses the drag threshold, so a tap on a link
		// still synthesises a click through to the <a> inside the SVG.
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
			pinchStartScale = scale;
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
			return;
		}
		if (pointers.size !== 1) return;
		// Promote a single-pointer drag into a pan once it crosses
		// the threshold. Before that, the gesture might still be a
		// click — leaving the link clickable.
		if (!panActive.has(event.pointerId)) {
			const start = pointerStarts.get(event.pointerId);
			if (!start) return;
			const moved = Math.hypot(curr.x - start.x, curr.y - start.y);
			if (moved < PAN_THRESHOLD) return;
			panActive.add(event.pointerId);
			try {
				(event.currentTarget as Element).setPointerCapture(event.pointerId);
			} catch {
				// pointer already released or invalid id; ignore
			}
		}
		panBy(curr.x - prev.x, curr.y - prev.y);
	}

	function onPointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		pointerStarts.delete(event.pointerId);
		const wasPanning = panActive.delete(event.pointerId);
		if (pointers.size < 2) pinchStartDist = 0;
		// Suppress the synthesised click that follows pointerup if
		// the gesture was a pan — otherwise a release over a link
		// after panning would navigate.
		if (wasPanning) {
			const swallow = (e: Event) => {
				e.stopPropagation();
				e.preventDefault();
				window.removeEventListener('click', swallow, true);
			};
			window.addEventListener('click', swallow, true);
			setTimeout(() => window.removeEventListener('click', swallow, true), 0);
		}
	}

	function onDoubleClick(event: MouseEvent) {
		if (scale > 1.01) reset();
		else zoomAt(event.clientX, event.clientY, 2.5);
	}

	/**
	 * Keyboard controls run through a requestAnimationFrame loop
	 * rather than firing one step per keydown event. The OS-level
	 * keyboard repeat has a large initial delay (~500ms) and a
	 * coarse repeat rate (~30Hz typical), which produces visible
	 * steppy motion. By tracking which keys are currently held in
	 * `heldKeys` and integrating motion per frame, we get smooth
	 * 60fps pan/zoom for the entire duration of the keypress.
	 *
	 *   Arrow keys → pan (scaled to zoom level for consistent feel)
	 *   +/= → zoom in at center
	 *   - → zoom out at center
	 *   0 → reset to cover-fit (one-shot)
	 *   Hold Shift → 3× pan / 2× zoom speed
	 *
	 * Motion keys are tracked by `event.code` rather than
	 * `event.key`. The latter changes when modifiers shift the
	 * character produced — Shift+Minus on a US layout fires
	 * `key:"_"`, so a held-key set keyed on `key` would let "-"
	 * leak out of `heldKeys` (we'd record "-" on initial keydown
	 * before Shift, then on the keyup-after-Shift we'd see "_" and
	 * fail to delete). `event.code` reports the physical key
	 * regardless of modifier state.
	 */
	const heldKeys = new Set<string>();
	let shiftHeld = $state(false);
	let rafHandle = 0;
	let lastFrameTime = 0;

	// Pan velocity at scale=1, in screen pixels per second. Tuned
	// so a held arrow crosses ~half the viewport in a second.
	const PAN_SPEED = 600;
	// Zoom velocity in scale-multiplier per second. 1.8 means scale
	// roughly doubles every second of held +/-.
	const ZOOM_SPEED = 2.5;
	const SHIFT_PAN_MULTIPLIER = 3;
	const SHIFT_ZOOM_MULTIPLIER = 2;

	// Physical keys we treat as motion. KeyboardEvent.code values are
	// US-layout-stable: Minus / Equal are the physical keys that on
	// US layouts produce -, =, _, +. NumpadAdd / NumpadSubtract cover
	// the numeric keypad. Equal also doubles as zoom-in because + lives
	// on Shift+Equal — pressing Shift+Equal still reports code:"Equal".
	const MOTION_CODES = new Set([
		'ArrowLeft',
		'ArrowRight',
		'ArrowUp',
		'ArrowDown',
		'Minus',
		'NumpadSubtract',
		'Equal',
		'NumpadAdd'
	]);
	const ZOOM_IN_CODES = new Set(['Equal', 'NumpadAdd']);
	const ZOOM_OUT_CODES = new Set(['Minus', 'NumpadSubtract']);

	function tick(now: number) {
		const dt = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.1) : 0;
		lastFrameTime = now;
		const panMul = shiftHeld ? SHIFT_PAN_MULTIPLIER : 1;
		const zoomMul = shiftHeld ? SHIFT_ZOOM_MULTIPLIER : 1;

		if (dt > 0) {
			let dx = 0;
			let dy = 0;
			if (heldKeys.has('ArrowLeft')) dx += 1;
			if (heldKeys.has('ArrowRight')) dx -= 1;
			if (heldKeys.has('ArrowUp')) dy += 1;
			if (heldKeys.has('ArrowDown')) dy -= 1;
			if (dx !== 0 || dy !== 0) {
				const step = PAN_SPEED * panMul * dt;
				panBy(dx * step, dy * step);
			}

			let zoomDir = 0;
			for (const code of ZOOM_IN_CODES) if (heldKeys.has(code)) zoomDir += 1;
			for (const code of ZOOM_OUT_CODES) if (heldKeys.has(code)) zoomDir -= 1;
			if (zoomDir !== 0 && stage) {
				const rect = stage.getBoundingClientRect();
				const factor = Math.pow(ZOOM_SPEED * zoomMul, zoomDir * dt);
				zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, scale * factor);
			}
		}

		// Keep ticking only while motion keys are still down. Shift
		// alone doesn't keep the loop alive — it's a modifier, not
		// a motion key.
		if (hasMotionKey()) {
			rafHandle = requestAnimationFrame(tick);
		} else {
			rafHandle = 0;
			lastFrameTime = 0;
		}
	}

	function hasMotionKey() {
		for (const code of heldKeys) if (MOTION_CODES.has(code)) return true;
		return false;
	}

	function startTicking() {
		if (rafHandle) return;
		lastFrameTime = 0;
		rafHandle = requestAnimationFrame(tick);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (!dialog?.open) return;
		// Reset is a one-shot — handle by `event.key` because the
		// physical key for "0" varies (Digit0 vs Numpad0) and we
		// don't care which.
		if (event.key === '0') {
			event.preventDefault();
			reset();
			return;
		}
		if (event.key === 'Shift') {
			shiftHeld = true;
			return;
		}
		if (MOTION_CODES.has(event.code)) {
			event.preventDefault();
			// Browser autorepeat fires keydown over and over while a
			// key is held. We only need the first one — the rAF loop
			// integrates motion from there. Ignoring repeats keeps
			// the held-key set clean and prevents spurious work.
			if (event.repeat) return;
			heldKeys.add(event.code);
			startTicking();
		}
	}

	function onKeyUp(event: KeyboardEvent) {
		if (event.key === 'Shift') {
			shiftHeld = false;
			return;
		}
		heldKeys.delete(event.code);
		// The loop self-terminates next frame when hasMotionKey() goes
		// false — no need to cancelAnimationFrame here.
	}

	function clearHeldKeys() {
		heldKeys.clear();
		shiftHeld = false;
		if (rafHandle) {
			cancelAnimationFrame(rafHandle);
			rafHandle = 0;
		}
		lastFrameTime = 0;
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
				// Background-click path: bail out on figcaption (selectable text)
				// and on non-primary/modifier-key clicks (open-in-new-tab, context
				// menu). Links inside the inline SVG no longer navigate directly —
				// the user must open the lightbox first, where the map is readable.
				if (target.closest('button, figcaption')) return;
				if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
			}
			const svg = figure.querySelector('svg');
			if (!svg || !dialog || !zoomTarget) return;

			event.preventDefault();
			const clone = svg.cloneNode(true) as SVGSVGElement;
			clone.removeAttribute('width');
			clone.removeAttribute('height');

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
			scale = 1;
			minScale = 1;
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
			ctx.dataset.btZoomLevel = 'min';
			ctx.setAttribute('data-bt-zoom-min', '');
			ctx.style.setProperty('--bt-zoom', '1');
			if (parsedVb[2] > 0 && parsedVb[3] > 0) {
				ctx.style.setProperty('--bt-svg-aspect', String(parsedVb[2] / parsedVb[3]));
			}
			ctx.appendChild(clone);
			zoomTarget.replaceChildren(ctx);

			const cap = figure.querySelector('figcaption');
			captionText = cap?.textContent?.trim() ?? '';
			dialog.showModal();
			showHintBriefly();
			// Stage layout settles after showModal + caption render.
			// Wait one frame so the grid row sizing is final before
			// we measure.
			requestAnimationFrame(() => sizeWrapperToStage());
		}

		document.addEventListener('click', onTriggerClick);
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		// Clear held-key state if focus leaves the window — otherwise
		// a key released while the tab is in the background never
		// fires keyup and the loop would keep panning forever.
		window.addEventListener('blur', clearHeldKeys);
		const onResize = () => sizeWrapperToStage();
		window.addEventListener('resize', onResize);
		isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
		return () => {
			document.removeEventListener('click', onTriggerClick);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('blur', clearHeldKeys);
			window.removeEventListener('resize', onResize);
		};
	});

	function onDialogClick(event: MouseEvent) {
		if (event.target === dialog) dialog?.close();
	}

	function close() {
		dialog?.close();
		clearHeldKeys();
		hintVisible = false;
		hintPinned = false;
		if (hintTimer) {
			clearTimeout(hintTimer);
			hintTimer = null;
		}
	}

	// Debug HUD: semantic level derived from the same threshold table
	// the data attribute uses, so the badge mirrors what CSS sees.
	const zoomLevel = $derived(
		SEMANTIC_ZOOM_LEVELS[
			SEMANTIC_ZOOM_THRESHOLDS.findIndex((threshold: number) => scale <= threshold)
		] || 'max'
	);

	// Keyboard-shortcut hint visibility. Shown for ~4s on every open
	// so first-time users discover the controls; the `?` toggle in
	// the chrome lets returning users summon it on demand. Pinned
	// (clicked rather than auto-shown) hints stay until dismissed.
	let hintVisible = $state(false);
	let hintPinned = $state(false);
	let hintTimer: ReturnType<typeof setTimeout> | null = null;

	// Detect coarse-pointer (touch) devices so we can swap out the
	// keyboard-shortcut hint for a gesture hint instead.
	let isTouchDevice = $state(false);

	function showHintBriefly() {
		hintVisible = true;
		hintPinned = false;
		if (hintTimer) clearTimeout(hintTimer);
		hintTimer = setTimeout(() => {
			if (!hintPinned) hintVisible = false;
			hintTimer = null;
		}, 4000);
	}

	function toggleHint() {
		if (hintVisible) {
			hintVisible = false;
			hintPinned = false;
			if (hintTimer) {
				clearTimeout(hintTimer);
				hintTimer = null;
			}
		} else {
			hintVisible = true;
			hintPinned = true;
			if (hintTimer) {
				clearTimeout(hintTimer);
				hintTimer = null;
			}
		}
	}
</script>

<dialog bind:this={dialog} class="bt-svg-lightbox" onclick={onDialogClick}>
	<div class="frame">
		<button type="button" class="close" onclick={close} aria-label="Close">✕</button>
		{#if !isTouchDevice}
			<button
				type="button"
				class="help-toggle"
				onclick={toggleHint}
				aria-label="Keyboard shortcuts"
				aria-expanded={hintVisible}
				aria-pressed={hintPinned}
			>?</button>
		{/if}
		<div class="zoom-hud" aria-hidden="true">
			<span class="zoom-hud__scale">{scale.toFixed(2)}×</span>
			<span class="zoom-hud__level">{zoomLevel}</span>
		</div>
		{#if hintVisible}
			<div class="hint" role="note" aria-label={isTouchDevice ? 'Touch controls' : 'Keyboard shortcuts'}>
				{#if isTouchDevice}
					<p class="hint__touch">Pinch to zoom · Drag to pan</p>
				{:else}
					<dl class="hint__rows">
						<div class="hint__row">
							<dt><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></dt>
							<dd>Pan</dd>
						</div>
						<div class="hint__row">
							<dt><kbd>+</kbd><kbd>−</kbd></dt>
							<dd>Zoom</dd>
						</div>
						<div class="hint__row">
							<dt><kbd>Shift</kbd></dt>
							<dd>Hold for faster pan/zoom</dd>
						</div>
						<div class="hint__row">
							<dt><kbd>0</kbd></dt>
							<dd>Reset</dd>
						</div>
						<div class="hint__row">
							<dt><kbd>Esc</kbd></dt>
							<dd>Close</dd>
						</div>
					</dl>
				{/if}
			</div>
		{/if}
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
		/* Fade open + close. `allow-discrete` lets `display` and the
		   [open] attribute participate in the transition so the dialog
		   actually disappears at the end of the close fade.
		   @starting-style below sets the from-state for the open
		   transition (opacity 0 → 1). The close fade is the reverse:
		   when [open] is removed the browser transitions back to the
		   non-open style (opacity 0) before removing from the DOM. */
		opacity: 1;
		transition:
			opacity 220ms ease,
			display 220ms ease allow-discrete,
			overlay 220ms ease allow-discrete;
	}

	/* Entry state: where the dialog starts from when it opens. */
	@starting-style {
		.bt-svg-lightbox[open] {
			opacity: 0;
		}
	}

	/* Closed state: what the dialog transitions toward when closing. */
	.bt-svg-lightbox:not([open]) {
		opacity: 0;
	}

	.bt-svg-lightbox::backdrop {
		background: rgba(20, 16, 12, 0.65);
		opacity: 1;
		transition:
			opacity 220ms ease,
			display 220ms ease allow-discrete,
			overlay 220ms ease allow-discrete;
	}

	@starting-style {
		.bt-svg-lightbox[open]::backdrop {
			opacity: 0;
		}
	}

	.bt-svg-lightbox:not([open])::backdrop {
		opacity: 0;
	}

	.frame {
		position: relative;
		width: 100%;
		height: 100%;
		display: grid;
		grid-template-rows: 1fr auto;
		gap: 0;
		padding: 0;
		box-sizing: border-box;
	}

	.stage {
		position: relative;
		min-height: 0;
		overflow: hidden;
		touch-action: none;
		cursor: grab;
		/* Container query context: the wrapper below uses 100cqw/cqh
		   to compute an aspect-preserving size that hugs the SVG. */
		container-type: size;
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
		/* Width / height are set inline in open() / resize handler
		   to cover the stage in both dimensions (the smaller stage
		   dimension fits exactly; the larger overflows and is
		   clipped by `.stage { overflow: hidden }`). We can't use
		   cq units here because `.bt-inline-svg` itself sets
		   `container-type: inline-size` in global.css, which makes
		   cq units resolve to the element's own size (circular).
		   `flex-shrink: 0` prevents the parent flex container from
		   collapsing the wrapper back to stage width. */
		margin: 0;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.zoom-target :global(.bt-inline-svg svg) {
		/* Fill the wrapper; global.css's max-height: --figure-max-height
		   would otherwise cap us. The wrapper is sized to the SVG's
		   own aspect (cover-fit) in JS, so 100% / 100% here does not
		   distort the content. */
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
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
		background: var(--bt-lightbox-chrome-bg, var(--vellum));
		color: var(--bt-lightbox-chrome-color, var(--ink-soft));
		border: 1px solid var(--bt-lightbox-chrome-border, var(--rule));
		border-radius: var(--radius-md);
		font-size: 1.1rem;
		cursor: pointer;
		/* Sits above the stage; not affected by zoom transform. */
		z-index: 2;
	}

	.close:hover,
	.close:focus-visible {
		color: var(--bt-lightbox-chrome-hover-color, var(--accent));
		background: var(--bt-lightbox-chrome-hover-bg, var(--parchment-soft));
		outline: none;
	}

	.zoom-hud {
		position: absolute;
		top: calc(var(--space-3) + 2.5rem + var(--space-2));
		right: var(--space-3);
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
		padding: 0.35rem 0.7rem;
		background: var(--bt-lightbox-chrome-bg, var(--vellum));
		color: var(--bt-lightbox-chrome-color, var(--ink-soft));
		border: 1px solid var(--bt-lightbox-chrome-border, var(--rule));
		border-radius: var(--radius-md);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: var(--text-sm);
		z-index: 2;
		pointer-events: none;
	}

	.zoom-hud__level {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--bt-lightbox-chrome-accent, var(--accent));
	}

	.help-toggle {
		position: absolute;
		top: var(--space-3);
		/* Sits to the left of the close button: close is 2.5rem
		   wide at right=space-3, so this lands flush against it
		   with one space-2 gap. */
		right: calc(var(--space-3) + 2.5rem + var(--space-2));
		width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bt-lightbox-chrome-bg, var(--vellum));
		color: var(--bt-lightbox-chrome-color, var(--ink-soft));
		border: 1px solid var(--bt-lightbox-chrome-border, var(--rule));
		border-radius: var(--radius-md);
		font-family: var(--font-serif, ui-serif, serif);
		font-size: 1.2rem;
		font-style: italic;
		cursor: pointer;
		z-index: 2;
	}

	.help-toggle:hover,
	.help-toggle:focus-visible,
	.help-toggle[aria-pressed='true'] {
		color: var(--bt-lightbox-chrome-hover-color, var(--accent));
		background: var(--bt-lightbox-chrome-hover-bg, var(--parchment-soft));
		outline: none;
	}

	.hint {
		position: absolute;
		/* Anchor below the zoom HUD on the right rail. zoom-hud sits
		   at top = space-3 + 2.5rem (close height) + space-2; its
		   own height is roughly 1.6rem (text-sm + padding). */
		top: calc(var(--space-3) + 2.5rem + var(--space-2) + 2rem + var(--space-2));
		right: var(--space-3);
		max-width: 18rem;
		padding: var(--space-2) var(--space-3);
		background: var(--bt-lightbox-chrome-bg, var(--vellum));
		color: var(--bt-lightbox-chrome-color, var(--ink-soft));
		border: 1px solid var(--bt-lightbox-chrome-border, var(--rule));
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		z-index: 2;
		animation: hint-in 200ms ease-out;
	}

	@keyframes hint-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.hint__rows {
		margin: 0;
		display: grid;
		gap: 0.4rem;
	}

	.hint__row {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-3);
		align-items: center;
	}

	.hint__row dt {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.hint__row dd {
		margin: 0;
		color: var(--ink-soft);
	}

	.hint kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.4rem;
		height: 1.4rem;
		padding: 0 0.35rem;
		background: var(--bt-lightbox-kbd-bg, var(--parchment));
		color: var(--bt-lightbox-kbd-color, var(--ink));
		border: 1px solid var(--bt-lightbox-chrome-border, var(--rule));
		border-radius: var(--radius-sm, 0.25rem);
		font-family: var(--bt-lightbox-kbd-font, var(--font-mono, ui-monospace, monospace));
		font-size: 0.75rem;
		line-height: 1;
		box-shadow: inset 0 -1px 0 var(--bt-lightbox-chrome-border, var(--rule));
	}

	.hint__touch {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--ink-soft);
		text-align: center;
	}
</style>
