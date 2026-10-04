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

/** King-move adjacency (8-way), the Boggle path rule, between two tiles of a
 *  board this many tiles on a side. A tile's id is its index, row by row. */
export function isAdjacent(a: string, b: string, side: number): boolean {
  const [ai, bi] = [Number(a), Number(b)]
  const dy = Math.abs(((ai / side) | 0) - ((bi / side) | 0))
  const dx = Math.abs((ai % side) - (bi % side))
  return dy <= 1 && dx <= 1 && ai !== bi
}

/** The tiles' indices in the order they are drawn, row by row, once the board
 *  has been turned a quarter clockwise this many times. One turn draws the
 *  bottom-left tile at the top-left; each letter stays upright. */
export function makeDrawOrder(side: number, quarterTurns: number): number[] {
  let order = Array.from({ length: side * side }, (_, i) => i)
  for (let t = 0; t < quarterTurns; t++) {
    order = order.map((_, k) => order[(side - 1 - (k % side)) * side + ((k / side) | 0)]!)
  }
  return order
}
