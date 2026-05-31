<script lang="ts">
	interface Item {
		key: string;
		value: unknown;
	}

	interface Props {
		items: Item[];
	}

	let { items }: Props = $props();

	function format(value: unknown): string {
		if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
		return String(value);
	}

	function isEmpty(value: unknown): boolean {
		if (value === null || value === undefined || value === '') return true;
		if (Array.isArray(value) && value.length === 0) return true;
		return false;
	}

	function humanize(key: string): string {
		return key.replace(/[-_]/g, ' ');
	}

	const visible = $derived(items.filter((i) => !isEmpty(i.value)));
</script>

{#if visible.length > 0}
	<dl class="property-list">
		{#each visible as item (item.key)}
			<dt>{humanize(item.key)}</dt>
			<dd>{format(item.value)}</dd>
		{/each}
	</dl>
{/if}

<style>
	.property-list {
		margin: 0;
		display: grid;
		grid-template-columns: max-content 1fr;
		column-gap: var(--space-4);
		row-gap: var(--space-2);
	}

	dt {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		font-weight: 500;
		padding-top: 0.15em;
	}

	dd {
		margin: 0;
		color: var(--ink);
		font-size: var(--text-sm);
	}
</style>
