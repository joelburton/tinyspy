// cs-unmet

/** A cell's id, `row,col`: what `GCell.id` holds and a board's `cellsById` is
 *  keyed by, and anywhere else a cell needs a string id. The builder writes the
 *  same key (`crosswords._cell_key`). */
export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}
