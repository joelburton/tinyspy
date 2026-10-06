// cs-unmet

/**
 * MY LETTER SHOWS AT ONCE, AND NEVER HIDES A TEAMMATE'S.
 *
 * `usePendingWrites` lays my writes over the blob's board until the blob is
 * known to carry them — by revision, not by what it shows. These pin the three
 * ways that can go wrong: a read that started before my keystroke undoing it,
 * a teammate's later overwrite hidden behind my letter, and a failed write
 * left standing.
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ZTest_makeGameDataRaw, type ZTest_CellFacts } from '../lib/gameData.fixture'
import type { GBoard } from '../types'
import { makeGameData } from './useGame'
import { usePendingWrites } from './usePendingWrites'

/** Me (u1) and moth (u2), sharing a coop grid. */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

/** The board a blob with these cells hands me. */
function blobBoard(cells: ZTest_CellFacts[] = []): GBoard {
  return makeGameData(ZTest_makeGameDataRaw({ players: TWO, cells }), 'u1').me.board
}

/** The hook over a blob of `revision`, re-renderable with the next blob. */
function setup(board: GBoard, revision: number) {
  return renderHook((props: { board: GBoard; revision: number }) => usePendingWrites(props), {
    initialProps: { board, revision },
  })
}

const fillAt = (board: GBoard, id: string) => board.cellsById[id]!.fill

describe('crosswords usePendingWrites', () => {
  it('draws a write over the board the moment it is made', () => {
    const { result } = setup(blobBoard(), 1)
    act(() => {
      result.current.pendingWrites.add('0,0', { fill: 'C', pencil: false })
    })
    expect(fillAt(result.current.pendingWrites.board, '0,0')).toBe('C')
  })

  it('a read that started before my keystroke does not undo it', () => {
    const { result, rerender } = setup(blobBoard(), 1)
    let handle = -1
    act(() => {
      handle = result.current.pendingWrites.add('0,0', { fill: 'C' })
    })
    // My RPC answers revision 2; a blob of revision 1, read before it, lands.
    act(() => result.current.pendingWrites.settle(handle, 2))
    rerender({ board: blobBoard(), revision: 1 })
    expect(fillAt(result.current.pendingWrites.board, '0,0')).toBe('C')
  })

  it('once the blob carries my write, a teammate who wrote after me is not hidden', () => {
    const { result, rerender } = setup(blobBoard(), 1)
    let handle = -1
    act(() => {
      handle = result.current.pendingWrites.add('0,0', { fill: 'C' })
    })
    act(() => result.current.pendingWrites.settle(handle, 2))
    // moth overwrote the cell after me: revision 3 carries my write AND hers.
    rerender({ board: blobBoard([{ row: 0, col: 0, fill: 'X', writer: 'u2' }]), revision: 3 })
    expect(fillAt(result.current.pendingWrites.board, '0,0')).toBe('X')
  })

  it('a write whose RPC has not answered stays, however new the blob', () => {
    const { result, rerender } = setup(blobBoard(), 1)
    act(() => {
      result.current.pendingWrites.add('0,0', { fill: 'C' })
    })
    rerender({ board: blobBoard(), revision: 9 })
    expect(fillAt(result.current.pendingWrites.board, '0,0')).toBe('C')
  })

  it('a failed write leaves at once', () => {
    const { result } = setup(blobBoard(), 1)
    let handle = -1
    act(() => {
      handle = result.current.pendingWrites.add('0,0', { fill: 'C' })
    })
    act(() => result.current.pendingWrites.drop(handle))
    expect(fillAt(result.current.pendingWrites.board, '0,0')).toBeNull()
  })

  it('a later write to the same cell wins', () => {
    const { result } = setup(blobBoard(), 1)
    act(() => {
      result.current.pendingWrites.add('0,0', { fill: 'C' })
      result.current.pendingWrites.add('0,0', { fill: 'D' })
    })
    expect(fillAt(result.current.pendingWrites.board, '0,0')).toBe('D')
  })

  it('a mark is a write too, and leaves the cell\'s letter alone', () => {
    const { result } = setup(blobBoard([{ row: 0, col: 0, fill: 'C' }]), 1)
    act(() => {
      result.current.pendingWrites.add('0,0', { markRight: 'break' })
    })
    const cell = result.current.pendingWrites.board.cellsById['0,0']!
    expect([cell.fill, cell.markRight]).toEqual(['C', 'break'])
  })
})
