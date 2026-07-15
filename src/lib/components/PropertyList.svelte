<script lang="ts">
	interface Item {
		key: string;
		value: unknown;
		/** Override display label, e.g. from a `_kind.yaml` property schema. */
		label?: string;
		/** Unit suffix appended to numeric values, e.g. "km", "g". */
		unit?: string;
	}

	interface Props {
		items: Item[];
	}

	let { items }: Props = $props();

	function formatValue(value: unknown, unit?: string): string {
		if (Array.isArray(value)) return value.map((v) => formatValue(v)).join(', ');
		if (typeof value === 'number' && Number.isFinite(value)) {
			const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 3 });
			return unit ? `${formatted} ${unit}` : formatted;
		}
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
			<dt>{item.label ?? humanize(item.key)}</dt>
			<dd>{formatValue(item.value, item.unit)}</dd>
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
