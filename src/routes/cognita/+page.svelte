<script lang="ts">
	import CognitaMap from '$lib/components/CognitaMap.svelte';
	import MundusMap from '$lib/components/MundusMap.svelte';
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
			Two maps follow. The first is cosmological — the frame within which everything else sits. The
			second is local — Aureth, its eight planets, and the long gulf to the neighbouring system.
		</p>
	</header>

	<section class="map-section">
		<h2>The cosmological frame</h2>
		<p class="map-intro">
			Existence is bounded by three <a href="/foundation/fabric/existence">horizons</a> — the
			Source, the Self, and Chaos — each of which is approached but never reached. Between them lies
			<a href="/foundation/fabric/existence/mundus">Mundus</a>, the inhabited middle, where every
			thing that exists has a place. Three axes — Essence, Subjectivity, Dissolution — run through
			the interior, each pointing toward the horizon it measures distance from. The faint
			topographical rings show that approach: bunched tight near the edges and corners, because the
			horizons are limits one nears but never reaches.
		</p>
		<MundusMap />
	</section>

	<section class="map-section">
		<h2>The local sky</h2>
		<p class="map-intro">
			<a href="/aurethia/places/celestial/aureth-system/aureth">Aureth</a>, eight planets, and two
			parallel layers of being. Three of the planets — the habitable-zone worlds — are settled
			territory; the others are sketches, their names still tentative. Across the long gulf, the
			neighbouring <em>Hollow Binary</em> is visible from Cognita: a single companion star, and the
			unresolved body it orbits —
			<a href="/aurethia/places/celestial/hollow-binary/the-dark-companion">the Dark Companion</a>,
			which gives off no light and is known only by what it does.
		</p>
		<CognitaMap />

		<div class="legend">
			<h3>How to read it</h3>
			<dl>
				<dt><a href="/aurethia/places/realms/asthera">Asthera</a> · the material</dt>
				<dd>
					The persistent layer. Bodies in their solid forms; orbits that keep; histories that stay
					put long enough to be written down.
				</dd>

				<dt><a href="/aurethia/places/realms/nareth">Nareth</a> · the resonant</dt>
				<dd>
					The substrate beneath. The same bodies are here too, but as identity and memory rather
					than stone — fluid, interconnected, available to drift and transformation.
				</dd>

				<dt>The threads</dt>
				<dd>
					Faint vertical lines between the twin bodies. Existence is rarely just one or the other;
					the threads are how a thing reaches across.
				</dd>

				<dt>The tentative</dt>
				<dd>
					Five of the eight worlds carry working names rather than settled ones, shown in italics on
					the map. Their stories haven't fully arrived yet.
				</dd>

				<dt>The Hollow Binary</dt>
				<dd>
					The neighbouring system, drawn off to the right across a long gulf of interstellar space
					(not to scale). Its visible companion star turns around a body the eye cannot resolve:
					<a href="/aurethia/places/celestial/hollow-binary/the-dark-companion"
						>the Dark Companion</a
					>, shown as a hollow rather than drawn solidly, because no light has ever come from it.
				</dd>
			</dl>
		</div>
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

	.map-section {
		margin: 0 auto var(--space-10);
	}

	.map-section + .map-section {
		margin-top: var(--space-10);
		padding-top: var(--space-8);
		border-top: 1px solid var(--rule);
	}

	.map-section h2 {
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		text-align: center;
		margin: 0 0 var(--space-4);
		font-weight: 500;
	}

	.map-intro {
		max-width: var(--prose-max);
		margin: 0 auto var(--space-6);
		color: var(--ink-soft);
		text-align: left;
		line-height: var(--leading-relaxed);
	}

	.map-intro a {
		color: var(--ink);
		text-decoration: none;
		border-bottom: 1px solid var(--rule);
	}

	.map-intro a:hover {
		color: var(--accent);
	}

	.legend {
		max-width: var(--prose-max);
		margin: var(--space-8) auto 0;
	}

	.legend h3 {
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
