// cs-unmet

/**
 * A TEAMMATE'S LETTER FLASHES IN THEIR COLOR; MINE NEVER DOES.
 *
 * `useTeammateFills` finds the flash by comparing each board the blob brings
 * with the one before it, so the flash and the letter come from one place.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZTest_makeGameDataRaw, type ZTest_CellFacts } from '../lib/gameData.fixture'
import type { GGameData } from '../types'
import { useTeammateFills } from './useTeammateFills'
import { makeGameData } from './useGame'

/** Me (u1) and moth (u2), sharing a coop grid. */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

/** `gd` as the blob with these cells makes it, seen by me. */
const gdWith = (cells: ZTest_CellFacts[] = []): GGameData =>
  makeGameData(ZTest_makeGameDataRaw({ players: TWO, cells }), 'u1')

/** The hook over a first blob, re-renderable with the next one. */
function setup(gd: GGameData) {
  return renderHook((props: { gd: GGameData }) => useTeammateFills(props.gd.me.board, props.gd.me), {
    initialProps: { gd },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('crosswords useTeammateFills', () => {
  it('flashes nothing on the first board, however full', () => {
    const { result } = setup(gdWith([{ row: 0, col: 0, fill: 'C', writer: 'u2' }]))
    expect(result.current.size).toBe(0)
  })

  it('a teammate\'s new letter flashes in their color', () => {
    const { result, rerender } = setup(gdWith())
    rerender({ gd: gdWith([{ row: 0, col: 0, fill: 'C', writer: 'u2' }]) })
    expect(result.current).toEqual(new Map([['0,0', 'blue']]))
  })

  it('my own letter does not flash', () => {
    const { result, rerender } = setup(gdWith())
    rerender({ gd: gdWith([{ row: 0, col: 0, fill: 'C', writer: 'u1' }]) })
    expect(result.current.size).toBe(0)
  })

  it('a blanked cell does not flash, nor does the same letter typed again', () => {
    const { result, rerender } = setup(gdWith([{ row: 0, col: 0, fill: 'C', writer: 'u2' }]))
    rerender({ gd: gdWith() })
    expect(result.current.size).toBe(0)
    rerender({ gd: gdWith() })
    rerender({ gd: gdWith([{ row: 0, col: 1, fill: 'A', writer: 'u1' }]) })
    rerender({ gd: gdWith([{ row: 0, col: 1, fill: 'A', writer: 'u2' }]) })
    expect(result.current.size).toBe(0)
  })

  it('a flash ends after five seconds', () => {
    const { result, rerender } = setup(gdWith())
    rerender({ gd: gdWith([{ row: 0, col: 0, fill: 'C', writer: 'u2' }]) })
    expect(result.current.size).toBe(1)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current.size).toBe(0)
  })
})
