<script lang="ts">
	import type { StatBlock, PopulationSlice } from '$lib/routes/path/entityPage.load';

	interface Props {
		blocks: StatBlock[];
	}

	let { blocks }: Props = $props();

	// ── Palette for pie slices ─────────────────────────────────────────────
	const PALETTE = ['#c9b89a', '#8fada2', '#b8a4c4', '#a8b89c', '#c9a4a0'] as const;

	// SVG pie chart constants
	const CX = 150;
	const CY = 150;
	const R = 110;
	const GAP_RAD = 0.015; // radian gap between slices

	/**
	 * Compute an SVG path string for one pie slice.
	 * Angles in radians, 0 = top (12 o'clock), clockwise.
	 */
	function sliceToPath(
		cx: number,
		cy: number,
		r: number,
		startAngle: number,
		endAngle: number
	): string {
		const start = startAngle - Math.PI / 2;
		const end = endAngle - Math.PI / 2;
		const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
		const x1 = cx + r * Math.cos(start);
		const y1 = cy + r * Math.sin(start);
		const x2 = cx + r * Math.cos(end);
		const y2 = cy + r * Math.sin(end);
		return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
	}

	interface SliceArc {
		path: string;
		color: string;
		slice: PopulationSlice;
	}

	/**
	 * Build arc data from a list of population slices.
	 * Returns null when the chart shouldn't be shown (e.g. single slice,
	 * percentages don't sum to something reasonable, etc.).
	 */
	function buildArcs(slices: PopulationSlice[]): SliceArc[] | null {
		if (slices.length === 0) return null;

		// Single slice: render a full circle as a plain <circle> — handled
		// separately in the template; signal that via null here.
		if (slices.length === 1) return null;

		const total = slices.reduce((s, sl) => s + sl.percentage, 0);
		// Refuse to draw if the total is wildly off (< 50% or > 150%)
		if (total < 50 || total > 150) return null;

		const scale = (2 * Math.PI) / total; // normalise so they fill a full circle
		const arcs: SliceArc[] = [];
		let cursor = 0;

		for (let i = 0; i < slices.length; i++) {
			const sl = slices[i];
			const span = sl.percentage * scale;
			const start = cursor + GAP_RAD;
			const end = cursor + span - GAP_RAD;
			if (end > start) {
				arcs.push({
					path: sliceToPath(CX, CY, R, start, end),
					color: PALETTE[i % PALETTE.length],
					slice: sl
				});
			}
			cursor += span;
		}

		return arcs.length > 0 ? arcs : null;
	}

	/** Format a number with locale-style thousands separators. */
	function formatNumber(n: number): string {
		return n.toLocaleString('en-US');
	}
</script>

{#if blocks.length > 0}
	<div class="statistics-panel">
		{#each blocks as block (block.kind)}
			{#if block.kind === 'population'}
				{@const arcs = buildArcs(block.slices)}
				{@const singleSlice = block.slices.length === 1 ? block.slices[0] : null}

				<section class="stat-block stat-block--population">
					<h2 class="stat-heading">Population</h2>

					{#if block.total !== null}
						<p class="stat-total">
							<span class="stat-total__number">{formatNumber(block.total)}</span>
							<span class="stat-total__label">total</span>
						</p>
					{/if}

					{#if arcs || singleSlice}
						<div class="stat-chart-wrap">
							<!-- Chart -->
							<div class="stat-chart">
								<svg
									viewBox="0 0 300 300"
									width="220"
									height="220"
									aria-hidden="true"
									focusable="false"
								>
									{#if arcs}
										{#each arcs as arc (arc.slice.speciesId)}
											<path d={arc.path} fill={arc.color} />
										{/each}
									{:else if singleSlice}
										<!-- Single slice: full circle -->
										<circle
											cx={CX}
											cy={CY}
											r={R}
											fill={PALETTE[0]}
										/>
									{/if}
								</svg>
							</div>

							<!-- Legend -->
							{#if block.slices.length > 0}
								<ul class="stat-legend">
									{#each block.slices as slice, i (slice.speciesId)}
										<li class="stat-legend__item">
											<span
												class="stat-legend__swatch"
												style:background-color={PALETTE[i % PALETTE.length]}
											></span>
											<a class="stat-legend__link" href={slice.href}>{slice.speciesName}</a>
											<span class="stat-legend__pct">({slice.percentage}%)</span>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</section>
			{:else if block.kind === 'presence'}
				{@const counts = block.entries.map(e =>
					e.worldTotal !== null ? Math.round(e.percentage / 100 * e.worldTotal) : null
				)}
				{@const knownTotal = counts.every(c => c !== null)
					? counts.reduce((s, c) => s! + c!, 0)
					: null}
				{@const maxCount = counts.reduce((m, c) => (c !== null && c > (m ?? 0) ? c : m), null as number | null)}
				<section class="stat-block stat-block--presence">
					<h2 class="stat-heading">Population presence</h2>
					{#if knownTotal !== null}
						<p class="stat-total">
							<span class="stat-total__number">{formatNumber(knownTotal)}</span>
							<span class="stat-total__label">known total</span>
						</p>
					{/if}
					<ul class="presence-list">
						{#each block.entries as entry, i (entry.worldId)}
							{@const count = counts[i]}
							{@const speciesPct = knownTotal ? Math.round((count ?? 0) / knownTotal * 100) : null}
							<li class="presence-item">
								<div class="presence-row">
									<a class="presence-world" href={entry.href}>{entry.worldName}</a>
									{#if speciesPct !== null}
										<span class="presence-pct">{speciesPct}%</span>
									{/if}
									{#if count !== null}
										<span class="presence-total">({formatNumber(count)})</span>
									{/if}
								</div>
								<div class="presence-bar-track" aria-hidden="true">
									<div
										class="presence-bar-fill"
										style:width="{maxCount ? ((count ?? 0) / maxCount) * 100 : 100}%"
									></div>
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.statistics-panel {
		margin-block: var(--space-6, 2rem);
	}

	.stat-block {
		margin-bottom: var(--space-6, 2rem);
	}

	/* ── Heading ──────────────────────────────────────────────────── */
	.stat-heading {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		font-weight: 600;
		color: var(--accent);
		margin: 0 0 var(--space-3);
		text-transform: lowercase; /* small-caps + lowercase = true small-caps effect */
	}

	/* ── Total line ───────────────────────────────────────────────── */
	.stat-total {
		margin: 0 0 var(--space-4);
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.stat-total__number {
		font-family: var(--font-serif);
		font-size: var(--text-lg, 1.25rem);
		font-weight: 600;
		color: var(--ink);
	}

	.stat-total__label {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	/* ── Chart + legend wrapper ───────────────────────────────────── */
	.stat-chart-wrap {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-5);
	}

	/* ── SVG chart ────────────────────────────────────────────────── */
	.stat-chart {
		flex: 0 0 auto;
		/* Center the chart when it wraps alone */
		margin-inline: auto;
	}

	.stat-chart svg {
		display: block;
		max-width: 220px;
		height: auto;
	}

	/* ── Legend ───────────────────────────────────────────────────── */
	.stat-legend {
		list-style: none;
		margin: 0;
		padding: 0;
		flex: 1 1 10rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		/* Align legend text with top of chart on wider screens */
		padding-block-start: var(--space-2);
	}

	.stat-legend__item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
	}

	.stat-legend__swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		flex: 0 0 12px;
		border-radius: 2px;
	}

	.stat-legend__link {
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		color: var(--ink);
		text-decoration: none;
		border-bottom: 1px solid var(--rule-hair, #d8d8d8);
	}

	.stat-legend__link:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-warm);
	}

	.stat-legend__pct {
		font-size: var(--text-xs);
		color: var(--ink-faint);
		font-variant-numeric: tabular-nums;
	}

	/* ── Presence block ───────────────────────────────────────────── */
	.presence-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.presence-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.presence-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.presence-world {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		color: var(--ink);
		text-decoration: none;
		border-bottom: 1px solid var(--rule-hair, #d8d8d8);
	}

	.presence-world:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-warm);
	}

	.presence-pct {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.06em;
		color: var(--ink);
		font-weight: 600;
	}

	.presence-total {
		font-size: var(--text-xs);
		color: var(--ink-faint);
		font-variant-numeric: tabular-nums;
	}

	.presence-bar-track {
		height: 4px;
		background: var(--parchment-deep, #e2e2e2);
		border-radius: 2px;
		overflow: hidden;
	}

	.presence-bar-fill {
		height: 100%;
		background: var(--accent-soft, #777);
		border-radius: 2px;
		transition: width 200ms ease;
	}
</style>
