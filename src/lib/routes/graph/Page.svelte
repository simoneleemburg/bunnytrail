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
	import { buildKindTree } from '$lib/types';
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

	// ── Filter state ─────────────────────────────────────────────────────────

	let selectedKinds = $state<Set<string>>(new Set());
	let filterOpen = $state(false);

	// Kind hierarchy for transitive matching
	const kindTree = $derived(buildKindTree(new Map(Object.entries(data.kindParents ?? {}))));

	// Pre-flattened tree rows for rendering. Each entry carries its depth so
	// the template can indent without a recursive component.
	interface KindRow {
		id: string;
		label: string;
		/** Total count including all descendants. */
		count: number;
		/** True if this kind has any children that are also in the list. */
		hasChildren: boolean;
		/** Nesting depth (0 = root). */
		depth: number;
	}

	// Expanded state — kind ids whose children are shown. Empty = all collapsed.
	let expandedKinds = $state<Set<string>>(new Set());

	function toggleCollapse(id: string) {
		const next = new Set(expandedKinds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedKinds = next;
	}

	const kindTreeRows = $derived.by((): KindRow[] => {
		// Pass 1: direct counts per kind
		const direct = new Map<string, number>();
		for (const n of data.nodes) {
			const k = n.kind;
			if (!k) continue;
			direct.set(k, (direct.get(k) ?? 0) + 1);
		}

		// Pass 2: accumulate counts up to each ancestor
		const totals = new Map<string, number>(direct);
		for (const [kindId, count] of direct) {
			for (const ancestor of kindTree.ancestors(kindId)) {
				totals.set(ancestor, (totals.get(ancestor) ?? 0) + count);
			}
		}

		// The set of kinds that have at least one entity (directly or via descendants)
		const present = new Set(totals.keys());

		// For each present kind, find its parent among also-present kinds
		function presentParent(id: string): string | null {
			let cur = kindTree.parent(id);
			while (cur !== null) {
				if (present.has(cur)) return cur;
				cur = kindTree.parent(cur);
			}
			return null;
		}

		// Build children map restricted to present kinds
		const children = new Map<string | null, string[]>();
		for (const id of present) {
			const par = presentParent(id);
			if (!children.has(par)) children.set(par, []);
			children.get(par)!.push(id);
		}

		// Sort children at each level: by count desc, then label
		for (const list of children.values()) {
			list.sort((a, b) => {
				const dc = (totals.get(b) ?? 0) - (totals.get(a) ?? 0);
				if (dc !== 0) return dc;
				return (data.kindLabels?.[a] ?? a).localeCompare(data.kindLabels?.[b] ?? b);
			});
		}

		// Pre-order DFS to produce flat list with depth
		const rows: KindRow[] = [];
		function walk(id: string, depth: number) {
			const kids = children.get(id) ?? [];
			rows.push({
				id,
				label: data.kindLabels?.[id] ?? id,
				count: totals.get(id) ?? 0,
				hasChildren: kids.length > 0,
				depth
			});
			if (expandedKinds.has(id)) {
				for (const child of kids) walk(child, depth + 1);
			}
		}
		for (const root of (children.get(null) ?? [])) walk(root, 0);

		return rows;
	});

	// The set of node ids that pass the current kind filter (OR across selected kinds,
	// transitive). When nothing is selected, all nodes are visible.
	const filteredNodeIds = $derived.by((): Set<string> | null => {
		if (selectedKinds.size === 0) return null; // null = no filter active

		const result = new Set<string>();
		for (const n of data.nodes) {
			const k = n.kind;
			if (!k) continue;
			for (const sel of selectedKinds) {
				// match if n.kind equals sel OR sel is an ancestor of n.kind
				if (k === sel || kindTree.ancestors(k).includes(sel)) {
					result.add(n.id);
					break;
				}
			}
		}
		return result;
	});

	// Filtered nodes/edges fed to the simulation
	const filteredNodes = $derived.by((): GraphNode[] => {
		if (!filteredNodeIds) return data.nodes;
		return data.nodes.filter((n) => filteredNodeIds.has(n.id));
	});

	const filteredEdges = $derived.by((): GraphEdge[] => {
		if (!filteredNodeIds) return data.edges;
		return data.edges.filter(
			(e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
		);
	});

	function toggleKind(id: string) {
		const next = new Set(selectedKinds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedKinds = next;
	}

	function clearFilter() {
		selectedKinds = new Set();
	}

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

	// neighbour sets for ego-graph derivation — always over full data
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

	function buildFullGraph(srcNodes: GraphNode[], srcEdges: GraphEdge[]) {
		const degrees = computeDegrees(srcNodes, srcEdges);

		const nodeMap = new Map<string, SimNode>();
		const nodes: SimNode[] = srcNodes.map((n) => {
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

		const edges: SimEdge[] = srcEdges
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
				// Pin the center node and give it an explicit start position
				...(isCenter ? { fx: width / 2, fy: height / 2, x: width / 2, y: height / 2 } : {})
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

		// In ego mode the centre node is pinned at cx/cy — no forceCenter needed.
		// Radial radius scales up for small neighbourhoods so nodes don't crowd.
		const neighbourCount = isEgo ? nodes.length - 1 : 0;
		const egoRadius = Math.max(180, 120 + neighbourCount * 18);

		// Pre-position all ego-graph nodes before forceSimulation() sees them,
		// so D3 cannot assign its own initial positions (which start near origin).
		// Centre goes to cx/cy; neighbours go evenly around it at egoRadius.
		if (isEgo) {
			const nonCenter = nodes.filter((n) => !n.isCenter);
			const center = nodes.find((n) => n.isCenter);
			if (center) { center.x = cx; center.y = cy; }
			nonCenter.forEach((n, i) => {
				// Offset start angle by -π/2 so first neighbour sits directly above
				const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(nonCenter.length, 1);
				n.x = cx + egoRadius * Math.cos(angle);
				n.y = cy + egoRadius * Math.sin(angle);
			});
		}

		const sim = forceSimulation(nodes)
			.force('charge', forceManyBody<SimNode>().strength(isEgo ? -800 : -180))
			.force('collide',
				forceCollide<SimNode>().radius((d) => nodeRadius(d.degree, d.isCenter) + 10)
			)
			.alphaDecay(isEgo ? 0.03 : 0.02);

		if (!isEgo) {
			// Full graph: link force + center keep the graph coherent
			sim
				.force('link',
					forceLink<SimNode, SimEdge>(edges)
						.id((d) => d.id)
						.distance(80)
						.strength(0.4)
				)
				.force('center', forceCenter(cx, cy));

			sim.on('tick', () => {
				for (const e of edges) {
					e.sourceNode = e.source as unknown as SimNode;
					e.targetNode = e.target as unknown as SimNode;
				}
				simNodes = nodes.slice();
				simEdges = edges.slice();
			});
		} else if (nodes.length <= 2) {
			// 1-neighbour case: stop D3 before it ticks, then place nodes explicitly
			// and wire up edges for the SVG renderer.
			sim.stop();
			// Re-apply positions after sim construction (D3 may jiggle them during init)
			const nonCenter2 = nodes.filter((n) => !n.isCenter);
			const center2 = nodes.find((n) => n.isCenter);
			if (center2) { center2.x = cx; center2.y = cy; }
			nonCenter2.forEach((n, i) => {
				const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(nonCenter2.length, 1);
				n.x = cx + egoRadius * Math.cos(angle);
				n.y = cy + egoRadius * Math.sin(angle);
			});
			const nodeMap = new Map(nodes.map((n) => [n.id, n]));
			for (const e of edges) {
				e.sourceNode = nodeMap.get(e.source as string);
				e.targetNode = nodeMap.get(e.target as string);
			}
			simNodes = nodes.slice();
			simEdges = edges.slice();
		} else {
			// Ego graph (3+ nodes): radial + link cooperate to form a ring.
			sim
				.force('link',
					forceLink<SimNode, SimEdge>(edges)
						.id((d) => d.id)
						.distance(egoRadius)
						.strength(0.3)
				)
				.force('radial', forceRadial<SimNode>(egoRadius, cx, cy).strength((d) => d.isCenter ? 0 : 0.8));

			sim.on('tick', () => {
				for (const e of edges) {
					e.sourceNode = e.source as unknown as SimNode;
					e.targetNode = e.target as unknown as SimNode;
				}
				simNodes = nodes.slice();
				simEdges = edges.slice();
			});
		}

		currentSim = sim;

		// Reset zoom to identity when switching modes
		if (svgEl && zoomBehavior) {
			select(svgEl).call(zoomBehavior.transform, zoomIdentity);
		}
	}

	// ── Reactive: rebuild sim when focusId OR filter changes ─────────────────

	$effect(() => {
		const id = focusId; // reactive dependency
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		filteredNodes; filteredEdges; // reactive dep — filter changes trigger resim
		if (!svgEl) return; // not mounted yet
		untrack(() => {
			if (id) {
				// Ego mode always uses full graph neighbourhood (filter doesn't apply in ego)
				const { nodes, edges } = buildEgoGraph(id);
				startSimulation(nodes, edges, true);
			} else {
				const { nodes, edges } = buildFullGraph(filteredNodes, filteredEdges);
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
		const fNodes = untrack(() => filteredNodes);
		const fEdges = untrack(() => filteredEdges);
		if (id) {
			const { nodes, edges } = buildEgoGraph(id);
			startSimulation(nodes, edges, true);
		} else {
			const { nodes, edges } = buildFullGraph(fNodes, fEdges);
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
		{#if centerNode?.kindLabel}
			<span class="overlay-sep">·</span>
			<span class="overlay-name">{centerNode.kindLabel}</span>
		{/if}
		<span class="overlay-sep">·</span>
		<a class="overlay-btn" href={'/' + focusId}>Open →</a>
	</nav>
{/if}

<!-- Kind filter panel (full-graph mode only) -->
{#if !focusId}
	<!-- Toggle button -->
	<!-- svelte-ignore a11y_consider_explicit_label -->
	<button
		class="filter-toggle"
		class:filter-toggle--active={selectedKinds.size > 0}
		onclick={() => (filterOpen = !filterOpen)}
		aria-expanded={filterOpen}
		aria-label="Filter by kind"
	>
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
			<path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
		</svg>
		{#if selectedKinds.size > 0}
			<span class="filter-badge">{selectedKinds.size}</span>
		{/if}
	</button>

	<!-- Panel -->
	{#if filterOpen}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<aside class="filter-panel" onmouseenter={() => {}} onmouseleave={() => {}}>
			<header class="filter-header">
				<span class="filter-title">Filter by kind</span>
				{#if selectedKinds.size > 0}
					<button class="filter-clear" onclick={clearFilter}>Clear</button>
				{/if}
			</header>
			<ul class="filter-list">
				{#each kindTreeRows as row (row.id)}
					<li class="filter-item" class:filter-item--child={row.depth > 0}>
						{#if row.hasChildren}
							<!-- Row with collapse toggle + checkbox -->
							<div class="filter-row">
								<button
									class="filter-collapse"
									class:filter-collapse--open={expandedKinds.has(row.id)}
									onclick={() => toggleCollapse(row.id)}
									aria-label={expandedKinds.has(row.id) ? 'Collapse' : 'Expand'}
								>▶</button>
								<label class="filter-row-inner">
									<input
										type="checkbox"
										class="filter-check"
										checked={selectedKinds.has(row.id)}
										onchange={() => toggleKind(row.id)}
									/>
									<span class="filter-label">{row.label}</span>
									<span class="filter-count">{row.count}</span>
								</label>
							</div>
						{:else}
							<!-- Leaf row — no collapse toggle, just indent guide -->
							<label class="filter-row filter-row--leaf">
								<span class="filter-indent-guide" aria-hidden="true"></span>
								<input
									type="checkbox"
									class="filter-check"
									checked={selectedKinds.has(row.id)}
									onchange={() => toggleKind(row.id)}
								/>
								<span class="filter-label">{row.label}</span>
								<span class="filter-count">{row.count}</span>
							</label>
						{/if}
					</li>
				{/each}
			</ul>
		</aside>
	{/if}
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

	/* ── Kind filter toggle button ─────────────────────────────────────────── */

	.filter-toggle {
		position: fixed;
		top: 148px;
		right: 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.75rem;
		background: rgba(9, 8, 15, 0.82);
		border: 1px solid rgba(199, 161, 90, 0.18);
		border-radius: 2rem;
		backdrop-filter: blur(6px);
		cursor: pointer;
		color: #9a8a72;
		transition: color 0.15s, border-color 0.15s;
		z-index: 10;
		font-family: var(--font-ui, system-ui, sans-serif);
		font-size: 10px;
		font-variant: small-caps;
		letter-spacing: 0.07em;
	}

	.filter-toggle:hover,
	.filter-toggle--active {
		color: #c7a15a;
		border-color: rgba(199, 161, 90, 0.4);
	}

	.filter-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		background: rgba(199, 161, 90, 0.25);
		border-radius: 8px;
		font-size: 9px;
		color: #c7a15a;
	}

	/* ── Kind filter panel ─────────────────────────────────────────────────── */

	.filter-panel {
		position: fixed;
		top: 186px; /* below the toggle button */
		right: 1.5rem;
		width: 220px;
		max-height: calc(100vh - 220px);
		overflow-y: auto;
		background: rgba(9, 8, 15, 0.90);
		border: 1px solid rgba(199, 161, 90, 0.18);
		border-radius: 0.75rem;
		backdrop-filter: blur(8px);
		z-index: 10;
		padding: 0.75rem 0;
	}

	/* Scrollbar — subtle */
	.filter-panel::-webkit-scrollbar { width: 4px; }
	.filter-panel::-webkit-scrollbar-track { background: transparent; }
	.filter-panel::-webkit-scrollbar-thumb { background: rgba(199, 161, 90, 0.15); border-radius: 2px; }

	.filter-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.9rem 0.5rem;
		border-bottom: 1px solid rgba(199, 161, 90, 0.1);
		margin-bottom: 0.25rem;
	}

	.filter-title {
		font-family: var(--font-ui, system-ui, sans-serif);
		font-size: 9px;
		font-variant: small-caps;
		letter-spacing: 0.1em;
		color: #6a5a4a;
		text-transform: uppercase;
	}

	.filter-clear {
		font-family: var(--font-ui, system-ui, sans-serif);
		font-size: 9px;
		font-variant: small-caps;
		letter-spacing: 0.07em;
		color: #c7a15a;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		transition: color 0.15s;
	}

	.filter-clear:hover {
		color: #e8d5a3;
	}

	.filter-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.filter-item--child {
		/* Left border line groups children visually under their parent */
		border-left: 1px solid rgba(199, 161, 90, 0.15);
		margin-left: 0.9rem;
	}

	/* Row that contains a collapse toggle + inner label */
	.filter-row {
		display: flex;
		align-items: center;
		gap: 0;
		padding: 0.28rem 0.9rem 0.28rem 0;
		cursor: pointer;
		transition: background 0.1s;
	}

	.filter-row:hover {
		background: rgba(199, 161, 90, 0.06);
	}

	/* Collapse arrow button */
	.filter-collapse {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		cursor: pointer;
		color: rgba(199, 161, 90, 0.3);
		font-size: 7px;
		padding: 0;
		transition: color 0.1s, transform 0.15s;
		transform: rotate(0deg);
	}

	.filter-collapse--open {
		transform: rotate(90deg);
		color: rgba(199, 161, 90, 0.5);
	}

	.filter-collapse:hover {
		color: #c7a15a;
	}

	/* Inner label (used when there's a collapse toggle) */
	.filter-row-inner {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		min-width: 0;
	}

	/* Leaf rows have no collapse toggle; align checkbox with parent's */
	.filter-row--leaf {
		padding-left: 18px;
	}

	.filter-check {
		appearance: none;
		width: 12px;
		height: 12px;
		border: 1px solid rgba(199, 161, 90, 0.3);
		border-radius: 3px;
		background: transparent;
		flex-shrink: 0;
		cursor: pointer;
		position: relative;
		transition: background 0.1s, border-color 0.1s;
	}

	.filter-check:checked {
		background: rgba(199, 161, 90, 0.3);
		border-color: rgba(199, 161, 90, 0.7);
	}

	.filter-check:checked::after {
		content: '';
		position: absolute;
		inset: 2px;
		background: #c7a15a;
		border-radius: 1px;
	}

	.filter-label {
		flex: 1;
		font-family: var(--font-ui, system-ui, sans-serif);
		font-size: 10px;
		font-variant: small-caps;
		letter-spacing: 0.05em;
		color: #c8b48a;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.filter-count {
		font-family: var(--font-ui, system-ui, sans-serif);
		font-size: 9px;
		color: #4a3a2a;
		flex-shrink: 0;
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
