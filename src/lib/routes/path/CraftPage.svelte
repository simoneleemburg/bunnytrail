<script lang="ts">
	import { page } from '$app/state';
	import { t } from '$lib/i18n';
	import type { CraftPageData } from './craftPage.load';

	let { data }: { data: CraftPageData } = $props();

	const ui = $derived(t(page.data.world.language));
</script>

<svelte:head>
	<title>Craft sheet · {data.entity.name} · {page.data.world.shortName}</title>
</svelte:head>

<!--
	Author's-room companion document for an entity. Visually set
	apart from the field-journal chrome — cooler tinted surface,
	dashed border, sans-serif title — so a reader can see at a
	glance that this is a different register from the in-world
	prose, without needing it spelled out.
-->
<article class="bt-journal">
	<nav class="bt-journal__frame" aria-label={ui.craft_nav_aria}>
		<a class="back" href={data.entity.href}>↩&#xFE0E; {data.entity.name}</a>
	</nav>

	<header class="head">
		<h1 class="bt-journal__title">{ui.craft_title}</h1>
		<p class="subject">
			{ui.craft_companion} <a href={data.entity.href}>{data.entity.name}</a>.
		</p>
	</header>

	<div class="bt-prose bt-journal__prose">
		{@html data.html}
	</div>
</article>

<style>
	.head {
		margin: var(--space-6) 0 var(--space-6);
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
</style>
