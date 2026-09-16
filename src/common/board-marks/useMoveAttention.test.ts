// cs-audited-board-marks

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTENTION_FLASH_MS } from './feedbackTiming'
import { useMoveAttention } from './useMoveAttention'

/** A board as a string of letters, diffed cell by cell — the shape of the real
 *  callers, small enough to read. */
function render(initial: { board: string; moves: number; quiet?: boolean }) {
  return renderHook(
    ({ board, moves, quiet }: { board: string; moves: number; quiet?: boolean }) =>
      useMoveAttention({
        content: board,
        contentKey: board,
        moveCount: moves,
        quiet,
        changed: (before, now) =>
          new Set([...now].map((c, i) => (c === before[i] ? -1 : i)).filter((i) => i >= 0)),
      }),
    { initialProps: initial },
  )
}

describe('useMoveAttention', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('marks nothing on mount, however long the log is', () => {
    const { result } = render({ board: 'abcd', moves: 12 })
    expect([...result.current]).toEqual([])
  })

  it('marks what a move changed, and takes it off after the lifetime', () => {
    const { result, rerender } = render({ board: 'abcd', moves: 1 })
    rerender({ board: 'abXd', moves: 2 })
    expect([...result.current]).toEqual([2])

    act(() => vi.advanceTimersByTime(ATTENTION_FLASH_MS - 1))
    expect(result.current.has(2)).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect([...result.current]).toEqual([])
  })

  it('says nothing about a change no move caused', () => {
    const { result, rerender } = render({ board: 'abcd', moves: 3 })
    // A re-deal: the whole board differs and the log went with it.
    rerender({ board: 'wxyz', moves: 0 })
    expect([...result.current]).toEqual([])
  })

  it('says nothing when the caller is quiet', () => {
    const { result, rerender } = render({ board: 'abcd', moves: 1, quiet: true })
    rerender({ board: 'abXd', moves: 2, quiet: true })
    expect([...result.current]).toEqual([])
  })

  it('says nothing about a move that changed nothing visible', () => {
    const { result, rerender } = render({ board: 'abcd', moves: 1 })
    // The marker advanced and the content did not — a move that landed on an
    // identical board. The diff is never consulted; there is nothing to mark.
    rerender({ board: 'abcd', moves: 2 })
    expect([...result.current]).toEqual([])
  })

  it('absorbs an unexplained change, so the NEXT move diffs against the screen', () => {
    const { result, rerender } = render({ board: 'abcd', moves: 1 })
    rerender({ board: 'wxyz', moves: 0 }) // a re-deal, silently absorbed
    rerender({ board: 'wxYz', moves: 1 }) // a move on the new board
    expect([...result.current]).toEqual([2])
  })
})
