<script lang="ts">
	/**
	 * The Mundus triangle — the cosmological map.
	 *
	 * Three Cardinals at the corners, three axes drawn as lines from
	 * the interior outward toward each corner, Mundus filling the
	 * interior as the inhabited middle, with faint topographical
	 * contours showing the asymptotic crowding toward the bounds.
	 *
	 * The geometry is barycentric: any point inside the triangle is a
	 * weighted blend of the three corners, and the three axis values
	 * are not independent — they sum to a constant. This image is the
	 * shape of that constraint.
	 *
	 *   - Corners are Cardinals: the Source (🜁), the Self (🜄), Chaos (🜂).
	 *     Each is an asymptotic limit, never reached.
	 *   - Edges are Horizons: the loci on which one axis goes to its
	 *     minimum and the other two do the leaning. Also asymptotic.
	 *   - Axes are interior lines pointing toward each Cardinal. Each
	 *     axis measures distance/closeness to the Cardinal it points at:
	 *     Essence → Source, Subjectivity → Self, Dissolution → Chaos.
	 *   - Interior is Mundus (🜃) — the inhabited middle.
	 *   - Contours are level sets of ψ = -(log s + log r + log c), the
	 *     barycentric "cost of approach". The field diverges on the
	 *     boundary, so the rings crowd tight toward edges and corners,
	 *     making the asymptotic character of all six bounds visible: no
	 *     thing in Mundus can fully reach any of them.
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
	// toward the Cardinal it measures distance from.
	function axisLine(corner: { x: number; y: number }) {
		const innerT = 0.22;
		const outerT = 0.78;
		return {
			x1: MID.x + (corner.x - MID.x) * innerT,
			y1: MID.y + (corner.y - MID.y) * innerT,
			x2: MID.x + (corner.x - MID.x) * outerT,
			y2: MID.y + (corner.y - MID.y) * outerT
		};
	}

	function axisLabelPos(corner: { x: number; y: number }) {
		const t = 0.55;
		return {
			x: MID.x + (corner.x - MID.x) * t,
			y: MID.y + (corner.y - MID.y) * t
		};
	}

	const ESS_LINE = axisLine(SOURCE);
	const SUB_LINE = axisLine(SELF);
	const DIS_LINE = axisLine(CHAOS);

	const ESS_LABEL = axisLabelPos(SOURCE);
	const SUB_LABEL = axisLabelPos(SELF);
	const DIS_LABEL = axisLabelPos(CHAOS);

	// Horizon labels: positioned outside the triangle, near the
	// midpoint of each edge, along the outward normal. Each Horizon
	// is the edge opposite one corner; the outward direction is the
	// vector from that opposite corner to the edge's midpoint.
	function horizonLabelPos(
		a: { x: number; y: number },
		b: { x: number; y: number },
		opposite: { x: number; y: number },
		offset: number
	) {
		const mx = (a.x + b.x) / 2;
		const my = (a.y + b.y) / 2;
		const dx = mx - opposite.x;
		const dy = my - opposite.y;
		const len = Math.hypot(dx, dy);
		return { x: mx + (dx / len) * offset, y: my + (dy / len) * offset };
	}

	const HORIZON_OFFSET = 40;
	const TRANQUILITY_LABEL = horizonLabelPos(SOURCE, SELF, CHAOS, HORIZON_OFFSET);
	const OBLIVION_LABEL = horizonLabelPos(SOURCE, CHAOS, SELF, HORIZON_OFFSET);
	const NULLITY_LABEL = horizonLabelPos(SELF, CHAOS, SOURCE, HORIZON_OFFSET);

	const triPath = `M ${SOURCE.x} ${SOURCE.y} L ${SELF.x} ${SELF.y} L ${CHAOS.x} ${CHAOS.y} Z`;

	// ─────────── Contour generation ────────────────────────────────
	//
	// Convert a pixel (x, y) inside the triangle to barycentric
	// coordinates (s, r, c) with s + r + c = 1. s ↔ Source corner,
	// r ↔ Self, c ↔ Chaos.
	function bary(x: number, y: number): [number, number, number] {
		const x1 = SOURCE.x,
			y1 = SOURCE.y;
		const x2 = SELF.x,
			y2 = SELF.y;
		const x3 = CHAOS.x,
			y3 = CHAOS.y;
		const denom = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
		const s = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / denom;
		const r = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / denom;
		const c = 1 - s - r;
		return [s, r, c];
	}

	function fieldValue(x: number, y: number): number {
		const [s, r, c] = bary(x, y);
		// Outside the triangle: return NaN; the sentinel below treats
		// these as "above any threshold" so contours close cleanly on
		// the boundary instead of leaking out.
		if (s < 0 || r < 0 || c < 0) return NaN;
		// Clamp away from zero to keep finite at the boundary sample row.
		const eps = 1e-6;
		return -(Math.log(Math.max(s, eps)) + Math.log(Math.max(r, eps)) + Math.log(Math.max(c, eps)));
	}

	// Marching squares on a regular grid covering the triangle's
	// bounding box. For each cell, look at the four corner field
	// values and emit one or two line segments where the contour
	// crosses. NaN corners (outside the triangle) are treated as
	// "above" any threshold — the field diverges at the boundary,
	// so that's the right limit and makes contours close cleanly
	// against the edges.
	function generateContours(levels: number[]): string[] {
		const minX = SELF.x;
		const maxX = CHAOS.x;
		const minY = SOURCE.y;
		const maxY = BOT_Y;

		const STEP = 6; // pixels; smaller = smoother, slower
		const cols = Math.ceil((maxX - minX) / STEP);
		const rows = Math.ceil((maxY - minY) / STEP);

		// Pre-sample the grid.
		const grid: number[] = new Array((cols + 1) * (rows + 1));
		for (let j = 0; j <= rows; j++) {
			for (let i = 0; i <= cols; i++) {
				const x = minX + i * STEP;
				const y = minY + j * STEP;
				grid[j * (cols + 1) + i] = fieldValue(x, y);
			}
		}

		const sampleAt = (i: number, j: number) => {
			const v = grid[j * (cols + 1) + i];
			return Number.isNaN(v) ? Number.POSITIVE_INFINITY : v;
		};

		const paths: string[] = [];

		for (const level of levels) {
			let pathData = '';
			for (let j = 0; j < rows; j++) {
				for (let i = 0; i < cols; i++) {
					const x0 = minX + i * STEP;
					const y0 = minY + j * STEP;
					const x1 = x0 + STEP;
					const y1 = y0 + STEP;

					const v00 = sampleAt(i, j);
					const v10 = sampleAt(i + 1, j);
					const v11 = sampleAt(i + 1, j + 1);
					const v01 = sampleAt(i, j + 1);

					// Skip cells that are entirely "outside" (infinite for
					// logsum); they shouldn't draw spurious segments.
					if (
						!Number.isFinite(v00) &&
						!Number.isFinite(v10) &&
						!Number.isFinite(v11) &&
						!Number.isFinite(v01)
					)
						continue;

					// Build a 4-bit index: bit set if corner value >= level.
					let idx = 0;
					if (v00 >= level) idx |= 1;
					if (v10 >= level) idx |= 2;
					if (v11 >= level) idx |= 4;
					if (v01 >= level) idx |= 8;

					if (idx === 0 || idx === 15) continue;

					// Linear interpolation along an edge between two corners
					// whose values straddle the level.
					const interp = (
						va: number,
						vb: number,
						xa: number,
						ya: number,
						xb: number,
						yb: number
					): [number, number] => {
						// Treat ±∞ as "very far above"; use a finite cap so we
						// get a real coordinate near the cell corner.
						const a = Number.isFinite(va) ? va : level + 1e6 * Math.sign(va || 1);
						const b = Number.isFinite(vb) ? vb : level + 1e6 * Math.sign(vb || 1);
						const t = (level - a) / (b - a);
						const tc = Math.max(0, Math.min(1, t));
						return [xa + (xb - xa) * tc, ya + (yb - ya) * tc];
					};

					const top = () => interp(v00, v10, x0, y0, x1, y0);
					const right = () => interp(v10, v11, x1, y0, x1, y1);
					const bottom = () => interp(v01, v11, x0, y1, x1, y1);
					const left = () => interp(v00, v01, x0, y0, x0, y1);

					const seg = (p1: [number, number], p2: [number, number]) => {
						pathData += `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}L${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
					};

					switch (idx) {
						case 1:
						case 14:
							seg(left(), top());
							break;
						case 2:
						case 13:
							seg(top(), right());
							break;
						case 3:
						case 12:
							seg(left(), right());
							break;
						case 4:
						case 11:
							seg(right(), bottom());
							break;
						case 5:
							seg(left(), top());
							seg(right(), bottom());
							break;
						case 6:
						case 9:
							seg(top(), bottom());
							break;
						case 7:
						case 8:
							seg(left(), bottom());
							break;
						case 10:
							seg(top(), right());
							seg(left(), bottom());
							break;
					}
				}
			}
			if (pathData) paths.push(pathData);
		}

		return paths;
	}

	// Contour levels: pick rings tracing ψ = -(log s + log r + log c).
	// The field bottoms out at ψ = 3 log 3 ≈ 3.296 at the centroid
	// and diverges to +∞ on the boundary. We pick inner rings at
	// roughly linear spacing (where the field grows gently) and
	// outer rings at geometric spacing (where each successive ring
	// sits a similar perceptual distance further out as the field
	// accelerates toward infinity).
	const contourPaths = $derived.by(() => {
		const minVal = 3 * Math.log(3);
		const levels: number[] = [];
		// Inner rings: linear-ish spacing near the centroid.
		for (let k = 1; k <= 5; k++) {
			levels.push(minVal + k * 0.45);
		}
		// Outer rings: geometric spacing, ratchet 1.35× each step.
		let step = 0.9;
		let v = minVal + 5 * 0.45;
		for (let k = 0; k < 10; k++) {
			v += step;
			levels.push(v);
			step *= 1.35;
		}
		return generateContours(levels);
	});
</script>

<figure class="mundus-map">
	<svg
		viewBox={`0 0 ${W} ${H}`}
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		aria-labelledby="mundus-title mundus-desc"
	>
		<title id="mundus-title"
			>The Mundus triangle: three Cardinals, three axes, the inhabited middle</title
		>
		<desc id="mundus-desc">
			A triangular diagram of existence. The three corners are the Cardinals — the Source at the
			apex, the Self at the bottom-left, Chaos at the bottom-right — each an asymptotic limit. The
			three edges between them are the Horizons — Tranquility along the Source–Self edge, Oblivion
			along the Source–Chaos edge, Nullity along the Self–Chaos edge — also asymptotic. Three axes
			run through the interior toward each corner: Essence toward the Source, Subjectivity toward
			the Self, Dissolution toward Chaos. The interior is Mundus, the inhabited middle. Faint
			topographical rings show how the bounds crowd in toward the boundary, never reached.
		</desc>

		<defs>
			<clipPath id="mundus-tri-clip">
				<path d={triPath} />
			</clipPath>
		</defs>

		<!-- ───────── Mundus interior fill (also the click target) ──── -->
		<a
			href="/foundation/fabric/mundus"
			class="mundus-link"
			aria-label="Mundus, the inhabited middle"
		>
			<path class="mundus-fill" d={triPath} />
		</a>

		<!-- ───────── Contours (level sets of the chosen field) ─────── -->
		{#if contourPaths.length > 0}
			<g class="contours" clip-path="url(#mundus-tri-clip)" aria-hidden="true">
				{#each contourPaths as d, i (i)}
					<path {d} />
				{/each}
			</g>
		{/if}

		<!-- ───────── Triangle outline ──────────────────────────────── -->
		<path class="triangle-outline" d={triPath} />

		<!-- ───────── Axes: interior lines pointing to each corner ──── -->
		<g class="axes">
			<line class="axis" x1={ESS_LINE.x1} y1={ESS_LINE.y1} x2={ESS_LINE.x2} y2={ESS_LINE.y2} />
			<line class="axis" x1={SUB_LINE.x1} y1={SUB_LINE.y1} x2={SUB_LINE.x2} y2={SUB_LINE.y2} />
			<line class="axis" x1={DIS_LINE.x1} y1={DIS_LINE.y1} x2={DIS_LINE.x2} y2={DIS_LINE.y2} />

			<circle class="axis-tip" cx={ESS_LINE.x2} cy={ESS_LINE.y2} r="3" />
			<circle class="axis-tip" cx={SUB_LINE.x2} cy={SUB_LINE.y2} r="3" />
			<circle class="axis-tip" cx={DIS_LINE.x2} cy={DIS_LINE.y2} r="3" />
		</g>

		<a href="/foundation/fabric/essence" class="axis-link">
			<text class="axis-name" x={ESS_LABEL.x} y={ESS_LABEL.y} text-anchor="middle">
				ε Essence
			</text>
		</a>
		<a href="/foundation/fabric/subjectivity" class="axis-link">
			<text class="axis-name" x={SUB_LABEL.x} y={SUB_LABEL.y + 4} text-anchor="middle">
				σ Subjectivity
			</text>
		</a>
		<a href="/foundation/fabric/dissolution" class="axis-link">
			<text class="axis-name" x={DIS_LABEL.x} y={DIS_LABEL.y + 4} text-anchor="middle">
				δ Dissolution
			</text>
		</a>

		<!-- ───────── Horizons: labels outside each edge ────────────── -->
		<a href="/foundation/fabric/tranquility" class="horizon-link">
			<text
				class="horizon-name"
				x={TRANQUILITY_LABEL.x}
				y={TRANQUILITY_LABEL.y}
				text-anchor="middle"
				transform={`rotate(-60 ${TRANQUILITY_LABEL.x} ${TRANQUILITY_LABEL.y})`}
			>
				δ̸ Tranquility
			</text>
		</a>
		<a href="/foundation/fabric/oblivion" class="horizon-link">
			<text
				class="horizon-name"
				x={OBLIVION_LABEL.x}
				y={OBLIVION_LABEL.y}
				text-anchor="middle"
				transform={`rotate(60 ${OBLIVION_LABEL.x} ${OBLIVION_LABEL.y})`}
			>
				σ̸ Oblivion
			</text>
		</a>
		<a href="/foundation/fabric/nullity" class="horizon-link">
			<text class="horizon-name" x={NULLITY_LABEL.x} y={NULLITY_LABEL.y} text-anchor="middle">
				ε̸ Nullity
			</text>
		</a>

		<!-- ───────── Mundus label, centered in the interior ────────── -->
		<a href="/foundation/fabric/mundus" class="mundus-label-link">
			<g class="mundus-label" transform={`translate(${MID.x} ${MID.y})`}>
				<text class="cardinal-sigil" text-anchor="middle" y="-14">🜃</text>
				<text class="cardinal-name" text-anchor="middle" y="14">Mundus</text>
				<text class="cardinal-caption" text-anchor="middle" y="32">the inhabited middle</text>
			</g>
		</a>

		<!-- ───────── Cardinals: the three corners ──────────────────── -->
		<a href="/foundation/fabric/source" class="cardinal-link">
			<g class="cardinal" transform={`translate(${SOURCE.x} ${SOURCE.y - 4})`}>
				<text class="cardinal-sigil" text-anchor="middle" y="-30">🜁</text>
				<text class="cardinal-name" text-anchor="middle" y="-6">the Source</text>
			</g>
		</a>

		<a href="/foundation/fabric/self" class="cardinal-link">
			<g class="cardinal" transform={`translate(${SELF.x - 6} ${SELF.y + 4})`}>
				<text class="cardinal-sigil" text-anchor="middle" y="30">🜄</text>
				<text class="cardinal-name" text-anchor="middle" y="54">the Self</text>
			</g>
		</a>

		<a href="/foundation/fabric/chaos" class="cardinal-link">
			<g class="cardinal" transform={`translate(${CHAOS.x + 6} ${CHAOS.y + 4})`}>
				<text class="cardinal-sigil" text-anchor="middle" y="30">🜂</text>
				<text class="cardinal-name" text-anchor="middle" y="54">Chaos</text>
			</g>
		</a>
	</svg>

	<figcaption>
		Three Cardinals at the corners — <a href="/foundation/fabric/source">the Source</a>,
		<a href="/foundation/fabric/self">the Self</a>, and
		<a href="/foundation/fabric/chaos">Chaos</a> — each an asymptotic limit. Three axes measure
		where in the interior a thing stands, each pointing toward the Cardinal it tracks:
		<a href="/foundation/fabric/essence">Essence</a> toward the Source,
		<a href="/foundation/fabric/subjectivity">Subjectivity</a> toward the Self,
		<a href="/foundation/fabric/dissolution">Dissolution</a> toward Chaos. The edges between the
		corners are the three Horizons —
		<a href="/foundation/fabric/tranquility">Tranquility</a>,
		<a href="/foundation/fabric/oblivion">Oblivion</a>, and
		<a href="/foundation/fabric/nullity">Nullity</a> — also asymptotic. The interior is
		<a href="/foundation/fabric/mundus">Mundus</a>, the inhabited middle, where every thing that
		exists has a place.
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

	/* ── Contours: faint topo lines showing the asymptotic shape ─ */
	.contours path {
		fill: none;
		stroke: var(--ink-soft);
		stroke-width: 0.6;
		stroke-opacity: 0.45;
		pointer-events: none;
	}

	/* ── Triangle outline: the boundary the bounds enclose ────── */
	.triangle-outline {
		fill: none;
		stroke: var(--ink-soft);
		stroke-width: 1.25;
		pointer-events: none;
	}

	/* ── Axes: interior lines pointing to each Cardinal ───────── */
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

	/* ── Horizons: edge labels, sitting outside the triangle ──── */
	.horizon-link {
		cursor: pointer;
	}

	.horizon-name {
		font-family: var(--font-display);
		font-size: 13px;
		font-variant: small-caps;
		letter-spacing: 0.14em;
		fill: var(--ink-soft);
		transition: fill 0.2s;
	}

	.horizon-link:hover .horizon-name {
		fill: var(--accent);
	}

	/* ── Cardinals: corners ───────────────────────────────────── */
	.cardinal-sigil {
		font-size: 26px;
		fill: var(--ink-soft);
	}

	.cardinal-name {
		font-family: var(--font-display);
		font-size: 16px;
		font-variant: small-caps;
		letter-spacing: 0.12em;
		fill: var(--ink);
		transition: fill 0.2s;
	}

	.cardinal-caption {
		font-family: var(--font-serif);
		font-size: 11px;
		font-style: italic;
		fill: var(--ink-faint);
	}

	.cardinal-link {
		cursor: pointer;
	}

	.cardinal-link:hover .cardinal-name,
	.cardinal-link:hover .cardinal-sigil {
		fill: var(--accent);
	}

	/* ── Mundus label in the interior ─────────────────────────── */
	.mundus-label-link {
		cursor: pointer;
	}

	.mundus-label-link:hover .cardinal-name,
	.mundus-label-link:hover .cardinal-sigil {
		fill: var(--accent);
	}
</style>
