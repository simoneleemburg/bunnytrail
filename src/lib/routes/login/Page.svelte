<script lang="ts">
	import type { LoginData } from './load';
	import { tick } from 'svelte';
	import { t } from '$lib/i18n';

	let { data }: { data: LoginData } = $props();

	const world = $derived(data.world);
	const ornament = $derived(data.ornament);
	const ui = $derived(t(data.world.language));

	// ── Passphrase gate ───────────────────────────────────────
	// One input box per character. Submit is intercepted via fetch
	// so wrong-password feedback is a local toast, not a URL redirect.
	const secretLength = $derived(data.secretLength);
	let chars = $state<string[]>([]);
	let boxEls = $state<HTMLInputElement[]>([]);
	let focusedIdx = $state<number>(-1);
	let toastVisible = $state(false);
	let toastTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (chars.length !== secretLength) {
			chars = Array(secretLength).fill('');
		}
	});

	// Focus the first gate box when it mounts.
	$effect(() => {
		if (boxEls[0]) {
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
	{#if data.ornamentGlyphStyle}
		{@html '<style>' + data.ornamentGlyphStyle + '</style>'}
	{/if}
	{#if data.worldMarkStyle}
		{@html '<style>' + data.worldMarkStyle + '</style>'}
	{/if}
</svelte:head>

<div class="login-page">
	<!--
		Crest: optional ornament rendered above the world title.
		Worlds opt in by dropping `assets/crest.svg` in their world dir.
	-->
	{#if data.crest}
		<div class="crest" aria-hidden="true">{@html data.crest}</div>
	{/if}

	<h1 class="hero-title">{world.heroTitle ?? world.name}</h1>

	<!--
		Hero divider: a thin rule with a centred ornament.
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

	<section class="gate" aria-label={ui.home_gate_section_aria}>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="gate-form"
			role="group"
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
			<p class="gate-prompt">{data.gatePrompt}</p>
			<div class="gate-boxes" aria-label={ui.home_gate_boxes_aria}>
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
							aria-label={ui.home_gate_char_aria(i + 1, data.secretLength)}
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
			<p class="gate-toast" role="alert">{ui.home_gate_wrong}</p>
		{/if}
	</section>
</div>

<style>
	/* ── Login page wrapper ──────────────────────────────────── */
	.login-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: calc(100svh - 4rem);
		padding: var(--space-6) var(--space-5);
	}

	/* ── Crest ───────────────────────────────────────────────── */
	.crest {
		display: flex;
		justify-content: center;
		color: var(--accent-warm);
		margin: 0 0 var(--space-5);
	}

	/* ── Hero title ──────────────────────────────────────────── */
	.hero-title {
		font-family: var(--font-display);
		font-size: clamp(2rem, 6vw, var(--text-4xl));
		font-weight: 400;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		text-indent: 0.18em;
		padding-right: 0.18em;
		margin: 0;
		line-height: 1.15;
		max-width: 100%;
		text-align: center;
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

	/* ── Passphrase gate ──────────────────────────────────────── */
	.gate {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-5);
		padding: var(--space-6) var(--space-5);
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
</style>
