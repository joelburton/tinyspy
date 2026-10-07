// cs-unmet

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { cellIndex, decodeBoard } from '../lib/board'
import { Board } from './Board'

const EMPTY = '.'.repeat(225)
// A played C at the star's left, and a played blank-as-A on the star.
const PLAYED = EMPTY.slice(0, cellIndex(6, 7)) + 'cA' + EMPTY.slice(cellIndex(8, 7))

/** The board with these marks, every other mark empty. */
function renderBoard(marks: Partial<Parameters<typeof Board>[0]['marks']> = {}) {
  return render(
    <Board
      cells={decodeBoard(PLAYED)}
      marks={{
        stagedTiles: new Map(),
        justPlayedCellIds: new Set(),
        refusedCellIds: new Set(),
        historyLitCellIds: new Set(),
        liftedCellId: null,
        dropCellId: null,
        myTurnJustStarted: false,
        ...marks,
      }}
      cursor={{ x: 0, y: 0, dir: 'h' }}
      isViewingHistory={false}
      endingOutcome={null}
      onCellPointerDown={() => {}}
    />,
  )
}

/** The classes on the tile with this id — a CSS module's `_<key>_<hash>`. */
function tileClasses(container: HTMLElement, id: string): string {
  return container.querySelector(`[data-tile="${id}"]`)!.className
}

/** The cell at (x, y). */
function cellAt(container: HTMLElement, x: number, y: number): HTMLElement {
  return container.querySelector(`[data-x="${x}"][data-y="${y}"]`)!
}

describe('Board — what each cell draws', () => {
  it('a played tile is locked; a played blank is ringed, with no value', () => {
    const { container } = renderBoard()
    expect(tileClasses(container, '6,7')).toMatch(/_locked_/)
    expect(tileClasses(container, '7,7')).toMatch(/_blank_/)
    expect(cellAt(container, 6, 7).textContent).toBe('c3')
    expect(cellAt(container, 7, 7).textContent).toBe('a')
  })

  it('a staged tile covers its cell\'s premium', () => {
    const { container } = renderBoard({ stagedTiles: new Map([['3,0', { id: '3,0', letter: 't', blank: false }]]) })
    expect(tileClasses(container, '3,0')).toMatch(/_staged_/)
    expect(cellAt(container, 3, 0).textContent).toBe('t1')
    // An empty premium cell shows its label.
    expect(cellAt(container, 0, 0).textContent).toBe('TW')
  })

  it('the board column\'s marks land on the tiles they name', () => {
    const { container } = renderBoard({
      justPlayedCellIds: new Set(['6,7']),
      refusedCellIds: new Set(['7,7']),
    })
    expect(tileClasses(container, '6,7')).toMatch(/_justPlayed_/)
    expect(tileClasses(container, '6,7')).not.toMatch(/_refused_/)
    expect(tileClasses(container, '7,7')).toMatch(/_refused_/)
  })

  it('a drag over a held cell rings the tile; over an empty one, the cell', () => {
    const held = renderBoard({ dropCellId: '6,7' })
    expect(tileClasses(held.container, '6,7')).toMatch(/_dropBlocked_/)
    held.unmount()
    const open = renderBoard({ dropCellId: '9,7' })
    expect(cellAt(open.container, 9, 7).className).toMatch(/_dropOk_/)
  })
})
