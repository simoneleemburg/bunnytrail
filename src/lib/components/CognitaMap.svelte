<script lang="ts">
	/**
	 * The Alteria Cognita star-map.
	 *
	 * A stellar map of the Aureth system — the star at the left and
	 * eight planets on flat orbital arcs, ordered from innermost to
	 * outermost — and, off to the right across a wide gulf of
	 * interstellar space, the neighbouring Hollow Binary. The visible
	 * companion star turns around the Dark Companion, which gives off
	 * no light and is drawn as a void rather than a body.
	 *
	 * The map shows bodies in Mundus; it does not depict realms.
	 * Asthera, Nareth, Valdor and the rest are regions of Mundus
	 * defined by their Mundus Frame, not separate planes a body sits
	 * on. The cosmological frame belongs in the MundusMap above; this
	 * one is just the local sky.
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
		/**
		 * Optional moons. Drawn as a small orbit ellipse above the planet
		 * with a dot on it. No labels at this scale — the moon's entry is
		 * one click away on the planet's page.
		 */
		moons?: { slug?: string }[];
	};

	// Innermost → outermost. Three of the habitable-zone worlds (Bayurinda,
	// Sharazan, Nebelheim) have full entries; the rest are working names.
	const planets: Planet[] = [
		{ label: 'Vireth', note: 'scorched, too near the star', tentative: true },
		{ label: 'Zharos', note: 'barren, thin toxic air', tentative: true },
		{ label: 'Bayurinda', slug: 'bayurinda', note: 'ocean, drowned past' },
		{ label: 'Sharazan', slug: 'sharazan', note: 'fractured cluster' },
		{
			label: 'Nebelheim',
			slug: 'nebelheim',
			note: 'tectonic, ash-skies',
			moons: [{ slug: 'leyla' }]
		},
		{ label: 'Orenth', note: 'gas giant, anchor', tentative: true },
		{ label: 'Seryth', note: 'eccentric wanderer', tentative: true },
		{ label: 'Caldra', note: 'ringed, debris-edge', tentative: true }
	];

	// Layout constants — tweak by eye.
	const W = 1200;
	const H = 480;
	const AXIS_Y = 260; // the stellar axis

	// Cognita system occupies the left portion. Planets squeezed in tight
	// so the wider neighbourhood has room on the right.
	const STAR_X = 70;
	const PLANET_LEFT = 130;
	const PLANET_RIGHT = 600;
	const PLANET_STEP = (PLANET_RIGHT - PLANET_LEFT) / (planets.length - 1);

	// The Hollow Binary lives in the right portion of the map, beyond
	// a wide gulf of empty interstellar space.
	const VISIBLE_COMPANION_X = 970;
	const DARK_COMPANION_X = 1080;
	const BINARY_CENTER_X = (VISIBLE_COMPANION_X + DARK_COMPANION_X) / 2;
	const BINARY_ORBIT_RX = (DARK_COMPANION_X - VISIBLE_COMPANION_X) / 2;
	const BINARY_ORBIT_RY = BINARY_ORBIT_RX * 0.3;

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
		<title id="cognita-title">Alteria Cognita and the wider stellar neighbourhood</title>
		<desc id="cognita-desc">
			A stellar map of the Aureth system — eight planets ranged outward from their star — and, to
			the right across the long gulf of interstellar space, the neighbouring Hollow Binary: a
			visible companion star orbiting an unresolved body, the Dark Companion.
		</desc>

		<defs>
			<!-- Fog-of-war washes: dense at the corners, thinning where the
			     two known systems sit. The Aureth system gets the larger
			     pocket; the Hollow Binary a tighter one. -->
			<radialGradient id="cognita-fog-aureth" cx="28%" cy="54%" r="38%">
				<stop offset="0%" stop-color="var(--ink)" stop-opacity="0" />
				<stop offset="100%" stop-color="var(--ink)" stop-opacity="0.65" />
			</radialGradient>
			<radialGradient id="cognita-fog-binary" cx="84%" cy="54%" r="20%">
				<stop offset="0%" stop-color="var(--ink)" stop-opacity="0" />
				<stop offset="100%" stop-color="var(--ink)" stop-opacity="0.65" />
			</radialGradient>
		</defs>

		<!-- Scattered star-field as ambient texture. Same deterministic
		     PRNG pattern as the clusters map, scaled to this canvas. -->
		<g class="stars" aria-hidden="true">
			{#each Array.from({ length: 180 }, (_, i) => i) as i (i)}
				{@const seed = i * 9301 + 49297}
				{@const x = (seed * 233 + 31) % W}
				{@const y = (seed * 1117 + 7) % H}
				{@const r = ((seed * 71) % 10) / 10 + 0.3}
				<circle cx={x} cy={y} {r} fill="var(--parchment)" fill-opacity="0.55" />
			{/each}
		</g>

		<!-- Fog of war: dark wash that thins around each known system. -->
		<rect x="0" y="0" width={W} height={H} fill="url(#cognita-fog-aureth)" />
		<rect x="0" y="0" width={W} height={H} fill="url(#cognita-fog-binary)" />

		<!-- ───────── The local sky ─────────────────────────────────── -->
		<g class="asthera">
			<!-- The horizontal axis: continuous across the whole sky,
			     with a faint break to mark the long gulf between systems. -->
			<line class="axis" x1={STAR_X + 20} y1={AXIS_Y} x2={PLANET_RIGHT + 30} y2={AXIS_Y} />
			<line
				class="axis axis-gulf"
				x1={PLANET_RIGHT + 30}
				y1={AXIS_Y}
				x2={VISIBLE_COMPANION_X - 60}
				y2={AXIS_Y}
			/>
			<line
				class="axis"
				x1={VISIBLE_COMPANION_X - 60}
				y1={AXIS_Y}
				x2={DARK_COMPANION_X + 50}
				y2={AXIS_Y}
			/>

			<!-- The Cognita star's orbital arcs, one per planet. -->
			{#each planets as p, i}
				{@const r = planetX(i) - STAR_X}
				<ellipse class="orbit" cx={STAR_X} cy={AXIS_Y} rx={r} ry={r * 0.08} />
			{/each}

			<!-- Aureth, the star at the centre of the system. -->
			<g class="star" transform={`translate(${STAR_X} ${AXIS_Y})`}>
				<circle class="star-glow" r="20" />
				<circle class="star-body" r="9" />
				<a href="/aurethia/places/celestial/aureth-system/aureth">
					<text class="star-label" y="40" text-anchor="middle">Aureth</text>
				</a>
			</g>

			<!-- The Cognita planets. -->
			{#each planets as p, i}
				{@const cx = planetX(i)}
				<g class="planet" class:tentative={p.tentative} transform={`translate(${cx} ${AXIS_Y})`}>
					{#if p.moons}
						<!-- Small moon orbit + dot(s). Drawn under the planet body
						     so the body sits cleanly on top; dot offset above-left
						     so it doesn't collide with the label or the orbital arc. -->
						{#each p.moons as m, mi}
							<ellipse class="moon-orbit" cx="0" cy="0" rx="11" ry="3.5" />
							{@const dx = -8 + mi * 4}
							{@const dy = -2.5}
							{#if m.slug}
								<a
									href={`/aurethia/places/celestial/aureth-system/${p.slug}/${m.slug}`}
									aria-label={`Moon of ${p.label}`}
								>
									<circle class="moon-body" cx={dx} cy={dy} r="2" />
								</a>
							{:else}
								<circle class="moon-body" cx={dx} cy={dy} r="2" />
							{/if}
						{/each}
					{/if}
					<circle class="planet-body" r="5" />
					{#if p.slug}
						<a href={`/aurethia/places/celestial/aureth-system/${p.slug}`}>
							<text class="planet-label" y="22" text-anchor="middle">{p.label}</text>
						</a>
					{:else}
						<text class="planet-label" y="22" text-anchor="middle">{p.label}</text>
					{/if}
					{#if p.note}
						<text class="planet-note" y="37" text-anchor="middle">{p.note}</text>
					{/if}
				</g>
			{/each}

			<!-- The long gulf between systems. A faint label sits on the axis. -->
			<text
				class="gulf-label"
				x={(PLANET_RIGHT + VISIBLE_COMPANION_X) / 2}
				y={AXIS_Y - 14}
				text-anchor="middle"
			>
				· · · the long gulf · · ·
			</text>
			<text
				class="gulf-sublabel"
				x={(PLANET_RIGHT + VISIBLE_COMPANION_X) / 2}
				y={AXIS_Y + 22}
				text-anchor="middle"
			>
				interstellar space, not to scale
			</text>

			<!-- The Hollow Binary: a visible companion star orbiting an
			     unresolved body, the Dark Companion. -->
			<g class="binary">
				<!-- The orbit the visible companion traces, around the
				     midpoint of the pair. The Dark Companion is where the
				     orbit's far focus would be — drawn as a void. -->
				<ellipse
					class="binary-orbit"
					cx={BINARY_CENTER_X}
					cy={AXIS_Y}
					rx={BINARY_ORBIT_RX}
					ry={BINARY_ORBIT_RY}
				/>

				<!-- The visible companion star. -->
				<g class="star binary-star" transform={`translate(${VISIBLE_COMPANION_X} ${AXIS_Y})`}>
					<circle class="star-glow" r="14" />
					<circle class="star-body" r="6" />
					<text class="binary-label" y="-24" text-anchor="middle">visible companion</text>
				</g>

				<!-- The Dark Companion: drawn as a dashed empty circle,
				     a hollow where a body should be. Linked to its entry. -->
				<a href="/aurethia/places/celestial/hollow-binary/the-dark-companion">
					<g class="dark-companion" transform={`translate(${DARK_COMPANION_X} ${AXIS_Y})`}>
						<circle class="dark-halo" r="22" />
						<circle class="dark-ring" r="11" />
						<text class="dark-label" y="40" text-anchor="middle">The Dark Companion</text>
						<text class="dark-sublabel" y="55" text-anchor="middle">
							unresolved; visible only by what it does
						</text>
					</g>
				</a>

				<text class="system-label" x={BINARY_CENTER_X} y={AXIS_Y + 90} text-anchor="middle">
					the Hollow Binary
				</text>
			</g>
		</g>
	</svg>

	<figcaption>
		Alteria Cognita's eight planets ranged outward from
		<a href="/aurethia/places/celestial/aureth-system/aureth">Aureth</a>, and — across the long gulf
		of interstellar space — the neighbouring Hollow Binary, turning around something the eye cannot
		resolve:
		<a href="/aurethia/places/celestial/hollow-binary/the-dark-companion">the Dark Companion</a>.
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
		max-width: 64rem;
		margin: 0 auto;
		background: var(--ink);
		border-radius: 2px;
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

	/* ── The local sky: parchment-on-ink, cartographic register ─ */
	.axis {
		stroke: var(--parchment);
		stroke-width: 0.75;
		opacity: 0.35;
	}

	.axis-gulf {
		stroke-dasharray: 1 6;
		opacity: 0.2;
	}

	.orbit {
		fill: none;
		stroke: var(--parchment);
		stroke-width: 0.5;
		opacity: 0.25;
	}

	.star-glow {
		fill: var(--accent);
		opacity: 0.45;
	}

	.star-body {
		fill: var(--accent-soft);
	}

	.star-label {
		font-family: var(--font-display);
		font-size: 13px;
		font-style: italic;
		fill: var(--parchment);
		fill-opacity: 0.75;
	}

	.planet-body {
		fill: var(--parchment);
	}

	.moon-orbit {
		fill: none;
		stroke: var(--parchment);
		stroke-width: 0.4;
		opacity: 0.3;
	}

	.moon-body {
		fill: var(--parchment);
		opacity: 0.7;
	}

	.planet a:hover ~ .moon-body,
	.moon-body:hover {
		fill: var(--accent-soft);
		opacity: 1;
	}

	.planet.tentative .planet-body {
		fill: var(--parchment);
		opacity: 0.5;
	}

	.planet.tentative .planet-label {
		font-style: italic;
		fill: var(--parchment);
		fill-opacity: 0.55;
	}

	.planet-label {
		font-family: var(--font-display);
		font-size: 13px;
		fill: var(--parchment);
		letter-spacing: 0.02em;
	}

	.planet a:hover .planet-label {
		fill: var(--accent-soft);
	}

	.planet-note {
		font-family: var(--font-serif);
		font-size: 10px;
		font-style: italic;
		fill: var(--parchment);
		fill-opacity: 0.5;
	}

	/* ── The long gulf between systems ────────────────────────── */
	.gulf-label {
		font-family: var(--font-serif);
		font-size: 11px;
		font-style: italic;
		fill: var(--parchment);
		fill-opacity: 0.55;
		letter-spacing: 0.1em;
	}

	.gulf-sublabel {
		font-family: var(--font-serif);
		font-size: 10px;
		font-style: italic;
		fill: var(--parchment);
		fill-opacity: 0.4;
	}

	/* ── The Hollow Binary ────────────────────────────────────── */
	.binary-orbit {
		fill: none;
		stroke: var(--parchment);
		stroke-width: 0.5;
		stroke-dasharray: 2 3;
		opacity: 0.35;
	}

	.binary-label {
		font-family: var(--font-serif);
		font-size: 10px;
		font-style: italic;
		fill: var(--parchment);
		fill-opacity: 0.55;
	}

	.system-label {
		font-family: var(--font-display);
		font-size: 13px;
		font-style: italic;
		fill: var(--parchment);
		fill-opacity: 0.7;
		font-variant: small-caps;
		letter-spacing: 0.08em;
	}

	/* The Dark Companion: a hollow where a body should be —
	   now a void blacker than the surrounding dark, ringed by a
	   faint dashed outline so the eye registers absence. */
	.dark-halo {
		fill: none;
		stroke: var(--parchment);
		stroke-width: 0.5;
		stroke-dasharray: 1 4;
		opacity: 0.35;
	}

	.dark-ring {
		fill: #000;
		stroke: var(--parchment);
		stroke-width: 0.9;
		stroke-dasharray: 3 2;
		stroke-opacity: 0.6;
	}

	.dark-label {
		font-family: var(--font-display);
		font-size: 13px;
		fill: var(--parchment);
		letter-spacing: 0.03em;
	}

	.dark-sublabel {
		font-family: var(--font-serif);
		font-size: 10px;
		font-style: italic;
		fill: var(--parchment);
		fill-opacity: 0.55;
	}

	.dark-companion:hover .dark-label,
	.dark-companion:hover .dark-ring {
		stroke: var(--accent-soft);
	}

	.dark-companion:hover .dark-label {
		fill: var(--accent-soft);
	}
</style>
