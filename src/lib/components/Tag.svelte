<script lang="ts">
	interface Props {
		label: string;
		href?: string;
	}

	let { label, href }: Props = $props();
</script>

{#if href}
	<a class="tag" {href}>{label}</a>
{:else}
	<span class="tag">{label}</span>
{/if}

<style>
	.tag {
		display: inline-block;
		font-family: var(--font-serif);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		color: var(--ink-soft);
		padding: 0 var(--space-2);
		border-bottom: 1px solid var(--rule-hair);
		text-decoration: none;
		line-height: 1.6;
	}

	a.tag:hover {
		color: var(--accent-warm);
		border-bottom-color: var(--accent-warm);
	}
</style>
