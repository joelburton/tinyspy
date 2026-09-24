// cs-audited-board-cursor

import { describe, expect, it } from 'vitest'
import { moveCursor, planBackspace, stepBack, type BackspaceCell, type GridCursor } from './gridCursor'

/**
 * The crossword-style cursor rule that bananagrams and scrabble both run: an
 * arrow either ROTATES the cursor onto its axis or STEPS along it, never both.
 * That is the one thing a player feels — press ↓ on a horizontal cursor and the
 * cell must not move — and the one thing an "improvement" would break.
 *
 * The rest is bounds. Positions clamp to `[0, max]` at both ends, and `max` is
 * the caller's, which is why one case runs the two real grids side by side:
 * 14 for scrabble's 15×15, 24 for bananagrams's 25×25.
 *
 * Backspace's rule is here as WHICH cell it empties; nothing here touches how a
 * keypress places or removes a tile, or where the cursor goes after a placement
 * — those differ deeply between the two games and stay per-game by design (see
 * the module docstring), so they are tested there.
 */

const C = (x: number, y: number, dir: 'h' | 'v'): GridCursor => ({ x, y, dir })

describe('moveCursor', () => {
  it('rotates onto a perpendicular axis without moving', () => {
    expect(moveCursor(C(5, 5, 'h'), 'ArrowDown', 14)).toEqual(C(5, 5, 'v'))
    expect(moveCursor(C(5, 5, 'h'), 'ArrowUp', 14)).toEqual(C(5, 5, 'v'))
    expect(moveCursor(C(5, 5, 'v'), 'ArrowRight', 14)).toEqual(C(5, 5, 'h'))
    expect(moveCursor(C(5, 5, 'v'), 'ArrowLeft', 14)).toEqual(C(5, 5, 'h'))
  })

  it('steps one cell along the current axis', () => {
    expect(moveCursor(C(5, 5, 'h'), 'ArrowRight', 14)).toEqual(C(6, 5, 'h'))
    expect(moveCursor(C(5, 5, 'h'), 'ArrowLeft', 14)).toEqual(C(4, 5, 'h'))
    expect(moveCursor(C(5, 5, 'v'), 'ArrowDown', 14)).toEqual(C(5, 6, 'v'))
    expect(moveCursor(C(5, 5, 'v'), 'ArrowUp', 14)).toEqual(C(5, 4, 'v'))
  })

  it('clamps to [0, max] at both ends', () => {
    expect(moveCursor(C(0, 5, 'h'), 'ArrowLeft', 14)).toEqual(C(0, 5, 'h'))
    expect(moveCursor(C(14, 5, 'h'), 'ArrowRight', 14)).toEqual(C(14, 5, 'h'))
    expect(moveCursor(C(5, 0, 'v'), 'ArrowUp', 24)).toEqual(C(5, 0, 'v'))
    expect(moveCursor(C(5, 24, 'v'), 'ArrowDown', 24)).toEqual(C(5, 24, 'v'))
  })

  it('respects the per-game max (14 for scrabble, 24 for bananagrams)', () => {
    expect(moveCursor(C(14, 5, 'h'), 'ArrowRight', 14)).toEqual(C(14, 5, 'h'))
    expect(moveCursor(C(14, 5, 'h'), 'ArrowRight', 24)).toEqual(C(15, 5, 'h'))
  })
})

describe('stepBack', () => {
  it('steps one cell back along the cursor axis', () => {
    expect(stepBack(C(5, 5, 'h'), 14)).toEqual(C(4, 5, 'h'))
    expect(stepBack(C(5, 5, 'v'), 14)).toEqual(C(5, 4, 'v'))
  })

  it('leaves the cross-axis coordinate untouched', () => {
    expect(stepBack(C(7, 3, 'h'), 14)).toEqual(C(6, 3, 'h')) // y stays
    expect(stepBack(C(3, 7, 'v'), 14)).toEqual(C(3, 6, 'v')) // x stays
  })

  it('clamps at 0', () => {
    expect(stepBack(C(0, 5, 'h'), 14)).toEqual(C(0, 5, 'h'))
    expect(stepBack(C(5, 0, 'v'), 14)).toEqual(C(5, 0, 'v'))
  })
})

describe('planBackspace', () => {
  // A row of cells from x = 0, one character each: R removable, L locked, . empty.
  const row =
    (cells: string) =>
    (x: number): BackspaceCell =>
      cells[x] === 'R' ? 'removable' : cells[x] === 'L' ? 'locked' : 'empty'
  const plan = (x: number, cells: string) => planBackspace(C(x, 5, 'h'), 14, row(cells))

  it('removes the tile under the cursor and leaves the cursor there', () => {
    expect(plan(5, '....RR')).toEqual({ remove: { x: 5, y: 5 }, cursor: C(5, 5, 'h') })
  })

  it('on an empty cell, steps back and removes the tile there — one press after typing', () => {
    expect(plan(5, '....R.')).toEqual({ remove: { x: 4, y: 5 }, cursor: C(4, 5, 'h') })
    expect(planBackspace(C(5, 5, 'v'), 14, (_, y) => (y === 4 ? 'removable' : 'empty'))).toEqual({
      remove: { x: 5, y: 4 },
      cursor: C(5, 4, 'v'),
    })
  })

  it('passes over locked tiles to the removable one behind them', () => {
    expect(plan(5, '..RLL.')).toEqual({ remove: { x: 2, y: 5 }, cursor: C(2, 5, 'h') })
    expect(plan(4, '..RLL.')).toEqual({ remove: { x: 2, y: 5 }, cursor: C(2, 5, 'h') }) // starting ON a locked tile
  })

  it('steps back and removes nothing when it lands on an empty cell', () => {
    expect(plan(5, '......')).toEqual({ remove: null, cursor: C(4, 5, 'h') })
    expect(plan(5, '..LL..')).toEqual({ remove: null, cursor: C(4, 5, 'h') })
    expect(plan(5, '.LLL.')).toEqual({ remove: null, cursor: C(4, 5, 'h') })
    expect(plan(4, '.LLL.')).toEqual({ remove: null, cursor: C(0, 5, 'h') }) // over the locks to the gap
  })

  it('stops at the grid edge', () => {
    expect(plan(0, '......')).toEqual({ remove: null, cursor: C(0, 5, 'h') })
    expect(plan(3, 'LLL...')).toEqual({ remove: null, cursor: C(0, 5, 'h') })
  })
})
