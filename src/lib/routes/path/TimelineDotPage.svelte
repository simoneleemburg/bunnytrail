<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { TimelineDotPageData } from './timelineDotPage.load.ts';

	interface Props {
		data: TimelineDotPageData;
	}

	let { data }: Props = $props();
</script>

<PageHeader title={String(data.year)} breadcrumbs={data.breadcrumbs} />

<nav class="timeline-dot-nav" aria-label="Timeline navigation">
	{#if data.prev}
		<a class="nav-arrow" href={data.prev.href}>← {data.prev.year}</a>
	{:else}
		<span class="nav-arrow nav-arrow--placeholder" aria-hidden="true"></span>
	{/if}

	<a class="nav-timeline-link" href={data.timelineHref}>{data.timelineTitle}</a>

	{#if data.next}
		<a class="nav-arrow" href={data.next.href}>{data.next.year} →</a>
	{:else}
		<span class="nav-arrow nav-arrow--placeholder" aria-hidden="true"></span>
	{/if}
</nav>

{#if data.bodyHtml}
	<div class="dot-body">
		<!-- trusted: server-rendered markdown from the engine pipeline -->
		{@html data.bodyHtml}
	</div>
{/if}

<style>
	.timeline-dot-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		max-width: var(--prose-max);
		margin: 0 auto var(--space-7);
	}

	.nav-arrow,
	.nav-timeline-link {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
		text-decoration: none;
	}

	.nav-arrow:hover,
	.nav-timeline-link:hover {
		color: var(--accent-warm);
	}

	.nav-arrow {
		flex: 0 0 auto;
	}

	.nav-arrow--placeholder {
		/* Invisible spacer so the centre link stays centred when
		   one side has no neighbour dot. */
		visibility: hidden;
		pointer-events: none;
	}

	.nav-timeline-link {
		flex: 1;
		text-align: center;
	}

	.dot-body {
		max-width: var(--prose-max);
		margin: 0 auto;
	}
</style>
