<script lang="ts">
	import { page } from '$app/state';
	import type { SourcesData } from './load';
	import EntityLink from '$lib/components/EntityLink.svelte';

	let { data }: { data: SourcesData } = $props();
</script>

<svelte:head>
	<title>Source projects · {page.data.world.shortName}</title>
</svelte:head>

<!--
	Source-projects index. Shares the notebook surface with /blog
	(cool tint, dashed frame, sans-serif title) so the
	author's-room register is recognisable at a glance — this page
	is *about* the worldbuilding rather than *of* it. Each row is
	one feeder work; the small bar on the right is how much of
	that project has already landed in the compendium.
-->
<section class="bt-notebook">
	<header class="head">
		<p class="bt-notebook__eyebrow">Workbench</p>
		<h1 class="bt-notebook__title">Source projects</h1>
		<p class="sub">
			The feeder works being absorbed into {page.data.world.name}. Out-of-world; ordered newest first.
		</p>
	</header>

	{#if data.projects.length === 0}
		<p class="empty">No source projects yet.</p>
	{:else}
		<ul class="projects">
			{#each data.projects as p (p.slug)}
				<li class="project">
					<div class="year">{p.yearStart}</div>
					<div class="main">
						<div class="title-row">
							<span class="project-title">{p.title}</span>
							<span class="genre">{p.genre}</span>
							<span class="size" title="Project size">{p.size}</span>
							{#if p.cluster}
								<a class="cluster" href={`/${p.cluster.slug}`} title="Cluster">
									{p.cluster.label}
								</a>
							{/if}
						</div>
						<p class="catchline">{p.catchline}</p>
						{#if p.entity}
							<p class="entity-link-row">
						In {page.data.world.name}: <EntityLink
								id={p.entity.id}
								name={p.entity.name}
								summary={p.entity.summary}
								sigil={p.entity.sigil}
								kind={p.entity.kind}
								compact
							/>
							</p>
						{/if}
					</div>
					<div
						class="integration"
						title={`${p.integration}% integrated into ${page.data.world.name}`}
						aria-label={`${p.integration}% integrated`}
					>
						<div class="bar" aria-hidden="true">
							<div class="fill" style:width={`${p.integration}%`}></div>
						</div>
						<div class="bar-label">{p.integration}%</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	/* Sources is wider than prose-max: each row is a small table
	   of year, project, and integration bar. */
	.bt-notebook {
		max-width: 48rem;
	}

	.head {
		margin: 0 0 var(--space-6);
		padding-bottom: var(--space-5);
		border-bottom: 1px solid var(--rule-hair);
	}

	.sub {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--ink-soft);
		line-height: var(--leading-normal);
	}

	.empty {
		margin: 0;
		color: var(--ink-soft);
		font-style: italic;
	}

	.projects {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.project {
		display: grid;
		grid-template-columns: 4rem 1fr 7rem;
		gap: var(--space-4);
		align-items: start;
		padding: var(--space-4) 0;
	}

	/* Separator above every project except the first. */
	.project + .project {
		border-top: 1px solid var(--rule-hair);
	}

	.year {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		color: var(--ink-soft);
		font-variant-numeric: tabular-nums;
	}

	.main {
		min-width: 0;
	}

	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2) var(--space-3);
		margin-bottom: var(--space-1);
	}

	.project-title {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		color: var(--ink);
	}

	.genre {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		color: var(--ink-faint);
	}

	.size {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--ink-soft);
		background: var(--vellum);
		border: 1px solid var(--rule);
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		letter-spacing: 0.05em;
	}

	/* Cluster chip — the destination cluster (aurethia, earth, …)
	   for each project. Links to the cluster's root page so the
	   reader can jump into that part of the compendium. Visually
	   sits beside the size pill but in the accent register so it
	   reads as actionable. */
	.cluster {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--accent);
		background: var(--vellum);
		border: 1px solid var(--rule);
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		text-decoration: none;
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}

	.cluster:hover {
		border-color: var(--accent-soft);
		color: var(--accent-soft);
	}

	.catchline {
		font-size: var(--text-sm);
		color: var(--ink-soft);
		margin: 0;
		line-height: var(--leading-normal);
	}

	.entity-link-row {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
		margin: var(--space-2) 0 0;
	}

	.integration {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-1);
	}

	.bar {
		height: 0.4rem;
		background: var(--vellum);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		background: var(--accent);
		transition: width 0.2s ease;
	}

	.bar-label {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		color: var(--ink-faint);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 36rem) {
		.project {
			grid-template-columns: 3rem 1fr;
			grid-template-areas:
				'year main'
				'.    integration';
		}

		.year {
			grid-area: year;
		}

		.main {
			grid-area: main;
		}

		.integration {
			grid-area: integration;
			flex-direction: row;
			align-items: center;
			gap: var(--space-3);
		}

		.bar {
			flex: 1;
		}

		.bar-label {
			text-align: left;
			min-width: 3ch;
		}
	}
</style>
