// cs-unmet

/**
 * Tests for useEditingBoard, the editing board: the hand derived from the tiles
 * I hold less the board, the save on a timer and on unmount (the one
 * `PauseBoundary` depends on), the keyboard cursor (place a held tile, return
 * one, flash when I don't hold it), the peel's guards, and an inert board.
 *
 * db, the drag gesture and the shared cursor keyboard are mocked; the pure
 * board lib runs for real. The keyboard is driven by calling what the editing
 * board hands `useBoardCursorKeys`.
 */

import { renderHook, act } from '@testing-library/react'
import { ZTest_actionFixture } from '@/common/actions/action.fixture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GRID, idx, setChar } from '../lib/board'
import { useEditingBoard } from './useEditingBoard'
import type { GEditingBoardInput } from '../reactTypes'

const { keyCfg, mockStart, mockRpc } = vi.hoisted(() => ({
  keyCfg: {
    current: null as unknown as Record<string, (...a: never[]) => void> & {
      enabled: boolean
    },
  },
  mockStart: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('../db', () => ({ db: { rpc: mockRpc } }))
vi.mock('@/shared/grid-and-drag/useDragGesture', () => ({
  cellAtPoint: () => null,
  useDragGesture: () => ({ drag: null, hover: null, start: mockStart }),
}))
// The cursor keyboard is captured rather than driven: what this file tests is
// what bananagrams supplies (the callbacks), not the shared action. It hands
// back the submit action, so the fake does too.
vi.mock('@/common/board-cursor/useBoardCursorKeys', () => ({
  useBoardCursorKeys: (cfg: typeof keyCfg.current) => {
    keyCfg.current = cfg
    return { actSubmit: ZTest_actionFixture('act-peel') }
  },
}))

const EMPTY = '.'.repeat(GRID * GRID)
const C = Math.floor(GRID / 2)
const CENTER = idx(C, C)
const withCenter = (letter: string) => setChar(EMPTY, CENTER, letter)

function render(input: Partial<GEditingBoardInput> = {}) {
  return renderHook(() =>
    useEditingBoard({
      gameId: 'g1',
      initialBoard: EMPTY,
      tiles: 'a',
      isBoardInteractive: true,
      onPeel: () => Promise.resolve(null),
      onCheckBoard: () => Promise.resolve(null),
      onDump: () => {
      },
      nBunchTiles: 100,
      nBagTiles: 0,
      reportBoardRef: { current: '' },
      ...input,
    }),
  )
}

/** The peel, as Enter or Space fires it. */
const pressPeel = () => act(async () => keyCfg.current.onSubmit())

beforeEach(() => {
  mockRpc.mockReset().mockReturnValue(Promise.resolve({ error: null }))
  mockStart.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('derived hand', () => {
  it('is the held tiles minus what is on the board', () => {
    const { result } = render({ tiles: 'abc', initialBoard: withCenter('a') })
    expect([...result.current.derivedHand].sort().join('')).toBe('bc')
  })
})

describe('persistence', () => {
  it('saves the board on UNMOUNT (the pause path)', () => {
    const { unmount } = render({ tiles: 'a', initialBoard: EMPTY })
    expect(mockRpc).not.toHaveBeenCalled() // no save while mounted + unchanged
    unmount()
    expect(mockRpc).toHaveBeenCalledWith('save_player_board',
      { p_game_id: 'g1', p_board: EMPTY })
  })

  it('saves a little after a board edit', () => {
    vi.useFakeTimers()
    render({ tiles: 'a', initialBoard: EMPTY })
    act(() => keyCfg.current.onLetter('a' as never)) // places 'a' at center → board changes
    expect(mockRpc).not.toHaveBeenCalled() // not yet — it waits
    act(() => vi.advanceTimersByTime(800))
    expect(mockRpc).toHaveBeenCalledWith('save_player_board', {
      p_game_id: 'g1',
      p_board: withCenter('a'),
    })
  })
})

describe('keyboard cursor', () => {
  it(
    'typing a held letter fills the cursor cell, in the data\'s lowercase, and advances',
    () => {
      const { result } = render({ tiles: 'a', initialBoard: EMPTY })
      act(() => keyCfg.current.onLetter('a' as never))
      expect(result.current.board).toBe(withCenter('a'))
      expect(result.current.cursor.x).toBe(C + 1) // advanced one cell (dir 'h')
    })

  it('typing a letter you do NOT hold flashes the hand and leaves the board',
    () => {
      const { result } = render({ tiles: 'a', initialBoard: EMPTY })
      act(() => keyCfg.current.onLetter('b' as never))
      expect(result.current.errFlash).toBe(true)
      expect(result.current.board).toBe(EMPTY)
    })

  it('Backspace returns the tile under the cursor to the hand', () => {
    const { result } = render({ tiles: 'a', initialBoard: withCenter('a') })
    expect(result.current.board[CENTER]).toBe('a')
    act(() => keyCfg.current.onBackspace())
    expect(result.current.board[CENTER]).toBe('.') // cleared → re-derives into the hand
    expect(result.current.cursor.x).toBe(C) // the cursor stays
  })

  it('one Backspace right after typing returns the letter just typed', () => {
    const { result } = render({ tiles: 'a', initialBoard: EMPTY })
    act(() => keyCfg.current.onLetter('a' as never)) // cursor advances past it
    act(() => keyCfg.current.onBackspace())
    expect(result.current.board).toBe(EMPTY)
    expect(result.current.cursor.x).toBe(C) // back on the emptied cell
  })
})

describe('peel', () => {
  it('no-ops while the hand still holds tiles', async () => {
    const onPeel = vi.fn(() => Promise.resolve(null))
    render({ tiles: 'ab', initialBoard: withCenter('a'), onPeel }) // hand = 'b'
    await pressPeel()
    expect(onPeel).not.toHaveBeenCalled()
  })

  it(
    'saves the board first, peels once every held tile is placed, and paints back the blocked cells',
    async () => {
      const onPeel = vi.fn(() => Promise.resolve({ invalidCells: [CENTER] }))
      const { result } = render({
        tiles: 'a',
        initialBoard: withCenter('a'),
        onPeel,
      }) // hand empty
      await pressPeel()
      expect(mockRpc).toHaveBeenCalledWith('save_player_board',
        expect.anything())
      expect(onPeel).toHaveBeenCalledTimes(1)
      expect(result.current.invalidCells.has(CENTER)).toBe(true)
    })

  it('is inert once the board is (the game over, or I conceded)', async () => {
    const onPeel = vi.fn(() => Promise.resolve(null))
    render({
      tiles: 'a',
      initialBoard: withCenter('a'),
      onPeel,
      isBoardInteractive: false,
    })
    await pressPeel()
    expect(onPeel).not.toHaveBeenCalled()
  })
})

describe('the dump', () => {
  it('can draw while the bunch and the bag together cover it', () => {
    expect(render({
      nBunchTiles: 1,
      nBagTiles: 2,
    }).result.current.canDump).toBe(true)
    expect(render({
      nBunchTiles: 1,
      nBagTiles: 1,
    }).result.current.canDump).toBe(false)
  })
})

describe('an inert board (conceded, or the game over)', () => {
  it('disables the keyboard and blocks pointer-down', () => {
    const { result } = render({ tiles: 'a', isBoardInteractive: false })
    expect(keyCfg.current.enabled).toBe(false)
    result.current.onCellPointerDown(C, C, {} as never)
    expect(mockStart).not.toHaveBeenCalled()
  })

  it('starts a drag on pointer-down while live', () => {
    const { result } = render({ tiles: 'a', initialBoard: withCenter('a') })
    result.current.onCellPointerDown(C, C, {} as never)
    expect(mockStart).toHaveBeenCalledTimes(1)
  })
})
