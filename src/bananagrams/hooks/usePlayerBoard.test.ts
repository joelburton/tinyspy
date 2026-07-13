/**
 * Tests for usePlayerBoard — bananagrams' board+hand interaction engine, the other
 * of the two most intricate hooks in the codebase (the twin is crosswords'
 * useGridKeyboard).
 * It spans both columns, so the load-bearing pieces are: the hand DERIVED from the
 * server tiles minus the board, the persistence (debounced autosave + the
 * save-on-unmount that PauseBoundary depends on), the keyboard cursor (place a held
 * tile / return one / flash when you don't hold it), and doPeel's guards.
 *
 * db, useDragGesture, and the shared board-cursor keyboard are mocked; the pure
 * board lib (deriveHand/idx/setChar/GRID) runs for real. We drive the keyboard by
 * invoking the config the hook hands useBoardCursorKeys.
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GRID, idx, setChar } from '../lib/board'
import { usePlayerBoard, type UsePlayerBoardInput } from './usePlayerBoard'

const { keyCfg, mockStart, mockRpc } = vi.hoisted(() => ({
  keyCfg: { current: null as unknown as Record<string, (...a: never[]) => void> & { enabled: boolean } },
  mockStart: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('../db', () => ({ db: { rpc: mockRpc } }))
vi.mock('../../common/hooks/ui/useDragGesture', () => ({
  useDragGesture: () => ({ drag: null, hover: null, start: mockStart }),
}))
vi.mock('../../common/hooks/input/useBoardCursorKeys', () => ({
  useBoardCursorKeys: (cfg: typeof keyCfg.current) => {
    keyCfg.current = cfg
  },
}))

const EMPTY = '.'.repeat(GRID * GRID)
const C = Math.floor(GRID / 2)
const CENTER = idx(C, C)
const withCenter = (letter: string) => setChar(EMPTY, CENTER, letter)

function render(input: Partial<UsePlayerBoardInput> = {}) {
  return renderHook(() =>
    usePlayerBoard({ gameId: 'g1', initialBoard: EMPTY, tiles: 'A', ...input }),
  )
}

beforeEach(() => {
  mockRpc.mockReset().mockReturnValue(Promise.resolve({ error: null }))
  mockStart.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('derived hand', () => {
  it('is the held tiles minus what is on the board', () => {
    const { result } = render({ tiles: 'ABC', initialBoard: withCenter('A') })
    expect([...result.current.derivedHand].sort().join('')).toBe('BC')
  })
})

describe('persistence', () => {
  it('snapshots the board to save_player_board on UNMOUNT (the pause path)', () => {
    const { unmount } = render({ tiles: 'A', initialBoard: EMPTY })
    expect(mockRpc).not.toHaveBeenCalled() // no save while mounted + unchanged
    unmount()
    expect(mockRpc).toHaveBeenCalledWith('save_player_board', { target_game: 'g1', board: EMPTY })
  })

  it('debounces an autosave after a board edit', () => {
    vi.useFakeTimers()
    render({ tiles: 'A', initialBoard: EMPTY })
    act(() => keyCfg.current.onLetter('A' as never)) // places 'A' at centre → board changes
    expect(mockRpc).not.toHaveBeenCalled() // not yet — it's debounced
    act(() => vi.advanceTimersByTime(800))
    expect(mockRpc).toHaveBeenCalledWith('save_player_board', {
      target_game: 'g1',
      board: withCenter('A'),
    })
  })
})

describe('keyboard cursor', () => {
  it('typing a held letter fills the cursor cell and advances', () => {
    const { result } = render({ tiles: 'A', initialBoard: EMPTY })
    act(() => keyCfg.current.onLetter('A' as never))
    expect(result.current.board[CENTER]).toBe('A')
    expect(result.current.cursor.x).toBe(C + 1) // advanced one cell (dir 'h')
  })

  it('typing a letter you do NOT hold flashes the hand and leaves the board', () => {
    const { result } = render({ tiles: 'A', initialBoard: EMPTY })
    act(() => keyCfg.current.onLetter('B' as never))
    expect(result.current.errFlash).toBe(true)
    expect(result.current.board).toBe(EMPTY)
  })

  it('Backspace returns the tile under the cursor to the hand', () => {
    const { result } = render({ tiles: 'A', initialBoard: withCenter('A') })
    expect(result.current.board[CENTER]).toBe('A')
    act(() => keyCfg.current.onBackspace())
    expect(result.current.board[CENTER]).toBe('.') // cleared → re-derives into the hand
  })
})

describe('doPeel', () => {
  it('no-ops while the hand still holds tiles', async () => {
    const onPeel = vi.fn(() => Promise.resolve(null))
    const { result } = render({ tiles: 'AB', initialBoard: withCenter('A'), onPeel }) // hand = 'B'
    await act(async () => {
      await result.current.doPeel()
    })
    expect(onPeel).not.toHaveBeenCalled()
  })

  it('peels once every held tile is placed, and paints back the blocked cells', async () => {
    const onPeel = vi.fn(() => Promise.resolve({ illegalCells: [CENTER] }))
    const { result } = render({ tiles: 'A', initialBoard: withCenter('A'), onPeel }) // hand empty
    await act(async () => {
      await result.current.doPeel()
    })
    expect(onPeel).toHaveBeenCalledTimes(1)
    expect(result.current.invalidCells.has(CENTER)).toBe(true)
  })

  it('is inert once the game is terminal', async () => {
    const onPeel = vi.fn(() => Promise.resolve(null))
    const { result } = render({ tiles: 'A', initialBoard: withCenter('A'), onPeel, isTerminal: true })
    await act(async () => {
      await result.current.doPeel()
    })
    expect(onPeel).not.toHaveBeenCalled()
  })
})

describe('frozen (conceded / terminal)', () => {
  it('disables the keyboard and blocks pointer-down when conceded', () => {
    const { result } = render({ tiles: 'A', isConceded: true })
    expect(keyCfg.current.enabled).toBe(false)
    result.current.onCellPointerDown(C, C, {} as never)
    expect(mockStart).not.toHaveBeenCalled()
  })

  it('starts a drag on pointer-down while live', () => {
    const { result } = render({ tiles: 'A', initialBoard: withCenter('A') })
    result.current.onCellPointerDown(C, C, {} as never)
    expect(mockStart).toHaveBeenCalledTimes(1)
  })
})
