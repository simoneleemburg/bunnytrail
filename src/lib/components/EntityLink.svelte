<script lang="ts">
	interface Props {
		id: string;
		name: string;
		summary?: string | null;
		sigil?: string | null;
		compact?: boolean;
		kind?: string | null;
	}

	let { id, name, summary = null, sigil = null, compact = false, kind = null }: Props = $props();

	const slug = $derived(id.split('/').at(-1) ?? id);
	const cls = $derived(
		['entity-link', 'bt-link', compact ? 'compact' : '', kind ? `bt-link--kind-${kind}` : '']
			.filter(Boolean)
			.join(' ')
	);
</script>

<a
	class={cls}
	href={`/${id}`}
	title={!compact && summary ? summary : undefined}
	data-bt-slug={slug}
	data-bt-kind={kind ?? undefined}
>
	{#if sigil}<span class="sigil" aria-hidden="true">{sigil}</span>{/if}{name}
</a>

<style>
	/* Use :where() to keep specificity at zero so world theme rules
	   (e.g. [data-bt-kind="axiom"] { color: var(--tier-gold) }) can
	   override the default colour without needing !important. */
	:where(.entity-link) {
		color: var(--accent);
		text-decoration: none;
	}

	:where(.entity-link):hover {
		/* text-decoration instead of border-bottom so that world theme
		   hover rules (which also use text-decoration) simply override
		   this — avoiding a double underline on silver/gold tiers. */
		text-decoration: underline;
		text-decoration-color: currentColor;
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
		/* Reset webkit-text-fill-color so world rules like
		   `.sigil { -webkit-text-fill-color: var(--accent-warm) }`
		   don't override the tier colour on the parent link. */
		-webkit-text-fill-color: currentColor;
	}
</style>
