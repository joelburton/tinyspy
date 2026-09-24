// cs-audited-board-cursor

/**
 * The shared keyboard-cursor *movement* math for the two grid games
 * (bananagrams + scrabble). Both run an identical crossword-style cursor: a
 * position `{ x, y }` plus a direction `'h'`/`'v'`. An arrow either rotates the
 * cursor onto its axis (when it's currently pointing the other way) or steps
 * one cell along its current axis; Backspace empties the cell under the cursor,
 * or steps one cell BACK along the axis and empties that one.
 * Positions are clamped to `[0, max]` (max = the grid's last index).
 *
 * ONLY this cursor math is shared. What a keypress *places* differs deeply
 * between the games (bananagrams's derived-multiset hand vs scrabble's rack
 * slots + blanks + a locked-committed tier), as does how Backspace *removes* a
 * tile and how the cursor *advances after a placement* — all of that stays
 * per-game, wrapped around these helpers. Pure (no React) so they're trivially
 * unit-tested.
 *
 * **Crosswords is a third grid game and deliberately does not use this.** Its
 * cursor is GRID-AWARE — it skips blocked cells and can jump to a word's edge —
 * so movement there is a function of the puzzle, not just of a bound, which is
 * the difference between a crossword and a rack game. It keeps its own
 * `moveCursor` in `crosswords/lib/cursor.ts`, and parameterizing this one over
 * "does the grid have holes" would make a framework out of eleven lines of
 * arithmetic. Its cursor also speaks a different vocabulary — `{ row, col }`
 * with `'across'`/`'down'`, against `{ x, y }` with `'h'`/`'v'` here — which is
 * a real cross-game naming split (docs/naming.md wants one name per concept)
 * and a bigger question than this module.
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

/** Step the cursor one cell BACKWARD along its axis. */
export function stepBack(cursor: GridCursor, max: number): GridCursor {
  return {
    x: clampTo(cursor.x - (cursor.dir === 'h' ? 1 : 0), max),
    y: clampTo(cursor.y - (cursor.dir === 'v' ? 1 : 0), max),
    dir: cursor.dir,
  }
}

/** What a cell holds, as Backspace sees it: a tile it may remove, a tile it may
 *  not (scrabble's committed tiles), or nothing. */
export type BackspaceCell = 'removable' | 'locked' | 'empty'

/**
 * Where a Backspace lands, crosswords' two-step rule. A removable tile under the
 * cursor is the one to remove, and the cursor stays; otherwise the cursor steps
 * back, passing over locked tiles as typing passes over them going forward, and
 * the tile it lands on is the one, if it is removable. So one press right after
 * typing removes the letter just typed.
 *
 * `remove` is null when the press removes nothing; the caller does the removing.
 */
export function planBackspace(
  cursor: GridCursor,
  max: number,
  cellAt: (x: number, y: number) => BackspaceCell,
): { remove: { x: number; y: number } | null; cursor: GridCursor } {
  if (cellAt(cursor.x, cursor.y) === 'removable') return { remove: { x: cursor.x, y: cursor.y }, cursor }
  let back = stepBack(cursor, max)
  while (cellAt(back.x, back.y) === 'locked') {
    const next = stepBack(back, max)
    if (next.x === back.x && next.y === back.y) break // the grid's edge
    back = next
  }
  return { remove: cellAt(back.x, back.y) === 'removable' ? { x: back.x, y: back.y } : null, cursor: back }
}
