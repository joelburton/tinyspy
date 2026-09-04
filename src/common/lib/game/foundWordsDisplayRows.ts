// cs-audited-game-lib

import type { WordListRow } from '../../components/game/lists/WordList'

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
 *     word as both found-in-color AND missed-in-gray.
 *
 * `revealWords` is the caller's whole missed set — **required AND bonus** — each
 * entry flagged with which list it came from. The builder doesn't care which; it
 * just carries `is_bonus` through so the list can filter on it.
 *
 * Pure + synchronous so it's unit-testable away from the component.
 *
 * **The parameters are STRUCTURAL, not the named types**, so a word-hunt game
 * without pangrams can pass its own rows. `FoundWordRow` and `FoundWordsWord`
 * still satisfy them — a required field is assignable to an optional one — so
 * spellingbee and wordwheel are unaffected, and `WordListRow.isPangram` is
 * already optional, so the body needs no branch.
 *
 * That was widened for boggle, which keeps a byte-for-byte copy of this
 * function in `boggle/lib/displayRows.ts` differing only by that one field.
 * **A note here used to say boggle "deliberately keeps a different rule
 * (per-player duplicates in compete)" and must NOT use this one — that was
 * false**: boggle dedups by word to the earliest finder exactly as this does,
 * and its own tests say so. Adopting it is boggle's to do
 * (plans/areas/boggle.md); this side is ready.
 */

/** What this needs off a found row — `FoundWordRow` and boggle's both fit. */
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

