// cs-unmet

/**
 * WHAT THE GAME_DATA BLOB BECOMES, AND WHAT A RACER MAY NOT SEE.
 *
 * `makeGameData` is a pure function of the blob and who I am, so this tests it
 * directly: the links turned into players and tiles, the setup rows built, each
 * seat's facts carried through — and the seat rule, which is the one thing the
 * blob does not carry: a rival's rows and stack are withheld mid-race and
 * nowhere else.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ZTest_CONCEDED,
  ZTest_hint,
  ZTest_makeGameDataRaw,
  ZTest_makeStackdownCtx,
  ZTest_spoiler,
  ZTest_word,
} from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2). */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
/** I clear EAGLE; moth tries a word that isn't next, takes a hint, then a
 *  spoiler. */
const EVENTS = [
  ZTest_word(1, 'u1', 'eagle'),
  ZTest_word(2, 'u2', 'ebatl', ['10', '5', '11', '6', '2']),
  ZTest_hint(3, 'u2', 'something to eat off'),
  ZTest_spoiler(4, 'u2', 'table'),
]

describe('stackdown makeGameData — the links become players and tiles', () => {
  it('me is my own entry in players — the same object', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.me.username).toBe('me')
    expect(gd.players).toContain(gd.me)
    expect(gd.playersById.u1).toBe(gd.me)
  })

  it('a free-for-all game has no turns', () => {
    expect(makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1').turns).toBeNull()
  })

  it('names who ended the game and the winner as players', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        mode: 'compete',
        players: TWO,
        ending: { reason: 'reached_goal', detail: 'cleared', by: 'u2', winner: 'u2' },
        outcome: 'won',
      }),
      'u1',
    )
    expect(gd.ending?.by).toBe(gd.playersById.u2)
    expect(gd.ending?.winner).toBe(gd.playersById.u2)
    expect(gd.ended).toBe(true)
  })

  it('a timeout is ended by nobody', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        players: TWO,
        ending: { reason: 'timeout', detail: 'timeout', by: null, winner: null },
        outcome: 'lost',
      }),
      'u1',
    )
    expect(gd.ending).toEqual({ reason: 'timeout', detail: 'timeout', by: null, winner: null })
  })

  it('gives each log row its player, and a word its tiles in pick order', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    const [eagle, refused, hint, spoiler] = gd.events
    expect(eagle!.by).toBe(gd.me)
    expect(hint!.by).toBe(gd.playersById.u2)
    expect(eagle).not.toHaveProperty('userId')
    expect(eagle).not.toHaveProperty('tileIds')
    expect(eagle!.tiles.map((t) => t.letter).join('')).toBe('EAGLE')
    expect(eagle!.tiles[0]).toBe(gd.puzzle.tilesById['19'])
    expect(refused).toMatchObject({ word: 'ebatl', valid: false, tookTurn: true })
    expect(hint).toMatchObject({ kind: 'hint', word: null, clue: 'something to eat off', tiles: [], tookTurn: false })
    expect(spoiler).toMatchObject({ kind: 'spoiler', word: 'table', clue: null, tiles: [], tookTurn: true })
  })

  it('builds the setup rows once, for the info column and the printout', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.setupRows.map((r) => r.key)).toContain('band')
  })
})

describe('stackdown makeGameData — the puzzle', () => {
  it('keys the tiles by their tile number', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    expect(gd.puzzle.tiles).toHaveLength(30)
    expect(gd.puzzle.tilesById['29']).toBe(gd.puzzle.tiles[29])
    expect(gd.puzzle.tilesById['29']).toEqual({ id: '29', letter: 'O', x: 6, y: 8, z: 0 })
  })

  it('six words to clear, and no solution mid-game', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    expect(gd.puzzle.nReqdWords).toBe(6)
    expect(gd.puzzle.solution).toBeNull()
  })

  it('hands the solution over once the game has ended', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null },
        outcome: 'neutral',
      }),
      'u1',
    )
    expect(gd.puzzle.solution).toEqual(['eagle', 'table', 'plans', 'apple', 'juice', 'lemon'])
  })
})

describe('stackdown makeGameData — the counts', () => {
  it('coop: each player\'s counts are their own, and the team sums them', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect([gd.me.nFoundWords, gd.me.nHintsUsed, gd.me.nSpoilersUsed]).toEqual([1, 0, 0])
    const moth = gd.playersById.u2!
    expect([moth.nFoundWords, moth.nHintsUsed, moth.nSpoilersUsed]).toEqual([0, 1, 1])
    expect(gd.team).toEqual({ nFoundWords: 1, nHintsUsed: 1, nSpoilersUsed: 1 })
  })

  it('coop: the state line shows the team\'s counts', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.stateLineData).toEqual({ nFoundWords: 1, nReqdWords: 6, nHintsUsed: 1, nSpoilersUsed: 1 })
  })

  it('coop: one stack, with every valid word\'s tiles gone, on every seat', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, events: EVENTS }), 'u1')
    expect(gd.me.board.tiles).toHaveLength(25)
    expect(gd.me.board.tiles.some((t) => t.id === '19')).toBe(false)
    expect(gd.playersById.u2!.board).toEqual(gd.me.board)
  })
})

describe('stackdown makeGameData — the seat rule', () => {
  const race = (over = {}) => ZTest_makeGameDataRaw({
    mode: 'compete',
    players: TWO,
    events: [ZTest_word(1, 'u1', 'eagle'), ZTest_word(2, 'u2', 'eagle'), ZTest_word(3, 'u2', 'table')],
    ...over,
  })

  it('mid-race, a rival\'s rows leave the log and their stack is withheld', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.events.map((e) => e.id)).toEqual([1])
    expect(gd.playersById.u2!.board).toBeNull()
    // My own is always mine to see.
    expect(gd.me.board.tiles).toHaveLength(25)
  })

  it('a rival\'s count stays visible mid-race — the race publishes it', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.playersById.u2!.nFoundWords).toBe(2)
  })

  it('the race\'s end opens everything', () => {
    const gd = makeGameData(
      race({ ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null }, outcome: 'neutral' }),
      'u1',
    )
    expect(gd.events.map((e) => e.id)).toEqual([1, 2, 3])
    expect(gd.playersById.u2!.board?.tiles).toHaveLength(20)
  })

  it('a race has no team, so the state line shows my own counts', () => {
    const gd = makeGameData(race(), 'u1')
    expect(gd.team).toBeNull()
    expect(gd.stateLineData).toEqual({ nFoundWords: 1, nReqdWords: 6, nHintsUsed: 0, nSpoilersUsed: 0 })
  })

  it('a conceder is still a player, with their ending', () => {
    const gd = makeGameData(race({ players: [TWO[0]!, { ...TWO[1]!, ...ZTest_CONCEDED }] }), 'u1')
    expect(gd.playersById.u2!.conceded).toBe(true)
    expect(gd.playersById.u2!.ending?.reason).toBe('conceded')
    expect(gd.playersById.u2!.stillPlaying).toBe(false)
  })
})

describe('stackdown useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const ctx = ZTest_makeStackdownCtx({ players: TWO })
    const { result } = renderHook(() => useGame(ctx))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.id).toBe('g1')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = ZTest_makeStackdownCtx({ players: TWO })
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(ZTest_makeStackdownCtx({ players: TWO, events: EVENTS }))
    expect(result.current.gd).not.toBe(first)
    expect(result.current.gd.events).toHaveLength(4)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...ZTest_makeStackdownCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
