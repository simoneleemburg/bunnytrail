<script lang="ts">
	import type { StatBlock, PopulationSlice, SubGroupEntry, SubGroupBlock } from '$lib/routes/path/entityPage.load';

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

	/**
	 * Format a percentage for display.
	 * - ≥ 1%: one decimal place (e.g. "32%", "2.5%")
	 * - 0.01–1%: two decimal places (e.g. "0.05%")
	 * - > 0 but < 0.01%: "<0.01%"
	 */
	function formatPct(pct: number): string {
		if (pct > 0 && pct < 0.01) return '<0.01%';
		if (pct < 1) {
			const rounded = Math.round(pct * 100) / 100;
			return `${rounded}%`;
		}
		const rounded = Math.round(pct * 10) / 10;
		return `${rounded}%`;
	}
</script>

{#if blocks.length > 0}
	<div class="statistics-panel">
		{#each blocks as block (block.kind)}
		{#if block.kind === 'population'}
			{@const sliceTotal = block.slices.reduce((s, sl) => s + sl.percentage, 0)}
			{@const remainder = Math.round((100 - sliceTotal) * 10) / 10}
			{@const allSlices = remainder > 0.4
				? [...block.slices, { speciesId: '__other__', speciesName: 'Other', href: null, percentage: remainder, count: null }]
				: block.slices}
			{@const arcs = buildArcs(allSlices)}
			{@const singleSlice = allSlices.length === 1 ? allSlices[0] : null}

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
						{#if allSlices.length > 0}
							<ul class="stat-legend">
								{#each allSlices as slice, i (slice.speciesId)}
									{@const count = slice.count !== undefined && slice.count !== null
										? slice.count
										: (block.total !== null ? Math.round(slice.percentage / 100 * block.total) : null)}
									<li class="stat-legend__item">
										<span
											class="stat-legend__swatch"
											style:background-color={slice.speciesId === '__other__' ? '#d4cdc4' : PALETTE[i % PALETTE.length]}
										></span>
										{#if slice.href}
											<a class="stat-legend__link" href={slice.href}>{slice.speciesName}</a>
										{:else}
											<span class="stat-legend__label">{slice.speciesName}</span>
										{/if}
										<span class="stat-legend__pct">({formatPct(slice.percentage)})</span>
										{#if count !== null}
											<span class="stat-legend__count">{formatNumber(count)}</span>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
						</div>
					{/if}
				</section>
			{#if block.subGroupBlocks && block.subGroupBlocks.length > 0}
				{#each block.subGroupBlocks as sg (sg.groupId)}
					{@const sgSliceTotal = sg.slices.reduce((s, sl) => s + sl.percentage, 0)}
					{@const sgRemainder = Math.round((100 - sgSliceTotal) * 10) / 10}
					{@const sgAllSlices = sgRemainder > 0.4
						? [...sg.slices, { speciesId: '__other__', speciesName: 'Other', href: null, percentage: sgRemainder, count: null }]
						: sg.slices}
					{@const sgArcs = buildArcs(sgAllSlices)}
					{@const sgSingleSlice = sgAllSlices.length === 1 ? sgAllSlices[0] : null}
					<section class="stat-block stat-block--subgroup">
						<h3 class="subgroup-heading">
							<a class="subgroup-heading__link" href={sg.href}>{sg.groupName}</a>
						</h3>
						{#if sg.total !== null}
							<p class="stat-total">
								<span class="stat-total__number">{formatNumber(sg.total)}</span>
								<span class="stat-total__label">total</span>
							</p>
						{/if}
						{#if sgArcs || sgSingleSlice}
							<div class="stat-chart-wrap">
								<div class="stat-chart stat-chart--small">
									<svg viewBox="0 0 300 300" width="140" height="140" aria-hidden="true" focusable="false">
										{#if sgArcs}
											{#each sgArcs as arc (arc.slice.speciesId)}
												<path d={arc.path} fill={arc.color} />
											{/each}
										{:else if sgSingleSlice}
											<circle cx={CX} cy={CY} r={R} fill={PALETTE[0]} />
										{/if}
									</svg>
								</div>
								{#if sgAllSlices.length > 0}
									<ul class="stat-legend stat-legend--small">
										{#each sgAllSlices as slice, i (slice.speciesId)}
											{@const count = slice.count !== undefined && slice.count !== null
												? slice.count
												: (sg.total !== null ? Math.round(slice.percentage / 100 * sg.total) : null)}
											<li class="stat-legend__item">
												<span
													class="stat-legend__swatch"
													style:background-color={slice.speciesId === '__other__' ? '#d4cdc4' : PALETTE[i % PALETTE.length]}
												></span>
												{#if slice.href}
													<a class="stat-legend__link" href={slice.href}>{slice.speciesName}</a>
												{:else}
													<span class="stat-legend__label">{slice.speciesName}</span>
												{/if}
												<span class="stat-legend__pct">({formatPct(slice.percentage)})</span>
												{#if count !== null}
													<span class="stat-legend__count">{formatNumber(count)}</span>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</section>
				{/each}
			{/if}
		{:else if block.kind === 'presence'}
				{@const counts = block.entries.map(e =>
					e.count !== undefined && e.count !== null
						? e.count
						: (e.worldTotal !== null ? Math.round(e.percentage / 100 * e.worldTotal) : null)
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
										<span class="presence-pct">{formatPct(entry.percentage)}</span>
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
								{#if entry.subGroups && entry.subGroups.length > 0}
									<ul class="subgroup-list">
										{#each entry.subGroups as sg (sg.groupId)}
											<li class="subgroup-item">
												<span class="subgroup-arrow" aria-hidden="true">↳</span>
												<a class="subgroup-link" href={sg.href}>{sg.groupName}</a>
												{#if sg.count !== null}
													<span class="subgroup-count">{formatNumber(sg.count)}</span>
												{/if}
												{#if sg.pctOfSlice !== null}
													<span class="subgroup-pct">({formatPct(sg.pctOfSlice)})</span>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
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

	.stat-legend__label {
		font-size: var(--text-sm);
		color: var(--ink-mid);
	}

	.stat-legend__count {
		font-size: var(--text-xs);
		color: var(--ink-faint);
		font-variant-numeric: tabular-nums;
		margin-left: 0.25em;
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

	/* ── Sub-groups ───────────────────────────────────────────────── */
	.subgroup-list {
		list-style: none;
		margin: var(--space-2) 0 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		width: 100%;
	}

	.subgroup-item {
		display: flex;
		align-items: baseline;
		gap: var(--space-1);
		font-size: var(--text-xs);
		color: var(--ink-faint);
		padding-inline-start: var(--space-3);
	}

	.subgroup-arrow {
		color: var(--ink-faint);
		flex: 0 0 auto;
		font-size: 0.65em;
	}

	.subgroup-link {
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.05em;
		color: var(--ink-mid);
		text-decoration: none;
		border-bottom: 1px solid var(--rule-hair, #d8d8d8);
	}

	.subgroup-link:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-warm);
	}

	.subgroup-count {
		font-variant-numeric: tabular-nums;
		color: var(--ink-faint);
	}

	.subgroup-pct {
		font-variant-numeric: tabular-nums;
		color: var(--ink-faint);
	}

	/* ── Sub-group population charts ──────────────────────────────── */
	.stat-block--subgroup {
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--rule-hair, #e0e0e0);
	}

	.subgroup-heading {
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		font-weight: 600;
		color: var(--ink-mid);
		margin: 0 0 var(--space-3);
		text-transform: lowercase;
	}

	.subgroup-heading__link {
		color: inherit;
		text-decoration: none;
		border-bottom: 1px solid var(--rule-hair, #d8d8d8);
	}

	.subgroup-heading__link:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-warm);
	}

	.stat-chart--small svg {
		max-width: 140px;
	}

	.stat-legend--small {
		flex: 1 1 8rem;
	}
</style>
