// cs-unmet

/**
 * The marks on psychicnum's just-decided tiles: the flash on a guess that
 * lands, none on a reveal or while a past turn is open, and the head-shake on a
 * wrong word only — after the flash, never with it. When the flash itself
 * starts and ends is `useMoveAttention`'s, tested beside it.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTENTION_FADE_MS, VERDICT_SHAKE_MS } from '@/common/board-marks/feedbackTiming'
import type { TileResults } from '../lib/tileResults'
import { useDecidedTileMarks } from './useDecidedTileMarks'

type Props = { results: TileResults; moveCount: number; isViewingHistory: boolean }

function setup(initial: Props) {
  return renderHook((props: Props) => useDecidedTileMarks(props), { initialProps: initial })
}

/** One guess already on the board: apple, a hit. */
const ONE_GUESS: TileResults = new Map([['apple', true]])

describe('useDecidedTileMarks', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('marks nothing on mount', () => {
    const { result } = setup({ results: ONE_GUESS, moveCount: 1, isViewingHistory: false })
    expect([...result.current.flashing]).toEqual([])
    expect([...result.current.shaking]).toEqual([])
  })

  it('flashes a right guess as it lands, and never shakes it', () => {
    const { result, rerender } = setup({ results: ONE_GUESS, moveCount: 1, isViewingHistory: false })
    rerender({ results: new Map([...ONE_GUESS, ['berry', true]]), moveCount: 2, isViewingHistory: false })
    expect([...result.current.flashing]).toEqual(['berry'])

    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS))
    expect([...result.current.shaking]).toEqual([])
  })

  it('shakes a wrong guess once its flash is done, and not before', () => {
    const { result, rerender } = setup({ results: ONE_GUESS, moveCount: 1, isViewingHistory: false })
    rerender({ results: new Map([...ONE_GUESS, ['cedar', false]]), moveCount: 2, isViewingHistory: false })
    expect([...result.current.flashing]).toEqual(['cedar'])

    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS - 1))
    expect([...result.current.shaking]).toEqual([])
    act(() => vi.advanceTimersByTime(1))
    expect([...result.current.shaking]).toEqual(['cedar'])

    // The shake is a beat, then gone.
    act(() => vi.advanceTimersByTime(VERDICT_SHAKE_MS))
    expect([...result.current.shaking]).toEqual([])
  })

  it('says nothing about a reveal, which no guess caused', () => {
    const { result, rerender } = setup({ results: ONE_GUESS, moveCount: 1, isViewingHistory: false })
    // The secrets revealed: tiles turn, and the guess count does not move.
    rerender({ results: new Map([...ONE_GUESS, ['delta', true]]), moveCount: 1, isViewingHistory: false })
    expect([...result.current.flashing]).toEqual([])
  })

  it('says nothing while a past turn is open', () => {
    const { result, rerender } = setup({ results: ONE_GUESS, moveCount: 1, isViewingHistory: true })
    rerender({ results: new Map([...ONE_GUESS, ['cedar', false]]), moveCount: 2, isViewingHistory: true })
    expect([...result.current.flashing]).toEqual([])
    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS))
    expect([...result.current.shaking]).toEqual([])
  })
})
