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
				case 'word':
					diff = cmp(a.word, b.word);
					break;
				case 'pos':
					diff = cmp(a.pos, b.pos);
					break;
				case 'meaning':
					diff = cmp(a.meaning, b.meaning);
					break;
				case 'notes':
					diff = cmp(a.notes, b.notes);
					break;
				case 'source':
					diff = cmp(a.sourceName, b.sourceName);
					break;
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
						<button
							class="sort-btn"
							class:active={sortCol === 'word'}
							onclick={() => toggleSort('word')}
						>
							Word{#if indicator('word')}<span class="sort-indicator" aria-hidden="true"
									>{indicator('word')}</span
								>{/if}
						</button>
					</th>
					<th class="col-pos">
						<button
							class="sort-btn"
							class:active={sortCol === 'pos'}
							onclick={() => toggleSort('pos')}
						>
							Pos{#if indicator('pos')}<span class="sort-indicator" aria-hidden="true"
									>{indicator('pos')}</span
								>{/if}
						</button>
					</th>
					<th>
						<button
							class="sort-btn"
							class:active={sortCol === 'meaning'}
							onclick={() => toggleSort('meaning')}
						>
							Meaning{#if indicator('meaning')}<span class="sort-indicator" aria-hidden="true"
									>{indicator('meaning')}</span
								>{/if}
						</button>
					</th>
					<th>
						<button
							class="sort-btn"
							class:active={sortCol === 'notes'}
							onclick={() => toggleSort('notes')}
						>
							Notes{#if indicator('notes')}<span class="sort-indicator" aria-hidden="true"
									>{indicator('notes')}</span
								>{/if}
						</button>
					</th>
					{#if showSource}
						<th>
							<button
								class="sort-btn"
								class:active={sortCol === 'source'}
								onclick={() => toggleSort('source')}
							>
								Source{#if indicator('source')}<span class="sort-indicator" aria-hidden="true"
										>{indicator('source')}</span
									>{/if}
							</button>
						</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each sorted as entry (entry.word + (entry.sourceId ?? ''))}
					<tr>
						<td class="cell-word">{entry.word}</td>
						<td class="cell-pos">
							{#if entry.pos}
								<span class="pos-label">{entry.pos}</span>
							{:else}
								<span class="em-dash" aria-label="none">—</span>
							{/if}
						</td>
						<td>
							{#if entry.meaning}
								{entry.meaning}
							{:else}
								<span class="em-dash" aria-label="none">—</span>
							{/if}
						</td>
						<td>
							{#if entry.notes}
								{entry.notes}
							{:else}
								<span class="em-dash" aria-label="none">—</span>
							{/if}
						</td>
						{#if showSource}
							<td>
								{#if entry.sourceHref && entry.sourceName}
									<a class="source-link" href={entry.sourceHref}>{entry.sourceName}</a>
								{:else if entry.sourceName}
									{entry.sourceName}
								{:else}
									<span class="em-dash" aria-label="none">—</span>
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
	/* ── Container ────────────────────────────────────────────────── */
	.vocab-wrap {
		margin-block: var(--space-4);
	}

	/* ── Word count label (matches stat-total__label) ─────────────── */
	.word-count {
		margin: 0 0 var(--space-3);
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.08em;
		color: var(--ink-faint);
	}

	/* ── Horizontal scroll wrapper ───────────────────────────────── */
	.table-scroll {
		width: 100%;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	/* ── Table ────────────────────────────────────────────────────── */
	.vocab-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
		color: var(--ink);
	}

	/* ── Header row ───────────────────────────────────────────────── */
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
		padding: var(--space-2) var(--space-3) var(--space-2) 0;
		font-size: var(--text-xs);
		font-family: var(--font-serif);
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
		line-height: 1;
		color: var(--accent);
		vertical-align: middle;
	}

	/* ── Body rows ────────────────────────────────────────────────── */
	.vocab-table tbody tr {
		border-bottom: 1px solid var(--rule-hair);
		transition: background-color 120ms ease;
	}

	/* Zebra stripe */
	.vocab-table tbody tr:nth-child(even) {
		background-color: var(--parchment-soft);
	}

	.vocab-table tbody tr:hover {
		background-color: var(--paper-warm);
	}

	.vocab-table td {
		padding: var(--space-2) var(--space-3) var(--space-2) 0;
		vertical-align: top;
		line-height: var(--leading-normal);
	}

	/* ── Word column ───────────────────────────────────────────────── */
	.cell-word {
		font-style: italic;
		font-family: var(--font-serif);
		white-space: nowrap;
		padding-right: var(--space-4);
	}

	/* ── Pos column ────────────────────────────────────────────────── */
	.col-pos {
		/* Narrow the column */
		width: 1%;
	}

	.cell-pos {
		white-space: nowrap;
	}

	.pos-label {
		font-size: var(--text-xs);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		color: var(--ink-faint);
		padding-right: var(--space-4);
	}

	/* ── Em-dash placeholder ───────────────────────────────────────── */
	.em-dash {
		color: var(--rule-bold);
		font-size: var(--text-xs);
	}

	/* ── Source links ──────────────────────────────────────────────── */
	.source-link {
		font-size: var(--text-xs);
		font-family: var(--font-serif);
		font-variant-caps: all-small-caps;
		letter-spacing: 0.06em;
		color: var(--ink);
		text-decoration: none;
		border-bottom: 1px solid var(--rule-hair);
	}

	.source-link:hover {
		color: var(--accent);
		border-bottom-color: var(--accent-warm);
	}
</style>
