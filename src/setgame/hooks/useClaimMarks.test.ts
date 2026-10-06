// cs-unmet

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ATTENTION_FLASH_MS, WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { useClaimMarks } from './useClaimMarks'
import type { GTile } from '../types'

const tiles = (...ids: string[]): GTile[] => ids.map((id) => ({ id }))
const ids = (list: readonly GTile[]) => list.map((t) => t.id)

// Fifteen tiles; the claim takes the first three. The table comes down to
// twelve: the last three move into the holes — they were already on it.
const BEFORE = tiles(
  '1111', '1112', '1113', '1121', '1122', '1123', '1131', '1132', '1133',
  '1211', '1212', '1213', '1221', '1222', '1223',
)
const COMPACTED = tiles(
  '1221', '1222', '1223', '1121', '1122', '1123', '1131', '1132', '1133',
  '1211', '1212', '1213',
)
// Twelve tiles; the claim takes the first three and the deck refills them.
const TWELVE = BEFORE.slice(0, 12)
const REFILLED = tiles('3111', '3112', '3113', ...ids(TWELVE.slice(3)))
const CLAIM = { id: 7, tiles: tiles('1111', '1112', '1113') }

type Props = Parameters<typeof useClaimMarks>[0]

describe('useClaimMarks', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('holds the found set in its ring, then flashes the tiles the claim dealt', () => {
    const { result, rerender } = renderHook((p: Props) => useClaimMarks(p), {
      initialProps: { liveTiles: TWELVE, lastClaim: null, quiet: false } as Props,
    })
    rerender({ liveTiles: REFILLED, lastClaim: CLAIM, quiet: false })

    // The table from before the claim, the found set ringed, nothing flashing.
    expect(ids(result.current.tiles)).toEqual(ids(TWELVE))
    expect([...result.current.foundTileIds]).toEqual(['1111', '1112', '1113'])
    expect(result.current.newTileIds.size).toBe(0)

    // The hold ends: the live table, and the three it dealt flash.
    act(() => { vi.advanceTimersByTime(WORD_ANSWER_MS) })
    expect(ids(result.current.tiles)).toEqual(ids(REFILLED))
    expect(result.current.foundTileIds.size).toBe(0)
    expect([...result.current.newTileIds]).toEqual(['3111', '3112', '3113'])

    act(() => { vi.advanceTimersByTime(ATTENTION_FLASH_MS) })
    expect(result.current.newTileIds.size).toBe(0)
  })

  it('does not flash tiles a short table moved into the holes', () => {
    const { result, rerender } = renderHook((p: Props) => useClaimMarks(p), {
      initialProps: { liveTiles: BEFORE, lastClaim: null, quiet: false } as Props,
    })
    rerender({ liveTiles: COMPACTED, lastClaim: CLAIM, quiet: false })
    act(() => { vi.advanceTimersByTime(WORD_ANSWER_MS) })
    expect(ids(result.current.tiles)).toEqual(ids(COMPACTED))
    expect(result.current.newTileIds.size).toBe(0)
  })

  it('marks nothing for a change no claim made — a Restart deals the deck again', () => {
    const { result, rerender } = renderHook((p: Props) => useClaimMarks(p), {
      initialProps: { liveTiles: REFILLED, lastClaim: CLAIM, quiet: false } as Props,
    })
    // The Restart deletes the log, so the newest claim is gone.
    rerender({ liveTiles: TWELVE, lastClaim: null, quiet: false })
    expect(ids(result.current.tiles)).toEqual(ids(TWELVE))
    expect(result.current.foundTileIds.size).toBe(0)
  })

  it('is quiet while a past turn is open', () => {
    const { result, rerender } = renderHook((p: Props) => useClaimMarks(p), {
      initialProps: { liveTiles: TWELVE, lastClaim: null, quiet: true } as Props,
    })
    rerender({ liveTiles: REFILLED, lastClaim: CLAIM, quiet: true })
    expect(ids(result.current.tiles)).toEqual(ids(REFILLED))
    expect(result.current.foundTileIds.size).toBe(0)
  })
})
