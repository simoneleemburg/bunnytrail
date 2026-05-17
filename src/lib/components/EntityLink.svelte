<script lang="ts">
	interface Props {
		id: string;
		name: string;
		summary?: string | null;
		compact?: boolean;
	}

	let { id, name, summary = null, compact = false }: Props = $props();
</script>

<a
	class="entity-link"
	class:compact
	href={`/${id}`}
	title={!compact && summary ? summary : undefined}
>
	{name}
</a>

<style>
	.entity-link {
		color: var(--accent);
		text-decoration: none;
		border-bottom: 1px solid transparent;
	}

	.entity-link:hover {
		border-bottom-color: var(--accent-soft);
		color: var(--accent-soft);
	}

	.entity-link.compact {
		font-size: var(--text-sm);
	}
</style>
