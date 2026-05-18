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
	 * The map is zoomed out far enough that the neighbouring Hollow
	 * Binary system is visible to the right of Cognita — its visible
	 * companion star, and the empty orbit around which that star
	 * turns. The body at the centre of that empty orbit is the Dark
	 * Companion, which gives off no visible light and is not drawn
	 * solidly.
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
	const H = 600;
	const AXIS_Y = 420; // Asthera axis
	const NARETH_Y = 160; // Nareth overlay band centerline

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
			A diagram showing Aureth and its eight planets of Alteria Cognita on the material plane of
			Asthera, with the same bodies echoed on the resonant overlay of Nareth above. To the right,
			across the long gulf of interstellar space, the neighbouring Hollow Binary is shown — a
			visible companion star orbiting an unresolved body, the Dark Companion.
		</desc>

		<!-- ───────── Nareth: resonant overlay ──────────────────────── -->
		<g class="nareth">
			<!-- The arching boundary of Nareth: a gentle curve above the bodies. -->
			<path
				class="nareth-arc"
				d={`M ${STAR_X - 30} ${NARETH_Y + 80}
				    Q ${W / 2} ${NARETH_Y - 130}, ${DARK_COMPANION_X + 60} ${NARETH_Y + 80}`}
			/>
			<!-- Companion arc, faint, beneath -->
			<path
				class="nareth-arc nareth-arc-inner"
				d={`M ${STAR_X} ${NARETH_Y + 90}
				    Q ${W / 2} ${NARETH_Y - 70}, ${DARK_COMPANION_X + 30} ${NARETH_Y + 90}`}
			/>

			<!-- Sigil + label for Nareth -->
			<text class="realm-sigil" x={W / 2} y={NARETH_Y - 70} text-anchor="middle">🜁</text>
			<text class="realm-name" x={W / 2} y={NARETH_Y - 40} text-anchor="middle">Nareth</text>
			<text class="realm-caption" x={W / 2} y={NARETH_Y - 22} text-anchor="middle">
				the resonant
			</text>

			<!-- Ghost-points: each Cognita planet's echo on Nareth. -->
			{#each planets as p, i}
				{@const cx = planetX(i)}
				<circle class="nareth-point" {cx} cy={NARETH_Y + 40} r="3.5" />
			{/each}

			<!-- Ghost-points for the binary: the visible companion echoes
			     cleanly; the Dark Companion's echo is a void, drawn as a
			     small dashed ring rather than a dot. -->
			<circle class="nareth-point" cx={VISIBLE_COMPANION_X} cy={NARETH_Y + 40} r="3.5" />
			<circle class="nareth-void-point" cx={DARK_COMPANION_X} cy={NARETH_Y + 40} r="6" />
		</g>

		<!-- ───────── Resonance threads: Asthera ↔ Nareth ───────────── -->
		<g class="threads">
			{#each planets as p, i}
				{@const cx = planetX(i)}
				<line class="thread" x1={cx} y1={NARETH_Y + 40} x2={cx} y2={AXIS_Y} />
			{/each}
			<line
				class="thread"
				x1={VISIBLE_COMPANION_X}
				y1={NARETH_Y + 40}
				x2={VISIBLE_COMPANION_X}
				y2={AXIS_Y}
			/>
			<line
				class="thread thread-void"
				x1={DARK_COMPANION_X}
				y1={NARETH_Y + 40}
				x2={DARK_COMPANION_X}
				y2={AXIS_Y}
			/>
		</g>

		<!-- ───────── Asthera: the material plane ───────────────────── -->
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
				<a href="/cosmology/celestial-bodies/stars/aureth">
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
								<a href={`/places/${m.slug}`} aria-label={`Moon of ${p.label}`}>
									<circle class="moon-body" cx={dx} cy={dy} r="2" />
								</a>
							{:else}
								<circle class="moon-body" cx={dx} cy={dy} r="2" />
							{/if}
						{/each}
					{/if}
					<circle class="planet-body" r="5" />
					{#if p.slug}
						<a href={`/places/${p.slug}`}>
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
				<a href="/cosmology/celestial-bodies/black-holes/the-dark-companion">
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

			<!-- Sigil + label for Asthera -->
			<text class="realm-sigil" x={W / 2} y={AXIS_Y + 130} text-anchor="middle">🜃</text>
			<text class="realm-name" x={W / 2} y={AXIS_Y + 158} text-anchor="middle">Asthera</text>
			<text class="realm-caption" x={W / 2} y={AXIS_Y + 176} text-anchor="middle">
				the material
			</text>
		</g>
	</svg>

	<figcaption>
		Two planes, one cosmos — and not the whole of it. Alteria Cognita's eight planets persist as
		form on <a href="/cosmology/asthera">Asthera</a> and resonate as identity, memory and meaning on
		<a href="/cosmology/nareth">Nareth</a>. Across the long gulf, the neighbouring Hollow Binary
		turns around something the eye cannot resolve:
		<a href="/cosmology/celestial-bodies/black-holes/the-dark-companion">the Dark Companion</a>.
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

	.nareth-void-point {
		fill: none;
		stroke: var(--ink-faint);
		stroke-width: 0.7;
		stroke-dasharray: 2 2;
		opacity: 0.6;
	}

	/* ── Threads connecting twin bodies between the planes ────── */
	.thread {
		stroke: var(--ink-faint);
		stroke-width: 0.5;
		stroke-dasharray: 1 4;
		opacity: 0.55;
	}

	.thread-void {
		opacity: 0.3;
		stroke-dasharray: 1 6;
	}

	/* ── Asthera: solid ink-on-parchment ──────────────────────── */
	.axis {
		stroke: var(--rule);
		stroke-width: 0.75;
	}

	.axis-gulf {
		stroke-dasharray: 1 6;
		opacity: 0.5;
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
		font-size: 13px;
		font-style: italic;
		fill: var(--ink-faint);
	}

	.planet-body {
		fill: var(--ink);
	}

	.moon-orbit {
		fill: none;
		stroke: var(--rule);
		stroke-width: 0.4;
		opacity: 0.7;
	}

	.moon-body {
		fill: var(--ink-soft);
	}

	.planet a:hover ~ .moon-body,
	.moon-body:hover {
		fill: var(--accent);
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
		font-size: 13px;
		fill: var(--ink);
		letter-spacing: 0.02em;
	}

	.planet a:hover .planet-label {
		fill: var(--accent);
	}

	.planet-note {
		font-family: var(--font-serif);
		font-size: 10px;
		font-style: italic;
		fill: var(--ink-faint);
	}

	/* ── The long gulf between systems ────────────────────────── */
	.gulf-label {
		font-family: var(--font-serif);
		font-size: 11px;
		font-style: italic;
		fill: var(--ink-faint);
		letter-spacing: 0.1em;
	}

	.gulf-sublabel {
		font-family: var(--font-serif);
		font-size: 10px;
		font-style: italic;
		fill: var(--ink-faint);
		opacity: 0.7;
	}

	/* ── The Hollow Binary ────────────────────────────────────── */
	.binary-orbit {
		fill: none;
		stroke: var(--rule);
		stroke-width: 0.5;
		stroke-dasharray: 2 3;
		opacity: 0.55;
	}

	.binary-label {
		font-family: var(--font-serif);
		font-size: 10px;
		font-style: italic;
		fill: var(--ink-faint);
	}

	.system-label {
		font-family: var(--font-display);
		font-size: 13px;
		font-style: italic;
		fill: var(--ink-soft);
		font-variant: small-caps;
		letter-spacing: 0.08em;
	}

	/* The Dark Companion: a hollow where a body should be. */
	.dark-halo {
		fill: none;
		stroke: var(--ink-faint);
		stroke-width: 0.5;
		stroke-dasharray: 1 4;
		opacity: 0.5;
	}

	.dark-ring {
		fill: var(--page);
		stroke: var(--ink-soft);
		stroke-width: 0.9;
		stroke-dasharray: 3 2;
	}

	.dark-label {
		font-family: var(--font-display);
		font-size: 13px;
		fill: var(--ink);
		letter-spacing: 0.03em;
	}

	.dark-sublabel {
		font-family: var(--font-serif);
		font-size: 10px;
		font-style: italic;
		fill: var(--ink-faint);
	}

	.dark-companion:hover .dark-label,
	.dark-companion:hover .dark-ring {
		stroke: var(--accent);
	}

	.dark-companion:hover .dark-label {
		fill: var(--accent);
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
