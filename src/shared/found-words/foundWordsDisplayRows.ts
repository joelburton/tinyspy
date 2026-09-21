// cs-blessed-found-words

import type { WordListRow } from '@/common/word-list/WordList'
import type { FoundWordRow, FoundWordsWord } from './foundWords'
import type { RevealWord } from './revealWords'

/**
 * The rows behind the info column's found-words list, for any game in the family.
 */

/**
 * One alphabetized row per word — the found ones, plus (once the game is over)
 * the ones nobody found.
 *
 * **Each word appears at most once**, which takes two different dedup rules:
 *
 *  1. **Found vs found.** In compete, terminal opens RLS on every player's
 *     `found_words`, so a word several people found arrives several times. It
 *     shows once, attributed to the **first finder** (earliest `found_at`) —
 *     that is whose color it renders in — but every finder is kept in
 *     `finderIds`, so filtering the list to a later finder still matches the
 *     word they genuinely found. In coop both are no-ops: `submit_word` rejects
 *     a word anyone already has, so there is only ever one finder.
 *  2. **Found vs unfound.** A found word shadows its reveal entry, so no word
 *     is ever shown as both found-in-color and missed-in-gray.
 *
 * `revealWords` is the caller's whole missed set — **required and bonus both** —
 * each entry already flagged with which list it came from. This does not care
 * which; it carries `is_bonus` through so the list can filter on it. Pass
 * `null` or `undefined` mid-game, when nothing is revealed yet.
 *
 * Pure and synchronous, so it tests away from the component.
 */
export function buildDisplayRows(
  foundWords: readonly FoundWordRow[],
  revealWords: readonly RevealWord<FoundWordsWord>[] | null | undefined,
): WordListRow[] {
  // One entry per word: the row that wins the attribution, and every finder in
  // first-found order (the WHO filter's input). Walked earliest-first, so the
  // first row of a word opens its entry and later ones only add finders.
  // `found_at` is an ISO timestamp, so a lexicographic compare is chronological.
  const byWord = new Map<string, { first: FoundWordRow; finderIds: string[] }>()
  for (const r of [...foundWords].sort((a, b) => a.found_at.localeCompare(b.found_at))) {
    const seen = byWord.get(r.word)
    if (!seen) byWord.set(r.word, { first: r, finderIds: [r.user_id] })
    else if (!seen.finderIds.includes(r.user_id)) seen.finderIds.push(r.user_id)
  }

  const rows: WordListRow[] = []
  for (const { first, finderIds } of byWord.values()) {
    rows.push({
      kind: 'found',
      word: first.word,
      userId: first.user_id,
      finderIds,
      isBonus: first.is_bonus,
      isPangram: first.is_pangram,
      points: first.points,
    })
  }
  if (revealWords) {
    for (const sw of revealWords) {
      if (byWord.has(sw.word)) continue // shadowed by a found row
      rows.push({ kind: 'unfound', word: sw.word, isBonus: sw.is_bonus, isPangram: sw.is_pangram, points: sw.points })
    }
  }

  rows.sort((a, b) => a.word.localeCompare(b.word))
  return rows
}
