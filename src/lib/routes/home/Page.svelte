<script lang="ts">
	import type { HomeData } from './load';
	import { tick } from 'svelte';
	import { page } from '$app/stores';
	import Tag from '$lib/components/Tag.svelte';
	import CollectionCard from '$lib/components/CollectionCard.svelte';

	let { data }: { data: HomeData } = $props();

	const world = $derived($page.data.world);
	const ornament = $derived($page.data.ornament);

	const wordCount = $derived(data.totalWords.toLocaleString());

	// ── Passphrase gate ───────────────────────────────────────
	// One input box per character. Submit is intercepted via fetch
	// so wrong-password feedback is a local toast, not a URL redirect.
	const secretLength = $derived(data.secretLength);
	let chars = $state<string[]>([]);
	let boxEls = $state<HTMLInputElement[]>([]);
	let formEl = $state<HTMLFormElement | null>(null);
	let focusedIdx = $state<number>(-1);
	let toastVisible = $state(false);
	let toastTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (chars.length !== secretLength) {
			chars = Array(secretLength).fill('');
		}
	});

	// Focus the first gate box when it mounts (replaces autofocus attribute).
	$effect(() => {
		if (!data.authed && boxEls[0]) {
			boxEls[0].focus();
		}
	});

	const secretValue = $derived(chars.join(''));

	function showToast() {
		if (toastTimer) clearTimeout(toastTimer);
		toastVisible = true;
		toastTimer = setTimeout(() => (toastVisible = false), 2200);
	}

	async function submitSecret() {
		await tick();
		const body = new FormData();
		body.set('secret', secretValue);
		const res = await fetch('/api/auth/login', { method: 'POST', body });
		const { ok } = await res.json();
		if (ok) {
			window.location.href = '/';
		} else {
			chars = Array(secretLength).fill('');
			showToast();
			await tick();
			boxEls[0]?.focus();
		}
	}

	async function onBoxInput(i: number, e: Event) {
		const val = (e.target as HTMLInputElement).value;
		const ch = val.slice(-1);
		chars[i] = ch;
		if (ch && i < secretLength - 1) {
			boxEls[i + 1]?.focus();
		}
		if (chars.every((c) => c !== '')) {
			await submitSecret();
		}
	}

	function onBoxKeydown(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace') {
			if (chars[i]) {
				chars[i] = '';
			} else if (i > 0) {
				chars[i - 1] = '';
				boxEls[i - 1]?.focus();
			}
			e.preventDefault();
		} else if (e.key === 'ArrowLeft' && i > 0) {
			boxEls[i - 1]?.focus();
			e.preventDefault();
		} else if (e.key === 'ArrowRight' && i < secretLength - 1) {
			boxEls[i + 1]?.focus();
			e.preventDefault();
		}
	}

	async function onBoxPaste(e: ClipboardEvent) {
		e.preventDefault();
		const text = e.clipboardData?.getData('text') ?? '';
		const trimmed = text.slice(0, secretLength);
		for (let i = 0; i < secretLength; i++) {
			chars[i] = trimmed[i] ?? '';
		}
		const nextEmpty = chars.findIndex((c) => !c);
		const focusIdx = nextEmpty === -1 ? secretLength - 1 : nextEmpty;
		boxEls[focusIdx]?.focus();
		if (chars.every((c) => c !== '')) {
			await submitSecret();
		}
	}
</script>

<svelte:head>
	<title>{world.name}</title>
</svelte:head>

<section class="hero">
	<!--
		Crest: optional ornament rendered above the world title.
		Worlds opt in by dropping `assets/crest.svg` in their world
		dir; the engine reads it server-side and inlines the markup
		so theme CSS variables / currentColor flow through. Engine
		ships no default crest — a vanilla world reads as a plain
		editorial title-page.
	-->
	{#if data.crest}
		<div class="crest" aria-hidden="true">{@html data.crest}</div>
	{/if}

	<h1 class="hero-title">{world.name}</h1>

	<!--
		Hero divider: a thin rule with a centred ornament between
		two short hairlines. The centrepiece resolves in three
		tiers:
		  1. If the world's ornament.svg is set in world.md, that
		     SVG is inlined here (recolours via currentColor).
		  2. Otherwise, the CSS `::before` content resolves to
		     --ornament-glyph (from ornament.glyph in world.md).
		  3. If neither is set, the divider collapses to two
		     hairlines with an empty gap — still reads as a rule.
	-->
	<div class="bt-fleuron" aria-hidden="true">
		<span class="bt-fleuron__rule"></span>
		{#if ornament.svg}
			<span class="bt-fleuron__glyph bt-fleuron__glyph--svg">{@html ornament.svg}</span>
		{:else}
			<span class="bt-fleuron__glyph"></span>
		{/if}
		<span class="bt-fleuron__rule"></span>
	</div>

	{#if world.tagline}
		<p class="hero-tagline">{world.tagline}</p>
	{/if}

	{#if data.lede}
		<div class="bt-lede">{@html data.lede}</div>
	{:else}
		<div class="bt-lede">
			<p>
				Author <code>content_meta/world.md</code> to set this world&rsquo;s name, tagline, and homepage
				intro. The body of that file is rendered here as the hero lede.
			</p>
		</div>
	{/if}

	<!--
		Colophon: three stacked lines of tracked small-caps, like a
		title-page tally. Lines fold gracefully when the underlying
		tallies are empty (no chapters in this world, no issues), so
		a fresh world reads as a clean two-liner rather than a list
		of zeros.
	-->
	{#if data.authed}
	<p class="colophon">
		{data.totalEntities} entities&ensp;&middot;&ensp;{data.entitiesWithProse} with prose&ensp;&middot;&ensp;{data.entitiesStub} stubs&ensp;&middot;&ensp;{wordCount} words{#if data.issues > 0}
			&ensp;&middot;&ensp;<a class="issues-link" href="/health"
				>{data.issues} {data.issues === 1 ? 'issue' : 'issues'}</a
			>{/if}
	</p>
	{/if}
</section>

{#if !data.authed}
	<section
		class="gate"
		role="group"
		aria-label="Secret passphrase entry"
		onclick={() => {
			const nextEmpty = chars.findIndex((c) => !c);
			const idx = nextEmpty === -1 ? secretLength - 1 : nextEmpty;
			boxEls[idx]?.focus();
		}}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				const nextEmpty = chars.findIndex((c) => !c);
				const idx = nextEmpty === -1 ? secretLength - 1 : nextEmpty;
				boxEls[idx]?.focus();
			}
		}}
	>
		<div class="gate-form">
			<p class="gate-prompt">{data.gatePrompt}</p>
			<div class="gate-boxes" aria-label="Secret passphrase">
				{#each chars as ch, i (i)}
					<div
						class="gate-slot"
						class:gate-slot--filled={!!ch}
						class:gate-slot--focused={focusedIdx === i}
					>
						<input
							type="password"
							class="gate-box"
							maxlength={2}
							value={ch}
							autocomplete="off"
							aria-label="Character {i + 1} of {data.secretLength}"
						bind:this={boxEls[i]}
						oninput={(e) => onBoxInput(i, e)}
							onkeydown={(e) => onBoxKeydown(i, e)}
							onpaste={onBoxPaste}
							onfocus={() => (focusedIdx = i)}
							onblur={() => (focusedIdx = -1)}
						/>
						{#if ch}
							<span class="gate-glyph" aria-hidden="true">{ornament.glyph ?? '✶'}</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
		{#if toastVisible}
			<p class="gate-toast" role="alert">That's not it.</p>
		{/if}
	</section>
{/if}

<!-- ── Dashboard: two-column layout. Left = guide/sources/journal callouts;
     Right = tall influence card. Stacks vertically on mobile (influence
     card rendered last in DOM but hoisted to top via order on mobile). -->
{#if data.authed}
<div class="page-wide">
	<div class="dashboard">
		<div class="dashboard-left">
			{#each data.guides as guide (guide.slug)}
				<a class="guide-callout" href={guide.href}>
					<div class="guide-body">
						{#if ornament.guides?.svg}
							<div class="guide-mark" aria-hidden="true">{@html ornament.guides.svg}</div>
						{/if}
						<p class="guide-eyebrow">{guide.eyebrow}</p>
						<p class="guide-title bt-meta-link">{guide.title}</p>
						<p class="guide-sub">{guide.summary}</p>
					</div>
					<div class="guide-arrow bt-meta-link" aria-hidden="true">→</div>
				</a>
			{/each}

			{#if data.sourceProjects.length > 0}
				<!--
					Source projects: out-of-world catalogue of feeder works being
					integrated into the world. Guide/Notebook-style doorway —
					teases by listing the project names so the visitor knows what's
					on the workbench; the full list (with sizes, integration
					bars, entity links) lives at /sources.
				-->
				<a class="sources-callout" href="/sources">
					<div class="sources-body">
						<p class="sources-eyebrow">Workbench</p>
						<p class="sources-title bt-meta-link">Source projects</p>
						<p class="sources-sub">
							{data.sourceProjects.length} feeder works:
							<span class="sources-names"
								>{(() => {
									const titles = data.sourceProjects.map((p) => p.title);
									const shown = titles.slice(0, 3);
									const rest = titles.length - shown.length;
									return shown.join(', ') + (rest > 0 ? `, and ${rest} more` : '');
								})()}.</span
							>
						</p>
					</div>
					<div class="sources-arrow bt-meta-link" aria-hidden="true">→</div>
				</a>
			{/if}

			{#if data.hasBlogPosts}
			<!--
				Notebook callout: a sibling doorway to the author's-room blog,
				in a cooler register than the world's chrome. Same shape as the
				guide callout so the two read as a paired set, but the rule is
				faint and the surface is the journal tint to signal that this
				is *about* the world rather than *of* it.
			-->
			<a class="journal-callout" href="/blog">
				<div class="journal-body">
					<p class="journal-eyebrow">Working notes</p>
					<p class="journal-title bt-meta-link">Notebook</p>
					<p class="journal-sub">
						Author&rsquo;s-room reflections on building {world.name}. Out-of-world; not part of the
						compendium.
					</p>
				</div>
				<div class="journal-arrow bt-meta-link" aria-hidden="true">→</div>
			</a>
			{/if}
		</div>

		{#if data.influenceCard}
			<!--
				Influences callout: tall vertical card — image fills top portion,
				text (eyebrow, title, creator, epigraph) below. Links to /influences.
				Right column so it reads as the hero visual alongside the left list.
			-->
			<div class="dashboard-right">
				<a class="influence-card" href="/influences">
					{#if data.influenceCard.imageSrc}
						<div class="influence-card__image">
							<img src={data.influenceCard.imageSrc} alt={data.influenceCard.title} />
						</div>
					{:else}
						<div
							class="influence-card__image influence-card__image--empty"
							aria-hidden="true"
						></div>
					{/if}
					<div class="influence-card__body">
						<p class="influence-card__section">My influences</p>
						{#if data.influenceCard.imageComment}
							<p class="influence-card__eyebrow">{data.influenceCard.imageComment}</p>
						{/if}
						<p class="influence-card__title bt-meta-link">
							{data.influenceCard.title}{#if data.influenceCard.creator}&ensp;&middot;&ensp;<span
									class="influence-card__creator">{data.influenceCard.creator}</span
								>{/if}
						</p>
						{#if data.influenceCard.epigraph}
							<p class="influence-card__epigraph">{data.influenceCard.epigraph}</p>
						{/if}
						<p class="influence-card__cta bt-meta-link" aria-hidden="true">Browse influences →</p>
					</div>
				</a>
			</div>
		{/if}
	</div>

	<section class="types">
		<h2 class="section-heading">Collections</h2>
		<ul class="collection-list">
			{#each data.counts as c (c.type)}
				<CollectionCard href={`/${c.type}`} label={c.label} description={c.description} />
			{/each}
		</ul>
	</section>

	{#if data.threads.length > 0}
		<section class="threads">
			<h2 class="section-heading">Starting threads</h2>
			<ul class="collection-list">
				{#each data.threads as t (t.type)}
					<CollectionCard href={`/${t.type}`} label={t.label} description={t.description} />
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.tags.length > 0}
		<section class="tags-section">
			<h2 class="section-heading">Tags</h2>
			<div class="tag-row">
				{#each data.tags as t (t.tag)}
					<Tag label={t.tag} href={`/tags/${encodeURIComponent(t.tag)}`} />
				{/each}
			</div>
		</section>
	{/if}
</div>
{/if}

<style>
	.hero {
		margin: var(--space-6) auto var(--space-8);
		max-width: var(--prose-max);
		text-align: center;
	}

	.crest {
		display: flex;
		justify-content: center;
		color: var(--accent-warm);
		margin: 0 0 var(--space-5);
	}

	.hero-title {
		font-family: var(--font-display);
		font-size: clamp(2rem, 6vw, var(--text-4xl));
		font-weight: 400;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		text-indent: 0.18em; /* compensate for the trailing tracking */
		padding-right: 0.18em; /* prevent background-clip from cropping the last glyph */
		margin: 0;
		line-height: 1.15;
		max-width: 100%;
		background: linear-gradient(
			180deg,
			var(--ink) 0%,
			var(--accent-warm) 55%,
			var(--accent-deep) 100%
		);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}

	.hero-tagline {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.22em;
		color: var(--ink-soft);
		margin: 0 0 var(--space-6);
	}

	.bt-lede {
		font-size: var(--text-lg);
		text-align: left;
		margin: 0 auto;
	}

	.bt-lede p {
		margin: 0 0 var(--space-4);
	}

	.bt-lede p:last-child {
		margin-bottom: 0;
	}

	.bt-lede :global(em) {
		font-style: italic;
		color: var(--ink);
	}

	.bt-lede :global(.closing) {
		margin-top: var(--space-5);
		color: var(--ink);
	}

	/* ── Wide page canvas for dashboard + sections below hero ── */
	.page-wide {
		max-width: 72rem;
		margin-left: auto;
		margin-right: auto;
	}

	/* ── Dashboard: two-column grid.
	   Left column (~1fr): stacked guide/sources/journal callouts.
	   Right column (~1.5fr): tall influence card.
	   Collapses to single column on mobile; influence card comes first
	   visually on mobile via `order`. */
	.dashboard {
		display: grid;
		grid-template-columns: 1fr 1.5fr;
		gap: var(--space-6);
		margin-bottom: var(--space-8);
		align-items: stretch;
	}

	.dashboard-left {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* Each card in the left column grows equally to fill the column height,
	   so the left stack always matches the influence card on the right. */
	.dashboard-left > * {
		flex: 1;
	}

	.dashboard-right {
		display: flex;
		flex-direction: column;
	}

	/* ── Guide callout — a prominent featured doorway to a content-authored
	   guide (tour, "start here", landing page). Repeated once per
	   registered guide. Top+left borders thicker (2px) in muted copper,
	   right+bottom hairline — corner-bracket idiom that reads as an entrance.
	   Optional guide-mark ornament sits above the body text. */
	.guide-callout {
		display: flex;
		align-items: flex-start;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-6);
		text-decoration: none;
		color: inherit;
		background: var(--vellum);
		border-top: 2px solid color-mix(in oklab, var(--accent) 40%, var(--rule));
		border-left: 2px solid color-mix(in oklab, var(--accent) 40%, var(--rule));
		border-right: 1px solid color-mix(in oklab, var(--accent) 40%, var(--rule));
		border-bottom: 1px solid color-mix(in oklab, var(--accent) 40%, var(--rule));
		border-radius: var(--radius-sm);
		transition:
			background-color 250ms ease,
			box-shadow 250ms ease,
			transform 250ms ease;
	}

	.guide-callout:hover {
		background: color-mix(in oklab, var(--accent-meta) 5%, var(--parchment));
		box-shadow:
			0 1px 1px rgba(120, 90, 60, 0.04),
			0 4px 14px -8px rgba(120, 90, 60, 0.1);
		transform: translateY(-1px);
	}

	/* Optional ornamental mark from ornament.guides.svg. Inlined SVG
	   colours via currentColor so --accent-warm flows through.
	   align-self: flex-start keeps it left-anchored with the body text
	   rather than stretching full-width. */
	.guide-mark {
		display: flex;
		color: var(--accent-warm);
		margin-bottom: var(--space-3);
	}

	.guide-mark :global(svg) {
		height: 2rem;
		width: auto;
		display: block;
	}

	.guide-body {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.guide-eyebrow {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-1);
	}

	.guide-title {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		color: var(--ink);
		margin: 0 0 var(--space-2);
		font-style: italic;
		/* Gradient parked off-screen; background-clip:text set so worlds
		   can trigger a gleam sweep on hover via @keyframes in theme.css
		   without touching engine code — same hook as .card-link in EntityCard. */
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-warm) 50%,
			currentColor 58%,
			currentColor 100%
		);
		background-size: 250% 100%;
		background-position: 130% 0;
		background-clip: text;
		-webkit-background-clip: text;
	}

	.guide-callout:hover .guide-title {
		color: var(--accent-meta);
	}

	.guide-sub {
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
		margin: 0;
		line-height: var(--leading-normal);
	}

	.guide-arrow {
		font-size: var(--text-xl);
		color: var(--accent);
		flex-shrink: 0;
	}

	.guide-callout:hover .guide-arrow {
		color: var(--accent-meta);
	}

	/* ── Notebook callout — quieter sibling to the guide doorway.
	   Solid border and vellum background; display-italic title for
	   visual consistency with guide register but clearly secondary. */
	.journal-callout {
		display: flex;
		align-items: flex-start;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-6);
		text-decoration: none;
		color: inherit;
		background: var(--vellum);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		transition: background-color 0.2s ease;
	}

	.journal-callout:hover {
		background: color-mix(in oklab, var(--accent-meta) 5%, var(--parchment));
	}

	.journal-body {
		flex: 1;
	}

	.journal-eyebrow {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-1);
	}

	.journal-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-xl);
		color: var(--ink);
		margin: 0 0 var(--space-2);
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-warm) 50%,
			currentColor 58%,
			currentColor 100%
		);
		background-size: 250% 100%;
		background-position: 130% 0;
		background-clip: text;
		-webkit-background-clip: text;
	}

	.journal-callout:hover .journal-title {
		color: var(--accent-meta);
	}

	.journal-sub {
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
		margin: 0;
		line-height: var(--leading-normal);
	}

	.journal-arrow {
		font-size: var(--text-xl);
		color: var(--ink-faint);
		flex-shrink: 0;
	}

	.journal-callout:hover .journal-arrow {
		color: var(--accent-meta);
	}

	/* ── Source projects callout — out-of-world workbench doorway.
	   Solid border and vellum background matches journal callout;
	   display-italic title; italic summary for register consistency. */
	.sources-callout {
		display: flex;
		align-items: flex-start;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-6);
		text-decoration: none;
		color: inherit;
		background: var(--vellum);
		border: 1px solid var(--rule);
		border-radius: var(--radius-sm);
		transition: background-color 0.2s ease;
	}

	.sources-callout:hover {
		background: color-mix(in oklab, var(--accent-meta) 5%, var(--parchment));
	}

	.sources-body {
		flex: 1;
		min-width: 0;
	}

	.sources-eyebrow {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-1);
	}

	.sources-title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-xl);
		color: var(--ink);
		margin: 0 0 var(--space-2);
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-warm) 50%,
			currentColor 58%,
			currentColor 100%
		);
		background-size: 250% 100%;
		background-position: 130% 0;
		background-clip: text;
		-webkit-background-clip: text;
	}

	.sources-callout:hover .sources-title {
		color: var(--accent-meta);
	}

	.sources-sub {
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
		margin: 0;
		line-height: var(--leading-normal);
	}

	.sources-names {
		font-style: italic;
		color: var(--ink);
	}

	.sources-arrow {
		font-size: var(--text-xl);
		color: var(--ink-faint);
		flex-shrink: 0;
	}

	.sources-callout:hover .sources-arrow {
		color: var(--accent-meta);
	}

	/* ── Influence card — tall vertical card occupying the right column.
	   Image fills the top ~65% of the card; text (eyebrow, title, creator,
	   epigraph) sits below. The whole card links to /influences. */
	.influence-card {
		display: flex;
		flex-direction: column;
		height: 100%;
		text-decoration: none;
		color: inherit;
		background: color-mix(in oklab, var(--parchment-soft) 30%, white);
		border-radius: var(--radius-sm);
		overflow: hidden;
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--rule-hair) 60%, transparent);
		transition: box-shadow 0.2s ease;
	}

	.influence-card:hover {
		background: color-mix(in oklab, var(--accent-meta) 5%, var(--parchment));
		box-shadow:
			0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent),
			0 8px 24px -12px rgba(120, 90, 60, 0.14);
	}

	.influence-card__image {
		flex: 1 1 0;
		overflow: hidden;
		background: var(--parchment-soft);
		min-height: 10rem;
	}

	.influence-card__body {
		flex: 0 0 auto;
		padding: var(--space-4) var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.influence-card__image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 0.4s ease;
	}

	.influence-card:hover .influence-card__image img {
		transform: scale(1.03);
	}

	/* Placeholder when no image is set — renders as a tinted block */
	.influence-card__image--empty {
		background: color-mix(in oklab, var(--accent) 8%, var(--parchment-soft));
	}

	.influence-card__section {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.14em;
		color: var(--ink-faint);
		margin: 0 0 var(--space-1);
	}

	.influence-card__eyebrow {
		font-size: var(--text-sm);
		font-family: var(--font-author);
		color: var(--ink-soft);
		margin: 0 0 var(--space-2);
		line-height: var(--leading-normal);
	}

	.influence-card__title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-lg);
		color: var(--ink);
		margin: 0;
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-warm) 50%,
			currentColor 58%,
			currentColor 100%
		);
		background-size: 250% 100%;
		background-position: 130% 0;
		background-clip: text;
		-webkit-background-clip: text;
	}

	.influence-card__creator {
		font-style: normal;
		font-size: var(--text-sm);
	}

	.influence-card__title {
		font-family: var(--font-display);
		font-style: italic;
		font-size: var(--text-xl);
		color: var(--ink);
		margin: 0;
		background-image: linear-gradient(
			100deg,
			currentColor 0%,
			currentColor 42%,
			var(--accent-warm) 50%,
			currentColor 58%,
			currentColor 100%
		);
		background-size: 250% 100%;
		background-position: 130% 0;
		background-clip: text;
		-webkit-background-clip: text;
	}

	.influence-card:hover .influence-card__title {
		color: var(--accent-meta);
	}

	.influence-card__creator {
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
		margin: 0;
	}

	.influence-card__epigraph {
		font-size: var(--text-sm);
		font-style: italic;
		color: var(--ink-soft);
		margin: 0;
		line-height: var(--leading-normal);
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
	}

	.influence-card__cta {
		margin: var(--space-3) 0 0;
		font-size: var(--text-sm);
		color: var(--ink-faint);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		transition: color 0.15s ease;
	}

	.influence-card:hover .influence-card__cta {
		color: var(--accent-meta);
	}

	.section-heading {
		font-size: var(--text-sm);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		font-weight: 500;
		margin: 0 0 var(--space-4);
		font-family: var(--font-serif);
	}

	.types {
		margin-bottom: var(--space-8);
	}

	.collection-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: var(--space-4) var(--space-6);
	}

	.threads {
		margin-bottom: var(--space-8);
	}

	.tags-section {
		margin-bottom: var(--space-8);
	}

	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}

	/* Title-page colophon: single centered tally line. */
	.colophon {
		margin: var(--space-7) auto 0;
		text-align: center;
		font-family: var(--font-serif);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.18em;
		font-size: var(--text-sm);
		color: var(--ink-faint);
	}

	/* The "N issues" segment of the counter is itself a link to the
	   health dashboard. Borrow the counter's small-caps register so
	   the row reads as one editorial label; underline-on-hover signals
	   the link without making it shout. */
	.issues-link {
		color: inherit;
		text-decoration: none;
		border-bottom: 1px dotted currentColor;
	}

	.issues-link:hover {
		color: var(--accent);
	}

	/* ── Passphrase gate ──────────────────────────────────────── */
	.gate {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-5);
		padding: var(--space-8) var(--space-5) 6rem;
		cursor: text;
	}

	.gate-form {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-5);
	}

	.gate-prompt {
		font-family: var(--font-display);
		font-size: clamp(1.1rem, 5vw, var(--text-2xl));
		font-weight: 400;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		text-indent: 0.18em;
		line-height: 1.1;
		margin: 0;
		background: linear-gradient(
			180deg,
			var(--ink) 0%,
			var(--accent-warm) 55%,
			var(--accent-deep) 100%
		);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		text-align: center;
	}

	.gate-toast {
		font-family: var(--font-display);
		font-size: var(--text-sm);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-soft);
		font-style: italic;
		margin: 0;
		animation: gate-toast-fade 2.2s ease-out both;
	}

	@keyframes gate-toast-fade {
		0%   { opacity: 0; transform: translateY(-4px); }
		12%  { opacity: 1; transform: translateY(0); }
		70%  { opacity: 1; }
		100% { opacity: 0; }
	}

	.gate-boxes {
		display: flex;
		gap: var(--space-4);
		opacity: 1;
		transition: opacity 300ms;
	}

	/* When nothing in the form has focus, dim the slots gently */
	.gate-form:not(:focus-within) .gate-boxes {
		opacity: 0.45;
	}

	/* Hovering the gate section while unfocused brightens them back as an invite */
	.gate:hover .gate-form:not(:focus-within) .gate-boxes {
		opacity: 0.8;
	}

	/* Each slot is a positioned wrapper so the glyph can overlay the input */
	.gate-slot {
		position: relative;
		width: 2.4rem;
		height: 3rem;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	/* The underline lives on the slot, not the input */
	.gate-slot::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 1.5px;
		background: var(--ink-soft);
		transition: background-color 200ms;
	}

	/* Focused empty slot: sharp on/off pulse with glow at peak */
	@keyframes gate-pulse {
		0%   { height: 1.5px; background: var(--ink-soft);   box-shadow: none; opacity: 1; }
		40%  { height: 2.5px; background: var(--accent-warm); box-shadow: 0 0 6px 1px var(--accent-warm); opacity: 1; }
		60%  { height: 2.5px; background: var(--accent-warm); box-shadow: 0 0 6px 1px var(--accent-warm); opacity: 1; }
		85%  { height: 1.5px; background: var(--ink-soft);   box-shadow: none; opacity: 0.2; }
		100% { height: 1.5px; background: var(--ink-soft);   box-shadow: none; opacity: 1; }
	}

	.gate-slot--focused:not(.gate-slot--filled)::after {
		animation: gate-pulse 1.4s ease-in-out infinite;
	}

	/* Filled slot: hide the underline entirely */
	.gate-slot--filled::after {
		background: transparent;
	}

	/* The actual input — invisible, just captures keypresses */
	.gate-box {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		padding: 0;
		opacity: 0;
		background: transparent;
		border: none;
		outline: none;
		cursor: default;
		-webkit-appearance: none;
		appearance: none;
	}

	/* Ornament glyph shown when slot is filled */
	@keyframes gate-glyph-emerge {
		0%   { opacity: 0;   transform: scale(0.5);   text-shadow: 0 0 18px var(--accent-warm); filter: blur(4px); }
		40%  { opacity: 0.9; transform: scale(1.25);  text-shadow: 0 0 12px var(--accent-warm); filter: blur(1px); }
		70%  { opacity: 1;   transform: scale(0.95);  text-shadow: 0 0 4px var(--accent-warm);  filter: blur(0);   }
		100% { opacity: 1;   transform: scale(1);     text-shadow: none;                         filter: blur(0);   }
	}

	.gate-glyph {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		color: var(--accent-warm);
		line-height: 1;
		padding-bottom: 0.3em;
		pointer-events: none;
		user-select: none;
		animation: gate-glyph-emerge 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	/* ── Mobile: single column, influence card hoisted above left-column list */
	@media (max-width: 48rem) {
		.dashboard {
			grid-template-columns: 1fr;
		}

		.dashboard-right {
			order: -1;
		}

		.influence-card {
			min-height: 22rem;
		}
	}
</style>
