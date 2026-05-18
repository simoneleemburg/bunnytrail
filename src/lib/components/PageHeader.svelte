<script lang="ts">
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
	}

	let { title, eyebrow, subtitle, subtitleHtml, language, sigil }: Props = $props();
</script>

<header class="page-header">
	{#if eyebrow}
		<div class="eyebrow">{eyebrow}</div>
	{/if}
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

	.eyebrow {
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		margin-bottom: var(--space-2);
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
