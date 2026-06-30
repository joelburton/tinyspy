import type { WordListRow } from '../../common/components/WordList'
import type { FoundWordRow } from '../hooks/useGame'

/** A required-word reveal entry (from `games_state.required_words`,
 *  materialized only post-terminal). */
export type RevealWord = { word: string; points: number; is_pangram: boolean }

/**
 * Build the alphabetized shared `WordListRow`s from the found words + (post-
 * terminal) the required-word reveal. Each word renders **at most once**; two
 * dedup rules:
 *
 *  1. **Found-vs-found.** In compete the post-terminal reveal exposes every
 *     player's `found_words` rows (RLS opens at `is_terminal`), so a word more
 *     than one player found arrives more than once. It shows once, attributed to
 *     the **first finder** (earliest `found_at`) — that's whose color it renders
 *     in. In coop each word has a single finder, so this is a no-op there.
 *  2. **Found-vs-unfound.** A found word shadows its reveal entry — we never show a
 *     word as both found-in-color AND missed-in-grey.
 *
 * Pure + synchronous so it's unit-testable away from the component.
 */
export function buildDisplayRows(
  foundWords: FoundWordRow[],
  revealWords: RevealWord[] | null | undefined,
): WordListRow[] {
  // Dedup found rows by word, keeping the earliest finder. `found_at` is an ISO
  // timestamp, so a lexicographic compare is chronological.
  const foundByWord = new Map<string, FoundWordRow>()
  for (const r of foundWords) {
    const existing = foundByWord.get(r.word)
    if (!existing || r.found_at < existing.found_at) foundByWord.set(r.word, r)
  }

  const rows: WordListRow[] = []
  for (const r of foundByWord.values()) {
    rows.push({ kind: 'found', word: r.word, userId: r.user_id, isBonus: r.is_bonus, isPangram: r.is_pangram })
  }
  if (revealWords) {
    for (const sw of revealWords) {
      if (foundByWord.has(sw.word)) continue // shadowed by a found row
      rows.push({ kind: 'unfound', word: sw.word, isPangram: sw.is_pangram })
    }
  }

  rows.sort((a, b) => a.word.localeCompare(b.word))
  return rows
}
