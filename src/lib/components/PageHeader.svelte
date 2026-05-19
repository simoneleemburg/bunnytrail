<script lang="ts">
	import { page } from '$app/state';

	interface Crumb {
		href: string;
		label: string;
	}

	interface KindChip {
		/** Kind id, used in the link `/kinds/<id>`. */
		id: string;
		/** Display label — usually the kind's singular form. */
		label: string;
		/** True if the kind isn't registered. Renders as a broken link. */
		broken?: boolean;
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
	}

	let {
		title,
		eyebrow,
		subtitle,
		subtitleHtml,
		language,
		sigil,
		breadcrumbs,
		kindChip
	}: Props = $props();

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
			return { href: '/', label: 'Alteria' };
		}
		const parentSegs = segments.slice(0, -1);
		const parentSlug = parentSegs[parentSegs.length - 1];
		const label = parentSlug
			.replace(/-/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
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
					<a class="crumb" href={crumb.href}>{crumb.label}</a>
				{/each}
			</nav>
		{:else}
			<a class="up-link" href={upLink.href} aria-label={`Up to ${upLink.label}`}>
				<span class="up-arrow" aria-hidden="true">↑</span>{upLink.label}
			</a>
		{/if}
		{#if kindChip}
			<span class="meta-sep" aria-hidden="true">·</span>
			<a
				class="kind-chip"
				href={`/kinds/${kindChip.id}`}
				data-broken={kindChip.broken ? 'true' : undefined}
				title={kindChip.broken ? `unregistered kind: ${kindChip.id}` : undefined}
			>
				{kindChip.label}
			</a>
		{:else if eyebrow}
			<span class="meta-sep" aria-hidden="true">·</span>
			<span class="eyebrow">{eyebrow}</span>
		{/if}
	</div>
	<h1>
		{#if sigil}<span class="sigil" aria-hidden="true">{sigil}</span>{/if}{title}{#if language}<sup
				class="lang-tag"
				data-broken={language.broken ? 'true' : undefined}
				><a href={language.href} title={`language: ${language.code}`}>{language.code}</a></sup
			>{/if}
	</h1>
	<div class="double-rule"></div>
	{#if subtitleHtml}
		<p class="subtitle">{@html subtitleHtml}</p>
	{:else if subtitle}
		<p class="subtitle">{subtitle}</p>
	{/if}
</header>

<style>
	.page-header {
		margin-bottom: var(--space-6);
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
		align-items: baseline;
		gap: 0 var(--space-2);
		margin-bottom: var(--space-2);
	}

	.meta-sep {
		color: var(--ink-faint);
		font-size: var(--text-xs);
	}

	.eyebrow {
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.12em;
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
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	.up-link:hover {
		color: var(--accent);
	}

	.up-arrow {
		font-variant: normal;
		letter-spacing: 0;
	}

	/* Breadcrumb chain. Each crumb borrows the up-link's small-caps
	   register so the whole row reads as one editorial label rather
	   than a row of buttons; the chevron is decorative only. */
	.crumbs {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0 var(--space-1);
	}

	.crumb {
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	.crumb:hover {
		color: var(--accent);
	}

	.crumb-sep {
		color: var(--ink-faint);
		font-size: var(--text-xs);
	}

	/* Kind chip. Same small-caps register as the eyebrow so it
	   nests naturally at the end of the meta row, but its linkness
	   is signalled with a subtle underline on hover. The
	   `data-broken` flavour visually marks unregistered kinds the
	   same way wikilinks mark unresolved targets. */
	.kind-chip {
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	.kind-chip:hover {
		color: var(--accent);
	}

	.kind-chip[data-broken='true'] {
		color: var(--broken, var(--ink-faint));
		text-decoration: underline dotted;
	}

	h1 {
		margin: 0 0 var(--space-3);
	}

	.double-rule {
		border-top: var(--rule-double);
		margin-bottom: var(--space-4);
	}

	.subtitle {
		font-style: italic;
		color: var(--ink-soft);
		font-size: var(--text-lg);
		margin: 0;
		max-width: var(--prose-max);
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
		color: var(--ink-soft);
		font-weight: 400;
		/* Alchemical glyphs sit low on the baseline in most fonts.
		   Lift the sigil to optically centre on the cap-height of
		   the title. */
		font-size: 0.85em;
		vertical-align: 0.08em;
	}
</style>
