// cs-unmet

/** The key a cell is stored under in a `CellsMap`, and anywhere else a cell
 *  needs a string id: `row:col`. */
export function cellKey(row: number, col: number): string {
  return `${row}:${col}`
}
