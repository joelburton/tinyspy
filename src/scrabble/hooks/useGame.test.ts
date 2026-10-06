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
    expect(gd.board.cells).toHaveLength(225)
    for (const cell of gd.board.cells) expect(gd.board.cellsById[cell.id]).toBe(cell)
    expect(gd.board.cells[cellIndex(6, 7)].tile).toEqual({ id: '6,7', letter: 'c', blank: false })
    expect(gd.board.cellsById['7,7'].tile).toEqual({ id: '7,7', letter: 'a', blank: true })
    expect(gd.board.cellsById['0,0'].tile).toBeNull()
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

  it('draws the state line from the team in coop', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      players: PLAYERS,
      nBagTiles: 40,
      events: [CAT, ZTest_leftovers(2, 'u1', -4, 2)],
    }), 'u1')
    expect(gd.stateLineData).toEqual({ score: 2, nBagTiles: 40 })
  })

  it('draws no score on the state line in a race', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({
      mode: 'compete',
      players: PLAYERS,
      nBagTiles: 40,
      events: [CAT],
    }), 'u1')
    expect(gd.stateLineData).toEqual({ score: null, nBagTiles: 40 })
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
