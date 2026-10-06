// cs-unmet

import { describe, expect, it } from 'vitest'
import { makeGameData } from './useGame'
import { cellIndex } from '../lib/board'
import {
  ZTest_leftovers, ZTest_makeGameDataRaw, ZTest_pass, ZTest_word,
} from '../lib/gameData.fixture'

const PLAYERS = [
  { id: 'u1', username: 'me', color: 'red', rack: ['q', 'u', 'i', 'z'] },
  { id: 'u2', username: 'rival', color: 'blue', rack: ['x', 'y'] },
]

// CAT across the star, the A a blank.
const CAT = ZTest_word(1, 'u2', ['6,7:c', '7,7:A', '8,7:t'], ['cat'], 6)

describe('makeGameData', () => {
  it('decodes the board string into its 225 cells, keyed by id', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ events: [CAT] }), 'u1')
    const board = gd.me.board
    expect(board.cells).toHaveLength(225)
    for (const cell of board.cells) expect(board.cellsById[cell.id]).toBe(cell)
    expect(board.cells[cellIndex(6, 7)].tile).toEqual({ id: '6,7', letter: 'c', blank: false })
    expect(board.cellsById['7,7'].tile).toEqual({ id: '7,7', letter: 'a', blank: true })
    expect(board.cellsById['0,0'].tile).toBeNull()
  })

  it('puts the one board and the bag on every player in both modes, the same object', () => {
    for (const mode of ['coop', 'compete'] as const) {
      const gd = makeGameData(ZTest_makeGameDataRaw({ mode, players: PLAYERS, nBagTiles: 40 }), 'u1')
      expect(gd.playersById.u2!.board).toBe(gd.me.board)
      expect(gd.me.own.board).toBe(gd.me.board)
      expect([gd.me.nBagTiles, gd.playersById.u2!.nBagTiles]).toEqual([40, 40])
      expect(gd).not.toHaveProperty('board')
      expect(gd).not.toHaveProperty('team')
    }
  })

  it('turns a word\'s placements into tiles, and every row\'s user into the player', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      players: PLAYERS,
      events: [CAT, ZTest_pass(2, 'u1')],
    }), 'u1')
    expect(gd.events[0].placements).toEqual([
      { id: '6,7', letter: 'c', blank: false },
      { id: '7,7', letter: 'a', blank: true },
      { id: '8,7', letter: 't', blank: false },
    ])
    expect(gd.events[1].placements).toBeNull()
    expect(gd.events.map((e) => e.by)).toEqual([gd.playersById.u2, gd.playersById.u1])
    expect(gd.me).toBe(gd.playersById.u1)
  })

  it('withholds a rival\'s rack mid-race, and keeps its count', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ mode: 'compete', players: PLAYERS }), 'u1')
    expect(gd.me.rack).toEqual(['q', 'u', 'i', 'z'])
    expect(gd.playersById.u2!.rack).toBeNull()
    expect(gd.playersById.u2!.nRackTiles).toBe(2)
  })

  it('shows every rack once the race has ended', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      mode: 'compete',
      players: PLAYERS,
      ending: { reason: 'all_passed', detail: 'blocked', by: 'u2', winner: 'u2' },
      outcome: 'won',
    }), 'u1')
    expect(gd.playersById.u2!.rack).toEqual(['x', 'y'])
  })

  it('coop: every player carries the team\'s score and rack; their own score under `own`', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      players: PLAYERS,
      events: [CAT, ZTest_leftovers(2, 'u1', -4, 2)],
    }), 'u1')
    expect([gd.me.score, gd.playersById.u2!.score]).toEqual([2, 2])
    expect(gd.playersById.u2!.own.score).toBe(6)
    expect(gd.playersById.u2!.rack).toBe(gd.me.rack)
    expect(gd.me.own.rack).toBe(gd.me.rack)
  })

  it('a racer\'s side is themselves, so both copies are their own', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ mode: 'compete', players: PLAYERS, events: [CAT] }), 'u1')
    expect(gd.playersById.u2!.score).toBe(gd.playersById.u2!.own.score)
    expect(gd.me.own.rack).toEqual(gd.me.rack)
  })

  it('turns the turn and the ending\'s links into players', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      mode: 'compete',
      players: PLAYERS,
      turnHolderId: 'u2',
      ending: { reason: 'all_passed', detail: 'blocked', by: 'u2', winner: 'u2' },
      outcome: 'won',
    }), 'u1')
    expect(gd.turns!.holder).toBe(gd.playersById.u2)
    expect(gd.ending!.by).toBe(gd.playersById.u2)
    expect(gd.ending!.winner).toBe(gd.playersById.u2)
  })
})
