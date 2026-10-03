// cs-unmet

/**
 * The turn-history view: live until a turn is opened, then that turn's board
 * rebuilt from the right author's rows, with an actor named only when the
 * board on screen is someone else's. The rebuild itself is
 * lib/history.test.ts's.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ZTest_PUZZLE, ZTest_guess, ZTest_makeGameDataRaw, ZTest_matchOf } from '../lib/gameData.fixture'
import { makeGameData } from './useGame'
import { useHistoryView } from './useHistoryView'

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
const [RED, GREEN] = ZTest_PUZZLE.cats as [typeof ZTest_PUZZLE.cats[0], typeof ZTest_PUZZLE.cats[1]]

/** me matched RED, then missed; moth matched GREEN. */
const EVENTS = [
  ZTest_matchOf(RED, 'u1'),
  ZTest_guess('u1', ['e', 'f', 'g', 'm'], 'oneAway'),
  ZTest_matchOf(GREEN, 'u2'),
]
const [MY_MATCH, MY_MISS, THEIR_MATCH] = EVENTS as [typeof EVENTS[0], typeof EVENTS[1], typeof EVENTS[2]]

/** The game as I see it, both modes ended so every row is on the log. */
function gdWith(mode: 'coop' | 'compete') {
  return makeGameData(
    ZTest_makeGameDataRaw({
      mode,
      players: TWO,
      events: EVENTS,
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
    expect(result.current.board).toBeNull()
    expect(result.current.litTileIds).toBeNull()
    expect(result.current.label).toBeNull()
  })

  it('rebuilds the board at the turn it opens, and goes back to live on exit', () => {
    const { result } = renderHook(() => useHistoryView(gdWith('coop')))
    act(() => result.current.show(MY_MISS.id, 2))
    expect(result.current.isViewing).toBe(true)
    expect(result.current.viewedEventId).toBe(MY_MISS.id)
    // RED was matched strictly before turn 2, so it is a band and its tiles are
    // gone; the turn's own four are lit in what it was.
    expect(result.current.board?.matchedCats.map((c) => c.name)).toEqual(['RED'])
    expect(result.current.board?.tilesLeft.map((t) => t.id)).toEqual(['e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p'])
    expect([...result.current.litTileIds!]).toEqual(['e', 'f', 'g', 'm'])
    expect(result.current.litOutcome).toBe('near')
    expect(result.current.label).toBe('One away!')
    act(() => result.current.exit())
    expect(result.current.isViewing).toBe(false)
    expect(result.current.board).toBeNull()
  })

  it('folds the author\'s rows alone in compete, and names them when they are not me', () => {
    const gd = gdWith('compete')
    const { result } = renderHook(() => useHistoryView(gd))
    act(() => result.current.show(THEIR_MATCH.id, 1))
    // moth's board: my RED never happened on it.
    expect(result.current.board?.matchedCats).toEqual([])
    expect(result.current.board?.tilesLeft).toHaveLength(16)
    expect(result.current.actor).toBe(gd.playersById.u2)
  })

  it('names nobody for my own board, or for any turn in coop', () => {
    const compete = renderHook(() => useHistoryView(gdWith('compete')))
    act(() => compete.result.current.show(MY_MISS.id, 2))
    expect(compete.result.current.actor).toBeUndefined()

    const coop = renderHook(() => useHistoryView(gdWith('coop')))
    act(() => coop.result.current.show(THEIR_MATCH.id, 3))
    expect(coop.result.current.actor).toBeUndefined()
    // Coop is one shared board: my RED is a band on moth's turn.
    expect(coop.result.current.board?.matchedCats.map((c) => c.name)).toEqual(['RED'])
    expect(MY_MATCH.id).toBeLessThan(THEIR_MATCH.id)
  })
})
