// cs-unmet

import type { GBoard, GTile } from '../types'

const A = 'a'.charCodeAt(0)

/** The board as rows of what each tile shows: `A`, `Qu`, and `?` for a blank. */
export function makeDisplayGrid(tiles: readonly GTile[], side: number): string[][] {
  const shown = tiles.map((t) => (t.letters === null ? '?' : t.letters[0]!.toUpperCase() + t.letters.slice(1)))
  const rows: string[][] = []
  for (let y = 0; y < side; y++) rows.push(shown.slice(y * side, (y + 1) * side))
  return rows
}

/** The board as the tracer walks it (`lib/boardTrace.ts`): each tile's first
 *  and second letter as 0–25, -1 where there is none. A blank has neither. */
export function makeTraceBoard(tiles: readonly GTile[], side: number): GBoard {
  const first = new Int8Array(tiles.length)
  const second = new Int8Array(tiles.length)
  tiles.forEach((t, i) => {
    first[i] = t.letters === null ? -1 : t.letters.charCodeAt(0) - A
    second[i] = t.letters === null || t.letters.length < 2 ? -1 : t.letters.charCodeAt(1) - A
  })
  return { n: side, first, second }
}
