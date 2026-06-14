<script lang="ts">
	import type { VocabEntry } from '$lib/types';

	interface Props {
		entries: VocabEntry[];
	}

	let { entries }: Props = $props();

	type SortCol = 'word' | 'pos' | 'meaning' | 'notes' | 'source';
	type SortDir = 'asc' | 'desc';

	let sortCol = $state<SortCol>('word');
	let sortDir = $state<SortDir>('asc');

	/** True when at least one entry has a non-null sourceId. */
	const showSource = $derived(entries.some((e) => e.sourceId !== null));



	/** Compare two nullable strings: non-null before null, then locale order. */
	function cmp(a: string | null, b: string | null): number {
		if (a === null && b === null) return 0;
		if (a === null) return 1;
		if (b === null) return -1;
		return a.localeCompare(b);
	}

	const sorted = $derived.by(() => {
		const slice = [...entries];
		const dir = sortDir === 'asc' ? 1 : -1;
		slice.sort((a, b) => {
			let diff = 0;
			switch (sortCol) {
				case 'word':    diff = cmp(a.word, b.word); break;
				case 'pos':     diff = cmp(a.pos, b.pos); break;
				case 'meaning': diff = cmp(a.meaning, b.meaning); break;
				case 'notes':   diff = cmp(a.notes, b.notes); break;
				case 'source':  diff = cmp(a.sourceName, b.sourceName); break;
			}
			return diff * dir;
		});
		return slice;
	});

	const wordCount = $derived(entries.length);

	function toggleSort(col: SortCol) {
		if (sortCol === col) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortCol = col;
			sortDir = 'asc';
		}
	}

	function indicator(col: SortCol): string {
		if (sortCol !== col) return '';
		return sortDir === 'asc' ? '▲' : '▼';
	}
</script>

<div class="vocab-wrap">
	<p class="word-count">
		{wordCount === 1 ? '1 word' : `${wordCount} words`}
	</p>

	<div class="table-scroll">
		<table class="vocab-table">
			<thead>
				<tr>
					<th>
						<button class="sort-btn" class:active={sortCol === 'word'} onclick={() => toggleSort('word')}>
							Word{#if indicator('word')}<span class="sort-indicator" aria-hidden="true">{indicator('word')}</span>{/if}
						</button>
					</th>
					<th class="col-pos">
						<button class="sort-btn" class:active={sortCol === 'pos'} onclick={() => toggleSort('pos')}>
							Pos{#if indicator('pos')}<span class="sort-indicator" aria-hidden="true">{indicator('pos')}</span>{/if}
						</button>
					</th>
					<th>
						<button class="sort-btn" class:active={sortCol === 'meaning'} onclick={() => toggleSort('meaning')}>
							Meaning{#if indicator('meaning')}<span class="sort-indicator" aria-hidden="true">{indicator('meaning')}</span>{/if}
						</button>
					</th>
					<th>
						<button class="sort-btn" class:active={sortCol === 'notes'} onclick={() => toggleSort('notes')}>
							Notes{#if indicator('notes')}<span class="sort-indicator" aria-hidden="true">{indicator('notes')}</span>{/if}
						</button>
					</th>
					{#if showSource}
						<th>
							<button class="sort-btn" class:active={sortCol === 'source'} onclick={() => toggleSort('source')}>
								Source{#if indicator('source')}<span class="sort-indicator" aria-hidden="true">{indicator('source')}</span>{/if}
							</button>
						</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each sorted as entry (entry.word + (entry.sourceId ?? ''))}
					<tr>
						<td class="cell-word">
							<span class="word-text">{entry.word}</span>
						</td>
						<td class="cell-pos">
							{#if entry.pos}
								<span class="pos-label">{entry.pos}</span>
							{/if}
						</td>
						<td class="cell-meaning">
							{#if entry.meaning}{entry.meaning}{/if}
						</td>
						<td class="cell-notes">
							{#if entry.notes}{entry.notes}{/if}
						</td>
						{#if showSource}
							<td class="cell-source">
								{#if entry.sourceHref && entry.sourceName}
									<a class="source-link" href={entry.sourceHref}>{entry.sourceName}</a>
								{:else if entry.sourceName}
									{entry.sourceName}
								{/if}
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.vocab-wrap {
		margin-block: var(--space-4);
	}

	.word-count {
		margin: 0 0 var(--space-4);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	.table-scroll {
		width: 100%;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.vocab-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
		color: var(--ink);
	}

	/* ── Header: a single bottom rule to separate from body ─────────── */
	.vocab-table thead tr {
		border-bottom: 1px solid var(--rule);
	}

	.vocab-table th {
		padding: 0;
		text-align: left;
		white-space: nowrap;
	}

	/* ── Sort buttons ─────────────────────────────────────────────── */
	.sort-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-4) var(--space-2) 0;
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		font-weight: 600;
		color: var(--ink-faint);
		cursor: pointer;
		transition: color 150ms ease;
		user-select: none;
	}

	.sort-btn:hover,
	.sort-btn.active {
		color: var(--accent-deep);
	}

	.sort-indicator {
		font-size: 0.65em;
		color: var(--accent);
		vertical-align: middle;
	}

	/* ── Body rows: no borders, generous padding creates the rhythm ── */
	.vocab-table tbody tr {
		transition: background-color 100ms ease;
	}

	.vocab-table tbody tr:hover {
		background-color: color-mix(in srgb, var(--accent) 5%, transparent);
	}

	.vocab-table td {
		padding: var(--space-3) var(--space-4) var(--space-3) 0;
		vertical-align: baseline;
		line-height: var(--leading-normal);
	}

	/* ── Word column ─────────────────────────────────────────────── */
	.cell-word {
		white-space: nowrap;
		padding-right: var(--space-5);
	}

	.word-text {
		font-style: italic;
		font-family: var(--font-serif);
	}

	/* ── Pos column ──────────────────────────────────────────────── */
	.col-pos { width: 1%; }

	.cell-pos { white-space: nowrap; }

	.pos-label {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		color: var(--ink-faint);
		padding-right: var(--space-4);
	}

	/* ── Meaning / Notes ─────────────────────────────────────────── */
	.cell-meaning { color: var(--ink); }
	.cell-notes   { color: var(--ink-soft, var(--ink-faint)); font-size: var(--text-sm); }

	/* ── Source links ────────────────────────────────────────────── */
	.cell-source { white-space: nowrap; }

	.source-link {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		color: var(--ink-faint);
		text-decoration: none;
		border-bottom: 1px solid var(--rule-hair);
	}

	.source-link:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-warm);
	}
</style>
