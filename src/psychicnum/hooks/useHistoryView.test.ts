// cs-unmet

/**
 * The turn-history view: live until a turn is opened, then that turn replayed,
 * with an actor named only when the board on screen is someone else's. The
 * replay's folding is lib/history.test.ts's.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ZTest_guess, ZTest_makeGameDataRaw } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import { useHistoryView } from './useHistoryView'
import type { GGameData } from '../types'

const EVENTS = [ZTest_guess(1, 'u1', 'apple', true), ZTest_guess(2, 'u2', 'berry', false)]

/** Me and moth, each with a guess in the log. A finished game, so a rival's
 *  rows are in the log in compete too. */
function gdWith(mode: 'coop' | 'compete'): GGameData {
  return makeGameData(
    ZTest_makeGameDataRaw({
      mode,
      words: ['apple', 'berry', 'cedar'],
      events: EVENTS,
      players: [{ id: 'u1', username: 'me', color: 'red' }, { id: 'u2', username: 'moth', color: 'blue' }],
      ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null },
      outcome: 'neutral',
    }),
    'u1',
  )
}

describe('useHistoryView', () => {
  it('is live until a turn is opened', () => {
    const { result } = renderHook(() => useHistoryView(gdWith('coop')))
    expect(result.current.isViewing).toBe(false)
    expect(result.current.viewedEventId).toBeNull()
    expect(result.current.tiles).toBeNull()
    expect(result.current.label).toBeNull()
  })

  it('replays the turn it opens, and goes back to live on exit', () => {
    const { result } = renderHook(() => useHistoryView(gdWith('coop')))
    act(() => result.current.show(1, 1))
    expect(result.current.isViewing).toBe(true)
    expect(result.current.viewedEventId).toBe(1)
    expect(result.current.litWord).toBe('apple')
    act(() => result.current.exit())
    expect(result.current.isViewing).toBe(false)
    expect(result.current.viewedEventId).toBeNull()
  })

  it('names the actor for a rival\'s board in compete', () => {
    const { result } = renderHook(() => useHistoryView(gdWith('compete')))
    act(() => result.current.show(2, 1))
    expect(result.current.actor?.username).toBe('moth')
  })

  it('names nobody for my own board, or for any turn in coop', () => {
    const compete = renderHook(() => useHistoryView(gdWith('compete')))
    act(() => compete.result.current.show(1, 1))
    expect(compete.result.current.actor).toBeUndefined()

    const coop = renderHook(() => useHistoryView(gdWith('coop')))
    act(() => coop.result.current.show(2, 2))
    expect(coop.result.current.actor).toBeUndefined()
  })
})
