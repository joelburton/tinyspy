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
import { useDecidedTileMarks } from './useDecidedTileMarks'
import type { GTile } from '../types'

type Props = { tiles: readonly GTile[]; moveCount: number; isViewingHistory: boolean }

/** A decided tile. */
const tile = (word: string, correct: boolean): GTile =>
  ({ id: word, word, correct, outcome: correct ? 'won' : 'lost', decidedBy: null })

/** The ids of the tiles in a mark set. */
const ids = (tiles: ReadonlySet<GTile>) => [...tiles].map((t) => t.id)

function setup(initial: Props) {
  return renderHook((props: Props) => useDecidedTileMarks(props), { initialProps: initial })
}

/** One guess already on the board: apple, a hit. */
const ONE_GUESS: GTile[] = [tile('apple', true)]

describe('useDecidedTileMarks', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('marks nothing on mount', () => {
    const { result } = setup({ tiles: ONE_GUESS, moveCount: 1, isViewingHistory: false })
    expect(ids(result.current.flashingTiles)).toEqual([])
    expect(ids(result.current.shakingTiles)).toEqual([])
  })

  it('flashes a right guess as it lands, and never shakes it', () => {
    const { result, rerender } = setup({ tiles: ONE_GUESS, moveCount: 1, isViewingHistory: false })
    rerender({ tiles: [...ONE_GUESS, tile('berry', true)], moveCount: 2, isViewingHistory: false })
    expect(ids(result.current.flashingTiles)).toEqual(['berry'])

    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS))
    expect(ids(result.current.shakingTiles)).toEqual([])
  })

  it('shakes a wrong guess once its flash is done, and not before', () => {
    const { result, rerender } = setup({ tiles: ONE_GUESS, moveCount: 1, isViewingHistory: false })
    rerender({ tiles: [...ONE_GUESS, tile('cedar', false)], moveCount: 2, isViewingHistory: false })
    expect(ids(result.current.flashingTiles)).toEqual(['cedar'])

    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS - 1))
    expect(ids(result.current.shakingTiles)).toEqual([])
    act(() => vi.advanceTimersByTime(1))
    expect(ids(result.current.shakingTiles)).toEqual(['cedar'])

    // The shake is a beat, then gone.
    act(() => vi.advanceTimersByTime(VERDICT_SHAKE_MS))
    expect(ids(result.current.shakingTiles)).toEqual([])
  })

  it('says nothing about a reveal, which no guess caused', () => {
    const { result, rerender } = setup({ tiles: ONE_GUESS, moveCount: 1, isViewingHistory: false })
    // The secrets revealed: tiles turn, and the guess count does not move.
    rerender({ tiles: [...ONE_GUESS, tile('delta', true)], moveCount: 1, isViewingHistory: false })
    expect(ids(result.current.flashingTiles)).toEqual([])
  })

  it('says nothing while a past turn is open', () => {
    const { result, rerender } = setup({ tiles: ONE_GUESS, moveCount: 1, isViewingHistory: true })
    rerender({ tiles: [...ONE_GUESS, tile('cedar', false)], moveCount: 2, isViewingHistory: true })
    expect(ids(result.current.flashingTiles)).toEqual([])
    act(() => vi.advanceTimersByTime(ATTENTION_FADE_MS))
    expect(ids(result.current.shakingTiles)).toEqual([])
  })
})
