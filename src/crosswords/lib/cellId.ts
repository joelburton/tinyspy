// cs-unmet

/** A cell's id, `row,col`: what `GCell.id` holds and a board's `cellsById` is
 *  keyed by, and anywhere else a cell needs a string id. The builder writes the
 *  same id (`crosswords._make_cell_id`). */
export function makeCellId(row: number, col: number): string {
  return `${row},${col}`
}
