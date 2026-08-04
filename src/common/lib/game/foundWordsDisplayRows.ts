import type { WordListRow } from '../../components/game/lists/WordList'
import type { FoundWordRow, FoundWordsWord } from './foundWords'
import type { RevealWord } from './revealWords'

/**
 * Build the alphabetized shared `WordListRow`s from the found words + (post-
 * terminal) the missed-word reveal. Shared by spellingbee + wordwheel (their
 * `lib/displayRows.ts` copies were byte-identical). Each word renders **at most
 * once**; two dedup rules:
 *
 *  1. **Found-vs-found.** In compete the post-terminal reveal exposes every
 *     player's `found_words` rows (RLS opens at `is_terminal`), so a word more
 *     than one player found arrives more than once. It shows once, attributed to
 *     the **first finder** (earliest `found_at`) — that's whose color it renders
 *     in — but every finder is kept in `finderIds` so the list's WHO filter can
 *     still match the others. In coop each word has a single finder (`submit_word`
 *     rejects a word anyone already found), so both are no-ops there.
 *  2. **Found-vs-unfound.** A found word shadows its reveal entry — we never show a
 *     word as both found-in-color AND missed-in-grey.
 *
 * `revealWords` is the caller's whole missed set — **required AND bonus** — each
 * entry flagged with which list it came from. The builder doesn't care which; it
 * just carries `is_bonus` through so the list can filter on it.
 *
 * Pure + synchronous so it's unit-testable away from the component.
 *
 * NOTE: this is the SET-semantics dedup (one row per distinct word). boggle
 * deliberately keeps a different rule (per-player duplicates in compete) — it
 * has its own displayRows and must NOT use this one.
 */
export function buildDisplayRows(
  foundWords: FoundWordRow[],
  revealWords: RevealWord<FoundWordsWord>[] | null | undefined,
): WordListRow[] {
  // Dedup found rows by word, keeping the earliest finder. `found_at` is an ISO
  // timestamp, so a lexicographic compare is chronological.
  const foundByWord = new Map<string, FoundWordRow>()
  // Every finder per word, in first-found order — the WHO filter's input.
  const findersByWord = new Map<string, string[]>()
  for (const r of [...foundWords].sort((a, b) => a.found_at.localeCompare(b.found_at))) {
    if (!foundByWord.has(r.word)) foundByWord.set(r.word, r)
    const finders = findersByWord.get(r.word)
    if (!finders) findersByWord.set(r.word, [r.user_id])
    else if (!finders.includes(r.user_id)) finders.push(r.user_id)
  }

  const rows: WordListRow[] = []
  for (const r of foundByWord.values()) {
    rows.push({
      kind: 'found',
      word: r.word,
      userId: r.user_id,
      finderIds: findersByWord.get(r.word) ?? [r.user_id],
      isBonus: r.is_bonus,
      isPangram: r.is_pangram,
    })
  }
  if (revealWords) {
    for (const sw of revealWords) {
      if (foundByWord.has(sw.word)) continue // shadowed by a found row
      rows.push({ kind: 'unfound', word: sw.word, isBonus: sw.is_bonus, isPangram: sw.is_pangram })
    }
  }

  rows.sort((a, b) => a.word.localeCompare(b.word))
  return rows
}

