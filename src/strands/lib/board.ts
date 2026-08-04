/**
 * strands board geometry — the pure, dependency-free core every other layer
 * builds on: the FE tracer, the puzzle importer (`supabase/scripts/lib/
 * strandsPuzzle.ts` imports `adjacent` + the dimensions from here), and the
 * tests.
 *
 * It lives in `src/` rather than beside the importer because `src/<game>/lib/`
 * is this repo's home for pure game logic shared across build targets — the
 * same way boggle's solver is imported by both its edge function and its
 * scripts. Two copies of an adjacency rule is exactly the drift this avoids.
 *
 * **Coordinates are `[row, col]`, 0-based**, matching the NYT feed. Every
 * coordinate in this gametype — stored solutions, traced paths, hint reveals —
 * uses that order, so there is one convention and no adapters.
 */

/** A board cell, `[row, col]`, 0-based. */
export type Coord = [row: number, col: number]

/** The board: 8 strings of 6 letters, one per row, as the feed ships them. */
export type Board = readonly string[]

export const ROWS = 8
export const COLS = 6
export const CELLS = ROWS * COLS

/**
 * Two cells are adjacent iff they touch on any of the 8 sides **or corners** —
 * diagonals included, and a cell is never adjacent to itself.
 *
 * This was verified against the real archive rather than assumed from the
 * rules: every sampled puzzle uses diagonal steps (3–15 of ~40), so a 4-way
 * rule would reject most genuine answers rather than a few exotic ones. The
 * oracle test replays NYT's own word lists through it.
 */
export function adjacent([r1, c1]: Coord, [r2, c2]: Coord): boolean {
  const dr = Math.abs(r1 - r2)
  const dc = Math.abs(c1 - c2)
  return (dr | dc) !== 0 && dr <= 1 && dc <= 1
}

/** Is this coordinate on the board? */
export function inBounds([r, c]: Coord): boolean {
  return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < ROWS && c >= 0 && c < COLS
}

/** The letter at a cell. Callers hold in-bounds coords (the tracer only ever
 *  produces them); an out-of-bounds read is a bug, not a case to handle. */
export function letterAt(board: Board, [r, c]: Coord): string {
  return board[r][c]
}

/**
 * A stable string key for a cell, for Set/Map membership. `${r},${c}` rather
 * than `r * COLS + c` so a key is readable in a debugger and in test failure
 * output — the board is 48 cells, so the packing saves nothing that matters.
 */
export function coordKey([r, c]: Coord): string {
  return `${r},${c}`
}

/** The word a path spells. */
export function wordFromPath(board: Board, path: readonly Coord[]): string {
  return path.map((c) => letterAt(board, c)).join('')
}

/** Do two paths visit the same cells in the same order? */
export function samePath(a: readonly Coord[], b: readonly Coord[]): boolean {
  return a.length === b.length && a.every(([r, c], i) => r === b[i][0] && c === b[i][1])
}

/**
 * Is this a structurally legal trace? In bounds, contiguous under 8-way
 * adjacency, and never revisiting a cell.
 *
 * Says nothing about whether the word is *accepted* — that is the server's
 * call, and it needs the hidden solution plus a dictionary. This is only the
 * shape a path must have before it is worth asking.
 *
 * A single cell is structurally valid (it is trivially contiguous); length
 * rules belong to acceptance, not to shape.
 */
export function isValidPath(path: readonly Coord[]): boolean {
  if (path.length === 0) return false
  const seen = new Set<string>()
  for (const [i, cell] of path.entries()) {
    if (!inBounds(cell)) return false
    const key = coordKey(cell)
    if (seen.has(key)) return false
    seen.add(key)
    if (i > 0 && !adjacent(path[i - 1], cell)) return false
  }
  return true
}

/**
 * The cells locked by already-found theme words.
 *
 * Found theme words consume their tiles permanently — which is only coherent
 * because the hidden words **tile the board exactly** (verified across the
 * archive: 48 cells, each covered once). So "every cell consumed" is the same
 * statement as "every theme word found", and the shrinking pool of free cells
 * is what makes hint words scarcer as a game progresses.
 */
export function consumedCells(found: ReadonlyArray<{ path: readonly Coord[] }>): Set<string> {
  const out = new Set<string>()
  for (const f of found) for (const cell of f.path) out.add(coordKey(cell))
  return out
}
