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
	 * closes.
	 *
	 * Keyboard / touch behavior is handled by the native `<dialog>`:
	 *  - Esc closes (default)
	 *  - clicks on the backdrop close (we wire that explicitly)
	 *  - pinch-zoom is enabled via `touch-action: pinch-zoom`
	 */
	import { onMount } from 'svelte';

	let dialog: HTMLDialogElement | null = $state(null);
	let stage: HTMLDivElement | null = $state(null);
	let captionText = $state('');

	onMount(() => {
		function onClick(event: MouseEvent) {
			const target = event.target as Element | null;
			const trigger = target?.closest('[data-bt-svg-expand]');
			if (!trigger) return;
			const figure = trigger.closest('figure.bt-inline-svg');
			if (!figure) return;
			const svg = figure.querySelector('svg');
			if (!svg || !dialog || !stage) return;

			event.preventDefault();
			const clone = svg.cloneNode(true) as SVGSVGElement;
			// Strip any width/height attributes that would lock the
			// clone to its inline rendered size; the lightbox sizes
			// it via CSS using the viewBox aspect ratio.
			clone.removeAttribute('width');
			clone.removeAttribute('height');
			clone.style.width = '100%';
			clone.style.height = '100%';

			// World CSS targets `.bt-inline-svg .foo` selectors and
			// relies on container queries via the figure wrapper.
			// Reproduce that context here so the cloned SVG renders
			// with the same fills, fonts (cqw-scaled to the lightbox
			// width), and chrome it has inline.
			const ctx = document.createElement('div');
			ctx.className = 'bt-inline-svg';
			ctx.appendChild(clone);
			stage.replaceChildren(ctx);
			const cap = figure.querySelector('figcaption');
			captionText = cap?.textContent?.trim() ?? '';
			dialog.showModal();
		}

		document.addEventListener('click', onClick);
		return () => document.removeEventListener('click', onClick);
	});

	function onDialogClick(event: MouseEvent) {
		// Close on backdrop click. The backdrop is the dialog
		// element itself; clicks on inner content bubble through
		// the inner wrapper which we test for here.
		if (event.target === dialog) dialog?.close();
	}

	function close() {
		dialog?.close();
	}
</script>

<dialog bind:this={dialog} class="bt-svg-lightbox" onclick={onDialogClick}>
	<div class="frame">
		<button type="button" class="close" onclick={close} aria-label="Close">✕</button>
		<div class="stage" bind:this={stage}></div>
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
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		touch-action: pinch-zoom;
		overflow: auto;
	}

	.stage :global(.bt-inline-svg) {
		/* Cap the lightbox figure at the same width as the inline
		   figure. World CSS uses `cqw` for in-SVG font sizes; if
		   the container grew to viewport-width here, labels would
		   scale proportionally and collide with each other (the
		   labels' viewBox positions were authored for a specific
		   absolute size). Keeping the container width consistent
		   means the lightbox is a "focused" view: same size on
		   desktop, much bigger than the cramped inline preview on
		   mobile. */
		max-width: var(--figure-max-width);
		max-height: 100%;
		width: 100%;
		height: 100%;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.stage :global(.bt-inline-svg svg) {
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
	}

	/* The inline figure's expand button leaks through the clone;
	   hide it inside the lightbox. */
	.stage :global(.bt-inline-svg__expand) {
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
		z-index: 1;
	}

	.close:hover,
	.close:focus-visible {
		color: var(--accent);
		background: var(--parchment-soft);
		outline: none;
	}
</style>
