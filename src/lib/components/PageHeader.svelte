<script lang="ts">
	import { page } from '$app/state';
	import { getContext } from 'svelte';

	interface Crumb {
		href: string;
		label: string;
	}

	interface KindChip {
		/** Kind id, used in the link `/kinds/<id>` (or overridden by `href`). */
		id: string;
		/** Display label — usually the kind's singular form. */
		label: string;
		/** True if the kind isn't registered. Renders as a broken link. */
		broken?: boolean;
		/** Optional sort rank from frontmatter. Displayed as "AXIOM · 2". */
		rank?: number | null;
		/**
		 * Optional explicit href that overrides the default `/kinds/<id>` link.
		 * Used when the chip should point at an entity (e.g. a class target)
		 * rather than a kind page.
		 */
		href?: string;
	}

	interface Props {
		title: string;
		eyebrow?: string;
		/**
		 * Subtitle as inline HTML, pre-rendered on the server via
		 * `renderSummary`. Prefer this; `subtitle` (plain text) is kept
		 * as a fallback for callers that don't go through the markdown
		 * pipeline.
		 */
		subtitleHtml?: string | null;
		subtitle?: string;
		/**
		 * Optional language tag rendered as a small superscript anchor
		 * beside the title — the same dictionary-style attribution used
		 * inline in prose for non-English names.
		 */
		language?: { code: string; href: string; broken?: boolean };
		/**
		 * Optional sigil glyph rendered left of the title. Decorative
		 * only; hidden from assistive tech.
		 */
		sigil?: string | null;
		/**
		 * Optional breadcrumb chain rendered above the title in place
		 * of the auto-derived single up-link. Each crumb is a folder
		 * label + href; the chain reads left-to-right from root
		 * (`Places › Celestial Bodies › Planets`). When omitted, the
		 * header falls back to its built-in "one level up" link.
		 */
		breadcrumbs?: Crumb[];
		/**
		 * Optional kind chip rendered as the trailing element of the
		 * meta row, linking to `/kinds/<id>`. Takes precedence over
		 * `eyebrow` when provided.
		 */
		kindChip?: KindChip | null;
		/**
		 * When set, renders a quiet "focus on <cluster>" hint below the
		 * subtitle. Used on cluster-scoped collection pages viewed in
		 * the all-clusters scope (e.g. /earth/history?scope=all).
		 * `focusHref` is the URL to navigate to (the same page without
		 * ?scope=all, with the cluster prefix). `focusClusterLabel` is
		 * the full translated label string (e.g. "Focus op Leemburg →").
		 */
		focusHref?: string;
		focusClusterLabel?: string;
		/**
		 * When set, renders a "← View all <label>" back-link instead of
		 * the cluster focus hint. Used on cluster-scoped sub-shelf pages
		 * viewed in all-clusters scope (e.g. /aurethia/people/characters
		 * ?scope=all) where the canonical aggregate view is /people/characters.
		 * Pass the full translated label string (e.g. "← Alle Personen tonen").
		 */
		viewAllHref?: string;
		viewAllLabel?: string;
	}

	let {
		title,
		eyebrow,
		subtitle,
		subtitleHtml,
		language,
		sigil,
		breadcrumbs,
		kindChip,
		focusHref,
		focusClusterLabel,
		viewAllHref,
		viewAllLabel
	}: Props = $props();

	// When the focus link is clicked, tell the layout's beforeNavigate
	// hook to skip scope-painting for that one navigation — otherwise
	// it would intercept the cluster-scoped URL and re-add ?scope=all.
	const bypassNextScopePaint = getContext<(() => void) | undefined>('bypassNextScopePaint');
	function onFocusClick() {
		bypassNextScopePaint?.();
	}

	// Fallback one-level-up navigation link, used when no explicit
	// breadcrumbs were supplied. Strips the last URL segment from the
	// current path; from a top-level page falls back to home (`/`),
	// which is itself the roof — and from home, the link just points
	// back at home (effectively a no-op, but the chrome stays
	// consistent across every page).
	const upLink = $derived.by(() => {
		const path = page.url?.pathname ?? '/';
		const segments = path.replace(/\/+$/, '').split('/').filter(Boolean);
		if (segments.length <= 1) {
			return { href: '/', label: page.data?.world?.name ?? 'Home' };
		}
		const parentSegs = segments.slice(0, -1);
		const parentSlug = parentSegs[parentSegs.length - 1];
		const label = parentSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
		return { href: '/' + parentSegs.join('/'), label };
	});

	const crumbs = $derived(breadcrumbs ?? []);
	const hasBreadcrumbs = $derived(crumbs.length > 0);
</script>

<header class="page-header">
	<div class="meta-row">
		{#if hasBreadcrumbs}
			<nav class="crumbs" aria-label="Breadcrumb">
				{#each crumbs as crumb, i (crumb.href)}
					{#if i > 0}<span class="crumb-sep" aria-hidden="true">›</span>{/if}
					<a class="crumb" href={crumb.href}
						>{#if crumbs.length === 1}<span class="up-arrow" aria-hidden="true">↑</span
							>{/if}{crumb.label}</a
					>
				{/each}
			</nav>
		{:else}
			<a
				class="up-link"
				class:up-link--home={upLink.href === '/'}
				class:bt-meta-link={upLink.href === '/'}
				href={upLink.href}
				aria-label={`Up to ${upLink.label}`}
			>
				<span class="up-arrow" aria-hidden="true">↑</span>{upLink.label}
			</a>
		{/if}
		{#if kindChip}
			<!-- kindChip is rendered beside the title, not in the meta row -->
		{:else if eyebrow}
			<span class="meta-sep" aria-hidden="true">·</span>
			<span class="eyebrow">{eyebrow}</span>
		{/if}
	</div>
	<div class="title-row">
		<h1>
			{#if sigil}<span class="sigil" aria-hidden="true">{sigil}</span>{/if}{title}{#if language}<sup
					class="lang-tag"
					data-broken={language.broken ? 'true' : undefined}
					><a href={language.href} title={`language: ${language.code}`}>{language.code}</a></sup
				>{/if}
		</h1>
		{#if kindChip}
			<a
				class="kind-chip"
				href={kindChip.href ?? `/kinds/${kindChip.id}`}
				data-broken={kindChip.broken ? 'true' : undefined}
				title={kindChip.broken ? `unregistered kind: ${kindChip.id}` : undefined}
				>{kindChip.label}</a
			>
		{/if}
	</div>
	{#if subtitleHtml}
		<p class="subtitle">{@html subtitleHtml}</p>
	{:else if subtitle}
		<p class="subtitle">{subtitle}</p>
	{/if}
	{#if (viewAllHref && viewAllLabel) || (focusHref && focusClusterLabel)}
		<p class="focus-hint">
		{#if viewAllHref && viewAllLabel}<a class="focus-link focus-link--back" href={viewAllHref}
				>{viewAllLabel}</a
			>{/if}{#if viewAllHref && viewAllLabel && focusHref && focusClusterLabel}<span
				class="focus-sep">—</span
			>{/if}{#if focusHref && focusClusterLabel}<a
				class="focus-link"
				href={focusHref}
				onclick={onFocusClick}>{focusClusterLabel}</a
			>{/if}
		</p>
	{/if}
</header>

<style>
	/* Editorial header in the guide register: centred chrome,
	   confident display H1 (inherits the gilt sheen from global.css),
	   italic lede underneath. The technical double-rule that used to
	   sit between title and subtitle has been retired — breathing
	   room reads as more editorial than a UI separator. */
	.page-header {
		max-width: var(--prose-max);
		margin: 0 auto var(--space-7);
		text-align: center;
	}

	/* Single metadata row stacked above the title:
	   `↑ Parent · Eyebrow` or `Crumb › Crumb › Crumb · Kind`.
	   Up-link / crumbs and the trailing eyebrow / kind chip share the
	   same small-caps register so they read as one continuous label
	   rather than two stacked eyebrows; the middle dot separates them.
	   The whole row carries the row-level bottom margin, so individual
	   elements don't fight over spacing. */
	.meta-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: baseline;
		gap: 0 var(--space-2);
		margin-bottom: var(--space-6);
	}

	.meta-sep {
		color: var(--ink-faint);
		font-size: var(--text-sm);
	}

	.eyebrow {
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
	}

	/* Discreet up-link in the metadata row. Same small-caps
	   register as the eyebrow so the two read as one label;
	   underline-on-hover signals the linkness. */
	.up-link {
		display: inline-flex;
		align-items: baseline;
		gap: 0.35em;
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	.up-link:hover {
		color: var(--accent-warm);
	}

	/* When the up-link resolves to world root (/), it's a "meta"
	   link — stepping outside the world's content hierarchy. Use
	   --accent-meta so worlds can give it a distinct register
	   (e.g. cosmic blue) that signals "this exits the cluster". */
	.up-link--home:hover {
		color: var(--accent-meta);
	}

	.up-arrow {
		font-variant: normal;
		letter-spacing: 0;
		margin-right: 0.35em;
	}

	/* Breadcrumb chain. Each crumb borrows the up-link's small-caps
	   register so the whole row reads as one editorial label rather
	   than a row of buttons; the chevron is decorative only. */
	.crumbs {
		display: inline-flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: baseline;
		gap: 0 var(--space-1);
	}

	.crumb {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	.crumb:hover {
		color: var(--accent-warm);
	}

	.crumb-sep {
		color: var(--ink-faint);
		font-size: var(--text-sm);
	}

	h1 {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		margin: 0;
	}

	/* Title + kind chip share one centered row. The chip sits to the
	   right of the title, aligned to the title's cap-height (not its
	   baseline) so it reads as a marginal label rather than a tail. */
	.title-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: flex-start;
		gap: 0 0.7em;
		margin: 0 0 var(--space-5);
	}

	/* Kind chip. Lifted out of the meta row and rendered beside the
	   title in the same accent-deep small-caps treatment as the kind
	   eyebrow on EntityCard, so the "what is this thing" label reads
	   consistently across surfaces. `data-broken` flavour marks
	   unregistered kinds the same way wikilinks mark unresolved
	   targets. */
	.kind-chip {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		font-weight: 600;
		color: var(--accent-deep);
		text-decoration: none;
		/* Nudge down so the chip's cap-height optically sits at the
		   title's cap-height rather than at the line-box top. */
		margin-top: 0.85em;
	}

	.kind-chip:hover {
		color: var(--accent);
	}

	.kind-chip[data-broken='true'] {
		color: var(--broken, var(--ink-faint));
		text-decoration: underline dotted;
	}

	.subtitle {
		font-style: italic;
		color: var(--ink-soft);
		font-size: var(--text-lg);
		line-height: var(--leading-relaxed);
		margin: 0 auto;
		max-width: var(--prose-max);
		text-align: left;
	}

	.focus-hint {
		margin: var(--space-4) auto 0;
		font-size: var(--text-sm);
		font-family: var(--font-serif);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
		text-align: center;
	}

	.focus-link {
		color: var(--ink-faint);
		text-decoration: none;
	}

	.focus-link:hover {
		color: var(--accent-meta);
		text-decoration: underline;
	}

	.focus-sep {
		color: var(--ink-faint);
		margin: 0 0.5em;
	}
	/* Local override of the global .lang-tag sizing so the title's
	   tag is proportional to the larger h1, not the base font size. */
	h1 .lang-tag {
		font-size: 0.45em;
		margin-left: 0.35em;
		vertical-align: super;
	}

	h1 .sigil {
		display: inline-block;
		margin-right: 0.35em;
		color: var(--accent-warm);
		font-weight: 600;
		/* Alchemical glyphs sit low on the baseline in most fonts.
		   Lift the sigil to optically centre on the cap-height of
		   the title. */
		font-size: 0.85em;
		vertical-align: 0.08em;
	}
</style>
