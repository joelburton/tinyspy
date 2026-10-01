// cs-unmet

/**
 * The turn-history view: live until a turn is opened, then that turn's board
 * rebuilt from the right author's rows, with an actor named only when the
 * board on screen is someone else's. The rebuild itself is
 * lib/history.test.ts's.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Board } from '../lib/board'
import type { EventRow, GameData } from './useGame'
import { useHistoryView } from './useHistoryView'

const BOARD: Board = {
  categories: [
    { rank: 0, name: 'RED', tiles: ['a', 'b', 'c', 'd'] },
    { rank: 1, name: 'GREEN', tiles: ['e', 'f', 'g', 'h'] },
    { rank: 2, name: 'BLUE', tiles: ['i', 'j', 'k', 'l'] },
    { rank: 3, name: 'PURPLE', tiles: ['m', 'n', 'o', 'p'] },
  ],
  tileOrder: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'],
}

/** me matched RED, then missed; moth matched GREEN. */
const EVENTS: EventRow[] = [
  {
    id: 1, user_id: 'u1', tiles: ['a', 'b', 'c', 'd'], result: 'correct', matched: true,
    outcome: 'won', matched_category_rank: 0, created_at: 't1',
  },
  {
    id: 2, user_id: 'u1', tiles: ['e', 'f', 'g', 'm'], result: 'oneAway', matched: false,
    outcome: 'near', matched_category_rank: null, created_at: 't2',
  },
  {
    id: 3, user_id: 'u2', tiles: ['e', 'f', 'g', 'h'], result: 'correct', matched: true,
    outcome: 'won', matched_category_rank: 1, created_at: 't3',
  },
]

/** Just what the hook reads: the log, the board, the mode, and the players by id. */
function gdWith(isCompete: boolean): GameData {
  return {
    isCompete,
    events: EVENTS,
    puzzle: { board: BOARD },
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
    expect(result.current.matched).toBeNull()
    expect(result.current.tiles).toBeNull()
    expect(result.current.litTiles).toBeNull()
    expect(result.current.label).toBeNull()
  })

  it('rebuilds the board at the turn it opens, and goes back to live on exit', () => {
    const { result } = renderHook(() => useHistoryView(gdWith(false), 'u1'))
    act(() => result.current.show(2, 2))
    expect(result.current.isViewing).toBe(true)
    expect(result.current.viewedEventId).toBe(2)
    // RED was matched strictly before turn 2, so it is a band and its tiles are
    // gone; the turn's own four are lit in what it was.
    expect(result.current.matched?.map((m) => m.name)).toEqual(['RED'])
    expect(result.current.tiles).toEqual(['e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'])
    expect([...result.current.litTiles!]).toEqual(['e', 'f', 'g', 'm'])
    expect(result.current.litOutcome).toBe('near')
    expect(result.current.label).toBe('One away!')
    act(() => result.current.exit())
    expect(result.current.isViewing).toBe(false)
    expect(result.current.matched).toBeNull()
  })

  it('folds the author\'s rows alone in compete, and names them when they are not me', () => {
    const { result } = renderHook(() => useHistoryView(gdWith(true), 'u1'))
    act(() => result.current.show(3, 1))
    // moth's board: my RED never happened on it.
    expect(result.current.matched).toEqual([])
    expect(result.current.tiles).toHaveLength(16)
    expect(result.current.actor?.username).toBe('moth')
  })

  it('names nobody for my own board, or for any turn in coop', () => {
    const compete = renderHook(() => useHistoryView(gdWith(true), 'u1'))
    act(() => compete.result.current.show(2, 2))
    expect(compete.result.current.actor).toBeUndefined()

    const coop = renderHook(() => useHistoryView(gdWith(false), 'u1'))
    act(() => coop.result.current.show(3, 3))
    expect(coop.result.current.actor).toBeUndefined()
    // Coop is one shared board: my RED is a band on moth's turn.
    expect(coop.result.current.matched?.map((m) => m.name)).toEqual(['RED'])
  })
})
