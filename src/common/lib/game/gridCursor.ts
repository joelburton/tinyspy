/**
 * The shared keyboard-cursor *movement* math for the two grid games
 * (bananagrams + scrabble). Both run an identical crossword-style cursor: a
 * position `{ x, y }` plus a direction `'h'`/`'v'`. An arrow either rotates the
 * cursor onto its axis (when it's currently pointing the other way) or steps
 * one cell along its current axis; Backspace steps one cell BACK along the axis.
 * Positions are clamped to `[0, max]` (max = the grid's last index).
 *
 * ONLY this movement math is shared. What a keypress *places* differs deeply
 * between the games (bananagrams's derived-multiset hand vs scrabble's rack
 * slots + blanks + a locked-committed tier), as does what Backspace *removes*
 * and how the cursor *advances after a placement* — all of that stays per-game,
 * wrapped around these helpers. Pure (no React) so they're trivially unit-tested.
 *
 * The games' own `Cursor` types are structurally identical to `GridCursor`, so
 * they pass through without conversion.
 */

export type Dir = 'h' | 'v'
export type GridCursor = { x: number; y: number; dir: Dir }
export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

const clampTo = (n: number, max: number) => Math.max(0, Math.min(max, n))

/**
 * Apply an arrow key. A *perpendicular* arrow rotates the cursor onto that axis
 * without moving (so the next press steps); an *along-axis* arrow steps one
 * cell in the arrow's direction, clamped to `[0, max]`.
 */
export function moveCursor(cursor: GridCursor, key: ArrowKey, max: number): GridCursor {
  const axis: Dir = key === 'ArrowLeft' || key === 'ArrowRight' ? 'h' : 'v'
  if (cursor.dir !== axis) return { ...cursor, dir: axis }
  const dx = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
  const dy = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
  return { x: clampTo(cursor.x + dx, max), y: clampTo(cursor.y + dy, max), dir: cursor.dir }
}

/** Step the cursor one cell BACKWARD along its axis (the Backspace move). */
export function stepBack(cursor: GridCursor, max: number): GridCursor {
  return {
    x: clampTo(cursor.x - (cursor.dir === 'h' ? 1 : 0), max),
    y: clampTo(cursor.y - (cursor.dir === 'v' ? 1 : 0), max),
    dir: cursor.dir,
  }
}
