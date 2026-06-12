<script lang="ts">
	import '$lib/styles/global.css';

	import { page } from '$app/stores';
	import { beforeNavigate, goto } from '$app/navigation';
	import { browser, dev } from '$app/environment';
	import { onMount, setContext } from 'svelte';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import { paintAllScope, translateUrl, type ScopeContext } from '$lib/cluster';
	import SvgLightbox from '$lib/components/SvgLightbox.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		data: {
			nav: { href: string; label: string; count: number }[];
			kindsHref: string;
			clusterOptions: { value: string; label: string; selected: boolean }[];
			selectedCluster: string | null;
			world: { name: string; shortName: string; tagline: string; allScopeLabel: string };
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
	});

	// Set to true while the user-initiated cluster switch is
	// navigating. The beforeNavigate hook checks this and bows out
	// — otherwise it would re-paint ?scope=all onto a cluster URL
	// just chosen from the selector, effectively reverting the
	// switch.
	let bypassScopePaint = false;

	// Expose a setter so deeply nested components (e.g. PageHeader's
	// "focus on <cluster>" link) can trigger a cluster-switch
	// navigation without going through the masthead selector. The
	// caller sets the flag, then navigates; beforeNavigate sees it
	// and bows out of scope-painting for that one navigation.
	setContext('bypassNextScopePaint', () => {
		bypassScopePaint = true;
	});

	// Mobile nav drawer open state + cluster picker open state.
	// Both are auto-closed on route change and on Escape; the
	// cluster picker also closes on outside click.
	let drawerOpen = $state(false);
	let clusterOpen = $state(false);
	let metaOpen = $state(false);

	// Active label for the cluster trigger. Falls back to the world
	// "all" label when nothing's flagged selected (defensive — the
	// loader always marks one).
	let clusterLabel = $derived(
		data.clusterOptions.find((o) => o.selected)?.label ?? data.world.allScopeLabel
	);

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
		// Always shut both menus on a navigation; the new page
		// shouldn't inherit the previous chrome state.
		drawerOpen = false;
		clusterOpen = false;
		metaOpen = false;

		if (bypassScopePaint) {
			bypassScopePaint = false;
			return;
		}
		if (data.selectedCluster !== null) return;
		if (!nav.to) return;
		if (nav.to.url.origin !== nav.from?.url.origin) return;
		// Don't paint API routes — they're never user destinations.
		if (nav.to.url.pathname.startsWith('/api/')) return;

		const painted = paintAllScope(nav.to.url, data.scopeContext);
		if (painted.href === nav.to.url.href) return;
		nav.cancel();
		goto(painted.href, { replaceState: false, keepFocus: true });
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
		clusterOpen = false;
		drawerOpen = false;
		goto(target);
	}

	// Escape closes whichever menu is open (cluster picker first
	// since it's the inner-most layer).
	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (clusterOpen) clusterOpen = false;
		else if (metaOpen) metaOpen = false;
		else if (drawerOpen) drawerOpen = false;
	}

	// Close the cluster picker when a click lands outside it. The
	// listener is only attached while it's open; the picker itself
	// stops propagation on its trigger so the toggle click doesn't
	// immediately re-close it.
	function onDocumentClick(e: MouseEvent) {
		const target = e.target as Element | null;
		if (target?.closest('[data-cluster-picker]')) return;
		clusterOpen = false;
	}

	$effect(() => {
		if (!browser) return;
		if (!clusterOpen) return;
		document.addEventListener('click', onDocumentClick);
		return () => document.removeEventListener('click', onDocumentClick);
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
			current === '/blog' ||
			current.startsWith('/blog/') ||
			current === '/guides' ||
			current.startsWith('/guides/') ||
			current === '/symbology' ||
			current.startsWith('/symbology/') ||
			/^\/[^/]+\/kinds(\/|$)/.test(current)
		);
	});
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
				<span class="nav-sep" aria-hidden="true">{data.navSep}</span>
				<div class="meta-picker" data-meta-picker>
					<button
						type="button"
						class="meta-trigger"
						aria-haspopup="listbox"
						aria-expanded={metaOpen}
						aria-current={metaActive ? true : undefined}
						onclick={() => (metaOpen = !metaOpen)}
					>
						Meta
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
						</ul>
					{/if}
				</div>
			</nav>

			<div class="chrome-end">
				{#if data.clusterOptions.length > 1}
					<div class="cluster-picker cluster-picker-desktop" data-cluster-picker>
						<button
							type="button"
							class="cluster-trigger"
							aria-haspopup="listbox"
							aria-expanded={clusterOpen}
							onclick={() => (clusterOpen = !clusterOpen)}
						>
							<span class="cluster-eyebrow">Cluster</span>
							<span class="cluster-current">{clusterLabel}</span>
							<span class="cluster-caret" aria-hidden="true">▾</span>
						</button>
						{#if clusterOpen}
							<ul class="cluster-menu" role="listbox">
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
						{/if}
					</div>
				{/if}

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
			</div>
		{/if}
	</header>

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
		gap: var(--space-2);
		font-family: var(--font-display);
		font-size: var(--text-base);
		letter-spacing: 0.01em;
		color: var(--ink-soft);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		padding: var(--space-1) var(--space-2);
		cursor: pointer;
		transition:
			background-color 120ms,
			border-color 120ms,
			color 120ms;
	}

	.meta-trigger:hover,
	.meta-trigger:focus-visible {
		color: var(--accent);
		outline: none;
	}

	.meta-trigger[aria-expanded='true'],
	.meta-trigger[aria-current] {
		color: var(--ink);
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
		left: 0;
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
	}

	.meta-menu a {
		display: block;
		width: 100%;
		font-family: var(--font-display);
		font-size: var(--text-sm);
		letter-spacing: 0.02em;
		color: var(--ink-soft);
		background: transparent;
		text-decoration: none;
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
	}

	.meta-menu a:hover,
	.meta-menu a:focus-visible {
		background: var(--paper-warm);
		color: var(--accent);
		outline: none;
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

	/* ── Custom cluster picker ─────────────────────────────────
	   Replaces the native <select>. Trigger is a quiet pill that
	   carries both the eyebrow ("Cluster") and the current value;
	   click opens a small parchment menu of all options. */
	.cluster-picker {
		position: relative;
	}

	.cluster-trigger {
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

	.cluster-trigger:hover,
	.cluster-trigger:focus-visible {
		background: var(--paper-warm);
		border-color: var(--rule);
		outline: none;
	}

	.cluster-trigger[aria-expanded='true'] {
		background: var(--paper-warm);
		border-color: var(--rule);
	}

	.cluster-eyebrow {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		letter-spacing: 0;
		color: var(--ink-faint);
	}

	.cluster-current {
		font-family: var(--font-display);
		font-size: var(--text-sm);
		letter-spacing: 0.02em;
		color: var(--ink);
	}

	.cluster-caret {
		font-size: 0.7em;
		color: var(--ink-faint);
		transition: transform 120ms;
	}

	.cluster-trigger[aria-expanded='true'] .cluster-caret {
		transform: rotate(180deg);
	}

	.cluster-menu {
		position: absolute;
		top: calc(100% + var(--space-2));
		right: 0;
		min-width: 12rem;
		margin: 0;
		padding: var(--space-2);
		list-style: none;
		background: var(--vellum);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-hover);
		z-index: 20;
	}

	.cluster-menu li {
		margin: 0;
	}

	.cluster-menu button {
		width: 100%;
		text-align: left;
		font-family: var(--font-display);
		font-size: var(--text-sm);
		letter-spacing: 0.02em;
		color: var(--ink-soft);
		background: transparent;
		border: 0;
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
	}

	.cluster-menu button:hover,
	.cluster-menu button:focus-visible {
		background: var(--paper-warm);
		color: var(--accent);
		outline: none;
	}

	.cluster-menu button.selected {
		color: var(--accent);
	}

	.cluster-menu button.selected::before {
		content: '· ';
		color: var(--accent);
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

	/* ── Responsive collapse ─────────────────────────────────── */
	@media (max-width: 760px) {
		.masthead {
			padding: var(--space-4) var(--space-5);
		}

		.masthead-inner {
			align-items: center;
		}

		.nav-desktop,
		.cluster-picker-desktop,
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
</style>
