import type { FoundWordRow } from '../hooks/useGame'

/** A scoring-word reveal entry (from `games_state.scoring_words`,
 *  materialized only post-terminal). */
export type RevealWord = { word: string; points: number; is_pangram: boolean }

/**
 * A merged-list row — either a found word (full FoundWordRow) or an
 * unfound reveal entry. `category` is the post-terminal stylable
 * bucket: 'a' = the viewing player found it; 'b' = everything else
 * (others' words + scoring words nobody found).
 */
export type DisplayRow =
  | { kind: 'found'; row: FoundWordRow; category: 'a' | 'b' }
  | { kind: 'unfound'; word: string; isPangram: boolean } // always cat B

/**
 * Build the alphabetized WordList rows from the found words + (post-
 * terminal) the scoring-word reveal. Each word renders **at most once**;
 * two dedup rules:
 *
 *  1. **Found-vs-found.** In compete the post-terminal reveal exposes
 *     the opponent's `found_words` rows too (RLS opens at `is_terminal`).
 *     A word BOTH players found must show once — and MINE wins (cat A,
 *     my color) over the opponent's copy (cat B, grey). The old code
 *     pushed one row per `found_words` row, so a shared word appeared
 *     twice (mine colored + opponent's grey); this dedups by word with
 *     self-preference.
 *  2. **Found-vs-unfound.** A found word shadows its reveal entry — we
 *     never show a word as both found-in-color AND missed-in-grey.
 *
 * Pure + synchronous so it's unit-testable away from the component.
 */
export function buildDisplayRows(
  foundWords: FoundWordRow[],
  revealWords: RevealWord[] | null | undefined,
  selfUserId: string,
): DisplayRow[] {
  // Dedup found rows by word, preferring the caller's own row.
  const foundByWord = new Map<string, FoundWordRow>()
  for (const r of foundWords) {
    const existing = foundByWord.get(r.word)
    if (!existing || r.user_id === selfUserId) foundByWord.set(r.word, r)
  }

  const rows: DisplayRow[] = []
  for (const r of foundByWord.values()) {
    rows.push({
      kind: 'found',
      row: r,
      category: r.user_id === selfUserId ? 'a' : 'b',
    })
  }
  if (revealWords) {
    for (const sw of revealWords) {
      if (foundByWord.has(sw.word)) continue // shadowed by a found row
      rows.push({ kind: 'unfound', word: sw.word, isPangram: sw.is_pangram })
    }
  }

  rows.sort((a, b) => {
    const aw = a.kind === 'found' ? a.row.word : a.word
    const bw = b.kind === 'found' ? b.row.word : b.word
    return aw.localeCompare(bw)
  })
  return rows
}
