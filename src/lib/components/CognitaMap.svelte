<script lang="ts">
	/**
	 * The Alteria Cognita star-map.
	 *
	 * Two parallel planes:
	 *   • Asthera — the material plane, drawn as a horizontal axis with
	 *     the star at the left and eight planets on flat orbital arcs,
	 *     ordered from innermost to outermost.
	 *   • Nareth — the resonant plane, drawn as a translucent overlay
	 *     arching above. The same bodies exist there too, shown as
	 *     ghost-points connected to their Astheran twins by faint
	 *     vertical resonance threads.
	 *
	 * The map is deliberately hand-coded rather than data-driven: it's a
	 * one-of-a-kind drawing, not a generated diagram, and small visual
	 * adjustments belong in the SVG itself. The list of planets is a
	 * local constant; edit it here.
	 */

	type Planet = {
		/** Display label shown beneath the planet. */
		label: string;
		/** Optional entity slug under `places/`; if present, the label links. */
		slug?: string;
		/** Optional one-line note shown beneath the label on the material plane. */
		note?: string;
		/** True while the name is a working draft, not a final choice. */
		tentative?: boolean;
	};

	// Innermost → outermost. Three of the habitable-zone worlds (Bayurinda,
	// Nebelheim, Sharazan) have full entries; the rest are working names.
	const planets: Planet[] = [
		{ label: 'Vireth', note: 'scorched, too near the star', tentative: true },
		{ label: 'Zharos', note: 'barren, thin toxic air', tentative: true },
		{ label: 'Bayurinda', slug: 'bayurinda', note: 'ocean, dual moons' },
		{ label: 'Nebelheim', slug: 'nebelheim', note: 'volcanic, tectonic' },
		{ label: 'Sharazan', slug: 'sharazan', note: 'cluster, crossroads' },
		{ label: 'Orenth', note: 'gas giant, anchor', tentative: true },
		{ label: 'Seryth', note: 'eccentric wanderer', tentative: true },
		{ label: 'Caldra', note: 'ringed, debris-edge', tentative: true }
	];

	// Layout constants — tweak by eye.
	const W = 1000;
	const H = 540;
	const STAR_X = 80;
	const AXIS_Y = 380; // Asthera axis
	const NARETH_Y = 150; // Nareth overlay band centerline
	const PLANET_LEFT = 180;
	const PLANET_RIGHT = W - 70;
	const PLANET_STEP = (PLANET_RIGHT - PLANET_LEFT) / (planets.length - 1);

	function planetX(i: number): number {
		return PLANET_LEFT + i * PLANET_STEP;
	}
</script>

<figure class="cognita-map">
	<svg
		viewBox={`0 0 ${W} ${H}`}
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		aria-labelledby="cognita-title cognita-desc"
	>
		<title id="cognita-title">Alteria Cognita — the mapped territory</title>
		<desc id="cognita-desc">
			A diagram showing the star and its eight planets on the material plane of Asthera, with the
			same bodies echoed on the resonant overlay of Nareth above.
		</desc>

		<!-- ───────── Nareth: resonant overlay ──────────────────────── -->
		<g class="nareth">
			<!-- The arching boundary of Nareth: a gentle curve above the bodies. -->
			<path
				class="nareth-arc"
				d={`M ${PLANET_LEFT - 60} ${NARETH_Y + 80}
				    Q ${W / 2} ${NARETH_Y - 110}, ${PLANET_RIGHT + 40} ${NARETH_Y + 80}`}
			/>
			<!-- Companion arc, faint, beneath -->
			<path
				class="nareth-arc nareth-arc-inner"
				d={`M ${PLANET_LEFT - 30} ${NARETH_Y + 90}
				    Q ${W / 2} ${NARETH_Y - 60}, ${PLANET_RIGHT + 10} ${NARETH_Y + 90}`}
			/>

			<!-- Sigil + label for Nareth -->
			<text class="realm-sigil" x={W / 2} y={NARETH_Y - 60} text-anchor="middle">🜁</text>
			<text class="realm-name" x={W / 2} y={NARETH_Y - 30} text-anchor="middle">Nareth</text>
			<text class="realm-caption" x={W / 2} y={NARETH_Y - 12} text-anchor="middle">
				the resonant
			</text>

			<!-- Ghost-points: each planet's echo on Nareth. -->
			{#each planets as p, i}
				{@const cx = planetX(i)}
				<circle class="nareth-point" {cx} cy={NARETH_Y + 40} r="4" />
			{/each}
		</g>

		<!-- ───────── Resonance threads: Asthera ↔ Nareth ───────────── -->
		<g class="threads">
			{#each planets as p, i}
				{@const cx = planetX(i)}
				<line class="thread" x1={cx} y1={NARETH_Y + 40} x2={cx} y2={AXIS_Y} />
			{/each}
		</g>

		<!-- ───────── Asthera: the material plane ───────────────────── -->
		<g class="asthera">
			<!-- The horizontal axis of the material plane. -->
			<line class="axis" x1={STAR_X + 30} y1={AXIS_Y} x2={W - 30} y2={AXIS_Y} />

			<!-- Faint orbital arcs, one per planet, drawn as wide flat ellipses
			     centered on the star. -->
			{#each planets as p, i}
				{@const r = planetX(i) - STAR_X}
				<ellipse class="orbit" cx={STAR_X} cy={AXIS_Y} rx={r} ry={r * 0.08} />
			{/each}

			<!-- The star. -->
			<g class="star" transform={`translate(${STAR_X} ${AXIS_Y})`}>
				<circle class="star-glow" r="22" />
				<circle class="star-body" r="11" />
				<text class="star-label" y="44" text-anchor="middle">the star</text>
			</g>

			<!-- The planets. -->
			{#each planets as p, i}
				{@const cx = planetX(i)}
				<g class="planet" class:tentative={p.tentative} transform={`translate(${cx} ${AXIS_Y})`}>
					<circle class="planet-body" r="6" />
					{#if p.slug}
						<a href={`/places/${p.slug}`}>
							<text class="planet-label" y="26" text-anchor="middle">{p.label}</text>
						</a>
					{:else}
						<text class="planet-label" y="26" text-anchor="middle">{p.label}</text>
					{/if}
					{#if p.note}
						<text class="planet-note" y="42" text-anchor="middle">{p.note}</text>
					{/if}
				</g>
			{/each}

			<!-- Sigil + label for Asthera -->
			<text class="realm-sigil" x={W / 2} y={AXIS_Y + 90} text-anchor="middle">🜃</text>
			<text class="realm-name" x={W / 2} y={AXIS_Y + 118} text-anchor="middle">Asthera</text>
			<text class="realm-caption" x={W / 2} y={AXIS_Y + 136} text-anchor="middle">
				the material
			</text>
		</g>
	</svg>

	<figcaption>
		Two planes, one cosmos. The star and its eight planets persist as form on
		<a href="/concepts/asthera">Asthera</a>, and resonate as identity, memory and meaning on
		<a href="/concepts/nareth">Nareth</a>.
	</figcaption>
</figure>

<style>
	.cognita-map {
		margin: 0;
		padding: var(--space-6) 0;
	}

	.cognita-map svg {
		display: block;
		width: 100%;
		height: auto;
		max-width: 56rem;
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

	figcaption a {
		color: var(--ink);
		text-decoration: none;
		border-bottom: 1px solid var(--rule);
	}

	figcaption a:hover {
		color: var(--accent);
	}

	/* ── Nareth: drawn as a faint, vellum-toned arc up top ────── */
	.nareth-arc {
		fill: none;
		stroke: var(--ink-faint);
		stroke-width: 0.75;
		opacity: 0.55;
	}

	.nareth-arc-inner {
		opacity: 0.3;
		stroke-dasharray: 2 3;
	}

	.nareth-point {
		fill: var(--ink-faint);
		opacity: 0.65;
	}

	/* ── Threads connecting twin bodies between the planes ────── */
	.thread {
		stroke: var(--ink-faint);
		stroke-width: 0.5;
		stroke-dasharray: 1 4;
		opacity: 0.55;
	}

	/* ── Asthera: solid ink-on-parchment ──────────────────────── */
	.axis {
		stroke: var(--rule);
		stroke-width: 0.75;
	}

	.orbit {
		fill: none;
		stroke: var(--rule);
		stroke-width: 0.5;
		opacity: 0.7;
	}

	.star-glow {
		fill: var(--accent);
		opacity: 0.18;
	}

	.star-body {
		fill: var(--accent);
	}

	.star-label {
		font-family: var(--font-display);
		font-size: 14px;
		font-style: italic;
		fill: var(--ink-faint);
	}

	.planet-body {
		fill: var(--ink);
	}

	.planet.tentative .planet-body {
		fill: var(--ink-soft);
		opacity: 0.8;
	}

	.planet.tentative .planet-label {
		font-style: italic;
		fill: var(--ink-soft);
	}

	.planet-label {
		font-family: var(--font-display);
		font-size: 15px;
		fill: var(--ink);
		letter-spacing: 0.02em;
	}

	.planet a:hover .planet-label {
		fill: var(--accent);
	}

	.planet-note {
		font-family: var(--font-serif);
		font-size: 11px;
		font-style: italic;
		fill: var(--ink-faint);
	}

	/* ── Realm sigils & names ─────────────────────────────────── */
	.realm-sigil {
		font-size: 22px;
		fill: var(--ink-soft);
	}

	.realm-name {
		font-family: var(--font-display);
		font-size: 16px;
		font-variant: small-caps;
		letter-spacing: 0.12em;
		fill: var(--ink);
	}

	.realm-caption {
		font-family: var(--font-serif);
		font-size: 11px;
		font-style: italic;
		fill: var(--ink-faint);
	}
</style>
