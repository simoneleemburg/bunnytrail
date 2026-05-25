<script lang="ts">
	/**
	 * The Mundus triangle — the cosmological map.
	 *
	 * Renders a pre-baked SVG produced by scripts/bake-mundus-map.js.
	 * The SVG uses CSS class names; styles below apply to the injected markup.
	 *
	 * The `svg` prop is the raw SVG string, passed down from a server load
	 * function so it can eventually be sourced from the alteria_world assets
	 * directory rather than the bundled src/lib/assets file.
	 */

	interface Props {
		/** Raw SVG markup — the full <svg>…</svg> string. */
		svg: string;
	}

	const { svg }: Props = $props();
</script>

<figure class="mundus-map">
	{@html svg}

	<figcaption>
		The cosmology as a contained triangular space, held between three related Cardinals. The faint
		topographical rings show how the bounds are approached: bunched tighter and tighter toward the
		edges and corners, because no ordinary thing in Mundus can fully reach any of them.
	</figcaption>
</figure>

<style>
	.mundus-map {
		margin: 0;
		padding: var(--space-6) 0;
	}

	.mundus-map :global(svg) {
		display: block;
		width: 100%;
		height: auto;
		max-width: 50rem;
		margin: 0 auto;
	}

	figcaption {
		max-width: var(--prose-max);
		margin: var(--space-5) auto 0;
		text-align: center;
		font-style: italic;
		color: var(--ink-soft);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
	}

	/* ── Mundus interior: a soft inhabited fill ───────────────── */
	.mundus-map :global(.mundus-fill) {
		fill: var(--accent);
		fill-opacity: 0.05;
		stroke: none;
		transition: fill-opacity 0.2s;
	}

	.mundus-map :global(.mundus-link:hover .mundus-fill) {
		fill-opacity: 0.09;
	}

	/* ── Contours: faint topo lines showing the asymptotic shape ─ */
	.mundus-map :global(.contours path) {
		fill: none;
		stroke: var(--ink-soft);
		stroke-width: 0.6;
		stroke-opacity: 0.45;
		pointer-events: none;
	}

	/* ── Triangle outline: the boundary the bounds enclose ────── */
	.mundus-map :global(.triangle-outline) {
		fill: none;
		stroke: var(--ink-soft);
		stroke-width: 1.25;
		pointer-events: none;
	}

	/* ── Axes: interior lines pointing to each Cardinal ───────── */
	.mundus-map :global(.axis) {
		stroke: var(--ink-faint);
		stroke-width: 1;
		stroke-dasharray: 4 3;
		fill: none;
	}

	.mundus-map :global(.axis-tip) {
		fill: var(--ink-soft);
	}

	.mundus-map :global(.axis-link) {
		cursor: pointer;
	}

	.mundus-map :global(.axis-name) {
		font-family: var(--font-display);
		font-size: 15px;
		font-variant: small-caps;
		letter-spacing: 0.14em;
		fill: var(--ink);
		transition: fill 0.2s;
	}

	.mundus-map :global(.axis-link:hover .axis-name) {
		fill: var(--accent);
	}

	/* ── Horizons: edge labels, sitting outside the triangle ──── */
	.mundus-map :global(.horizon-link) {
		cursor: pointer;
	}

	.mundus-map :global(.horizon-name) {
		font-family: var(--font-display);
		font-size: 13px;
		font-variant: small-caps;
		letter-spacing: 0.14em;
		fill: var(--ink-soft);
		transition: fill 0.2s;
	}

	.mundus-map :global(.horizon-link:hover .horizon-name) {
		fill: var(--accent);
	}

	/* Sigil glyphs (Greek letters, struck or not) keep their literal
	   case — small-caps would turn σ into Σ etc. and break the
	   notation. Slightly larger so they read clearly. */
	.mundus-map :global(.sigil-glyph) {
		font-variant: normal;
		letter-spacing: 0;
		font-size: 1.15em;
	}

	/* ── Cardinals: corners ───────────────────────────────────── */
	.mundus-map :global(.cardinal-sigil) {
		font-size: 26px;
		fill: var(--ink-soft);
	}

	.mundus-map :global(.cardinal-name) {
		font-family: var(--font-display);
		font-size: 16px;
		font-variant: small-caps;
		letter-spacing: 0.12em;
		fill: var(--ink);
		transition: fill 0.2s;
	}

	.mundus-map :global(.cardinal-link) {
		cursor: pointer;
	}

	.mundus-map :global(.cardinal-link:hover .cardinal-name),
	.mundus-map :global(.cardinal-link:hover .cardinal-sigil) {
		fill: var(--accent);
	}

	/* ── Equilibrium label at the centroid ────────────────────── */
	.mundus-map :global(.equilibrium-link) {
		cursor: pointer;
	}

	.mundus-map :global(.equilibrium-sigil) {
		font-family: var(--font-display);
		font-size: 30px;
		fill: var(--ink);
		transition: fill 0.2s;
	}

	.mundus-map :global(.equilibrium-name) {
		font-family: var(--font-display);
		font-size: 14px;
		font-variant: small-caps;
		letter-spacing: 0.14em;
		fill: var(--ink-soft);
		transition: fill 0.2s;
	}

	.mundus-map :global(.equilibrium-link:hover .equilibrium-sigil),
	.mundus-map :global(.equilibrium-link:hover .equilibrium-name) {
		fill: var(--accent);
	}

	/* ── Mundus label, lower interior ─────────────────────────── */
	.mundus-map :global(.mundus-label-link) {
		cursor: pointer;
	}

	.mundus-map :global(.mundus-label-link:hover .cardinal-sigil),
	.mundus-map :global(.mundus-label-link:hover .cardinal-name) {
		fill: var(--accent);
	}
</style>
