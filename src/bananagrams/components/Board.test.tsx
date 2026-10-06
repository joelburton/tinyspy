// cs-unmet

/**
 * Render tests for the board and its pieces: what a cell shows for the board
 * being edited, the cursor's ring, the drop answer under a drag, and the marks
 * a tile wears. The editing board is hand-built: this is about drawing, not
 * about moves.
 */
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ZTest_actionFixture } from '@/common/actions/action.fixture'
import { GRID, emptyBoard, idx, setChar } from '../lib/board'
import type { GEditingBoard } from '../reactTypes'
import { Board } from './Board'

const C = Math.floor(GRID / 2)

function makeEditing(over: Partial<GEditingBoard> = {}): GEditingBoard {
  return {
    scrollRef: { current: null },
    board: emptyBoard(),
    cell: 40,
    minCell: 24,
    cursor: { x: C, y: C, dir: 'h' },
    hover: null,
    drag: null,
    invalidCells: new Set(),
    onZoom: vi.fn(),
    onCellPointerDown: vi.fn(),
    displayedHand: '',
    derivedHand: '',
    dumpHot: false,
    canDump: true,
    errFlash: false,
    errNonce: 0,
    onHandPointerDown: vi.fn(),
    actPeel: ZTest_actionFixture('act-peel'),
    actShuffle: ZTest_actionFixture('act-shuffle'),
    actCheckBoard: ZTest_actionFixture('act-check-board'),
    actZoomFit: ZTest_actionFixture('act-zoom-fit'),
    ...over,
  }
}

const cellAt = (x: number, y: number) =>
  document.querySelector(`[data-cell][data-x="${x}"][data-y="${y}"]`) as HTMLElement

describe('Board', () => {
  it('draws a cell per spot, and a tile on a filled one', () => {
    render(<Board editing={makeEditing({ board: setChar(emptyBoard(), idx(3, 4), 'q') })} />)
    expect(document.querySelectorAll('[data-cell]')).toHaveLength(GRID * GRID)
    expect(cellAt(3, 4).textContent).toBe('q')
    expect(cellAt(4, 4).textContent).toBe('')
  })

  it('rings the cell the cursor is on, and only that one', () => {
    render(<Board editing={makeEditing({ cursor: { x: 2, y: 7, dir: 'v' } })} />)
    expect(cellAt(2, 7).querySelector('[class*="cursor"]')).not.toBeNull()
    expect(cellAt(3, 7).querySelector('[class*="cursor"]')).toBeNull()
  })

  it('answers a drag over an empty cell ok, over a filled one blocked', () => {
    const board = setChar(emptyBoard(), idx(3, 4), 'q')
    const { rerender } = render(<Board editing={makeEditing({ board, hover: { x: 5, y: 5 } })} />)
    expect(cellAt(5, 5).className).toContain('dropOk')
    rerender(<Board editing={makeEditing({ board, hover: { x: 3, y: 4 } })} />)
    expect(cellAt(3, 4).className).toContain('dropNo')
  })

  it('lets a lifted tile land back on its own cell', () => {
    const board = setChar(emptyBoard(), idx(3, 4), 'q')
    const drag = { source: { kind: 'board' as const, x: 3, y: 4 }, letter: 'q', x: 0, y: 0 }
    render(<Board editing={makeEditing({ board, hover: { x: 3, y: 4 }, drag: drag as never })} />)
    expect(cellAt(3, 4).className).toContain('dropOk')
    expect(cellAt(3, 4).querySelector('[class*="lifted"]')).not.toBeNull()
  })

  it('marks the cells a check painted red', () => {
    const board = setChar(setChar(emptyBoard(), idx(3, 4), 'q'), idx(4, 4), 'x')
    render(<Board editing={makeEditing({ board, invalidCells: new Set([idx(4, 4)]) })} />)
    expect(cellAt(4, 4).querySelector('[class*="invalid"]')).not.toBeNull()
    expect(cellAt(3, 4).querySelector('[class*="invalid"]')).toBeNull()
  })

  it('forwards a press on a cell with its coordinates', () => {
    const onCellPointerDown = vi.fn()
    render(<Board editing={makeEditing({ onCellPointerDown })} />)
    cellAt(6, 9).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(onCellPointerDown).toHaveBeenCalledWith(6, 9, expect.anything())
  })
})
