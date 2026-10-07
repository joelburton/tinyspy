// cs-unmet

/**
 * The turn-history view: live until a turn is opened, then that turn replayed,
 * with an actor named only when the board on screen is someone else's. The
 * replay itself is lib/history.test.ts's.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ZTest_guess, ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import { useHistoryView } from './useHistoryView'

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
const EVENTS = [ZTest_guess(1, 'u1', 'slate'), ZTest_guess(2, 'u2', 'verse', true)]

/** A game with both players' rows in the log: coop, or a race that has ended
 *  (mid-race the seat rule would withhold moth's). */
function gdWith(isCompete: boolean) {
  return makeGameData(
    ZTest_makeGameDataRaw({
      mode: isCompete ? 'compete' : 'coop',
      players: TWO,
      events: EVENTS,
      ...(isCompete
        ? { ending: { reason: 'reached_goal', detail: 'solved', by: 'u2' }, outcome: 'won' }
        : {}),
    }),
    'u1',
  )
}

describe('useHistoryView', () => {
  it('is live until a turn is opened', () => {
    const { result } = renderHook(() => useHistoryView(gdWith(false)))
    expect(result.current.isViewing).toBe(false)
    expect(result.current.viewedEventId).toBeNull()
    expect(result.current.rows).toBeNull()
    expect(result.current.litRowIdx).toBe(-1)
    expect(result.current.label).toBeNull()
  })

  it('replays the turn it opens, and goes back to live on exit', () => {
    const { result } = renderHook(() => useHistoryView(gdWith(false)))
    act(() => result.current.show(2, 2))
    expect(result.current.isViewing).toBe(true)
    expect(result.current.viewedEventId).toBe(2)
    // The starter, then the solve, ringed.
    expect(result.current.rows?.map((r) => r.word)).toEqual(['sieve', 'verse'])
    expect(result.current.litRowIdx).toBe(1)
    expect(result.current.label).toBe('Guess 2: VERSE')
    act(() => result.current.exit())
    expect(result.current.isViewing).toBe(false)
    expect(result.current.rows).toBeNull()
  })

  it('names the actor for an opponent\'s board in compete', () => {
    const { result } = renderHook(() => useHistoryView(gdWith(true)))
    act(() => result.current.show(2, 1))
    expect(result.current.actor?.username).toBe('moth')
    expect(result.current.rows?.map((r) => r.word)).toEqual(['sieve', 'verse'])
  })

  it('names nobody for my own board, or for any turn in coop', () => {
    const compete = renderHook(() => useHistoryView(gdWith(true)))
    act(() => compete.result.current.show(1, 1))
    expect(compete.result.current.actor).toBeUndefined()

    const coop = renderHook(() => useHistoryView(gdWith(false)))
    act(() => coop.result.current.show(2, 2))
    expect(coop.result.current.actor).toBeUndefined()
  })
})
