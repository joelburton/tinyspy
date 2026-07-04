import type { WordListRow } from '../../common/components/game/lists/WordList'
import type { FoundWordRow } from '../hooks/useGame'

/**
 * Merge found words with the post-terminal reveal into one alphabetical list of
 * shared `WordListRow`s. Found words dedup by earliest `found_at` (first finder
 * wins — matters in compete post-terminal where several players found the same
 * word). Reveal entries (required − found) are appended; a found word shadows its
 * reveal entry. Pure + unit-tested.
 */
export function buildDisplayRows(
  foundWords: FoundWordRow[],
  revealWords: ReadonlyArray<{ word: string }> | null | undefined,
): WordListRow[] {
  const foundByWord = new Map<string, FoundWordRow>()
  for (const r of foundWords) {
    const existing = foundByWord.get(r.word)
    if (!existing || r.found_at < existing.found_at) foundByWord.set(r.word, r)
  }

  const rows: WordListRow[] = []
  for (const r of foundByWord.values()) {
    rows.push({ kind: 'found', word: r.word, userId: r.user_id, isBonus: r.is_bonus })
  }
  if (revealWords) {
    for (const rw of revealWords) {
      if (foundByWord.has(rw.word)) continue // found word shadows the reveal entry
      rows.push({ kind: 'unfound', word: rw.word })
    }
  }

  rows.sort((a, b) => a.word.localeCompare(b.word))
  return rows
}
