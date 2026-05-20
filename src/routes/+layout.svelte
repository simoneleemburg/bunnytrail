<script lang="ts">
	import '$lib/styles/global.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';

	interface Props {
		data: {
			nav: { href: string; label: string; count: number }[];
			regionOptions: { value: string; label: string; selected: boolean }[];
			selectedRegion: string | null;
		};
		children: Snippet;
	}

	let { data, children }: Props = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="page">
	<header class="masthead">
		<div class="masthead-inner">
			<a class="wordmark" href="/">Alteria</a>
			<nav>
				{#each data.nav as item (item.href)}
					<a href={item.href}>{item.label}</a>
				{/each}
				<span class="nav-sep" aria-hidden="true">·</span>
				<a href="/kinds">Kinds</a>
				{#if data.regionOptions.length > 1}
					<span class="nav-sep" aria-hidden="true">·</span>
					<form
						class="region-form"
						method="POST"
						action="/api/region"
					>
						<!-- Send the user back to where they were so the
						     selector feels in-place rather than navigational. -->
						<input type="hidden" name="redirect" value={$page.url.pathname + $page.url.search} />
						<label class="region-label">
							<span class="region-label-text">Region</span>
							<select
								name="region"
								onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
							>
								{#each data.regionOptions as opt (opt.value)}
									<option value={opt.value} selected={opt.selected}>{opt.label}</option>
								{/each}
							</select>
						</label>
					</form>
				{/if}
			</nav>
		</div>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<div class="footer-inner">
			<p>My sacred universe of imagination.</p>
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
		align-items: baseline;
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

	/* Quiet bullet between the folder group and the Kinds link —
	   signals that Kinds is a different kind of destination
	   (taxonomy, not a folder of entities) without shouting. */
	.nav-sep {
		color: var(--ink-faint);
		font-size: var(--text-sm);
	}

	.region-form {
		margin: 0;
		padding: 0;
	}

	.region-label {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-soft);
	}

	.region-label-text {
		color: var(--ink-faint);
	}

	.region-label select {
		font: inherit;
		font-variant: inherit;
		letter-spacing: inherit;
		color: var(--ink);
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--rule);
		padding: 0 var(--space-1);
		cursor: pointer;
	}

	.region-label select:hover {
		border-bottom-color: var(--accent);
		color: var(--accent);
	}

	.region-label select:focus-visible {
		outline: none;
		border-bottom-color: var(--accent);
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
