#!/usr/bin/env node
/**
 * bake-mundus-map.js
 *
 * Runs the same geometry that MundusMap.svelte computes at runtime and writes
 * a static SVG.
 *
 * The SVG references CSS custom properties for colour (var(--accent), etc.)
 * and class names; the MundusMap.svelte component applies the matching styles
 * when it injects the SVG via {@html}.
 *
 * Run:  node scripts/bake-mundus-map.js
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(process.env.ALTERIA_WORLD_DIR ?? __dirname, 'generated/assets/mundus-map.svg');

// ─── Geometry (ported 1-to-1 from MundusMap.svelte) ─────────────────────────

const W = 1000;
const H = 720;

const SIDE = 640;
const CX = W / 2;
const TOP_Y = 80;
const BOT_Y = TOP_Y + (SIDE * Math.sqrt(3)) / 2;

const SOURCE = { x: CX, y: TOP_Y };
const SELF = { x: CX - SIDE / 2, y: BOT_Y };
const CHAOS = { x: CX + SIDE / 2, y: BOT_Y };

const MID = {
	x: (SOURCE.x + SELF.x + CHAOS.x) / 3,
	y: (SOURCE.y + SELF.y + CHAOS.y) / 3
};

const MUNDUS_LABEL = { x: MID.x, y: MID.y + 95 };

function axisLine(corner) {
	const innerT = 0.22;
	const outerT = 0.78;
	return {
		x1: MID.x + (corner.x - MID.x) * innerT,
		y1: MID.y + (corner.y - MID.y) * innerT,
		x2: MID.x + (corner.x - MID.x) * outerT,
		y2: MID.y + (corner.y - MID.y) * outerT
	};
}

function axisLabelPos(corner) {
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

function horizonLabelPos(a, b, opposite, offset) {
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

// ─── Contour generation ──────────────────────────────────────────────────────

function bary(x, y) {
	const x1 = SOURCE.x, y1 = SOURCE.y;
	const x2 = SELF.x,   y2 = SELF.y;
	const x3 = CHAOS.x,  y3 = CHAOS.y;
	const denom = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
	const s = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / denom;
	const r = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / denom;
	const c = 1 - s - r;
	return [s, r, c];
}

function fieldValue(x, y) {
	const [s, r, c] = bary(x, y);
	if (s < 0 || r < 0 || c < 0) return NaN;
	const eps = 1e-6;
	return -(Math.log(Math.max(s, eps)) + Math.log(Math.max(r, eps)) + Math.log(Math.max(c, eps)));
}

function generateContours(levels) {
	const minX = SELF.x;
	const maxX = CHAOS.x;
	const minY = SOURCE.y;
	const maxY = BOT_Y;

	const STEP = 6;
	const cols = Math.ceil((maxX - minX) / STEP);
	const rows = Math.ceil((maxY - minY) / STEP);

	const grid = new Array((cols + 1) * (rows + 1));
	for (let j = 0; j <= rows; j++) {
		for (let i = 0; i <= cols; i++) {
			const x = minX + i * STEP;
			const y = minY + j * STEP;
			grid[j * (cols + 1) + i] = fieldValue(x, y);
		}
	}

	const sampleAt = (i, j) => {
		const v = grid[j * (cols + 1) + i];
		return Number.isNaN(v) ? Number.POSITIVE_INFINITY : v;
	};

	const paths = [];

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

				if (
					!Number.isFinite(v00) &&
					!Number.isFinite(v10) &&
					!Number.isFinite(v11) &&
					!Number.isFinite(v01)
				)
					continue;

				let idx = 0;
				if (v00 >= level) idx |= 1;
				if (v10 >= level) idx |= 2;
				if (v11 >= level) idx |= 4;
				if (v01 >= level) idx |= 8;

				if (idx === 0 || idx === 15) continue;

				const interp = (va, vb, xa, ya, xb, yb) => {
					const a = Number.isFinite(va) ? va : level + 1e6 * Math.sign(va || 1);
					const b = Number.isFinite(vb) ? vb : level + 1e6 * Math.sign(vb || 1);
					const t = (level - a) / (b - a);
					const tc = Math.max(0, Math.min(1, t));
					return [xa + (xb - xa) * tc, ya + (yb - ya) * tc];
				};

				const top    = () => interp(v00, v10, x0, y0, x1, y0);
				const right  = () => interp(v10, v11, x1, y0, x1, y1);
				const bottom = () => interp(v01, v11, x0, y1, x1, y1);
				const left   = () => interp(v00, v01, x0, y0, x0, y1);

				const seg = (p1, p2) => {
					pathData += `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)}L${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
				};

				switch (idx) {
					case 1: case 14: seg(left(), top());    break;
					case 2: case 13: seg(top(), right());   break;
					case 3: case 12: seg(left(), right());  break;
					case 4: case 11: seg(right(), bottom()); break;
					case 5:
						seg(left(), top());
						seg(right(), bottom());
						break;
					case 6: case 9:  seg(top(), bottom());  break;
					case 7: case 8:  seg(left(), bottom()); break;
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

// Contour levels — same logic as the $derived.by() in the component.
function buildContourPaths() {
	const minVal = 3 * Math.log(3);
	const levels = [];
	for (let k = 1; k <= 5; k++) {
		levels.push(minVal + k * 0.45);
	}
	let step = 0.9;
	let v = minVal + 5 * 0.45;
	for (let k = 0; k < 10; k++) {
		v += step;
		levels.push(v);
		step *= 1.35;
	}
	return generateContours(levels);
}

// ─── SVG assembly ────────────────────────────────────────────────────────────

function n(v) {
	// Format a number: up to 3 decimal places, strip trailing zeros.
	return parseFloat(v.toFixed(3)).toString();
}

const contourPaths = buildContourPaths();

const contoursInner = contourPaths
	.map((d) => `    <path d="${d.trim()}"/>`)
	.join('\n');

const svg = `<svg
  viewBox="100 0 800 ${H}"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-labelledby="mundus-title mundus-desc"
>
  <title id="mundus-title">The Mundus triangle: three Cardinals, three axes, the inhabited middle</title>
  <desc id="mundus-desc">
    A triangular diagram of existence. The three corners are the Cardinals — the Source at the
    apex, the Self at the bottom-left, Chaos at the bottom-right — each an asymptotic limit. The
    three edges between them are the Horizons — Tranquility along the Source–Self edge, Oblivion
    along the Source–Chaos edge, Nullity along the Self–Chaos edge — also asymptotic. Three axes
    run through the interior toward each corner: Essence toward the Source, Subjectivity toward
    the Self, Dissolution toward Chaos. The interior is Mundus, the inhabited middle; at its
    centroid is Equilibrium, the basin into which ordinary existence settles. Faint topographical
    rings show how the bounds crowd in toward the boundary, never reached.
  </desc>

  <defs>
    <clipPath id="mundus-tri-clip">
      <path d="${triPath}"/>
    </clipPath>
  </defs>

  <!-- Mundus interior fill -->
  <a href="/foundation/fabric/axioma/mundus" class="mundus-link" aria-label="Mundus">
    <path class="mundus-fill" d="${triPath}"/>
  </a>

  <!-- Contours -->
  <g class="contours" clip-path="url(#mundus-tri-clip)" aria-hidden="true">
${contoursInner}
  </g>

  <!-- Triangle outline -->
  <path class="triangle-outline" d="${triPath}"/>

  <!-- Axes -->
  <g class="axes">
    <line class="axis" x1="${n(ESS_LINE.x1)}" y1="${n(ESS_LINE.y1)}" x2="${n(ESS_LINE.x2)}" y2="${n(ESS_LINE.y2)}"/>
    <line class="axis" x1="${n(SUB_LINE.x1)}" y1="${n(SUB_LINE.y1)}" x2="${n(SUB_LINE.x2)}" y2="${n(SUB_LINE.y2)}"/>
    <line class="axis" x1="${n(DIS_LINE.x1)}" y1="${n(DIS_LINE.y1)}" x2="${n(DIS_LINE.x2)}" y2="${n(DIS_LINE.y2)}"/>
    <circle class="axis-tip" cx="${n(ESS_LINE.x2)}" cy="${n(ESS_LINE.y2)}" r="3"/>
    <circle class="axis-tip" cx="${n(SUB_LINE.x2)}" cy="${n(SUB_LINE.y2)}" r="3"/>
    <circle class="axis-tip" cx="${n(DIS_LINE.x2)}" cy="${n(DIS_LINE.y2)}" r="3"/>
  </g>

  <a href="/foundation/fabric/axioma/essence" class="axis-link">
    <text class="axis-name" x="${n(ESS_LABEL.x)}" y="${n(ESS_LABEL.y)}" text-anchor="middle">
      <tspan class="sigil-glyph">ε</tspan> Essence
    </text>
  </a>
  <a href="/foundation/fabric/axioma/subjectivity" class="axis-link">
    <text class="axis-name" x="${n(SUB_LABEL.x)}" y="${n(SUB_LABEL.y + 4)}" text-anchor="middle">
      <tspan class="sigil-glyph">σ</tspan> Subjectivity
    </text>
  </a>
  <a href="/foundation/fabric/axioma/dissolution" class="axis-link">
    <text class="axis-name" x="${n(DIS_LABEL.x)}" y="${n(DIS_LABEL.y + 4)}" text-anchor="middle">
      <tspan class="sigil-glyph">δ</tspan> Dissolution
    </text>
  </a>

  <!-- Horizons -->
  <a href="/foundation/fabric/axioma/tranquility" class="horizon-link">
    <text class="horizon-name" x="${n(TRANQUILITY_LABEL.x)}" y="${n(TRANQUILITY_LABEL.y)}" text-anchor="middle"
      transform="rotate(-60 ${n(TRANQUILITY_LABEL.x)} ${n(TRANQUILITY_LABEL.y)})">
      <tspan class="sigil-glyph">δ̸</tspan> Tranquility
    </text>
  </a>
  <a href="/foundation/fabric/axioma/oblivion" class="horizon-link">
    <text class="horizon-name" x="${n(OBLIVION_LABEL.x)}" y="${n(OBLIVION_LABEL.y)}" text-anchor="middle"
      transform="rotate(60 ${n(OBLIVION_LABEL.x)} ${n(OBLIVION_LABEL.y)})">
      <tspan class="sigil-glyph">σ̸</tspan> Oblivion
    </text>
  </a>
  <a href="/foundation/fabric/axioma/nullity" class="horizon-link">
    <text class="horizon-name" x="${n(NULLITY_LABEL.x)}" y="${n(NULLITY_LABEL.y)}" text-anchor="middle">
      <tspan class="sigil-glyph">ε̸</tspan> Nullity
    </text>
  </a>

  <!-- Equilibrium -->
  <a href="/foundation/fabric/axioma/equilibrium" class="equilibrium-link">
    <g class="equilibrium" transform="translate(${n(MID.x)} ${n(MID.y)})">
      <text class="equilibrium-sigil" text-anchor="middle" y="-10">∪</text>
      <text class="equilibrium-name" text-anchor="middle" y="18">Equilibrium</text>
    </g>
  </a>

  <!-- Mundus label -->
  <a href="/foundation/fabric/axioma/mundus" class="mundus-label-link">
    <g class="mundus-label" transform="translate(${n(MUNDUS_LABEL.x)} ${n(MUNDUS_LABEL.y)})">
      <text class="cardinal-sigil" text-anchor="middle" y="-2">🜃</text>
      <text class="cardinal-name" text-anchor="middle" y="22">Mundus</text>
    </g>
  </a>

  <!-- Cardinals -->
  <a href="/foundation/fabric/axioma/the-three-cardinals/source" class="cardinal-link">
    <g class="cardinal" transform="translate(${n(SOURCE.x)} ${n(SOURCE.y - 4)})">
      <text class="cardinal-sigil" text-anchor="middle" y="-30">🜁</text>
      <text class="cardinal-name" text-anchor="middle" y="-6">the Source</text>
    </g>
  </a>
  <a href="/foundation/fabric/axioma/the-three-cardinals/self" class="cardinal-link">
    <g class="cardinal" transform="translate(${n(SELF.x - 6)} ${n(SELF.y + 4)})">
      <text class="cardinal-sigil" text-anchor="middle" y="30">🜄</text>
      <text class="cardinal-name" text-anchor="middle" y="54">the Self</text>
    </g>
  </a>
  <a href="/foundation/fabric/axioma/the-three-cardinals/chaos" class="cardinal-link">
    <g class="cardinal" transform="translate(${n(CHAOS.x + 6)} ${n(CHAOS.y + 4)})">
      <text class="cardinal-sigil" text-anchor="middle" y="30">🜂</text>
      <text class="cardinal-name" text-anchor="middle" y="54">Chaos</text>
    </g>
  </a>
</svg>`;

// ─── Write ───────────────────────────────────────────────────────────────────

mkdirSync(resolve(__dirname, '../src/lib/assets'), { recursive: true });
writeFileSync(OUT, svg, 'utf-8');
console.log(`Wrote ${contourPaths.length} contour paths → ${OUT}`);
