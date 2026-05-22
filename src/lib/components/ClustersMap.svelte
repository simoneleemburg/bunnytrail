<script lang="ts">
	/**
	 * The clusters map.
	 *
	 * A galactic-register field showing the two charted clusters of
	 * Alteria Cognita — Aurethia and Earth — as small bright marks on
	 * a faint spiral-arm background, separated by a vast unmeasured
	 * gulf. Around and between them, a soft fog represents Alteria
	 * Incognita: the uncharted bulk of the universe.
	 *
	 * The map is deliberately not to scale and deliberately vague
	 * about absolute position. What it teaches is shape, not
	 * coordinates: two known fragments adrift in a much larger dark.
	 *
	 * Hand-coded, like the other maps. Small visual adjustments
	 * belong in the SVG itself.
	 */

	const W = 1200;
	const H = 480;

	// Cluster anchor points (left = Aurethia, right = Earth).
	const AURETHIA = { x: 360, y: 280 };
	const EARTH = { x: 880, y: 220 };
</script>

<figure class="clusters-map">
	<svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="clusters-title clusters-desc">
		<title id="clusters-title">The clusters of Alteria Cognita</title>
		<desc id="clusters-desc">
			A wide, dark field with a faint suggestion of spiral arms. Two small bright clusters are
			marked: Aurethia on the left and Earth on the right, with a vast unmeasured distance between
			them. The space around and between them is labelled Alteria Incognita — the uncharted bulk of
			the universe.
		</desc>

		<defs>
			<!-- Soft radial halo for each charted cluster. -->
			<radialGradient id="cluster-halo" cx="50%" cy="50%" r="50%">
				<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.55" />
				<stop offset="40%" stop-color="var(--accent)" stop-opacity="0.18" />
				<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
			</radialGradient>

			<!-- Fog-of-war: thick darkness everywhere, lifting where the clusters sit. -->
			<radialGradient id="fog-aurethia" cx="30%" cy="58%" r="22%">
				<stop offset="0%" stop-color="var(--ink)" stop-opacity="0" />
				<stop offset="100%" stop-color="var(--ink)" stop-opacity="0.7" />
			</radialGradient>
			<radialGradient id="fog-earth" cx="73%" cy="46%" r="20%">
				<stop offset="0%" stop-color="var(--ink)" stop-opacity="0" />
				<stop offset="100%" stop-color="var(--ink)" stop-opacity="0.7" />
			</radialGradient>
		</defs>

		<!-- Faint spiral-arm suggestion. Two broad sweeping bands. -->
		<g class="spiral-arms" aria-hidden="true">
			<path
				d="M -100 380 Q 300 200 700 240 T 1300 180"
				fill="none"
				stroke="var(--ink-soft)"
				stroke-width="80"
				stroke-opacity="0.06"
				stroke-linecap="round"
			/>
			<path
				d="M -100 420 Q 350 260 750 290 T 1300 230"
				fill="none"
				stroke="var(--ink-soft)"
				stroke-width="50"
				stroke-opacity="0.08"
				stroke-linecap="round"
			/>
			<path
				d="M -100 120 Q 400 280 800 220 T 1300 280"
				fill="none"
				stroke="var(--ink-soft)"
				stroke-width="60"
				stroke-opacity="0.05"
				stroke-linecap="round"
			/>
		</g>

		<!-- Background star scatter. -->
		<g class="stars" aria-hidden="true">
			{#each Array.from({ length: 140 }, (_, i) => i) as i (i)}
				{@const seed = i * 9301 + 49297}
				{@const x = (seed * 233 + 31) % W}
				{@const y = (seed * 1117 + 7) % H}
				{@const r = ((seed * 71) % 10) / 10 + 0.3}
				<circle cx={x} cy={y} {r} fill="var(--parchment)" fill-opacity="0.6" />
			{/each}
		</g>

		<!-- Fog of war: dark wash that thins around each known cluster. -->
		<rect x="0" y="0" width={W} height={H} fill="url(#fog-aurethia)" />
		<rect x="0" y="0" width={W} height={H} fill="url(#fog-earth)" />

		<!-- Alteria Incognita labels — scattered around the periphery. -->
		<g class="incognita">
			<text x="120" y="80" text-anchor="start">Alteria Incognita</text>
			<text x="120" y={H - 50} text-anchor="start">Alteria Incognita</text>
			<text x={W - 120} y="80" text-anchor="end">Alteria Incognita</text>
		</g>

		<!-- The vast-distance annotation between the two clusters. -->
		<g class="gulf">
			<line
				x1={AURETHIA.x + 80}
				y1={(AURETHIA.y + EARTH.y) / 2}
				x2={EARTH.x - 80}
				y2={(AURETHIA.y + EARTH.y) / 2}
				stroke="var(--ink-faint)"
				stroke-width="0.8"
				stroke-dasharray="2 6"
			/>
			<text
				x={(AURETHIA.x + EARTH.x) / 2}
				y={(AURETHIA.y + EARTH.y) / 2 - 12}
				text-anchor="middle"
				class="gulf-label"
			>
				vast distance, not to scale
			</text>
		</g>

		<!-- Aurethia cluster. -->
		<a href="/aurethia" class="cluster-link">
			<g class="cluster">
				<circle cx={AURETHIA.x} cy={AURETHIA.y} r="90" fill="url(#cluster-halo)" />
				<circle class="cluster-core" cx={AURETHIA.x} cy={AURETHIA.y} r="5" />
				<text class="cluster-label" x={AURETHIA.x} y={AURETHIA.y + 30} text-anchor="middle"
					>Aurethia</text
				>
			</g>
		</a>

		<!-- Earth cluster. -->
		<a href="/earth" class="cluster-link">
			<g class="cluster">
				<circle cx={EARTH.x} cy={EARTH.y} r="90" fill="url(#cluster-halo)" />
				<circle class="cluster-core" cx={EARTH.x} cy={EARTH.y} r="5" />
				<text class="cluster-label" x={EARTH.x} y={EARTH.y + 30} text-anchor="middle">Earth</text>
			</g>
		</a>
	</svg>

	<figcaption>
		Two charted clusters adrift in the dark. The galactic backdrop is suggestive, not surveyed; the
		distance between Aurethia and Earth is real but unmeasured. Everything else is
		<em>Alteria Incognita</em> — the part of the universe that has not yet been named.
	</figcaption>
</figure>

<style>
	.clusters-map {
		margin: 0;
		padding: var(--space-6) 0;
	}

	.clusters-map svg {
		display: block;
		width: 100%;
		height: auto;
		max-width: 50rem;
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

	figcaption em {
		font-style: italic;
		color: var(--ink);
	}

	.incognita text {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 26px;
		fill: var(--parchment);
		fill-opacity: 0.85;
		letter-spacing: 0.06em;
	}

	.gulf-label {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 13px;
		fill: var(--ink-faint);
	}

	.cluster-core {
		fill: var(--parchment);
		stroke: var(--accent);
		stroke-width: 1.5;
		transition:
			r 0.2s,
			stroke-width 0.2s;
	}

	.cluster-label {
		font-family: var(--font-display);
		font-size: 20px;
		fill: var(--parchment);
		font-style: italic;
		dominant-baseline: hanging;
	}

	.cluster-link {
		cursor: pointer;
	}

	.cluster-link:hover .cluster-core {
		r: 7;
		stroke-width: 2.5;
	}

	.cluster-link:hover .cluster-label {
		fill: var(--accent);
	}
</style>
