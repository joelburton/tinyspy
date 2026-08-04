import type { WordListRow } from '../../common/components/game/lists/WordList'
import type { FoundWordRow } from '../hooks/useGame'

/**
 * Merge found words with the post-terminal reveal into one alphabetical list of
 * shared `WordListRow`s. Found words dedup by earliest `found_at` (first finder
 * wins — matters in compete post-terminal where several players found the same
 * word), keeping every finder in `finderIds` so the list's WHO filter still
 * matches the later ones. Reveal entries (the missed words, **required and
 * bonus**, each tagged) are appended; a found word shadows its reveal entry.
 * Pure + unit-tested.
 */
export function buildDisplayRows(
  foundWords: FoundWordRow[],
  revealWords: ReadonlyArray<{ word: string; is_bonus: boolean }> | null | undefined,
): WordListRow[] {
  const foundByWord = new Map<string, FoundWordRow>()
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
    })
  }
  if (revealWords) {
    for (const rw of revealWords) {
      if (foundByWord.has(rw.word)) continue // found word shadows the reveal entry
      rows.push({ kind: 'unfound', word: rw.word, isBonus: rw.is_bonus })
    }
  }

  rows.sort((a, b) => a.word.localeCompare(b.word))
  return rows
}
