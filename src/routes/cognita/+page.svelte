<script lang="ts">
	import ClustersMap from '$lib/components/ClustersMap.svelte';
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
			Three maps follow. The first is cosmological — the frame within which everything else sits.
			The second steps back to galactic scale, locating the two clusters charted so far. The third
			zooms into Aureth, its eight planets, and the long gulf to the neighbouring system.
		</p>
	</header>

	<section class="map-section">
		<h2>The cosmological frame</h2>
		<p class="map-intro">
			To understand Alteria, it helps to begin where any of us would already be standing. The
			ordinary world — the one where ordinary physics holds, where stone is stone and time runs
			forward — sits at the centre of the cosmology. The map below calls that centre
			<a href="/foundation/fabric/equilibrium">Equilibrium</a>. Most things, most of the time, are
			there.
		</p>
		<MundusMap />
		<p class="map-intro">
			The cosmology adds three further dimensions on top of ordinary space and time. They do not
			move you across a landscape; they change what space and time are like in the place you stand.
			Each one runs from the familiar middle out toward a limit at which something fundamental about
			reality has been turned all the way up or down.
		</p>

		<dl class="axes-intro">
			<dt><a href="/foundation/fabric/essence">Essence</a></dt>
			<dd>
				The liveliness of being. Walk this way and the world grows ethereal — alive in itself, not
				merely inhabited by living things. The line between what is animate and what is solid
				softens; far enough along, a living thing can walk through a wall.
			</dd>

			<dt><a href="/foundation/fabric/subjectivity">Subjectivity</a></dt>
			<dd>
				The intensity of individual perspective. Walk this way and the fabric of a place begins to
				answer to whoever is in it. Layout, weather, geography bend toward attention, mood, memory —
				space-time becomes responsive to the perceiver.
			</dd>

			<dt><a href="/foundation/fabric/dissolution">Dissolution</a></dt>
			<dd>
				The looseness of form. Walk this way and the work that ordinarily holds space-time together
				falls off. A gesture of the hand can raise a tornado; further along, the same gesture may
				open a black hole or fold a passage of time onto itself.
			</dd>
		</dl>

		<p class="map-intro">
			Each direction has an end — not one you can reach, but one the fabric of a place declares more
			loudly the closer you get. The corners (<a href="/kinds/cardinal">Cardinals</a>) and edges (<a
				href="/kinds/horizon">Horizons</a
			>) of the map are those bounds.
		</p>
	</section>

	<section class="map-section">
		<h2>The clusters</h2>
		<p class="map-intro">
			Step back from the cosmology and look at the universe at galactic scale. Two clusters have
			been charted so far —
			<a href="/aurethia">Aurethia</a> and <a href="/earth">Earth</a> — small bright fragments
			separated by a vast unmeasured dark. Everything around and between them is
			<em>Alteria Incognita</em>: the part of the universe that has not yet been named. However far
			apart they sit, the same <a href="/foundation">foundational fabric</a> runs through them both; the
			cosmology above is the frame every cluster turns within.
		</p>
		<ClustersMap />
	</section>

	<section class="map-section">
		<h2>The Aurethian cluster</h2>
		<p class="map-intro">
			<a href="/aurethia/places/celestial/aureth-system/aureth">Aureth</a> and its eight planets.
			Three of them — the habitable-zone worlds — are settled territory; the others are sketches,
			their names still tentative. Across the long gulf, the neighbouring <em>Hollow Binary</em> is
			visible from Cognita: a single companion star, and the unresolved body it orbits —
			<a href="/aurethia/places/celestial/hollow-binary/the-dark-companion">the Dark Companion</a>,
			which gives off no light and is known only by what it does.
		</p>
		<CognitaMap />

		<div class="legend">
			<h3>How to read it</h3>
			<dl>
				<dt>The eight planets</dt>
				<dd>
					Ranged outward from <a href="/aurethia/places/celestial/aureth-system/aureth">Aureth</a>
					on flat orbital arcs, innermost to outermost. Three —
					<a href="/aurethia/places/celestial/aureth-system/bayurinda">Bayurinda</a>,
					<a href="/aurethia/places/celestial/aureth-system/sharazan">Sharazan</a>,
					<a href="/aurethia/places/celestial/aureth-system/nebelheim">Nebelheim</a> — have full entries;
					the others are working sketches.
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

				<dt>Realms are not depicted here</dt>
				<dd>
					<a href="/aurethia/places/realms/asthera">Asthera</a>,
					<a href="/aurethia/places/realms/nareth">Nareth</a>, and the other Aurethian realms are
					regions of <a href="/foundation/fabric/mundus">Mundus</a> defined by their
					<a href="/foundation/fabric/mundus-frame">Mundus Frame</a>, not parallel planes the bodies
					sit on. The cosmological frame is the map above; this one is just the Aurethian sky.
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
		margin: var(--space-10) auto;
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

	.axes-intro {
		max-width: var(--prose-max);
		margin: 0 auto var(--space-6);
	}

	.axes-intro dt {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-style: italic;
		color: var(--ink);
		margin: var(--space-5) 0 var(--space-2);
	}

	.axes-intro dt:first-of-type {
		margin-top: 0;
	}

	.axes-intro dt a {
		color: inherit;
		text-decoration: none;
		border-bottom: 1px solid var(--rule);
	}

	.axes-intro dt a:hover {
		color: var(--accent);
	}

	.axes-intro dd {
		margin: 0;
		color: var(--ink-soft);
		line-height: var(--leading-relaxed);
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

	dd {
		margin: 0;
		color: var(--ink-soft);
		line-height: var(--leading-relaxed);
	}
</style>
