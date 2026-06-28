<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	interface SearchResult {
		type: 'entity' | 'collection';
		id: string;
		name: string;
		kind: string | null;
		summary: string | null;
		url: string;
		score: number;
		context: string | null;
	}

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open, onclose }: Props = $props();

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let activeIndex = $state(-1);
	let inputEl = $state<HTMLInputElement | null>(null);
	let loading = $state(false);

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Focus input when opened; reset state when closed.
	$effect(() => {
		if (open) {
			query = '';
			results = [];
			activeIndex = -1;
			// Defer so the element is mounted.
			if (browser) setTimeout(() => inputEl?.focus(), 10);
		}
	});

	function close() {
		onclose();
	}

	function onBackdropClick(e: MouseEvent) {
		if ((e.target as Element).classList.contains('search-backdrop')) close();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			close();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = Math.min(activeIndex + 1, results.length - 1);
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, -1);
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			const target = activeIndex >= 0 ? results[activeIndex] : results[0];
			if (target) navigate(target);
			return;
		}
	}

	function navigate(result: SearchResult) {
		close();
		goto(result.url);
	}

	async function fetchResults(q: string) {
		if (!q.trim()) {
			results = [];
			activeIndex = -1;
			loading = false;
			return;
		}
		loading = true;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			const data = await res.json();
			results = data.results ?? [];
		} catch {
			results = [];
		} finally {
			loading = false;
			activeIndex = -1;
		}
	}

	function onInput() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => fetchResults(query), 150);
	}

	// Humanise kind id for display (e.g. "cultural-group" → "Cultural group")
	function kindLabel(kind: string): string {
		return kind.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
	}
</script>

{#if open}
	<div class="search-backdrop" role="presentation" onclick={onBackdropClick}>
		<div
			class="search-dialog"
			role="dialog"
			aria-modal="true"
			aria-label="Search"
			tabindex="-1"
			onkeydown={onKeydown}
		>
			<div class="search-input-row">
				<svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5"/>
					<path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
				<input
					bind:this={inputEl}
					bind:value={query}
					oninput={onInput}
					type="search"
					class="search-input"
					placeholder="Search…"
					autocomplete="off"
					spellcheck="false"
				/>
				<kbd class="search-esc-hint" aria-hidden="true">esc</kbd>
			</div>

			{#if results.length > 0}
				<ul class="search-results" role="listbox" aria-label="Search results">
					{#each results as result, i (result.id)}
						<li
							role="option"
							aria-selected={activeIndex === i}
							class="search-result"
							class:active={activeIndex === i}
						>
							<a
								href={result.url}
								class="search-result-link"
								onclick={(e) => { e.preventDefault(); navigate(result); }}
								onmouseenter={() => (activeIndex = i)}
							>
								<span class="search-result-main">
								<span class="search-result-name">{result.name}</span>
								{#if result.context}
									<span class="search-result-context">· {result.context}</span>
								{/if}
								{#if result.kind}
										<span class="search-result-kind">{kindLabel(result.kind)}</span>
									{:else if result.type === 'collection'}
										<span class="search-result-kind search-result-kind--collection">Collection</span>
									{/if}
								</span>
								{#if result.summary}
									<span class="search-result-summary">{result.summary}</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{:else if query.trim() && !loading}
				<p class="search-empty">No results</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.search-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		z-index: 100;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: min(10vh, 6rem);
	}

	.search-dialog {
		width: min(560px, calc(100vw - 2rem));
		background: var(--vellum);
		border: 1px solid var(--rule);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-hover);
		overflow: hidden;
	}

	.search-input-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-4);
		border-bottom: 1px solid var(--rule);
	}

	.search-icon {
		flex-shrink: 0;
		color: var(--ink-faint);
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: 0;
		outline: none;
		font-family: var(--font-display);
		font-size: var(--text-base);
		color: var(--ink);
		/* Reset browser default search-input styling */
		-webkit-appearance: none;
		appearance: none;
	}

	.search-input::placeholder {
		color: var(--ink-faint);
	}

	/* Hide browser's built-in clear button */
	.search-input::-webkit-search-cancel-button {
		-webkit-appearance: none;
		appearance: none;
	}

	.search-esc-hint {
		flex-shrink: 0;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-xs, 0.7rem);
		color: var(--ink-faint);
		border: 1px solid var(--rule);
		border-radius: 3px;
		padding: 0.1em 0.4em;
		line-height: 1.4;
		cursor: default;
	}

	.search-results {
		list-style: none;
		margin: 0;
		padding: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.search-result {
		border-radius: var(--radius-sm, 4px);
		transition: background-color 80ms;
	}

	.search-result.active,
	.search-result:has(a:focus-visible) {
		background: var(--paper-warm);
	}

	.search-result-link {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3) var(--space-3);
		text-decoration: none;
		color: inherit;
		border-radius: var(--radius-sm, 4px);
		outline: none;
	}

	.search-result-main {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.search-result-name {
		font-family: var(--font-display);
		font-size: var(--text-base);
		color: var(--ink);
		letter-spacing: 0.01em;
	}

	.search-result-kind {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		color: var(--ink-faint);
		flex-shrink: 0;
	}

	.search-result-kind--collection {
		color: var(--accent-warm, var(--ink-faint));
	}

	.search-result-context {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		color: var(--ink-soft);
	}

	.search-result-summary {
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		color: var(--ink-soft);
		line-height: 1.4;
		/* Clamp to two lines */
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.search-empty {
		margin: 0;
		padding: var(--space-4) var(--space-4);
		font-family: var(--font-serif);
		font-style: italic;
		font-size: var(--text-sm);
		color: var(--ink-faint);
	}
</style>
