// cs-unmet

/**
 * WHAT EACH CELL OF THE GRID SHOWS — the puzzle's facts, the board's fill and
 * flags, the solution's letter while it is shown, and the marks the page puts
 * on it. The classes are the CSS module's (proxies under Vitest, so these
 * prove the wiring, not the stylesheet).
 */

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ZTest_PUZZLE, ZTest_SOLUTION, ZTest_makeGameDataRaw, type ZTest_CellFacts } from '../lib/gameData.fixture'
import { makeGameData } from '../hooks/useGame'
import type { GGridEntry } from '../reactTypes'
import type { GSolution } from '../types'
import { Grid } from './Grid'

/** Typing on the grid, the cursor at (0,0) with nothing open. */
const ENTRY: GGridEntry = {
  cursor: { row: 0, col: 0, dir: 'across' },
  setCursor: vi.fn(),
  clickCell: vi.fn(),
  pencil: false,
  togglePencil: vi.fn(),
  rebus: null,
  submitRebus: vi.fn(),
  cancelRebus: vi.fn(),
  actRebus: {} as GGridEntry['actRebus'],
  peek: null,
  numberJump: { isOpen: false, jumpTo: vi.fn(), close: vi.fn() },
}

/** The grid over a board with these cells. */
function drawGrid({
  cells = [],
  solution = null,
  collapseRebus = false,
  wordCellIds = new Set<string>(),
  fillFlashColors = new Map<string, string>(),
}: {
  cells?: ZTest_CellFacts[]
  solution?: GSolution | null
  collapseRebus?: boolean
  wordCellIds?: Set<string>
  fillFlashColors?: Map<string, string>
} = {}) {
  const board = makeGameData(ZTest_makeGameDataRaw({ cells }), 'u1').me.board
  render(
    <Grid
      puzzle={ZTest_PUZZLE}
      board={board}
      entry={ENTRY}
      marks={{ wordCellIds, peerCursorColors: new Map(), fillFlashColors, endingOutcome: null }}
      solution={solution}
      collapseRebus={collapseRebus}
    />,
  )
}

/** One cell's element, by its place. */
const cellAt = (row: number, col: number) =>
  document.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)!
/** The letters a cell draws. */
const letterAt = (row: number, col: number) => cellAt(row, col).querySelector('span[class*="fill"]')

describe('crosswords Grid', () => {
  it('a given shows the author\'s letter, underlined', () => {
    drawGrid()
    expect(letterAt(1, 2)?.textContent).toBe('E')
    expect(letterAt(1, 2)?.className).toMatch(/given/)
  })

  it('a block draws no cell to type in', () => {
    drawGrid()
    expect(document.querySelector('[data-row="0"][data-col="2"]')).toBeNull()
  })

  it('a letter in pencil says so', () => {
    drawGrid({ cells: [{ row: 0, col: 0, fill: 'C', pencil: true }] })
    expect(cellAt(0, 0)).toHaveAttribute('data-pencil')
    expect(letterAt(0, 0)?.className).toMatch(/pencil/)
  })

  it('a collapsed rebus draws its first letter, and keeps the whole fill in data-fill', () => {
    drawGrid({ cells: [{ row: 0, col: 0, fill: 'HEART' }], collapseRebus: true })
    expect(letterAt(0, 0)?.textContent).toBe('H')
    expect(cellAt(0, 0)).toHaveAttribute('data-fill', 'HEART')
  })

  it('an expanded rebus draws every letter', () => {
    drawGrid({ cells: [{ row: 0, col: 0, fill: 'HEART' }] })
    expect(letterAt(0, 0)?.textContent).toBe('HEART')
  })

  it('the solution draws the author\'s letters, gray where they differ, and drops the wrong corner', () => {
    drawGrid({ cells: [{ row: 0, col: 0, fill: 'X', wrong: true }, { row: 0, col: 1, fill: 'A' }], solution: ZTest_SOLUTION })
    expect(letterAt(0, 0)?.textContent).toBe('C')
    expect(letterAt(0, 0)?.className).toMatch(/solutionLetter/)
    expect(cellAt(0, 0)).not.toHaveAttribute('data-wrong')
    // A letter they had right looks like theirs.
    expect(letterAt(0, 1)?.className).not.toMatch(/solutionLetter/)
  })

  it('a wrong letter wears its corner while the solution is hidden', () => {
    drawGrid({ cells: [{ row: 0, col: 0, fill: 'X', wrong: true }] })
    expect(cellAt(0, 0)).toHaveAttribute('data-wrong')
  })

  it('a teammate\'s fresh fill is drawn in their color', () => {
    drawGrid({ cells: [{ row: 0, col: 0, fill: 'C' }], fillFlashColors: new Map([['0,0', 'blue']]) })
    expect(letterAt(0, 0)).toHaveStyle({ color: 'rgb(0, 0, 255)' })
  })

  it('the cursor\'s cell and the active word are tinted', () => {
    drawGrid({ wordCellIds: new Set(['0,0', '0,1']) })
    expect(cellAt(0, 0)).toHaveAttribute('data-cursor')
    expect(cellAt(0, 1).className).toMatch(/inWord/)
    expect(cellAt(1, 0).className).not.toMatch(/inWord/)
  })
})
