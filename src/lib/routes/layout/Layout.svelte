<script lang="ts">
	import '$lib/styles/global.css';

	import { page } from '$app/stores';
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { browser, dev } from '$app/environment';
	import { onMount, setContext } from 'svelte';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { paintAllScope, paintMode, readMode, translateUrl, type ScopeContext, type ViewMode } from '$lib/cluster';
	import SvgLightbox from '$lib/components/SvgLightbox.svelte';
	import SearchOverlay from '$lib/components/SearchOverlay.svelte';
	import type { Snippet } from 'svelte';
	import type { EraDef, EraConfig } from '$lib/types';

	interface Props {
		data: {
			nav: { href: string; label: string; count: number }[];
			kindsHref: string;
			clusterOptions: { value: string; label: string; selected: boolean }[];
			selectedCluster: string | null;
		activeEra: string | null;
		activeMode: ViewMode;
		issueCount: number;
		world: { name: string; shortName: string; tagline: string; allScopeLabel: string; eras: EraConfig | null };
			wordmark: string | null;
			ornament: {
				glyph: string | null;
				svg: string | null;
				guides: { glyph: string | null; svg: string | null };
			};
			ornamentGlyphStyle: string | null;
			worldMarkStyle: string | null;
			navSep: string;
			scopeContext: ScopeContext;
		};
		children: Snippet;
	}

	let { data, children }: Props = $props();

	// Vercel Web Analytics. Safe to call unconditionally — on
	// non-Vercel deployments the beacon endpoint is absent, so the
	// script no-ops. Mode='development' silences beacons during
	// local dev but still wires the page-view listener so a build
	// against a real Vercel project keeps working.
	onMount(() => {
		if (!browser) return;
		injectAnalytics({ mode: dev ? 'development' : 'production' });

		// In dev, subscribe to the graph-reload SSE stream so that any
		// file change picked up by the watcher (content, kinds, world.md,
		// etc.) triggers a SvelteKit invalidation — causing all active
		// load() functions to re-run and the page data to refresh without
		// a manual browser reload.
		if (dev) {
			let knownVersion: number | null = null;
			const es = new EventSource('/api/graph-reload');
			es.onmessage = (event) => {
				const v = parseInt(event.data, 10);
				if (Number.isNaN(v)) return;
				if (knownVersion === null) {
					knownVersion = v; // baseline — don't invalidate on first message
				} else if (v !== knownVersion) {
					knownVersion = v;
					void invalidateAll();
				}
			};
			return () => es.close();
		}
	});

	// Set to true while the user-initiated cluster switch is
	// navigating. The beforeNavigate hook checks this and bows out
	// — otherwise it would re-paint ?scope=all onto a cluster URL
	// just chosen from the selector, effectively reverting the
	// switch.
	let bypassScopePaint = false;

	// Set to true while switchEra is navigating, so that the
	// beforeNavigate hook doesn't re-inject the old era param onto
	// the destination URL (which would prevent clearing the era).
	let bypassEraCarry = false;

	// Set to true while switchMode is navigating, so that the
	// beforeNavigate hook doesn't re-paint ?mode=dev onto a URL that
	// is intentionally clearing or changing the mode.
	let bypassModeCarry = false;

	// Expose a setter so deeply nested components (e.g. PageHeader's
	// "focus on <cluster>" link) can trigger a cluster-switch
	// navigation without going through the masthead selector. The
	// caller sets the flag, then navigates; beforeNavigate sees it
	// and bows out of scope-painting for that one navigation.
	setContext('bypassNextScopePaint', () => {
		bypassScopePaint = true;
	});

	// Mobile nav drawer open state + filter panel open state.
	// Both are auto-closed on route change and on Escape; the
	// filter panel also closes on outside click.
	let drawerOpen = $state(false);
	let filtersOpen = $state(false);
	let metaOpen = $state(false);
	let searchOpen = $state(false);

	// Keep these for backward-compat with switchCluster/switchEra which
	// reference filtersOpen directly.

	// Ordered list of EraDef objects for the filters panel era section.
	// cluster is active and has a perCluster entry, use that
	// cluster's era order; otherwise use all definitions.
	const eraOptions = $derived.by(() => {
		const cfg = data.world.eras;
		if (!cfg) return [];
		const cluster = data.selectedCluster;
		const pc = cluster ? cfg.perCluster[cluster] : null;
		const refs = pc ? pc.eras : cfg.definitions.map((d) => d.ref);
		return refs
			.map((ref) => cfg.definitions.find((d) => d.ref === ref))
			.filter(Boolean) as EraDef[];
	});

	// Path-derived hooks for world CSS. `data-bt-path` carries the
	// full pathname (sans leading slash); `data-bt-section` carries
	// only the first segment. Together they let world CSS scope
	// theming to a region of the world without the world having to
	// touch the engine — e.g. `[data-bt-section="foundation"]
	// .bt-link[data-bt-slug="harmonia"] { color: gold }` to gild
	// Harmonia mentions only when the reader is reading foundation
	// content. The empty home page (`/`) yields empty values for
	// both, which CSS attribute selectors won't match.
	let pathAttrs = $derived.by(() => {
		const raw = $page.url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
		const section = raw.split('/')[0] ?? '';
		return { path: raw, section };
	});

	// activeMode is read from the live URL rather than from layout data.
	// Layout data is baked in at prerender time (always 'visitor'), so
	// reading from $page.url.searchParams here is the only way ?mode=dev
	// works on a fully-prerendered site like production.
	const activeMode = $derived.by((): ViewMode => {
		try {
			return readMode($page.url.searchParams);
		} catch {
			return 'visitor';
		}
	});

	// activeEra is read from the live URL for the same reason — layout
	// data is prerendered as null and won't reflect ?era= on the client.
	const activeEra = $derived.by((): string | null => {
		try {
			return $page.url.searchParams.get('era') ?? null;
		} catch {
			return null;
		}
	});

	// Active-state for primary nav links. Returns:
	//   'page'  — link's href matches the current path exactly
	//   true    — current path is under the link's href (descendant)
	//   undefined — not active
	//
	// Semantics: clicking a card under /objects/freya keeps the
	// OBJECTS nav link marked active, which matches how readers
	// think about "where am I in the site". The /kinds link is the
	// special-case below — it lights up under /kinds, not under
	// /kinds/* (a kind detail page is in the kinds *section* but
	// the readers still expect the link to feel "current"), so we
	// fold both into the section semantics with a Boolean.
	//
	// Rendered as `aria-current="page"` (exact) or `aria-current="true"`
	// (descendant) — valid ARIA 1.1 tokens. Themes select with
	// `[aria-current]` to dress active items.
	function navAriaCurrent(href: string): 'page' | true | undefined {
		const current = '/' + ($page.url.pathname.replace(/^\/+/, '').replace(/\/+$/, '') || '');
		const target = '/' + (href.replace(/^\/+/, '').replace(/\/+$/, '') || '');
		if (current === target) return 'page';
		if (target !== '/' && (current === target || current.startsWith(target + '/')))
			return true;
		return undefined;
	}

	// In-app navigation hook: when the user is browsing in All
	// scope, paint `?scope=all` onto outgoing internal links that
	// would otherwise look scoped (i.e. start with a cluster prefix).
	// This is what keeps "click Freya from /characters" honest:
	// without it, the destination `/aurethia/characters/freya` would
	// re-scope the selector to Aurethia. With it, the destination
	// becomes `/aurethia/characters/freya?scope=all` and All sticks.
	//
	// Right-clicks (new tab) and pasted/shared URLs bypass this hook
	// — that's intentional. In those cases the URL alone determines
	// scope, which is the honest behaviour for a brand-new context.
	beforeNavigate((nav) => {
		drawerOpen = false;
		filtersOpen = false;
		metaOpen = false;
		searchOpen = false;

		if (bypassScopePaint) {
			bypassScopePaint = false;
			return;
		}
		if (!nav.to) return;
		if (nav.to.url.origin !== nav.from?.url.origin) return;
		// Don't paint API routes — they're never user destinations.
		if (nav.to.url.pathname.startsWith('/api/')) return;

		// Determine what the destination URL should look like after
		// applying both the scope paint and the era carry-forward.
		let target = nav.to.url;

		// Scope paint: in All scope, paint ?scope=all onto cluster-prefixed URLs.
		if (data.selectedCluster === null) {
			target = paintAllScope(target, data.scopeContext);
		}

		// Era carry-forward: inject the active era onto destinations that
		// don't already carry ?era=. Skipped when switchEra is navigating
		// (it already set the param correctly, including deleting it for "All eras").
		if (!bypassEraCarry && activeEra && !target.searchParams.has('era')) {
			const out = new URL(target.href);
			out.searchParams.set('era', activeEra);
			target = out;
		}
		bypassEraCarry = false;

		// Mode carry-forward: paint ?mode=dev onto every destination when dev mode is active.
		if (!bypassModeCarry && activeMode === 'dev' && !target.searchParams.has('mode')) {
			target = paintMode(target, 'dev');
		}
		bypassModeCarry = false;

		if (target.href === nav.to.url.href) return;
		nav.cancel();
		goto(target.href, { replaceState: false, keepFocus: true });
	});

	function switchCluster(value: string) {
		const newScope = value === '' ? null : value;
		const target = translateUrl(
			{
				pathname: $page.url.pathname,
				search: $page.url.search,
				hash: $page.url.hash
			},
			newScope,
			data.scopeContext
		);
		bypassScopePaint = true;
		filtersOpen = false;
		drawerOpen = false;
		goto(target);
	}

	function switchEra(ref: string | null) {
		const u = new URL($page.url);
		if (ref) u.searchParams.set('era', ref);
		else u.searchParams.delete('era');
		bypassEraCarry = true;
		filtersOpen = false;
		drawerOpen = false;
		goto(u.toString());
	}

	function switchMode(mode: ViewMode) {
		const u = new URL($page.url);
		if (mode === 'visitor') {
			u.searchParams.delete('mode');
		} else {
			u.searchParams.set('mode', mode);
		}
		bypassModeCarry = true;
		filtersOpen = false;
		drawerOpen = false;
		goto(u.toString());
	}

	// Escape closes whichever menu is open (cluster picker first
	// since it's the inner-most layer).
	function onKeydown(e: KeyboardEvent) {
		// '/' opens search unless the user is typing in an input/textarea.
		if (
			e.key === '/' &&
			!searchOpen &&
			!(e.target instanceof HTMLInputElement) &&
			!(e.target instanceof HTMLTextAreaElement) &&
			!(e.target instanceof HTMLElement && e.target.isContentEditable)
		) {
			e.preventDefault();
			searchOpen = true;
			return;
		}
		if (e.key !== 'Escape') return;
		if (searchOpen) searchOpen = false;
		else if (filtersOpen) filtersOpen = false;
		else if (metaOpen) metaOpen = false;
		else if (drawerOpen) drawerOpen = false;
	}

	function onDocumentClickFilters(e: MouseEvent) {
		const target = e.target as Element | null;
		if (target?.closest('[data-filters-picker]')) return;
		filtersOpen = false;
	}

	$effect(() => {
		if (!browser) return;
		if (!filtersOpen) return;
		document.addEventListener('click', onDocumentClickFilters);
		return () => document.removeEventListener('click', onDocumentClickFilters);
	});

	function onDocumentClickMeta(e: MouseEvent) {
		const target = e.target as Element | null;
		if (target?.closest('[data-meta-picker]')) return;
		metaOpen = false;
	}

	$effect(() => {
		if (!browser) return;
		if (!metaOpen) return;
		document.addEventListener('click', onDocumentClickMeta);
		return () => document.removeEventListener('click', onDocumentClickMeta);
	});

	let metaActive = $derived.by(() => {
		const current = '/' + ($page.url.pathname.replace(/^\/+/, '').replace(/\/+$/, '') || '');
		return (
			current === '/kinds' ||
			current.startsWith('/kinds/') ||
			current === '/relations' ||
			current.startsWith('/relations/') ||
			current === '/blog' ||
			current.startsWith('/blog/') ||
			current === '/guides' ||
			current.startsWith('/guides/') ||
			current === '/symbology' ||
			current.startsWith('/symbology/') ||
			current === '/graph' ||
			/^\/[^/]+\/kinds(\/|$)/.test(current)
		);
	});

	// True when any filter is actively set — drives the active indicator on the Filters button.
	const filtersActive = $derived(
		activeEra !== null || data.selectedCluster !== null || activeMode === 'dev'
	);

	// Dev bar: shown below the masthead in dev mode on entity and collection pages.
	// Reads from $page.data which merges layout + route data.
	const devBar = $derived.by(() => {
		if (activeMode !== 'dev') return null;
		const pd = $page.data as Record<string, unknown>;
		if (pd.kind === 'entity') {
			const devInfo = pd.devInfo as {
				issues: { kind: string; detail: string }[];
				mdPath: string;
				isStub: boolean;
				kind: string | null;
				classId: string | null;
			} | null;
			if (!devInfo) return null;
			const entityId = (pd.entity as { id: string } | undefined)?.id ?? null;
			return {
				path: entityId,
				issues: devInfo.issues,
				isStub: devInfo.isStub,
				kind: devInfo.kind,
				classId: devInfo.classId
			};
		}
		if (pd.kind === 'collection') {
			const collectionPath = pd.type as string | undefined ?? null;
			return {
				path: collectionPath,
				issues: [] as { kind: string; detail: string }[],
				isStub: false,
				kind: null as string | null,
				classId: null as string | null
			};
		}
		return null;
	});

	async function copyPath() {
		if (devBar?.path) { await navigator.clipboard.writeText(devBar.path); showToast(devBar.path); }
	}

	async function copyKind() {
		if (devBar?.kind) { await navigator.clipboard.writeText(devBar.kind); showToast(devBar.kind); }
	}

	async function copyClassId() {
		if (devBar?.classId) { await navigator.clipboard.writeText(devBar.classId); showToast(devBar.classId); }
	}

	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | null = null;

	function showToast(text: string) {
		toast = text;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { toast = null; }, 1500);
	}
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href="/api/assets/favicon.svg" />
	{#if data.ornamentGlyphStyle}
		<!-- Inject the world's ornament glyph as a CSS custom property
		     so the --ornament-glyph token (consumed by hr::before and
		     .bt-fleuron__glyph::before in global.css) is driven by
		     world.md rather than requiring a theme.css override.
		     The CSS string is built in load.ts to avoid template
		     literals containing CSS inside the Svelte template. -->
		{@html '<style>' + data.ornamentGlyphStyle + '</style>'}
	{/if}
	{#if data.worldMarkStyle}
		<!-- Inject --wordmark-mark and enable .wordmark-mark visibility
		     from ornament.world_mark in world.md. Without this the
		     element stays display:none (engine default), so no glyph
		     appears for worlds that haven't declared one. -->
		{@html '<style>' + data.worldMarkStyle + '</style>'}
	{/if}
</svelte:head>

<svelte:window on:keydown={onKeydown} />

<div class="page" class:drawer-open={drawerOpen}>
	<header class="masthead">
		<div class="masthead-inner">
			<a class="wordmark" class:wordmark-svg={data.wordmark} href="/" aria-label={data.world.name}>
				{#if data.wordmark}
					<span class="wordmark-figure" aria-hidden="true">{@html data.wordmark}</span>
				{:else}
					<span class="wordmark-mark" aria-hidden="true"></span>
					<span class="wordmark-name">{data.world.name}</span>
				{/if}
			</a>

			<nav class="nav-desktop" aria-label="Primary">
				{#each data.nav as item (item.href)}
					<a href={item.href} aria-current={navAriaCurrent(item.href)}>{item.label}</a>
				{/each}
			</nav>

			{#if activeMode === 'dev' && data.issueCount > 0}
				<a class="health-badge" href="/health" title="{data.issueCount} health issue{data.issueCount === 1 ? '' : 's'}">
					{data.issueCount}
				</a>
			{/if}

			<div class="chrome-end">
				<button
					type="button"
					class="search-trigger"
					aria-label="Search"
					onclick={() => (searchOpen = true)}
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5"/>
						<path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>

				<div class="meta-picker" data-meta-picker>
					<button
						type="button"
						class="meta-trigger"
						aria-haspopup="listbox"
						aria-expanded={metaOpen}
						aria-current={metaActive ? true : undefined}
						onclick={() => (metaOpen = !metaOpen)}
					>
						<span class="meta-eyebrow">Meta</span>
						<span class="meta-caret" aria-hidden="true">▾</span>
					</button>
					{#if metaOpen}
						<ul class="meta-menu" role="listbox">
							<li>
								<a
									href={data.kindsHref}
									role="option"
									aria-selected={!!navAriaCurrent(data.kindsHref)}
									class:selected={!!navAriaCurrent(data.kindsHref)}
									onclick={() => (metaOpen = false)}
								>Kinds</a>
							</li>
							<li>
								<a
									href="/guides"
									role="option"
									aria-selected={!!navAriaCurrent('/guides')}
									class:selected={!!navAriaCurrent('/guides')}
									onclick={() => (metaOpen = false)}
								>Guides</a>
							</li>
							<li>
								<a
									href="/blog"
									role="option"
									aria-selected={!!navAriaCurrent('/blog')}
									class:selected={!!navAriaCurrent('/blog')}
									onclick={() => (metaOpen = false)}
								>Journal</a>
							</li>
							<li>
								<a
									href="/symbology"
									role="option"
									aria-selected={!!navAriaCurrent('/symbology')}
									class:selected={!!navAriaCurrent('/symbology')}
									onclick={() => (metaOpen = false)}
								>Symbology</a>
							</li>
							<li>
								<a
									href="/graph"
									role="option"
									aria-selected={!!navAriaCurrent('/graph')}
									class:selected={!!navAriaCurrent('/graph')}
									onclick={() => (metaOpen = false)}
								>Graph</a>
							</li>
							<li>
								<a
									href="/relations"
									role="option"
									aria-selected={!!navAriaCurrent('/relations')}
									class:selected={!!navAriaCurrent('/relations')}
									onclick={() => (metaOpen = false)}
								>Relations</a>
							</li>
						</ul>
					{/if}
				</div>

				<div class="filters-picker" data-filters-picker>
					<button
						type="button"
						class="filters-trigger"
						aria-haspopup="true"
						aria-expanded={filtersOpen}
						class:active={filtersActive}
						onclick={() => (filtersOpen = !filtersOpen)}
					>
						<span class="filters-label">Filters</span>
						<span class="filters-caret" aria-hidden="true">▾</span>
					</button>
					{#if filtersOpen}
					<div class="filters-panel">
						{#if eraOptions.length > 0}
								<section class="filters-section">
									<p class="filters-eyebrow">Era</p>
									<ul class="filters-list" role="listbox">
										<li>
											<button
												type="button"
												role="option"
												aria-selected={activeEra === null}
												class:selected={activeEra === null}
												onclick={() => switchEra(null)}
											>All eras</button>
										</li>
										{#each eraOptions as opt (opt.ref)}
											<li>
												<button
													type="button"
													role="option"
													aria-selected={activeEra === opt.ref}
													class:selected={activeEra === opt.ref}
													onclick={() => switchEra(opt.ref)}
												>{opt.title}</button>
											</li>
										{/each}
									</ul>
								</section>
							{/if}
							{#if data.clusterOptions.length > 1}
								<section class="filters-section">
									<p class="filters-eyebrow">Cluster</p>
									<ul class="filters-list" role="listbox">
										{#each data.clusterOptions as opt (opt.value)}
											<li>
												<button
													type="button"
													role="option"
													aria-selected={opt.selected}
													class:selected={opt.selected}
													onclick={() => switchCluster(opt.value)}
												>{opt.label}</button>
											</li>
										{/each}
									</ul>
								</section>
						{/if}
						<div class="filters-dev-toggle">
							<button
								type="button"
								class="dev-toggle-btn"
								class:active={activeMode === 'dev'}
								onclick={() => switchMode(activeMode === 'dev' ? 'visitor' : 'dev')}
							>
								<span class="dev-toggle-indicator" aria-hidden="true"></span>
								{activeMode === 'dev' ? 'Disable dev mode' : 'Enable dev mode'}
							</button>
						</div>
					</div>
					{/if}
				</div>

				<button
					type="button"
					class="hamburger"
					aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
					aria-expanded={drawerOpen}
					aria-controls="mobile-drawer"
					onclick={() => (drawerOpen = !drawerOpen)}
				>
					<span class="hamburger-bar" aria-hidden="true"></span>
					<span class="hamburger-bar" aria-hidden="true"></span>
					<span class="hamburger-bar" aria-hidden="true"></span>
				</button>
			</div>
		</div>

		{#if drawerOpen}
			<div class="drawer" id="mobile-drawer">
				<nav class="nav-mobile" aria-label="Primary mobile">
					{#each data.nav as item (item.href)}
						<a href={item.href} aria-current={navAriaCurrent(item.href)}>{item.label}</a>
					{/each}
					<a href={data.kindsHref} aria-current={navAriaCurrent(data.kindsHref)}>Kinds</a>
				<a href="/guides" aria-current={navAriaCurrent('/guides')}>Guides</a>
				<a href="/blog" aria-current={navAriaCurrent('/blog')}>Journal</a>
				<a href="/symbology" aria-current={navAriaCurrent('/symbology')}>Symbology</a>
				<a href="/graph" aria-current={navAriaCurrent('/graph')}>Graph</a>
				<a href="/relations" aria-current={navAriaCurrent('/relations')}>Relations</a>
				</nav>

				{#if data.clusterOptions.length > 1}
					<div class="drawer-cluster">
						<p class="drawer-cluster-eyebrow">Cluster</p>
						<ul class="drawer-cluster-list" role="listbox">
							{#each data.clusterOptions as opt (opt.value)}
								<li>
									<button
										type="button"
										role="option"
										aria-selected={opt.selected}
										class:selected={opt.selected}
										onclick={() => switchCluster(opt.value)}
									>
										{opt.label}
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if eraOptions.length > 0}
					<div class="drawer-era">
						<p class="drawer-era-eyebrow">Era</p>
						<ul class="drawer-era-list" role="listbox">
							<li>
								<button
									type="button"
									role="option"
									aria-selected={activeEra === null}
									class:selected={activeEra === null}
									onclick={() => switchEra(null)}
								>All eras</button>
							</li>
							{#each eraOptions as opt (opt.ref)}
								<li>
									<button
										type="button"
										role="option"
										aria-selected={activeEra === opt.ref}
										class:selected={activeEra === opt.ref}
										onclick={() => switchEra(opt.ref)}
									>{opt.title}</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	</header>

	{#if devBar}
		<div class="dev-bar-wrap">
			<div class="dev-bar">
			{#if devBar.isStub}<span class="dev-bar-stub">stub</span>{/if}
			<code class="dev-bar-path">{devBar.path}</code>
			<button type="button" class="dev-bar-copy" onclick={copyPath} title="Copy path" aria-label="Copy path">
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
					<path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
			{#if devBar.kind}
				<span class="dev-bar-sep" aria-hidden="true">·</span>
				<code class="dev-bar-path">{devBar.kind}</code>
				<button type="button" class="dev-bar-copy" onclick={copyKind} title="Copy kind" aria-label="Copy kind">
					<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
						<path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
			{/if}
			{#if devBar.classId}
				<span class="dev-bar-sep" aria-hidden="true">·</span>
				<code class="dev-bar-path">{devBar.classId}</code>
				<button type="button" class="dev-bar-copy" onclick={copyClassId} title="Copy class" aria-label="Copy class">
					<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
						<path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
			{/if}
			{#if devBar.issues.length > 0}
				<a class="dev-bar-issues" href="/health" title="View all health issues">{devBar.issues.length} issue{devBar.issues.length === 1 ? '' : 's'}</a>
				<ul class="dev-bar-issue-list">
					{#each devBar.issues as issue (issue.kind + issue.detail)}
						<li><span class="dev-bar-issue-kind">{issue.kind}</span> {issue.detail}</li>
					{/each}
				</ul>
			{/if}
		</div>
		{#if toast}
			<div class="dev-toast" aria-live="polite">{toast}</div>
		{/if}
		</div>
	{/if}

	<main data-bt-path={pathAttrs.path} data-bt-section={pathAttrs.section}>
		{@render children()}
	</main>

	<footer>
		<div class="footer-inner">
			{#if data.world.tagline}
				<p>{data.world.tagline}</p>
			{/if}
		</div>
	</footer>
</div>

<SearchOverlay open={searchOpen} onclose={() => (searchOpen = false)} />
<SvgLightbox />

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	/* Themeable defaults. Wrapped in :global(:where(...)) so a
	   world's assets/theme.css can override the masthead chrome
	   (border, padding, background, ::before/::after ornaments)
	   with bare class selectors. Same trick as .wordmark-mark
	   above — :where() is zero-specificity, so any plain
	   `.masthead { ... }` in theme.css wins regardless of CSS
	   load order. */
	:global(:where(.masthead)) {
		border-bottom: var(--rule-thin);
		padding: var(--space-5) var(--space-8);
		position: relative;
	}

	.masthead-inner {
		max-width: none;
		margin: 0 auto;
		display: flex;
		align-items: baseline;
		gap: var(--space-6);
	}

	.wordmark {
		display: inline-flex;
		align-items: baseline;
		gap: 0.55em;
		font-family: var(--font-display);
		font-size: var(--text-lg);
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--ink);
		text-decoration: none;
		white-space: nowrap;
	}

	/* Both wordmark-mark rules are :global and wrapped in :where()
	   so a world theme can override them without specificity
	   gymnastics. Two reasons the :where() matters: (1) Svelte
	   would otherwise hash the class selector, beating a bare
	   `.wordmark-mark` from theme.css; (2) in Vite dev the engine
	   bundle's CSS is JS-injected after the static <link> to
	   theme.css, so equal-specificity rules would out-cascade the
	   theme. `:where()` is zero-specificity, so theme.css wins
	   regardless of load order. */
	:global(:where(.wordmark-mark)) {
		/* Optional glyph in front of the world name. Hidden by
		   default so the engine ships a plain text wordmark; declare
		   `ornament.world_mark` in `content_meta/world.md` and the
		   engine injects the glyph + `display: inline` via a
		   `<svelte:head>` style tag without requiring any theme.css.
		   A world theme can still override display and the token
		   directly for custom positioning if needed. */
		display: none;
		color: var(--accent-warm);
		font-size: 0.85em;
		letter-spacing: 0;
	}

	:global(:where(.wordmark-mark)::before) {
		content: var(--wordmark-mark, '');
	}

	/* SVG-wordmark mode. When a world ships assets/wordmark.svg,
	   the masthead inlines it instead of rendering text + glyph.
	   The wrapper sets a height; the inlined SVG fills it with
	   intrinsic aspect ratio. `color` still cascades, so any path
	   using `currentColor` picks up the masthead ink/accent. */
	.wordmark-svg {
		letter-spacing: 0;
		text-transform: none;
	}

	.wordmark-figure {
		display: inline-flex;
		align-items: center;
		height: 1.3em;
	}

	.wordmark-figure :global(svg) {
		height: 100%;
		width: auto;
		display: block;
	}

	.wordmark:hover {
		color: var(--accent);
	}

	.wordmark:hover .wordmark-mark {
		color: var(--accent);
	}

	.nav-desktop {
		display: flex;
		align-items: baseline;
		gap: var(--space-5);
	}

	/* Same :where() escape hatch as .masthead — themeable
	   typography defaults that a world can override (font-size,
	   letter-spacing, text-transform, padding for hover ornaments)
	   with bare `.nav-desktop a { ... }` rules in theme.css. */
	:global(:where(.nav-desktop a)) {
		font-family: var(--font-display);
		font-size: var(--text-base);
		letter-spacing: 0.01em;
		color: var(--ink-soft);
		text-decoration: none;
	}

	:global(:where(.nav-desktop a:hover)) {
		color: var(--accent);
	}

	/* Quiet separator between the folder group and the Kinds link —
	   signals that Kinds is a different kind of destination
	   (taxonomy, not a folder of entities) without shouting.
	   The glyph is driven by `ornament.nav_sep` in world.md (default "·").
	   Themeable via :where() so a world can re-colour it from theme.css. */
	:global(:where(.nav-sep)) {
		color: var(--ink-faint);
		font-size: var(--text-base);
	}

	/* ── Meta picker (Kinds / Journal / …) ──────────────────────
	   Vertically-folding menu behind the masthead "Meta" trigger.
	   Shares visual language with the cluster picker but is
	   anchored left (aligned to the trigger) rather than right. */
	.meta-picker {
		position: relative;
	}

	.meta-trigger {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-3);
		font: inherit;
		color: var(--ink-soft);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
		transition:
			background-color 120ms,
			border-color 120ms,
			color 120ms;
	}

	.meta-trigger:hover,
	.meta-trigger:focus-visible {
		background: var(--paper-warm);
		border-color: var(--rule);
		outline: none;
	}

	.meta-trigger[aria-expanded='true'],
	.meta-trigger[aria-current] {
		background: var(--paper-warm);
		border-color: var(--rule);
	}

	.meta-eyebrow {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		letter-spacing: 0;
		color: var(--ink-faint);
	}

	.meta-caret {
		font-size: 0.7em;
		color: var(--ink-faint);
		transition: transform 120ms;
	}

	.meta-trigger[aria-expanded='true'] .meta-caret {
		transform: rotate(180deg);
	}

	.meta-menu {
		position: absolute;
		top: calc(100% + var(--space-2));
		right: 0;
		min-width: 9rem;
		margin: 0;
		padding: var(--space-2);
		list-style: none;
		background: var(--vellum);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-hover);
		z-index: 20;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.meta-menu li {
		margin: 0;
		border-radius: 6px;
		transition: background-color 120ms;
	}

	.meta-menu li:has(a:hover),
	.meta-menu li:has(a:focus-visible) {
		background-color: var(--paper-warm);
	}

	.meta-menu a {
		display: block;
		width: 100%;
		font-family: var(--font-display);
		font-size: var(--text-sm);
		letter-spacing: 0.02em;
		color: var(--ink-soft);
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-warm) 50%,
			currentColor 58%,
			currentColor 100%
		);
		background-size: 250% 100%;
		background-position: 130% 0;
		background-clip: text;
		-webkit-background-clip: text;
		text-decoration: none;
		border-radius: 6px;
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
	}

	.meta-menu a:hover,
	.meta-menu a:focus-visible {
		color: var(--accent);
		outline: none;
		animation: menu-item-gleam 400ms ease-out;
	}

	@keyframes menu-item-gleam {
		0% {
			background-position: 130% 0;
			-webkit-text-fill-color: currentColor;
		}
		15%,
		85% {
			-webkit-text-fill-color: transparent;
		}
		100% {
			background-position: -30% 0;
			-webkit-text-fill-color: currentColor;
		}
	}

	.meta-menu a.selected {
		color: var(--accent);
	}

	.meta-menu a.selected::before {
		content: '· ';
		color: var(--accent);
	}

	.chrome-end {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	/* ── Search trigger ──────────────────────────────────────── */
	.search-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		padding: 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		cursor: pointer;
		color: var(--ink-soft);
		transition:
			background-color 120ms,
			border-color 120ms,
			color 120ms;
	}

	.search-trigger:hover,
	.search-trigger:focus-visible {
		background: var(--paper-warm);
		border-color: var(--rule);
		color: var(--ink);
		outline: none;
	}

	/* ── Filters picker ──────────────────────────────────────────
	   Single "Filters" button that opens a panel containing Era
	   and Cluster sections. Replaces the old separate pickers. */
	.filters-picker {
		position: relative;
	}

	.filters-trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font: inherit;
		color: var(--ink-soft);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
		transition:
			background-color 120ms,
			border-color 120ms,
			color 120ms;
	}

	.filters-trigger:hover,
	.filters-trigger:focus-visible {
		background: var(--paper-warm);
		border-color: var(--rule);
		outline: none;
	}

	.filters-trigger[aria-expanded='true'] {
		background: var(--paper-warm);
		border-color: var(--rule);
	}

	.filters-trigger.active {
		border-color: var(--rule);
		background: var(--paper-warm);
	}

	.filters-trigger.active .filters-label {
		color: var(--accent);
	}

	.filters-caret {
		font-size: 0.7em;
		color: var(--ink-faint);
		transition: transform 120ms;
	}

	.filters-trigger[aria-expanded='true'] .filters-caret {
		transform: rotate(180deg);
	}

	.filters-panel {
		position: absolute;
		top: calc(100% + var(--space-2));
		right: 0;
		min-width: 14rem;
		padding: var(--space-3);
		background: var(--vellum);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-hover);
		z-index: 20;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.filters-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.filters-eyebrow {
		margin: 0 0 var(--space-1);
		padding: 0 var(--space-3);
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		color: var(--ink-faint);
	}

	.filters-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.filters-list li {
		border-radius: 6px;
		transition: background-color 120ms;
	}

	.filters-list li:has(button:hover),
	.filters-list li:has(button:focus-visible) {
		background-color: var(--paper-warm);
	}

	.filters-list button {
		width: 100%;
		text-align: left;
		font-family: var(--font-display);
		font-size: var(--text-sm);
		letter-spacing: 0.02em;
		color: var(--ink-soft);
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-warm) 50%,
			currentColor 58%,
			currentColor 100%
		);
		background-size: 250% 100%;
		background-position: 130% 0;
		background-clip: text;
		-webkit-background-clip: text;
		background-color: transparent;
		border: 0;
		border-radius: 6px;
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
	}

	.filters-list button:hover,
	.filters-list button:focus-visible {
		color: var(--accent);
		outline: none;
		animation: filter-item-gleam 400ms ease-out;
	}

	@keyframes filter-item-gleam {
		0% {
			background-position: 130% 0;
			-webkit-text-fill-color: currentColor;
		}
		15%,
		85% {
			-webkit-text-fill-color: transparent;
		}
		100% {
			background-position: -30% 0;
			-webkit-text-fill-color: currentColor;
		}
	}

	.filters-list button.selected {
		color: var(--accent);
	}

	.filters-list button.selected::before {
		content: '· ';
		color: var(--accent);
	}

	.filters-dev-toggle {
		border-top: 1px solid var(--rule);
		padding-top: var(--space-3);
		margin-top: var(--space-1);
	}

	.dev-toggle-btn {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		text-align: left;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		color: var(--ink-faint);
		background: transparent;
		border: 0;
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
	}

	.dev-toggle-btn:hover {
		color: var(--ink-soft);
	}

	.dev-toggle-btn.active {
		color: var(--accent);
	}

	/* Small pill indicator: off = hollow, on = filled */
	.dev-toggle-indicator {
		display: inline-block;
		width: 0.55em;
		height: 0.55em;
		border-radius: 99px;
		border: 1px solid currentColor;
		flex-shrink: 0;
		transition: background-color 120ms;
	}

	.dev-toggle-btn.active .dev-toggle-indicator {
		background: currentColor;
	}

	/* ── Hamburger ───────────────────────────────────────────── */
	.hamburger {
		display: none;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
		width: 2.25rem;
		height: 2.25rem;
		padding: 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition:
			background-color 120ms,
			border-color 120ms;
	}

	.hamburger:hover,
	.hamburger:focus-visible {
		background: var(--paper-warm);
		border-color: var(--rule);
		outline: none;
	}

	.hamburger-bar {
		display: block;
		height: 1px;
		background: var(--ink);
		transition:
			transform 160ms,
			opacity 160ms;
	}

	.hamburger[aria-expanded='true'] .hamburger-bar:nth-child(1) {
		transform: translateY(5px) rotate(45deg);
	}
	.hamburger[aria-expanded='true'] .hamburger-bar:nth-child(2) {
		opacity: 0;
	}
	.hamburger[aria-expanded='true'] .hamburger-bar:nth-child(3) {
		transform: translateY(-5px) rotate(-45deg);
	}

	/* ── Drawer ──────────────────────────────────────────────── */
	.drawer {
		display: none;
		flex-direction: column;
		gap: var(--space-5);
		max-width: var(--page-max);
		margin: var(--space-5) auto 0;
		padding-top: var(--space-5);
		border-top: var(--rule-thin);
	}

	.nav-mobile {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.nav-mobile a {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		letter-spacing: 0.02em;
		color: var(--ink);
		text-decoration: none;
		padding: var(--space-2) 0;
	}

	.nav-mobile a:hover {
		color: var(--accent);
	}

	.drawer-cluster {
		border-top: var(--rule-thin);
		padding-top: var(--space-4);
	}

	.drawer-cluster-eyebrow {
		margin: 0 0 var(--space-3);
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		color: var(--ink-faint);
	}

	.drawer-cluster-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.drawer-cluster-list button {
		width: 100%;
		text-align: left;
		font-family: var(--font-display);
		font-size: var(--text-base);
		letter-spacing: 0.02em;
		color: var(--ink-soft);
		background: transparent;
		border: 0;
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
	}

	.drawer-cluster-list button:hover,
	.drawer-cluster-list button:focus-visible {
		background: var(--paper-warm);
		color: var(--accent);
		outline: none;
	}

	.drawer-cluster-list button.selected {
		color: var(--accent);
	}

	.drawer-cluster-list button.selected::before {
		content: '· ';
		color: var(--accent);
	}

	.drawer-era {
		border-top: var(--rule-thin);
		padding-top: var(--space-4);
	}

	.drawer-era-eyebrow {
		margin: 0 0 var(--space-3);
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		color: var(--ink-faint);
	}

	.drawer-era-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.drawer-era-list button {
		width: 100%;
		text-align: left;
		font-family: var(--font-display);
		font-size: var(--text-base);
		letter-spacing: 0.02em;
		color: var(--ink-soft);
		background: transparent;
		border: 0;
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
	}

	.drawer-era-list button:hover,
	.drawer-era-list button:focus-visible {
		background: var(--paper-warm);
		color: var(--accent);
		outline: none;
	}

	.drawer-era-list button.selected {
		color: var(--accent);
	}

	.drawer-era-list button.selected::before {
		content: '· ';
		color: var(--accent);
	}

	/* ── Tablet tighten (821px–1024px) ──────────────────────── */
	@media (min-width: 821px) and (max-width: 1024px) {
		:global(:where(.masthead)) {
			padding-left: var(--space-5);
			padding-right: var(--space-5);
		}

		.masthead-inner {
			gap: var(--space-4);
		}

		:global(:where(.nav-desktop a)) {
			font-size: var(--text-sm);
		}

		.nav-desktop {
			gap: var(--space-4);
		}
	}

	/* ── Responsive collapse ─────────────────────────────────── */
	@media (max-width: 820px) {
		.masthead {
			padding: var(--space-4) var(--space-5);
		}

		.masthead-inner {
			align-items: center;
		}

		.nav-desktop,
		.filters-picker,
		.meta-picker {
			display: none;
		}

		.hamburger {
			display: flex;
		}

		.page.drawer-open .drawer {
			display: flex;
		}
	}

	main {
		flex: 1;
		width: 100%;
		max-width: var(--page-max);
		margin: 0 auto;
		padding: var(--space-7) var(--space-6);
	}

	footer {
		border-top: var(--rule-thin);
		padding: var(--space-5) var(--space-6);
	}

	.footer-inner {
		max-width: var(--page-max);
		margin: 0 auto;
		color: var(--ink-faint);
		font-style: italic;
		font-size: var(--text-sm);
	}

	.footer-inner p {
		margin: 0;
	}

	/* ── Health badge (dev mode) ─────────────────────────────── */
	.health-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.4em;
		height: 1.4em;
		padding: 0 0.35em;
		font-family: var(--font-serif);
		font-size: var(--text-xs, 0.7rem);
		font-weight: 600;
		line-height: 1;
		color: var(--vellum);
		background: var(--accent-warn, #b45309);
		border-radius: 99px;
		text-decoration: none;
		letter-spacing: 0;
	}

	.health-badge:hover {
		background: var(--accent);
	}

	/* ── Dev bar ─────────────────────────────────────────────── */
	.dev-bar-wrap {
		position: relative;
	}

	.dev-bar {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-2) var(--space-8);
		background: var(--paper-warm);
		border-bottom: 1px solid var(--rule);
		font-family: var(--font-mono, monospace);
		font-size: 0.72rem;
		color: var(--ink-faint);
		line-height: 1.4;
	}

	.dev-bar-stub {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-xs, 0.7rem);
		color: var(--ink-faint);
		border: 1px dashed var(--rule);
		border-radius: 3px;
		padding: 0 0.4em;
	}

	.dev-bar-path {
		color: var(--ink-soft);
		letter-spacing: 0;
	}

	.dev-bar-sep {
		color: var(--ink-faint);
		font-size: var(--text-xs, 0.7rem);
		user-select: none;
	}

	.dev-bar-copy {
		display: inline-flex;
		align-items: center;
		padding: 0;
		background: transparent;
		border: 0;
		color: var(--ink-faint);
		cursor: pointer;
		line-height: 1;
		margin-top: 0.1em;
	}

	.dev-bar-copy:hover {
		color: var(--accent);
	}

	.dev-toast {
		position: absolute;
		top: 100%;
		left: var(--space-8);
		background: var(--ink-faint);
		color: #f0e8e0;
		border: 1px solid var(--rule);
		font-family: var(--font-mono, monospace);
		font-size: 0.72rem;
		padding: 0.25em 0.6em;
		border-radius: 0 0 3px 3px;
		border-top: none;
		white-space: nowrap;
		pointer-events: none;
		z-index: 9999;
		animation: dev-toast-fade 1.5s ease forwards;
	}

	@keyframes dev-toast-fade {
		0%   { opacity: 1; }
		60%  { opacity: 1; }
		100% { opacity: 0; }
	}

	.dev-bar-issues {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-xs, 0.7rem);
		color: var(--accent-warn, #b45309);
		text-decoration: none;
		white-space: nowrap;
	}

	.dev-bar-issues:hover {
		text-decoration: underline;
	}

	.dev-bar-issue-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: contents;
	}

	.dev-bar-issue-list li {
		color: var(--ink-faint);
		font-size: 0.7rem;
	}

	.dev-bar-issue-list li::before {
		content: '· ';
		color: var(--accent-warn, #b45309);
	}

	.dev-bar-issue-kind {
		color: var(--accent-warn, #b45309);
	}
</style>
