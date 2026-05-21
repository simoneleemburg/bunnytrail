<script lang="ts">
	interface Props {
		id: string;
		name: string;
		summary?: string | null;
		sigil?: string | null;
		compact?: boolean;
	}

	let { id, name, summary = null, sigil = null, compact = false }: Props = $props();
</script>

<a
	class="entity-link"
	class:compact
	href={`/${id}`}
	title={!compact && summary ? summary : undefined}
>
	{#if sigil}<span class="sigil" aria-hidden="true">{sigil}</span>{/if}{name}
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

	/* Inline sigil mirrors the treatment in EntityCard / PageHeader:
	   a small, slightly-faded glyph immediately before the name with
	   a hair of trailing space. Kept aria-hidden because the name
	   following it is the accessible label. */
	.entity-link .sigil {
		display: inline-block;
		margin-right: 0.3em;
		opacity: 0.85;
		font-feature-settings: 'tnum' 0;
	}
</style>
