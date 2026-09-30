// cs-unmet

/**
 * The turn-history view: live until a turn is opened, then that turn replayed,
 * with an actor named only when the board on screen is someone else's. The
 * replay's folding is lib/history.test.ts's.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { EventRow, GameData } from './useGame'
import { useHistoryView } from './useHistoryView'

const EVENTS: EventRow[] = [
  { id: 1, user_id: 'u1', word: 'apple', is_correct: true, kind: 'guess', created_at: '2026-01-01' },
  { id: 2, user_id: 'u2', word: 'berry', is_correct: false, kind: 'guess', created_at: '2026-01-01' },
]

/** Just what the hook reads: the log, the mode, and the players by id. */
function gdWith(isCompete: boolean): GameData {
  return {
    isCompete,
    events: EVENTS,
    playersById: {
      u1: { user_id: 'u1', username: 'me', color: 'red' },
      u2: { user_id: 'u2', username: 'moth', color: 'blue' },
    },
  } as unknown as GameData
}

describe('useHistoryView', () => {
  it('is live until a turn is opened', () => {
    const { result } = renderHook(() => useHistoryView(gdWith(false), 'u1'))
    expect(result.current.isViewing).toBe(false)
    expect(result.current.viewedEventId).toBeNull()
    expect(result.current.tileResults).toBeNull()
    expect(result.current.label).toBeNull()
  })

  it('replays the turn it opens, and goes back to live on exit', () => {
    const { result } = renderHook(() => useHistoryView(gdWith(false), 'u1'))
    act(() => result.current.show(1, 1))
    expect(result.current.isViewing).toBe(true)
    expect(result.current.viewedEventId).toBe(1)
    expect(result.current.litWord).toBe('apple')
    act(() => result.current.exit())
    expect(result.current.isViewing).toBe(false)
    expect(result.current.viewedEventId).toBeNull()
  })

  it('names the actor for a rival\'s board in compete', () => {
    const { result } = renderHook(() => useHistoryView(gdWith(true), 'u1'))
    act(() => result.current.show(2, 1))
    expect(result.current.actor?.username).toBe('moth')
  })

  it('names nobody for my own board, or for any turn in coop', () => {
    const compete = renderHook(() => useHistoryView(gdWith(true), 'u1'))
    act(() => compete.result.current.show(1, 1))
    expect(compete.result.current.actor).toBeUndefined()

    const coop = renderHook(() => useHistoryView(gdWith(false), 'u1'))
    act(() => coop.result.current.show(2, 2))
    expect(coop.result.current.actor).toBeUndefined()
  })
})
