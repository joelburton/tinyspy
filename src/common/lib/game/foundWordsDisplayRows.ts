// cs-audited-game-lib

import type { WordListRow } from '../../components/game/lists/WordList'

/**
 * The rows behind the info column's found-words list, for any word-hunt game.
 *
 * Its two parameter types are STRUCTURAL rather than a game's named types, so
 * a game whose words have no pangram flag passes its own rows unchanged.
 */

/** What this needs off a found row. `is_pangram` is optional because only some
 *  word-hunt games have the concept; `WordListRow` carries it optionally too. */
type DisplayableFound = {
  word: string
  user_id: string
  points: number
  is_bonus: boolean
  found_at: string
  is_pangram?: boolean
}

/** What this needs off a reveal entry. Same story, minus the finder. */
type DisplayableReveal = {
  word: string
  points: number
  is_bonus: boolean
  is_pangram?: boolean
}

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
  foundWords: DisplayableFound[],
  revealWords: readonly DisplayableReveal[] | null | undefined,
): WordListRow[] {
  // Dedup found rows by word, keeping the earliest finder. `found_at` is an ISO
  // timestamp, so a lexicographic compare is chronological.
  const foundByWord = new Map<string, DisplayableFound>()
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
      points: r.points,
    })
  }
  if (revealWords) {
    for (const sw of revealWords) {
      if (foundByWord.has(sw.word)) continue // shadowed by a found row
      rows.push({ kind: 'unfound', word: sw.word, isBonus: sw.is_bonus, isPangram: sw.is_pangram, points: sw.points })
    }
  }

  rows.sort((a, b) => a.word.localeCompare(b.word))
  return rows
}

