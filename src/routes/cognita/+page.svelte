<script lang="ts">
	import CognitaMap from '$lib/components/CognitaMap.svelte';
</script>

<svelte:head>
	<title>Alteria Cognita · Alteria</title>
</svelte:head>

<article class="cognita">
	<header>
		<p class="eyebrow">The mapped territory</p>
		<h1>Alteria Cognita</h1>
		<p class="lede">
			If <strong>Alteria</strong> is the whole sprawl of imagination — every world I might one day
			wander into — then <strong>Alteria Cognita</strong> is the part of it I have actually charted. The
			known portion. The pieces that have a name, a shape, a place to stand.
		</p>
		<p class="lede">
			One star, seven planets, and two parallel layers of being. Three of the planets are settled
			territory; the rest are placeholders, waiting on their names.
		</p>
	</header>

	<CognitaMap />

	<section class="legend">
		<h2>How to read it</h2>
		<dl>
			<dt><a href="/concepts/asthera">Asthera</a> · the material</dt>
			<dd>
				The persistent layer. Bodies in their solid forms; orbits that keep; histories that stay put
				long enough to be written down.
			</dd>

			<dt><a href="/concepts/nareth">Nareth</a> · the resonant</dt>
			<dd>
				The substrate beneath. The same bodies are here too, but as identity and memory rather than
				stone — fluid, interconnected, available to drift and transformation.
			</dd>

			<dt>The threads</dt>
			<dd>
				Faint vertical lines between the twin bodies. Existence is rarely just one or the other; the
				threads are how a thing reaches across.
			</dd>

			<dt>The unnamed</dt>
			<dd>Four of the seven worlds are still placeholders. Their stories haven't arrived yet.</dd>
		</dl>
	</section>
</article>

<style>
	.cognita {
		max-width: var(--page-max);
		margin: 0 auto;
	}

	header {
		max-width: var(--prose-max);
		margin: 0 auto var(--space-6);
		text-align: center;
	}

	.eyebrow {
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-3);
	}

	header h1 {
		font-family: var(--font-display);
		font-size: var(--text-3xl);
		margin: 0 0 var(--space-5);
	}

	.lede {
		color: var(--ink-soft);
		text-align: left;
		margin: 0 0 var(--space-4);
		line-height: var(--leading-relaxed);
	}

	.lede strong {
		color: var(--ink);
		font-weight: 500;
		font-style: italic;
	}

	.legend {
		max-width: var(--prose-max);
		margin: var(--space-8) auto 0;
	}

	.legend h2 {
		font-size: var(--text-sm);
		font-variant: small-caps;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		font-weight: 500;
		font-family: var(--font-serif);
		margin: 0 0 var(--space-5);
		text-align: center;
	}

	dl {
		margin: 0;
	}

	dt {
		font-family: var(--font-display);
		font-size: var(--text-base);
		color: var(--ink);
		margin: var(--space-5) 0 var(--space-2);
		font-style: italic;
	}

	dt:first-of-type {
		margin-top: 0;
	}

	dt a {
		color: inherit;
		text-decoration: none;
		border-bottom: 1px solid var(--rule);
	}

	dt a:hover {
		color: var(--accent);
	}

	dd {
		margin: 0;
		color: var(--ink-soft);
		line-height: var(--leading-relaxed);
	}
</style>
