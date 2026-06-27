import type { FoundWordRow } from '../hooks/useGame'

/** One row in the WordList: a found word (with its finder) or, post-terminal, a
 *  required word nobody found. */
export type DisplayRow =
  | { kind: 'found'; row: FoundWordRow }
  | { kind: 'unfound'; word: string }

/**
 * Merge found words with the post-terminal reveal into one alphabetical list.
 * Found words dedup by earliest `found_at` (first finder wins — matters in
 * compete post-terminal where several players found the same word). Reveal
 * entries (required − found) are appended; a found word shadows its reveal entry.
 * Pure + unit-tested.
 */
export function buildDisplayRows(
  foundWords: FoundWordRow[],
  revealWords: ReadonlyArray<{ word: string }> | null | undefined,
): DisplayRow[] {
  const foundByWord = new Map<string, FoundWordRow>()
  for (const r of foundWords) {
    const existing = foundByWord.get(r.word)
    if (!existing || r.found_at < existing.found_at) foundByWord.set(r.word, r)
  }

  const rows: DisplayRow[] = []
  for (const r of foundByWord.values()) rows.push({ kind: 'found', row: r })
  if (revealWords) {
    for (const rw of revealWords) {
      if (foundByWord.has(rw.word)) continue // found word shadows the reveal entry
      rows.push({ kind: 'unfound', word: rw.word })
    }
  }

  rows.sort((a, b) => {
    const aw = a.kind === 'found' ? a.row.word : a.word
    const bw = b.kind === 'found' ? b.row.word : b.word
    return aw.localeCompare(bw)
  })
  return rows
}
