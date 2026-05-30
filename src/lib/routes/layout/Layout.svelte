<script lang="ts">
	import '$lib/styles/global.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { beforeNavigate, goto } from '$app/navigation';
	import { paintAllScope, translateUrl, type ScopeContext } from '$lib/cluster';
	import type { Snippet } from 'svelte';

	interface Props {
		data: {
			nav: { href: string; label: string; count: number }[];
			kindsHref: string;
			clusterOptions: { value: string; label: string; selected: boolean }[];
			selectedCluster: string | null;
			world: { name: string; shortName: string; tagline: string; allScopeLabel: string };
			scopeContext: ScopeContext;
		};
		children: Snippet;
	}

	let { data, children }: Props = $props();

	// Set to true while the user-initiated cluster switch is
	// navigating. The beforeNavigate hook checks this and bows out
	// — otherwise it would re-paint ?scope=all onto a cluster URL
	// just chosen from the selector, effectively reverting the
	// switch.
	let bypassScopePaint = false;

	// In-app navigation hook: when the user is browsing in All
	// scope, paint `?scope=all` onto outgoing internal links that
	// would otherwise look scoped (i.e. start with a cluster prefix).
	// This is what keeps "click Freya from /characters" honest:
	// without it, the destination `/aurethia/characters/freya` would
	// re-scope the selector to Aurethia. With it, the destination
	// becomes `/aurethia/characters/freya?scope=all` and All sticks.
	//
	// Right-clicks (new tab) and pasted/shared URLs bypass this hook
	// — that's intentional. In those cases the URL alone determines
	// scope, which is the honest behaviour for a brand-new context.
	beforeNavigate((nav) => {
		if (bypassScopePaint) {
			bypassScopePaint = false;
			return;
		}
		if (data.selectedCluster !== null) return;
		if (!nav.to) return;
		if (nav.to.url.origin !== nav.from?.url.origin) return;
		// Don't paint API routes — they're never user destinations.
		if (nav.to.url.pathname.startsWith('/api/')) return;

		const painted = paintAllScope(nav.to.url, data.scopeContext);
		if (painted.href === nav.to.url.href) return;
		nav.cancel();
		goto(painted.href, { replaceState: false, keepFocus: true });
	});

	function switchCluster(value: string) {
		const newScope = value === '' ? null : value;
		const target = translateUrl(
			{
				pathname: $page.url.pathname,
				search: $page.url.search,
				hash: $page.url.hash
			},
			newScope,
			data.scopeContext
		);
		bypassScopePaint = true;
		goto(target);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="page">
	<header class="masthead">
		<div class="masthead-inner">
			<a class="wordmark" href="/">{data.world.name}</a>
			<nav>
				{#each data.nav as item (item.href)}
					<a href={item.href}>{item.label}</a>
				{/each}
				<span class="nav-sep" aria-hidden="true">·</span>
				<a href={data.kindsHref}>Kinds</a>
			</nav>
			{#if data.clusterOptions.length > 1}
				<div class="cluster-form">
					<label class="cluster-label">
						<span class="cluster-label-text">Cluster</span>
						<select name="cluster" onchange={(e) => switchCluster(e.currentTarget.value)}>
							{#each data.clusterOptions as opt (opt.value)}
								<option value={opt.value} selected={opt.selected}>{opt.label}</option>
							{/each}
						</select>
					</label>
				</div>
			{/if}
		</div>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<div class="footer-inner">
			{#if data.world.tagline}
				<p>{data.world.tagline}</p>
			{/if}
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

	.cluster-form {
		margin: 0 0 0 auto;
		padding: 0;
	}

	.cluster-label {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-soft);
	}

	.cluster-label-text {
		color: var(--ink-faint);
	}

	.cluster-label select {
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

	.cluster-label select:hover {
		border-bottom-color: var(--accent);
		color: var(--accent);
	}

	.cluster-label select:focus-visible {
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
