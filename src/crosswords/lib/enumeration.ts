import { cellKey, type CellsMap } from '../hooks/useCells'
import type { CellPos } from './cursor'
import type { Direction } from './types'

/**
 * The clue enumeration — `(7)`, `(4,3)`, `(3-2)` — derived from the cryptic
 * word-break / hyphen marks along a word (mirrors crossplay's
 * `buildEnumeration`). A `break` mark on a cell's trailing edge closes a
 * segment with a comma; a `hyphen` mark closes it with a hyphen; no marks →
 * just the word length. The mark on the LAST cell's trailing edge is ignored.
 *
 * @param word  the word's cells, in reading order (from `cursor.wordCells`).
 * @param dir   `across` reads `markRight`; `down` reads `markBottom`.
 */
export function enumerationFor(word: CellPos[], cells: CellsMap, dir: Direction): string {
  const segments: number[] = []
  const separators: string[] = [] // separator preceding segment i (for i ≥ 1)
  let len = 0
  word.forEach((p, i) => {
    len += 1
    if (i < word.length - 1) {
      // Given cells aren't in the cells map (no marks — option A), so their
      // mark reads as undefined, exactly as intended.
      const st = cells.get(cellKey(p.row, p.col))
      const mark = dir === 'across' ? st?.markRight : st?.markBottom
      if (mark === 'break' || mark === 'hyphen') {
        segments.push(len)
        separators.push(mark === 'break' ? ',' : '-')
        len = 0
      }
    }
  })
  segments.push(len)

  let out = String(segments[0])
  for (let i = 1; i < segments.length; i++) out += separators[i - 1] + segments[i]
  return `(${out})`
}
