// cs-blessed-codenamesduet

/**
 * Unit test for the codenamesduet turn-history replay (lib/history.ts). Pure —
 * no DOM, no supabase. Covers the three things the replay has to get right:
 *   1. INCLUSIVE folding — viewing turn N reflects every guess with turn ≤ N, and
 *      NOT any later turn's guesses.
 *   2. The builder's rule — a bystander shows `N` and points at its guesser; a
 *      contacted agent or the assassin points at nobody.
 *   3. The lit tiles — exactly those guessed DURING the viewed turn.
 */
import { describe, expect, it } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import { ZTest_clue, ZTest_guess, ZTest_makeGameDataRaw } from './gameData.fixture'
import { replayTurn } from './history'
import type { GEventRaw, GTile } from '../types'

// Turn 1: ada clues BREAD; bea contacts tile 0. Turn 2: bea clues; ada turns
// over tile 1 as a bystander. Turn 3: ada clues WAIT; bea passes. Turn 10:
// sudden death, ada guesses tile 2.
const EVENTS: GEventRaw[] = [
  ZTest_clue(1, 'u1', 1, 'bread', 2),
  ZTest_guess(2, 'u2', 1, 0, 'G'),
  ZTest_clue(3, 'u2', 2, 'x', 1),
  ZTest_guess(4, 'u1', 2, 1, 'N'),
  ZTest_clue(5, 'u1', 3, 'wait', 1),
  { ...ZTest_clue(6, 'u2', 3, 'x', 0), kind: 'pass', tookTurn: true, clueWord: null, clueCount: null, clueFromAi: null },
  ZTest_guess(7, 'u1', 10, 2, 'A'),
]
const gd = makeGameData(ZTest_makeGameDataRaw({ events: EVENTS, turnNum: 11, clueSeat: null }), 'u1')
const replay = (eventId: number, n: number | null) => replayTurn(gd.events, gd.puzzle.tiles, eventId, n)!
const tileOf = (tiles: GTile[], id: string) => tiles.find((t) => t.id === id)!

describe('replayTurn', () => {
  it('folds only guesses up to and including the viewed turn (inclusive)', () => {
    const { tiles } = replay(3, 2)
    expect(tileOf(tiles, '0')).toMatchObject({ revealed: { as: 'G' } })
    expect(tileOf(tiles, '1')).toMatchObject({ revealed: { as: 'N' } })
    expect(tileOf(tiles, '2')).toMatchObject({ revealed: null })
  })

  it('points a bystander at its guesser, and a contacted tile at nobody', () => {
    const { tiles } = replay(3, 2)
    expect([...tileOf(tiles, '1').revealed!.arrows]).toEqual([gd.me])
    expect(tileOf(tiles, '0')).toMatchObject({ revealed: { arrows: new Set() } })
  })

  it('lights exactly the tiles decided during the viewed turn', () => {
    expect([...replay(1, 1).litTileIds]).toEqual(['0'])
    expect([...replay(3, 2).litTileIds]).toEqual(['1'])
    expect(replay(5, 3).litTileIds.size).toBe(0)
  })

  it('describes the turn name-free: clue then guessed words, or "passed"', () => {
    expect(replay(1, 1).label).toBe('#1: 2 BREAD → WORD0')
    expect(replay(5, 3).label).toBe('#3: 1 WAIT — passed')
  })

  it('shows back the number the log printed, which a filter can make differ from the turn', () => {
    expect(replay(1, 4).label).toBe('#4: 2 BREAD → WORD0')
    expect(replay(1, null).label).toBe('2 BREAD → WORD0')
  })

  it('labels a turn with no clue as sudden death', () => {
    expect(replay(7, 4).label).toBe('#4: Sudden death → WORD2')
  })

  it('is null for an id the log does not hold', () => {
    expect(replayTurn(gd.events, gd.puzzle.tiles, 99, 1)).toBeNull()
  })
})
