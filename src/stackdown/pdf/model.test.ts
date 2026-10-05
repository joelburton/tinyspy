// cs-unmet

/**
 * Tests for the stackdown print model.
 *
 * The renderer is smoke-tested by `e2e/stackdown-print.e2e.ts`. What's pinned
 * here is the judgment — above all the **hidden solution**: stackdown's six
 * words are the game, and a printout is just another view of it, so paper has
 * to withhold them exactly as long as the screen does.
 */

import { describe, expect, it } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import {
  ZTest_hint,
  ZTest_makeGameDataRaw,
  ZTest_SOLUTION,
  ZTest_spoiler,
  ZTest_word,
  ZTest_WORD_TILES,
  type ZTest_GameDataFacts,
} from '../lib/gameData.fixture'
import { buildStackdownPrintModel } from './model'

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
const STOPPED: ZTest_GameDataFacts = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null },
  outcome: 'neutral',
}

/** The model the menu's Print would build, for these facts as `u1` sees them,
 *  the solution on screen or not. */
function printFrom(facts: ZTest_GameDataFacts, solutionShown = true) {
  const gd = makeGameData(ZTest_makeGameDataRaw({ players: TWO, ...facts }), 'u1')
  return buildStackdownPrintModel({
    brand: gd.brand,
    gameTitle: gd.title,
    date: '1 Jan 2026',
    mode: gd.mode,
    ended: gd.ended,
    tiles: gd.puzzle.tiles,
    players: gd.players,
    me: gd.me,
    events: gd.events,
    solution: solutionShown ? gd.puzzle.solution : null,
    nFoundWords: gd.stateLineData.nFoundWords,
    nReqdWords: gd.puzzle.nReqdWords,
    setupRows: gd.setupRows,
  })
}

describe('buildStackdownPrintModel — the hidden solution', () => {
  it('has no six words mid-game', () => {
    expect(printFrom({}).solution).toBeNull()
  })

  it('prints them once the game has ended, in clearing order, while they are on screen', () => {
    expect(printFrom(STOPPED).solution).toEqual(ZTest_SOLUTION)
  })

  it('withholds them once ended while they are put away', () => {
    expect(printFrom(STOPPED, false).solution).toBeNull()
  })
})

describe('buildStackdownPrintModel — the log', () => {
  it('distinguishes the kinds in TEXT, so B&W keeps them apart', () => {
    const m = printFrom({
      events: [
        ZTest_word(1, 'u1', 'eagle'),
        ZTest_word(2, 'u1', 'ebatl', ['10', '5', '11', '6', '2']),
        ZTest_hint(3, 'u1', 'something to eat off'),
        ZTest_spoiler(4, 'u1', 'table'),
      ],
    })
    expect(m.tracks[0]!.turns.map((t) => t.text)).toEqual([
      'EAGLE',
      'EBATL — not a word',
      'Hint: something to eat off',
      'Spoiler: TABLE',
    ])
  })

  it("names the player on coop's shared log", () => {
    const m = printFrom({ events: [ZTest_word(1, 'u1', 'eagle'), ZTest_word(2, 'u2', 'table')] })
    expect(m.tracks[0]!.turns.map((t) => t.who)).toEqual(['me', 'moth'])
  })
})

describe('buildStackdownPrintModel — one track per board', () => {
  const events = [ZTest_word(1, 'u1', 'eagle'), ZTest_word(2, 'u2', 'table')]

  it('coop is ONE shared stack, however many players', () => {
    expect(printFrom({ events }).tracks.map((t) => t.who)).toEqual(['Team'])
  })

  it('compete once ended gives every player their own board and log', () => {
    const m = printFrom({ mode: 'compete', events, ...STOPPED })
    expect(m.tracks.map((t) => t.who)).toEqual(['me (you)', 'moth'])
    expect(m.tracks.map((t) => t.turns.map((r) => r.text))).toEqual([['EAGLE'], ['TABLE']])
    // A compete column's log doesn't name anybody — the heading already did.
    expect(m.tracks.flatMap((t) => t.turns.map((r) => r.who))).toEqual(['', ''])
  })

  it('compete MID-RACE shows only me — a rival is withheld', () => {
    // A column built from rows I can't see would draw a full untouched stack,
    // which reads as "they've cleared nothing" rather than "not yet visible".
    const m = printFrom({ mode: 'compete', events })
    expect(m.tracks.map((t) => t.who)).toEqual(['You'])
    expect(m.tracks[0]!.turns.map((r) => r.text)).toEqual(['EAGLE'])
  })

  it('each compete board reflects only ITS OWN cleared tiles', () => {
    const m = printFrom({ mode: 'compete', events: [ZTest_word(1, 'u1', 'eagle')], ...STOPPED })
    const eagle = new Set(ZTest_WORD_TILES.eagle)
    expect(m.tracks[0]!.tiles).toHaveLength(25)
    expect(m.tracks[0]!.tiles.some((t) => eagle.has(t.id))).toBe(false)
    // moth played nothing, so their stack is untouched.
    expect(m.tracks[1]!.tiles).toHaveLength(30)
  })

  it('restores a CLEARED board, and leaves an uncleared one where it stopped', () => {
    const all = ZTest_SOLUTION.map((w, i) => ZTest_word(i + 1, 'u1', w))
    const cleared = printFrom({
      events: all,
      ending: { reason: 'reached_goal', detail: 'cleared', by: 'u1', winner: null },
      outcome: 'won',
    })
    // Every tile gone => put them all back; a blank page is nothing to review.
    expect(cleared.tracks[0]!.tiles).toHaveLength(30)

    const stopped = printFrom({ events: all.slice(0, 2), ...STOPPED })
    expect(stopped.tracks[0]!.tiles).toHaveLength(20)
  })
})

describe('buildStackdownPrintModel — summary', () => {
  it('reports words cleared and stack remaining', () => {
    expect(printFrom({ events: [ZTest_word(1, 'u1', 'eagle')] }).summary)
      .toBe('1/6 words cleared · 25 tiles left')
  })

  it('says "1 tile", not "1 tiles"', () => {
    // No real stack stops at one tile — words clear five — so the board is
    // handed in directly.
    const gd = makeGameData(ZTest_makeGameDataRaw(), 'u1')
    const m = buildStackdownPrintModel({
      ...{ brand: gd.brand, gameTitle: gd.title, date: '1 Jan 2026', mode: gd.mode },
      ended: false,
      tiles: gd.puzzle.tiles,
      players: gd.players,
      me: { ...gd.me, board: { tiles: gd.puzzle.tiles.slice(0, 1) } },
      events: [],
      solution: null,
      nFoundWords: 0,
      nReqdWords: 6,
      setupRows: gd.setupRows,
    })
    expect(m.summary).toContain('1 tile left')
  })

  it('drops the tile count in compete — several boards, no single number', () => {
    expect(printFrom({ mode: 'compete', events: [ZTest_word(1, 'u1', 'eagle')] }).summary)
      .toBe('1/6 words cleared')
  })
})
