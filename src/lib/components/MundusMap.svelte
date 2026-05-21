<script lang="ts">
	/**
	 * The Mundus triangle — the cosmological map.
	 *
	 * Three horizons at the corners, three axes drawn as lines from
	 * the interior outward toward each corner, Mundus filling the
	 * interior as the inhabited middle.
	 *
	 * The geometry is barycentric: any point inside the triangle is a
	 * weighted blend of the three corners, and the three axis values
	 * are not independent — they sum to a constant. This image is the
	 * shape of that constraint.
	 *
	 *   - Corners are horizons: the Source (🜁), the Self (🜄), Chaos (🜂).
	 *     Each is an asymptotic limit, never reached.
	 *   - Axes are interior lines pointing toward each horizon. Each
	 *     axis measures distance/closeness to the horizon it points at:
	 *     Resonance → Source, Recollection → Self, Dissolution → Chaos.
	 *   - Interior is Mundus (🜃) — the inhabited middle.
	 *
	 * Layout: equilateral, point-up.
	 *   - Source at the apex (air, rising).
	 *   - Self at bottom-left (water).
	 *   - Chaos at bottom-right (fire).
	 *
	 * Like CognitaMap, this is hand-coded and one-of-a-kind. Adjust
	 * geometry by eye.
	 */

	const W = 1000;
	const H = 760;

	// Equilateral triangle, point-up. Side length chosen by eye.
	const SIDE = 640;
	const CX = W / 2;
	const TOP_Y = 110;
	const BOT_Y = TOP_Y + (SIDE * Math.sqrt(3)) / 2;

	// Corners
	const SOURCE = { x: CX, y: TOP_Y };
	const SELF = { x: CX - SIDE / 2, y: BOT_Y };
	const CHAOS = { x: CX + SIDE / 2, y: BOT_Y };

	// Interior centroid (Mundus label sits here; axes converge here)
	const MID = {
		x: (SOURCE.x + SELF.x + CHAOS.x) / 3,
		y: (SOURCE.y + SELF.y + CHAOS.y) / 3
	};

	// Axis lines: from a point near (but not at) the centroid, outward
	// toward each corner, stopping short of the corner. Each axis points
	// toward the horizon it measures distance from.
	//
	// The inner end (near the centroid) is pulled back so it doesn't
	// collide with the Mundus label. The outer end stops short of the
	// corner so the horizon's sigil + name has room. The line ends in
	// a small dot, and the axis name sits just inside the dot.
	function axisLine(corner: { x: number; y: number }) {
		const innerT = 0.22; // start 22% of the way from centroid toward corner
		const outerT = 0.78; // dot at 78%
		return {
			x1: MID.x + (corner.x - MID.x) * innerT,
			y1: MID.y + (corner.y - MID.y) * innerT,
			x2: MID.x + (corner.x - MID.x) * outerT,
			y2: MID.y + (corner.y - MID.y) * outerT
		};
	}

	// Label position along each axis: between centroid and the outer
	// dot, so the dot is the outermost mark and the word sits inside it
	// toward the centroid. Keeps labels well clear of the outline.
	function axisLabelPos(corner: { x: number; y: number }) {
		const t = 0.55; // 55% of the way from centroid toward corner
		return {
			x: MID.x + (corner.x - MID.x) * t,
			y: MID.y + (corner.y - MID.y) * t
		};
	}

	const RES_LINE = axisLine(SOURCE);
	const REC_LINE = axisLine(SELF);
	const DIS_LINE = axisLine(CHAOS);

	const RES_LABEL = axisLabelPos(SOURCE);
	const REC_LABEL = axisLabelPos(SELF);
	const DIS_LABEL = axisLabelPos(CHAOS);

	// Path for the triangle outline. Also serves as the Mundus
	// click target via the interior fill.
	const triPath = `M ${SOURCE.x} ${SOURCE.y} L ${SELF.x} ${SELF.y} L ${CHAOS.x} ${CHAOS.y} Z`;
</script>

<figure class="mundus-map">
	<svg
		viewBox={`0 0 ${W} ${H}`}
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		aria-labelledby="mundus-title mundus-desc"
	>
		<title id="mundus-title"
			>The Mundus triangle: three horizons, three axes, the inhabited middle</title
		>
		<desc id="mundus-desc">
			A triangular diagram of existence. The three corners are the horizons — the Source at the
			apex, the Self at the bottom-left, Chaos at the bottom-right — each an asymptotic limit. Three
			axes run through the interior toward each corner: Resonance toward the Source, Recollection
			toward the Self, Dissolution toward Chaos. The interior is Mundus, the inhabited middle.
		</desc>

		<!-- ───────── Mundus interior fill (also the click target) ──── -->
		<a
			href="/foundation/fabric/existence/mundus"
			class="mundus-link"
			aria-label="Mundus, the inhabited middle"
		>
			<path class="mundus-fill" d={triPath} />
		</a>

		<!-- ───────── Triangle outline ──────────────────────────────── -->
		<path class="triangle-outline" d={triPath} />

		<!-- ───────── Axes: interior lines pointing to each corner ──── -->
		<!-- Drawn as un-clickable lines (the clickable region is the
		     label group below — clicking the line itself is fiddly). -->
		<g class="axes">
			<line class="axis" x1={RES_LINE.x1} y1={RES_LINE.y1} x2={RES_LINE.x2} y2={RES_LINE.y2} />
			<line class="axis" x1={REC_LINE.x1} y1={REC_LINE.y1} x2={REC_LINE.x2} y2={REC_LINE.y2} />
			<line class="axis" x1={DIS_LINE.x1} y1={DIS_LINE.y1} x2={DIS_LINE.x2} y2={DIS_LINE.y2} />

			<!-- Arrowhead-style tick at each axis's outer end, pointing
			     toward its corner. A tiny notch is enough; nothing fancy. -->
			<circle class="axis-tip" cx={RES_LINE.x2} cy={RES_LINE.y2} r="3" />
			<circle class="axis-tip" cx={REC_LINE.x2} cy={REC_LINE.y2} r="3" />
			<circle class="axis-tip" cx={DIS_LINE.x2} cy={DIS_LINE.y2} r="3" />
		</g>

		<!-- Axis labels: clickable, sitting along each interior line
		     toward the corner end. Text stays horizontal for legibility. -->
		<a href="/foundation/fabric/existence/resonance" class="axis-link">
			<text class="axis-name" x={RES_LABEL.x} y={RES_LABEL.y} text-anchor="middle">
				Resonance
			</text>
		</a>
		<a href="/foundation/fabric/existence/recollection" class="axis-link">
			<text class="axis-name" x={REC_LABEL.x} y={REC_LABEL.y + 4} text-anchor="middle">
				Recollection
			</text>
		</a>
		<a href="/foundation/fabric/existence/dissolution" class="axis-link">
			<text class="axis-name" x={DIS_LABEL.x} y={DIS_LABEL.y + 4} text-anchor="middle">
				Dissolution
			</text>
		</a>

		<!-- ───────── Mundus label, centered in the interior ────────── -->
		<a href="/foundation/fabric/existence/mundus" class="mundus-label-link">
			<g class="mundus-label" transform={`translate(${MID.x} ${MID.y})`}>
				<text class="horizon-sigil" text-anchor="middle" y="-14">🜃</text>
				<text class="horizon-name" text-anchor="middle" y="14">Mundus</text>
				<text class="horizon-caption" text-anchor="middle" y="32">the inhabited middle</text>
			</g>
		</a>

		<!-- ───────── Horizons: the three corners ───────────────────── -->
		<a href="/foundation/fabric/existence/source" class="horizon-link">
			<g class="horizon" transform={`translate(${SOURCE.x} ${SOURCE.y - 4})`}>
				<text class="horizon-sigil" text-anchor="middle" y="-30">🜁</text>
				<text class="horizon-name" text-anchor="middle" y="-6">the Source</text>
			</g>
		</a>

		<a href="/foundation/fabric/existence/self" class="horizon-link">
			<g class="horizon" transform={`translate(${SELF.x - 6} ${SELF.y + 4})`}>
				<text class="horizon-sigil" text-anchor="middle" y="30">🜄</text>
				<text class="horizon-name" text-anchor="middle" y="54">the Self</text>
			</g>
		</a>

		<a href="/foundation/fabric/existence/chaos" class="horizon-link">
			<g class="horizon" transform={`translate(${CHAOS.x + 6} ${CHAOS.y + 4})`}>
				<text class="horizon-sigil" text-anchor="middle" y="30">🜂</text>
				<text class="horizon-name" text-anchor="middle" y="54">Chaos</text>
			</g>
		</a>
	</svg>

	<figcaption>
		Three horizons at the corners — <a href="/foundation/fabric/existence/source">the Source</a>,
		<a href="/foundation/fabric/existence/self">the Self</a>, and
		<a href="/foundation/fabric/existence/chaos">Chaos</a> — each an asymptotic limit. Three axes
		measure where in the interior a thing stands, each pointing toward the horizon it tracks:
		<a href="/foundation/fabric/existence/resonance">Resonance</a> toward the Source,
		<a href="/foundation/fabric/existence/recollection">Recollection</a> toward the Self,
		<a href="/foundation/fabric/existence/dissolution">Dissolution</a> toward Chaos. The interior is
		<a href="/foundation/fabric/existence/mundus">Mundus</a>, the inhabited middle, where every
		thing that exists has a place.
	</figcaption>
</figure>

<style>
	.mundus-map {
		margin: 0;
		padding: var(--space-6) 0;
	}

	.mundus-map svg {
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

	/* ── Mundus interior: a soft inhabited fill ───────────────── */
	.mundus-fill {
		fill: var(--accent);
		fill-opacity: 0.05;
		stroke: none;
		transition: fill-opacity 0.2s;
	}

	.mundus-link:hover .mundus-fill {
		fill-opacity: 0.09;
	}

	/* ── Triangle outline: the boundary horizons enclose ──────── */
	.triangle-outline {
		fill: none;
		stroke: var(--ink-soft);
		stroke-width: 1.25;
		pointer-events: none;
	}

	/* ── Axes: interior lines pointing to each horizon ────────── */
	.axis {
		stroke: var(--ink-faint);
		stroke-width: 1;
		stroke-dasharray: 4 3;
		fill: none;
	}

	.axis-tip {
		fill: var(--ink-soft);
	}

	.axis-link {
		cursor: pointer;
	}

	.axis-name {
		font-family: var(--font-display);
		font-size: 15px;
		font-variant: small-caps;
		letter-spacing: 0.14em;
		fill: var(--ink);
		transition: fill 0.2s;
	}

	.axis-link:hover .axis-name {
		fill: var(--accent);
	}

	/* ── Horizons: corners ────────────────────────────────────── */
	.horizon-sigil {
		font-size: 26px;
		fill: var(--ink-soft);
	}

	.horizon-name {
		font-family: var(--font-display);
		font-size: 16px;
		font-variant: small-caps;
		letter-spacing: 0.12em;
		fill: var(--ink);
		transition: fill 0.2s;
	}

	.horizon-caption {
		font-family: var(--font-serif);
		font-size: 11px;
		font-style: italic;
		fill: var(--ink-faint);
	}

	.horizon-link {
		cursor: pointer;
	}

	.horizon-link:hover .horizon-name,
	.horizon-link:hover .horizon-sigil {
		fill: var(--accent);
	}

	/* ── Mundus label in the interior ─────────────────────────── */
	.mundus-label-link {
		cursor: pointer;
	}

	.mundus-label-link:hover .horizon-name,
	.mundus-label-link:hover .horizon-sigil {
		fill: var(--accent);
	}
</style>
