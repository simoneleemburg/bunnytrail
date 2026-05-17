<script lang="ts">
	interface Props {
		title: string
		eyebrow?: string
		subtitle?: string
	}

	let { title, eyebrow, subtitle }: Props = $props()
</script>

<header class="page-header">
	{#if eyebrow}
		<div class="eyebrow">{eyebrow}</div>
	{/if}
	<h1>{title}</h1>
	<div class="double-rule"></div>
	{#if subtitle}
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
</style>
