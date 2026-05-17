<script lang="ts">
	import '$lib/styles/global.css'
	import favicon from '$lib/assets/favicon.svg'
	import type { Snippet } from 'svelte'

	interface Props {
		children: Snippet
	}

	let { children }: Props = $props()

	const nav = [
		{ href: '/characters', label: 'Characters' },
		{ href: '/places', label: 'Places' },
		{ href: '/factions', label: 'Factions' },
		{ href: '/concepts', label: 'Concepts' }
	]
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="page">
	<header class="masthead">
		<div class="masthead-inner">
			<a class="wordmark" href="/">Alteria</a>
			<nav>
				{#each nav as item (item.href)}
					<a href={item.href}>{item.label}</a>
				{/each}
			</nav>
		</div>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<div class="footer-inner">
			<p>A field-notebook of worlds.</p>
		</div>
	</footer>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.masthead {
		border-bottom: var(--rule-thin);
		padding: var(--space-5) var(--space-6);
	}

	.masthead-inner {
		max-width: var(--page-max);
		margin: 0 auto;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-6);
	}

	.wordmark {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		letter-spacing: 0.04em;
		color: var(--ink);
		text-decoration: none;
	}

	.wordmark:hover {
		color: var(--accent);
	}

	nav {
		display: flex;
		gap: var(--space-5);
	}

	nav a {
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-soft);
		text-decoration: none;
	}

	nav a:hover {
		color: var(--accent);
	}

	main {
		flex: 1;
		width: 100%;
		max-width: var(--page-max);
		margin: 0 auto;
		padding: var(--space-7) var(--space-6);
	}

	footer {
		border-top: var(--rule-thin);
		padding: var(--space-5) var(--space-6);
	}

	.footer-inner {
		max-width: var(--page-max);
		margin: 0 auto;
		color: var(--ink-faint);
		font-style: italic;
		font-size: var(--text-sm);
	}

	.footer-inner p {
		margin: 0;
	}
</style>
