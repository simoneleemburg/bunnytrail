<script lang="ts">
	import type { BlogIndexData } from './load';
	import Tag from '$lib/components/Tag.svelte';

	let { data }: { data: BlogIndexData } = $props();
</script>

<svelte:head>
	<title>Notebook · Alteria</title>
</svelte:head>

<!--
	Notebook index. Visually mirrors the craft sheet so the
	author's-room register is recognisable at a glance — same
	cool-tinted surface, same dashed frame, same sans-serif
	title — even though the content here is a list of posts
	rather than a single prose column.
-->
<section class="notebook-index">
	<header class="head">
		<p class="eyebrow">Working notes</p>
		<h1 class="title">Notebook</h1>
		<p class="sub">
			Author&rsquo;s-room reflections on building Alteria. Out-of-world; not part of the compendium.
		</p>
	</header>

	{#if data.posts.length === 0}
		<p class="empty">No posts yet.</p>
	{:else}
		<ul class="posts">
			{#each data.posts as post (post.slug)}
				<li class="post">
					<a class="post-link" href={`/blog/${post.slug}`}>
						<p class="post-date">{post.dateLabel}</p>
						<h2 class="post-title">{post.title}</h2>
						{#if post.excerpt}
							<p class="post-excerpt">{post.excerpt}</p>
						{/if}
					</a>
					{#if post.tags.length > 0}
						<div class="post-tags">
							{#each post.tags as tag (tag)}
								<Tag label={tag} />
							{/each}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	/* Shared notebook surface — identical to .craft in
	   CraftPage.svelte so the two pages read as the same
	   author's-room artefact. */
	.notebook-index {
		max-width: var(--prose-max);
		margin: 0 auto;
		padding: var(--space-6) var(--space-6) var(--space-7);
		background: color-mix(in oklab, var(--ink) 4%, var(--page) 96%);
		border: 1px dashed var(--rule);
		border-radius: var(--radius-sm);
		color: var(--ink);
	}

	@media (max-width: 40rem) {
		.notebook-index {
			padding: var(--space-5) var(--space-4) var(--space-6);
		}
	}

	.head {
		margin: 0 0 var(--space-6);
		padding-bottom: var(--space-5);
		border-bottom: 1px dashed var(--rule);
	}

	.eyebrow {
		margin: 0 0 var(--space-2);
		font-variant: small-caps;
		letter-spacing: 0.14em;
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}

	.title {
		margin: 0 0 var(--space-3);
		font-family: var(--font-sans, var(--font-serif));
		font-weight: 600;
		font-size: var(--text-2xl);
		line-height: var(--leading-tight);
		color: var(--ink);
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

	.posts {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	/* Dashed separator between entries, but not above the first —
	   keeps the top of the list flush with the header rule. */
	.post + .post {
		border-top: 1px dashed var(--rule);
	}

	.post-link {
		display: block;
		padding: var(--space-4) 0;
		color: inherit;
		text-decoration: none;
	}

	.post-date {
		margin: 0 0 var(--space-2);
		font-variant: small-caps;
		letter-spacing: 0.14em;
		font-size: var(--text-xs);
		color: var(--ink-faint);
	}

	.post-title {
		margin: 0;
		font-family: var(--font-sans, var(--font-serif));
		font-weight: 600;
		font-size: var(--text-lg);
		line-height: var(--leading-tight);
		color: var(--ink);
		transition: color 0.15s ease;
	}

	.post-link:hover .post-title {
		color: var(--accent);
	}

	.post-excerpt {
		margin: var(--space-2) 0 0;
		font-size: var(--text-sm);
		color: var(--ink-soft);
		line-height: var(--leading-normal);
	}

	.post-tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding-bottom: var(--space-4);
	}
</style>
