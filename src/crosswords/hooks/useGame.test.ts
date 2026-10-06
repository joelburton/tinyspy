// cs-unmet

/**
 * WHAT THE PLAYAREA BLOB BECOMES, AND WHAT A RACER MAY NOT SEE.
 *
 * `makeGameData` is a pure function of the blob and who I am, so this tests it
 * directly: the links turned into players, each packed grid unpacked into its
 * cells, coop's one grid on every seat — and the seat rule, which is the one
 * thing the blob does not carry: a rival's grid is withheld mid-race and
 * nowhere else.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ZTest_CONCEDED,
  ZTest_SOLUTION,
  ZTest_makeCrosswordsCtx,
  ZTest_makeGameDataRaw,
} from '../lib/gameData.fixture'
import { makeGameData, useGame } from './useGame'

/** Me (u1) and moth (u2). */
const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]

const WON_BY_MOTH = {
  ending: { reason: 'reached_goal' as const, detail: 'solved', by: 'u2', winner: 'u2' },
  outcome: 'won' as const,
}

describe('crosswords makeGameData — the links become players', () => {
  it('me is my own entry in players — the same object', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.me.username).toBe('me')
    expect(gd.players).toContain(gd.me)
    expect(gd.playersById.u1).toBe(gd.me)
  })

  it('there is no turn order, and the team holds nothing', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO }), 'u1')
    expect(gd.turns).toBeNull()
    expect(gd.team).toBeNull()
  })

  it('names who ended the game and the winner as players', () => {
    const gd = makeGameData(ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, ...WON_BY_MOTH }), 'u1')
    expect(gd.ending?.by).toBe(gd.playersById.u2)
    expect(gd.ending?.winner).toBe(gd.playersById.u2)
    expect(gd.ended).toBe(true)
  })

  it('a timeout is ended by nobody, with no winner', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        ending: { reason: 'timeout', detail: 'timeout', by: null, winner: null },
        outcome: 'lost',
      }),
      'u1',
    )
    expect(gd.ending).toEqual({ reason: 'timeout', detail: 'timeout', by: null, winner: null })
  })

  it('carries the puzzle as the blob does: no solution mid-game, the answer key once it ends', () => {
    expect(makeGameData(ZTest_makeGameDataRaw(), 'u1').puzzle.solution).toBeNull()
    const ended = makeGameData(ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, ...WON_BY_MOTH }), 'u1')
    expect(ended.puzzle.solution).toEqual(ZTest_SOLUTION)
  })
})

describe('crosswords makeGameData — a grid unpacked', () => {
  it('has a cell for every open, non-given cell, in reading order, and no others', () => {
    // The 2×3 puzzle: a block at (0,2), a given at (1,2).
    const board = makeGameData(ZTest_makeGameDataRaw(), 'u1').me.board
    expect(board.cells.map((c) => c.id)).toEqual(['0,0', '0,1', '1,0', '1,1'])
    expect(board.cellsById['1,1']).toBe(board.cells[3])
  })

  it('a blank cell holds nothing', () => {
    const cell = makeGameData(ZTest_makeGameDataRaw(), 'u1').me.board.cellsById['0,0']
    expect(cell).toEqual({
      id: '0,0', row: 0, col: 0, fill: null, pencil: false, wrong: false, revealed: false,
      markRight: null, markBottom: null, writer: null,
    })
  })

  it('a letter in pen is uppercase; a letter in pencil arrives lowercase and is held uppercase, penciled', () => {
    const board = makeGameData(
      ZTest_makeGameDataRaw({ cells: [{ row: 0, col: 0, fill: 'C' }, { row: 1, col: 1, fill: 'S', pencil: true }] }),
      'u1',
    ).me.board
    expect([board.cellsById['0,0']!.fill, board.cellsById['0,0']!.pencil]).toEqual(['C', false])
    expect([board.cellsById['1,1']!.fill, board.cellsById['1,1']!.pencil]).toEqual(['S', true])
  })

  it('a rebus keeps every letter, in pen or in pencil', () => {
    const board = makeGameData(
      ZTest_makeGameDataRaw({
        cells: [{ row: 0, col: 0, fill: 'HEART' }, { row: 0, col: 1, fill: 'LUNGS', pencil: true }],
      }),
      'u1',
    ).me.board
    expect(board.cellsById['0,0']!.fill).toBe('HEART')
    expect([board.cellsById['0,1']!.fill, board.cellsById['0,1']!.pencil]).toEqual(['LUNGS', true])
  })

  it('reads each flag and edge mark off its cell index', () => {
    const board = makeGameData(
      ZTest_makeGameDataRaw({
        cells: [
          { row: 0, col: 0, fill: 'X', wrong: true, markRight: 'break' },
          { row: 1, col: 0, fill: 'T', revealed: true, markBottom: 'hyphen' },
          { row: 0, col: 1, markRight: 'hyphen', markBottom: 'break' },
        ],
      }),
      'u1',
    ).me.board
    const pick = (id: string) => {
      const c = board.cellsById[id]!
      return [c.wrong, c.revealed, c.markRight, c.markBottom]
    }
    expect(pick('0,0')).toEqual([true, false, 'break', null])
    expect(pick('1,0')).toEqual([false, true, null, 'hyphen'])
    expect(pick('0,1')).toEqual([false, false, 'hyphen', 'break'])
    expect(pick('1,1')).toEqual([false, false, null, null])
  })

  it('coop names each cell\'s writer as the player — the same object playersById holds', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        players: TWO,
        cells: [{ row: 0, col: 0, fill: 'C', writer: 'u1' }, { row: 1, col: 1, fill: 'S', pencil: true, writer: 'u2' }],
      }),
      'u1',
    )
    expect(gd.me.board.cellsById['0,0']!.writer).toBe(gd.me)
    expect(gd.me.board.cellsById['1,1']!.writer).toBe(gd.playersById.u2)
    expect(gd.me.board.cellsById['0,1']!.writer).toBeNull()
  })
})

describe('crosswords makeGameData — whose grid each seat holds', () => {
  it('coop puts its one grid on every seat: the same board object', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({ players: TWO, cells: [{ row: 0, col: 0, fill: 'C', writer: 'u2' }] }),
      'u1',
    )
    expect(gd.playersById.u2!.board).toBe(gd.me.board)
    expect(gd.me.board.cellsById['0,0']!.fill).toBe('C')
  })

  it('compete gives me my own grid, with no writers', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        mode: 'compete',
        players: [
          { ...TWO[0]!, cells: [{ row: 0, col: 0, fill: 'C' }] },
          { ...TWO[1]!, cells: [{ row: 0, col: 0, fill: 'X' }] },
        ],
      }),
      'u1',
    )
    expect(gd.me.board.cellsById['0,0']!.fill).toBe('C')
    expect(gd.me.board.cellsById['0,0']!.writer).toBeNull()
  })

  it('the seat rule: a rival\'s grid is null while the race is on', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        mode: 'compete',
        players: [TWO[0]!, { ...TWO[1]!, cells: [{ row: 0, col: 0, fill: 'C' }] }],
      }),
      'u1',
    )
    expect(gd.playersById.u2!.board).toBeNull()
  })

  it('a conceded rival\'s grid stays withheld while the others race on', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        mode: 'compete',
        players: [TWO[0]!, { ...TWO[1]!, ...ZTest_CONCEDED, cells: [{ row: 0, col: 0, fill: 'C' }] }],
      }),
      'u1',
    )
    expect(gd.playersById.u2!.board).toBeNull()
  })

  it('once the game has ended, every grid shows', () => {
    const gd = makeGameData(
      ZTest_makeGameDataRaw({
        mode: 'compete',
        players: [TWO[0]!, { ...TWO[1]!, cells: [{ row: 0, col: 0, fill: 'C' }] }],
        ...WON_BY_MOTH,
      }),
      'u1',
    )
    expect(gd.playersById.u2!.board!.cellsById['0,0']!.fill).toBe('C')
  })
})

describe('crosswords useGame', () => {
  it('builds gd from the blob the page was handed', () => {
    const { result } = renderHook(() => useGame(ZTest_makeCrosswordsCtx({ players: TWO })))
    expect(result.current.gd.me.id).toBe('u1')
    expect(result.current.gd.revision).toBe(1)
  })

  it('a game with no blob yet cannot be drawn, and says how to repair it', () => {
    const ctx = { ...ZTest_makeCrosswordsCtx(), gameData: null }
    expect(() => renderHook(() => useGame(ctx))).toThrow(/crosswords\._rebuild_data_cols_for_all/)
  })
})
