<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		forceSimulation,
		forceManyBody,
		forceLink,
		forceCenter,
		forceCollide,
		forceRadial,
		type SimulationNodeDatum,
		type SimulationLinkDatum
	} from 'd3-force';
	import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
	import { select } from 'd3-selection';
	import type { GraphData, GraphNode, GraphEdge } from './load';

	let { data }: { data: GraphData } = $props();

	// ── Types ────────────────────────────────────────────────────────────────

	interface SimNode extends SimulationNodeDatum {
		id: string;
		name: string;
		kind: string | null;
		cluster: string;
		degree: number;
		isCenter?: boolean;
	}

	interface SimEdge extends SimulationLinkDatum<SimNode> {
		kind: string;
		sourceNode?: SimNode;
		targetNode?: SimNode;
	}

	// ── Mode ─────────────────────────────────────────────────────────────────

	// When ?node=<id> is set we show the ego-graph for that node.
	let focusId = $derived(page.url.searchParams.get('node'));

	// ── State ────────────────────────────────────────────────────────────────

	let svgEl: SVGSVGElement;
	let containerEl: SVGGElement;

	let simNodes = $state<SimNode[]>([]);
	let simEdges = $state<SimEdge[]>([]);
	let transform = $state<ZoomTransform>(zoomIdentity);
	let hoveredId = $state<string | null>(null);
	let width = $state(800);
	let height = $state(600);

	// Degree threshold for always-on labels in full graph mode.
	// Top ~15% of nodes by degree, minimum 3.
	let prominentDegree = $derived.by(() => {
		if (focusId || simNodes.length === 0) return Infinity; // ego mode: all labels shown via focusId branch
		const sorted = simNodes.map((n) => n.degree).sort((a, b) => b - a);
		const cutoff = sorted[Math.floor(sorted.length * 0.15)] ?? 0;
		return Math.max(cutoff, 3);
	});

	// ── Precompute lookup tables from raw data ────────────────────────────────

	const nodeById = $derived(new Map<string, GraphNode>(data.nodes.map((n) => [n.id, n])));

	// neighbour sets for ego-graph derivation
	const neighboursOf = $derived.by(() => {
		const m = new Map<string, Set<string>>();
		for (const e of data.edges) {
			if (!m.has(e.source)) m.set(e.source, new Set());
			if (!m.has(e.target)) m.set(e.target, new Set());
			m.get(e.source)!.add(e.target);
			m.get(e.target)!.add(e.source);
		}
		return m;
	});

	const edgesOf = $derived.by(() => {
		const m = new Map<string, GraphEdge[]>();
		for (const e of data.edges) {
			if (!m.has(e.source)) m.set(e.source, []);
			if (!m.has(e.target)) m.set(e.target, []);
			m.get(e.source)!.push(e);
			m.get(e.target)!.push(e);
		}
		return m;
	});

	// ── Colour palette ───────────────────────────────────────────────────────

	const CLUSTER_COLORS: Record<string, string> = {};
	const PALETTE = [
		'#c7a15a', // Harmonia gold
		'#8fada2', // sea-sage
		'#b8a4c4', // soft violet
		'#c9b89a', // warm sand
		'#a8b89c', // muted green
		'#c9a4a0', // dusty rose
		'#7db0c4', // sky
		'#c4a07d'  // amber
	];
	let paletteIdx = 0;

	function clusterColor(cluster: string): string {
		if (!CLUSTER_COLORS[cluster]) {
			CLUSTER_COLORS[cluster] = PALETTE[paletteIdx % PALETTE.length];
			paletteIdx++;
		}
		return CLUSTER_COLORS[cluster];
	}

	// Pre-populate all clusters so legend is stable across mode switches
	$effect.pre(() => {
		for (const n of data.nodes) clusterColor(n.cluster);
	});

	// ── Helpers ───────────────────────────────────────────────────────────────

	function computeDegrees(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
		const deg = new Map<string, number>(nodes.map((n) => [n.id, 0]));
		for (const e of edges) {
			deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
			deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
		}
		return deg;
	}

	function nodeRadius(degree: number, isCenter = false): number {
		if (isCenter) return 18;
		return Math.min(4 + degree * 0.6, 16);
	}

	function isNeighbour(nodeId: string): boolean {
		if (!hoveredId) return false;
		return simEdges.some(
			(e) =>
				(e.sourceNode?.id === hoveredId && e.targetNode?.id === nodeId) ||
				(e.targetNode?.id === hoveredId && e.sourceNode?.id === nodeId)
		);
	}

	function edgeIsActive(e: SimEdge): boolean {
		if (!hoveredId) return false;
		// In ego mode: only activate edges touching a *neighbour*, not the
		// centre — hovering the centre would light every edge simultaneously.
		if (focusId && hoveredId === focusId) return false;
		return e.sourceNode?.id === hoveredId || e.targetNode?.id === hoveredId;
	}

	// ── Simulation management ─────────────────────────────────────────────────

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let currentSim: ReturnType<typeof forceSimulation<any, any>> | null = null;
	let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;

	function buildFullGraph() {
		const degrees = computeDegrees(data.nodes, data.edges);

		const nodeMap = new Map<string, SimNode>();
		const nodes: SimNode[] = data.nodes.map((n) => {
			const sn: SimNode = {
				id: n.id,
				name: n.name,
				kind: n.kind,
				cluster: n.cluster,
				degree: degrees.get(n.id) ?? 0
			};
			nodeMap.set(n.id, sn);
			return sn;
		});

		const edges: SimEdge[] = data.edges
			.filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
			.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));

		return { nodes, edges, nodeMap };
	}

	function buildEgoGraph(centerId: string) {
		const neighbours = neighboursOf.get(centerId) ?? new Set<string>();
		const egoEdges = edgesOf.get(centerId) ?? [];

		// Collect unique nodes: center + all neighbours
		const egoNodeIds = new Set([centerId, ...neighbours]);
		const egoNodeData = [...egoNodeIds]
			.map((id) => nodeById.get(id))
			.filter((n): n is GraphNode => n !== undefined);

		// Only edges that connect center ↔ neighbour
		const egoEdgeData = egoEdges.filter(
			(e) => egoNodeIds.has(e.source) && egoNodeIds.has(e.target)
		);

		// Degrees within ego graph (for sizing neighbours)
		const degrees = computeDegrees(egoNodeData, egoEdgeData);

		const nodeMap = new Map<string, SimNode>();
		const nodes: SimNode[] = egoNodeData.map((n) => {
			const isCenter = n.id === centerId;
			const sn: SimNode = {
				id: n.id,
				name: n.name,
				kind: n.kind,
				cluster: n.cluster,
				degree: degrees.get(n.id) ?? 0,
				isCenter,
				// Pin the center node
				...(isCenter ? { fx: width / 2, fy: height / 2 } : {})
			};
			nodeMap.set(n.id, sn);
			return sn;
		});

		const edges: SimEdge[] = egoEdgeData
			.filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
			.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));

		return { nodes, edges, nodeMap };
	}

	function startSimulation(
		nodes: SimNode[],
		edges: SimEdge[],
		isEgo: boolean
	) {
		currentSim?.stop();
		hoveredId = null;

		const cx = width / 2;
		const cy = height / 2;

		const sim = forceSimulation(nodes)
			.force(
				'link',
				forceLink<SimNode, SimEdge>(edges)
					.id((d) => d.id)
					.distance(isEgo ? 120 : 80)
					.strength(isEgo ? 0.8 : 0.4)
			)
			.force('charge', forceManyBody<SimNode>().strength(isEgo ? -400 : -180))
			.force('center', forceCenter(cx, cy))
			.force(
				'collide',
				forceCollide<SimNode>().radius((d) => nodeRadius(d.degree, d.isCenter) + 6)
			)
			.alphaDecay(isEgo ? 0.03 : 0.02);

		if (isEgo) {
			// Push neighbours into a ring around the center
			sim.force('radial', forceRadial<SimNode>(140, cx, cy).strength((d) => d.isCenter ? 0 : 0.6));
		}

		sim.on('tick', () => {
			for (const e of edges) {
				e.sourceNode = e.source as unknown as SimNode;
				e.targetNode = e.target as unknown as SimNode;
			}
			simNodes = nodes.slice();
			simEdges = edges.slice();
		});

		currentSim = sim;

		// Reset zoom to identity when switching modes
		if (svgEl && zoomBehavior) {
			select(svgEl).call(zoomBehavior.transform, zoomIdentity);
		}
	}

	// ── Reactive: rebuild sim when focusId changes ────────────────────────────

	$effect(() => {
		const id = focusId; // reactive dependency
		if (!svgEl) return; // not mounted yet
		untrack(() => {
			if (id) {
				const { nodes, edges } = buildEgoGraph(id);
				startSimulation(nodes, edges, true);
			} else {
				const { nodes, edges } = buildFullGraph();
				startSimulation(nodes, edges, false);
			}
		});
	});

	// ── Mount ────────────────────────────────────────────────────────────────

	onMount(() => {
		width = svgEl.clientWidth || window.innerWidth;
		height = svgEl.clientHeight || window.innerHeight;

		// Initial simulation
		const id = untrack(() => focusId);
		if (id) {
			const { nodes, edges } = buildEgoGraph(id);
			startSimulation(nodes, edges, true);
		} else {
			const { nodes, edges } = buildFullGraph();
			startSimulation(nodes, edges, false);
		}

		// Zoom
		zoomBehavior = zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.05, 8])
			.on('zoom', (event) => {
				transform = event.transform;
			});
		select(svgEl).call(zoomBehavior);

		// Resize
		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			width = entry.contentRect.width;
			height = entry.contentRect.height;
			currentSim?.force('center', forceCenter(width / 2, height / 2));
			currentSim?.alpha(0.2).restart();
		});
		ro.observe(svgEl);

		return () => {
			currentSim?.stop();
			ro.disconnect();
		};
	});

	// ── Edge label humanisation ───────────────────────────────────────────────

	const EDGE_LABELS: Record<string, string> = {
		'member-of':       'member of',
		'located-in':      'located in',
		'native-to':       'native to',
		'region-of':       'region of',
		'serves-in':       'serves in',
		'spoken-in':       'spoken in',
		'is-a':            'is a',
		'occurred-on':     'occurred on',
		'occurred-in':     'occurred in',
		'records':         'records',
		'recorded-on':     'recorded on',
		'orbits':          'orbits',
		'governed-by':     'governed by',
		'local-account-of':'local account of',
		'approaches':      'approaches',
		'defined-by':      'defined by',
		'bounded-by':      'bounded by',
		'inhabits':        'inhabits',
		'instance-of':     'instance of',
	};

	function edgeLabel(kind: string): string {
		return EDGE_LABELS[kind] ?? kind.replace(/[-_]/g, ' ');
	}

	// ── Click handlers ────────────────────────────────────────────────────────

	function handleNodeClick(node: SimNode) {
		if (focusId) {
			// Ego mode: center → entity page; neighbour → new ego graph
			if (node.isCenter) {
				goto('/' + node.id);
			} else {
				goto('/graph?node=' + encodeURIComponent(node.id));
			}
		} else {
			// Full graph mode: any click → ego graph for that node
			goto('/graph?node=' + encodeURIComponent(node.id));
		}
	}
</script>

<svelte:head>
	<title>Graph · {page.data.world.shortName}</title>
</svelte:head>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<svg
	bind:this={svgEl}
	class="graph-canvas"
	role="img"
	aria-label="Entity relationship graph"
	onmouseleave={() => (hoveredId = null)}
>
	<defs>
		<filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
			<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
			<feMerge>
				<feMergeNode in="blur" />
				<feMergeNode in="SourceGraphic" />
			</feMerge>
		</filter>
		<filter id="glow-strong" x="-80%" y="-80%" width="260%" height="260%">
			<feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
			<feMerge>
				<feMergeNode in="blur" />
				<feMergeNode in="blur" />
				<feMergeNode in="SourceGraphic" />
			</feMerge>
		</filter>
		<filter id="glow-center" x="-100%" y="-100%" width="300%" height="300%">
			<feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
			<feMerge>
				<feMergeNode in="blur" />
				<feMergeNode in="blur" />
				<feMergeNode in="SourceGraphic" />
			</feMerge>
		</filter>
	</defs>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- Background — resets hover when pointer moves off any node -->
	<rect
		class="graph-bg"
		x="0" y="0"
		width={width} height={height}
		onmouseenter={() => (hoveredId = null)}
	/>

	<g transform={transform.toString()} bind:this={containerEl}>
		<!-- Edges -->
		{#each simEdges as e (e.sourceNode?.id + '→' + e.targetNode?.id + ':' + e.kind)}
			{@const active = edgeIsActive(e)}
			{@const sx = e.sourceNode?.x ?? 0}
			{@const sy = e.sourceNode?.y ?? 0}
			{@const tx = e.targetNode?.x ?? 0}
			{@const ty = e.targetNode?.y ?? 0}
			{@const mx = (sx + tx) / 2}
			{@const my = (sy + ty) / 2}
			<line
				x1={sx} y1={sy} x2={tx} y2={ty}
				class="graph-edge"
				class:graph-edge--active={active}
				class:graph-edge--dim={hoveredId !== null && !active}
				data-kind={e.kind}
			/>
			{#if active && focusId}
				<text
					class="graph-edge-label"
					x={mx}
					y={my}
					text-anchor="middle"
					dominant-baseline="middle"
				>{edgeLabel(e.kind)}</text>
			{/if}
		{/each}

		<!-- Nodes -->
		{#each simNodes as node (node.id)}
			{@const r = nodeRadius(node.degree, node.isCenter)}
			{@const color = clusterColor(node.cluster)}
			{@const isHovered = hoveredId === node.id}
			{@const isNeighbourNode = isNeighbour(node.id)}
			{@const dim = hoveredId !== null && !isHovered && !isNeighbourNode}
			{@const showLabel = focusId !== null || isHovered || isNeighbourNode || node.degree >= prominentDegree}
			<!-- Hit area: covers visible circle + label above. Label sits at
			     dy=-(r+6) and is ~14px tall, so the rect top is -(r+24).
			     Width is generous (120px) to cover typical label text. -->
			{@const hitW = Math.max(r * 2 + 32, 120)}
			{@const hitTop = -(r + 28)}
			{@const hitH = r + 28 + r + 10}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<g
				class="graph-node"
				class:graph-node--center={node.isCenter}
				class:graph-node--hovered={isHovered}
				class:graph-node--neighbour={isNeighbourNode}
				class:graph-node--dim={dim}
				transform="translate({node.x ?? 0},{node.y ?? 0})"
				role="button"
				aria-label={node.name}
				onkeydown={(ev) => ev.key === 'Enter' && handleNodeClick(node)}
			>
				<circle
					{r}
					fill={node.isCenter ? '#e8d5a3' : color}
					filter={node.isCenter
						? 'url(#glow-center)'
						: isHovered
							? 'url(#glow-strong)'
							: 'url(#glow)'}
				/>
				{#if showLabel}
					<text
						class="graph-label"
						class:graph-label--center={node.isCenter}
						dy={-(r + 6)}
						text-anchor="middle"
					>{node.name}</text>
				{/if}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<!-- Invisible hit area on top — covers node + label -->
				<rect
					aria-hidden="true"
					class="graph-hit"
					x={-hitW / 2}
					y={hitTop}
					width={hitW}
					height={hitH}
					onmouseenter={() => (hoveredId = node.id)}
					onclick={() => handleNodeClick(node)}
				/>
			</g>
		{/each}
	</g>
</svg>

<!-- Ego mode: compact control strip centered below the masthead -->
{#if focusId}
	{@const centerNode = nodeById.get(focusId)}
	<nav class="graph-overlay">
		<a class="overlay-btn" href="/graph">← All</a>
		{#if centerNode}
			<span class="overlay-sep">·</span>
			<span class="overlay-name">{centerNode.name}</span>
			<span class="overlay-sep">·</span>
			<a class="overlay-btn" href={'/' + focusId}>Open →</a>
		{/if}
	</nav>
{/if}

<!-- Legend -->
<aside class="graph-legend">
	{#each Object.entries(CLUSTER_COLORS) as [cluster, color]}
		<div class="legend-item">
			<span class="legend-dot" style:background={color}></span>
			<span class="legend-name">{cluster}</span>
		</div>
	{/each}
</aside>

<style>
	:global(body:has(.graph-canvas)) {
		background: #09080f;
		overflow: hidden;
	}

	:global(main:has(.graph-canvas)) {
		max-width: 100% !important;
		padding: 0 !important;
		display: flex;
		flex-direction: column;
	}

	.graph-canvas {
		width: 100%;
		flex: 1;
		min-height: calc(100vh - 60px);
		display: block;
		cursor: grab;
	}

	.graph-canvas:active {
		cursor: grabbing;
	}

	.graph-bg {
		fill: transparent;
	}

	/* Edges */
	.graph-edge {
		stroke: #a55b46;
		stroke-width: 1;
		stroke-opacity: 0.2;
		pointer-events: none;
	}

	.graph-edge--active {
		stroke: #c7a15a;
		stroke-opacity: 0.75;
		stroke-width: 1.5;
	}

	.graph-edge--dim {
		stroke-opacity: 0.04;
	}

	.graph-edge[data-kind='inhabits'] {
		stroke: #8fada2;
	}

	.graph-edge[data-kind='instance-of'] {
		stroke: #b8a4c4;
	}

	/* Edge relationship labels — appear at midpoint on hover */
	.graph-edge-label {
		fill: #9a8a72;
		font-family: var(--font-ui, system-ui, sans-serif);
		font-size: 9px;
		font-variant: small-caps;
		letter-spacing: 0.05em;
		pointer-events: none;
		paint-order: stroke;
		stroke: #09080f;
		stroke-width: 4px;
	}

	/* Nodes */
	.graph-node {
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.graph-node--center {
		cursor: pointer;
	}

	.graph-node--dim {
		opacity: 0.15;
	}

	/* Invisible hit area */
	.graph-hit {
		fill: transparent;
		cursor: pointer;
		stroke: none;
	}

	/* Labels */
	.graph-label {
		fill: #c8b48a;
		font-family: var(--font-ui, system-ui, sans-serif);
		font-size: 10px;
		font-variant: small-caps;
		letter-spacing: 0.04em;
		pointer-events: none;
		paint-order: stroke;
		stroke: #09080f;
		stroke-width: 3px;
	}

	.graph-label--center {
		fill: #e8d5a3;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.06em;
	}

	/* Overlay nav (ego mode) — centered pill below the masthead rule */
	.graph-overlay {
		position: fixed;
		top: 148px; /* just below header + decorative rule */
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.9rem;
		background: rgba(9, 8, 15, 0.82);
		border: 1px solid rgba(199, 161, 90, 0.18);
		border-radius: 2rem;
		backdrop-filter: blur(6px);
		white-space: nowrap;
		pointer-events: all;
		z-index: 10;
	}

	.overlay-btn {
		font-family: var(--font-ui, system-ui, sans-serif);
		font-size: 10px;
		font-variant: small-caps;
		letter-spacing: 0.07em;
		color: #c7a15a;
		text-decoration: none;
		transition: color 0.15s;
	}

	.overlay-btn:hover {
		color: #e8d5a3;
	}

	.overlay-sep {
		font-size: 10px;
		color: rgba(199, 161, 90, 0.3);
		pointer-events: none;
	}

	.overlay-name {
		font-family: var(--font-ui, system-ui, sans-serif);
		font-size: 10px;
		font-variant: small-caps;
		letter-spacing: 0.07em;
		color: #e8d5a3;
	}

	/* Legend */
	.graph-legend {
		position: fixed;
		bottom: 1.5rem;
		left: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		pointer-events: none;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-name {
		font-family: var(--font-ui, system-ui, sans-serif);
		font-size: 10px;
		font-variant: small-caps;
		letter-spacing: 0.06em;
		color: #7a6a5a;
		text-transform: uppercase;
	}
</style>
