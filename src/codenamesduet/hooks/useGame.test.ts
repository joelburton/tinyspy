// cs-blessed-codenamesduet

/**
 * WHAT THE PLAYAREA BLOB BECOMES, AND WHAT A PLAYER MAY NOT SEE.
 *
 * `makeGameData` is a pure function of the blob and who I am, so this tests it
 * directly: the links turned into players and tiles, the setup rows built, the
 * state line decided — and the seat rule, which is the one thing the blob does
 * not carry: my partner's key is withheld until the game ends.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ZTest_clue,
  ZTest_guess,
  ZTest_makeCodenamesduetCtx,
  ZTest_makeGameDataRaw,
} from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Turn 1: I clued; leah found my agent at 0, then a bystander at 10. Turn 2:
 *  leah clued; I turned the same bystander over from her key. */
const PLAYED = {
  turnNum: 3,
  clueSeat: 'A' as const,
  events: [
    ZTest_clue(1, 'u1', 1, 'TOOLS', 2),
    ZTest_guess(2, 'u2', 1, 0, 'G'),
    ZTest_guess(3, 'u2', 1, 10, 'N'),
    ZTest_clue(4, 'u2', 2, 'BIRDS', 1, true),
    ZTest_guess(5, 'u1', 2, 10, 'N'),
  ],
}

describe('codenamesduet makeGameData — the links become players and tiles', () => {
  it('me and my partner are the entries in players — the same objects', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    expect(gd.me).toBe(gd.playersById.u1)
    expect(gd.partner).toBe(gd.playersById.u2)
    expect(gd.players.map((p) => p.id)).toEqual(['u1', 'u2'])
  })

  it('links each board tile to its puzzle tile', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    const tile = gd.team.board.tilesById.get('7')!
    expect(tile.puzzleTile).toBe(gd.puzzle.tilesById.get('7'))
    expect(tile.puzzleTile.word).toBe('word7')
  })

  it('a reveal points its arrows at players, as a Set', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(PLAYED), 'u1')
    const both = gd.team.board.tilesById.get('10')!.revealed!
    expect(both.as).toBe('N')
    expect(both.arrows.has(gd.me)).toBe(true)
    expect(both.arrows.has(gd.partner)).toBe(true)
    expect(gd.team.board.tilesById.get('0')!.revealed).toEqual({ as: 'G', arrows: new Set() })
  })

  it('a tile is guessable for me when the builder lists me', () => {
    // Leah's bystander alone, in turn 1, still open to me.
    const raw = ZTest_makeGameDataRaw({ ...PLAYED, events: PLAYED.events.slice(0, 3), turnNum: 2, clueSeat: 'B' })
    expect(makeGameData(raw, 'u1').team.board.tilesById.get('10')!.guessable).toBe(true)
    expect(makeGameData(raw, 'u2').team.board.tilesById.get('10')!.guessable).toBe(false)
    expect(makeGameData(raw, 'u1').team.board.tilesById.get('0')!.guessable).toBe(false)
  })

  it('the turn names its holder and the clue its giver', () => {
    const raw = ZTest_makeGameDataRaw({ events: [ZTest_clue(1, 'u1', 1, 'TOOLS', 2)] })
    const gd = makeGameData(raw, 'u1')
    expect(gd.turns.holder).toBe(gd.partner)
    expect(gd.turns.currClue).toEqual({ word: 'TOOLS', count: 2, fromAi: false, by: gd.me })
  })

  it('every event is by a player', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(PLAYED), 'u1')
    expect(gd.events.map((e) => e.by.id)).toEqual(['u1', 'u2', 'u2', 'u2', 'u1'])
  })

  it('names who ended the game as a player', () => {
    const raw = ZTest_makeGameDataRaw({
      ending: { reason: 'fatal_move', detail: 'assassin', by: 'u2', winner: null },
      outcome: 'lost',
    })
    const gd = makeGameData(raw, 'u1')
    expect(gd.ending!.by).toBe(gd.partner)
    expect(gd.ending!.winner).toBeNull()
  })

  it('builds the setup rows once, naming who gives the first clue', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    expect(gd.setupRows.find((r) => r.key === 'first_clue_giver_user_id')!.value).toBe('me')
  })

  it('the state line shows the team: agents and turns against the budget', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(PLAYED), 'u1')
    expect(gd.stateLineData).toEqual({
      nFoundAgents: 1, nAgents: 15, nTurnsUsed: 2, maxTurns: 9, suddenDeath: false,
    })
  })
})

describe('codenamesduet makeGameData — the seat rule', () => {
  it("mid-game, my partner's key is null on every tile, and mine is there", () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    expect(gd.puzzle.tiles.every((t) => t.key.u2 === null)).toBe(true)
    expect(gd.puzzle.tilesById.get('9')!.key.u1).toBe('A')
  })

  it("my partner sees their key, and not mine", () => {
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u2')
    expect(gd.puzzle.tilesById.get('15')!.key.u2).toBe('A')
    expect(gd.puzzle.tiles.every((t) => t.key.u1 === null)).toBe(true)
  })

  it("the game's end opens both keys", () => {
    const raw = ZTest_makeGameDataRaw({
      ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null },
      outcome: 'neutral',
    })
    expect(makeGameData(raw, 'u1').puzzle.tilesById.get('15')!.key.u2).toBe('A')
  })
})

describe('codenamesduet useGame', () => {
  it('hands back gd built from the blob the page was handed, for me', () => {
    const { result } = renderHook(() => useGame(ZTest_makeCodenamesduetCtx()))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.id).toBe('g1')
  })

  it('keeps gd while the blob is the same, and rebuilds it for a new one', () => {
    const ctx = ZTest_makeCodenamesduetCtx()
    const { result, rerender } = renderHook((c) => useGame(c), { initialProps: ctx })
    const first = result.current.gd
    rerender({ ...ctx })
    expect(result.current.gd).toBe(first)
    rerender(ZTest_makeCodenamesduetCtx(PLAYED))
    expect(result.current.gd).not.toBe(first)
    expect(result.current.gd.events).toHaveLength(5)
  })

  it('throws for a game whose builder has not written its game_data', () => {
    const ctx = { ...ZTest_makeCodenamesduetCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/no game_data/)
  })
})
