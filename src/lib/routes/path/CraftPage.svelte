<script lang="ts">
	import type { CraftPageData } from './_craftPage.load';

	let { data }: { data: CraftPageData } = $props();
</script>

<svelte:head>
	<title>Craft sheet · {data.entity.name} · Alteria</title>
</svelte:head>

<!--
	Author's-room companion document for an entity. Visually set
	apart from the field-notebook chrome — cooler tinted surface,
	dashed border, sans-serif title — so a reader can see at a
	glance that this is a different register from the in-world
	prose, without needing it spelled out.
-->
<article class="craft">
	<nav class="frame" aria-label="Subject navigation">
		<a class="back" href={data.entity.href}>↩ {data.entity.name}</a>
	</nav>

	<header class="head">
		<h1 class="title">Craft sheet</h1>
		<p class="subject">
			Companion notes for <a href={data.entity.href}>{data.entity.name}</a>.
		</p>
	</header>

	<div class="prose">
		{@html data.html}
	</div>
</article>

<style>
	/* Notebook surface: a cool grey-blue tint distinct from the
	   warm parchment used by the in-world chrome, with a
	   single-line frame that reads as a sheet of writer's notes
	   rather than a folio. */
	.craft {
		max-width: var(--prose-max);
		margin: 0 auto;
		padding: var(--space-6) var(--space-6) var(--space-7);
		background: color-mix(in oklab, var(--ink) 4%, var(--page) 96%);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-sm);
		color: var(--ink);
	}

	@media (max-width: 40rem) {
		.craft {
			padding: var(--space-5) var(--space-4) var(--space-6);
		}
	}

	.frame {
		font-size: var(--text-xs);
		font-variant: small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		padding-bottom: var(--space-3);
		border-bottom: 1px dashed var(--rule);
	}

	.frame a {
		color: inherit;
		text-decoration: none;
	}

	.frame a:hover {
		color: var(--accent);
	}

	.head {
		margin: var(--space-6) 0 var(--space-6);
	}

	.title {
		margin: 0 0 var(--space-3);
		font-family: var(--font-sans, var(--font-serif));
		font-weight: 600;
		font-size: var(--text-2xl);
		line-height: var(--leading-tight);
		color: var(--ink);
	}

	.subject {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--ink-soft);
	}

	.subject a {
		color: var(--ink);
	}

	.subject a:hover {
		color: var(--accent);
	}

	.prose {
		color: var(--ink);
	}

	.prose :global(h2) {
		font-size: var(--text-lg);
		font-weight: 600;
		margin: var(--space-6) 0 var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px dashed var(--rule);
		color: var(--ink);
	}

	.prose :global(h3) {
		font-size: var(--text-base);
		font-weight: 600;
		margin: var(--space-5) 0 var(--space-2);
		color: var(--ink);
	}

	.prose :global(p),
	.prose :global(ul),
	.prose :global(ol) {
		margin: 0 0 var(--space-4);
	}

	.prose :global(ul),
	.prose :global(ol) {
		padding-left: var(--space-5);
	}

	.prose :global(li) {
		margin: 0 0 var(--space-2);
	}

	.prose :global(blockquote) {
		margin: var(--space-4) 0;
		padding-left: var(--space-4);
		border-left: 2px solid var(--rule);
		color: var(--ink-soft);
		font-style: italic;
	}

	.prose :global(em) {
		color: var(--ink-soft);
	}
</style>
