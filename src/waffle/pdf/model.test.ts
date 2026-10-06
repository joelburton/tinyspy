// cs-unmet

/**
 * Tests for the waffle print model.
 *
 * The judgment: a compete track must carry ONE player's board beside THAT
 * player's swaps. Printing a board next to a log that doesn't belong to it is
 * worse than printing nothing — it looks authoritative and is wrong. Plus the
 * solution, which is printed only once it is on screen, as on screen.
 */
import { describe, expect, it } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import {
  ZTest_DEALT,
  ZTest_SOLVED,
  ZTest_makeGameDataRaw,
  ZTest_swap,
  type ZTest_GameDataFacts,
} from '../lib/gameData.fixture'
import { buildWafflePrintModel } from './model'

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
const ENDED: ZTest_GameDataFacts = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1', winner: null },
  outcome: 'neutral',
}

/** The model for a game from its facts, as `useActionsAndMenu` builds it. */
function makeModel(facts: ZTest_GameDataFacts = {}, answerShown = false) {
  const gd = makeGameData(ZTest_makeGameDataRaw({ mode: 'compete', players: TWO, ...facts }), 'u1')
  return buildWafflePrintModel({
    brand: 'SyrupSwap', gameTitle: 'Board 1', date: '1 Jan 2026',
    mode: gd.mode,
    isGameEnded: gd.ended,
    maxSwaps: gd.me.maxSwaps,
    parSwaps: gd.puzzle.parSwaps,
    players: gd.players,
    events: gd.events,
    myId: gd.me.id,
    solution: gd.puzzle.solution,
    answerShown,
    setupRows: [{ key: 'extra_swaps', label: 'Extra swaps', value: '5' }],
  })
}

describe('buildWafflePrintModel — the solution is a secret', () => {
  it('has none to print mid-game', () => {
    expect(makeModel({}, true).solutionWords).toBeNull()
  })

  it('withholds it on an ended game — ended is not enough', () => {
    // Same rule as wordle's: waffle hides the solution on a loss, and paper has
    // to hold the same line.
    expect(makeModel(ENDED).solutionWords).toBeNull()
  })

  it('prints it once the answer is legitimately shown (solved or revealed)', () => {
    // 'abcdef.g.hijklmn.o.pqrstu': three across, then three down.
    expect(makeModel(ENDED, true).solutionWords).toEqual(
      ['abcde', 'ijklm', 'qrstu', 'afinq', 'cgkos', 'ehmpu'],
    )
  })
})

describe('buildWafflePrintModel — the board', () => {
  it('prints holes as blank, letterless cells', () => {
    const m = makeModel()
    // Holes are 6, 8, 16, 18 — not part of the puzzle, so no box and no letter.
    for (const h of [6, 8, 16, 18]) {
      expect(m.tracks[0].cells[h]).toEqual({ letter: '', state: 'blank', hole: true })
    }
  })

  it('keeps the 5×5 shape (holes included) so the waffle reads', () => {
    expect(makeModel().tracks[0].cells).toHaveLength(25)
  })
})

describe('buildWafflePrintModel — tracks', () => {
  it('coop is ONE shared track whose log names each swapper, with the team’s count', () => {
    const m = makeModel({ mode: 'coop', events: [ZTest_swap(1, 'u2', [2, 3], ZTest_DEALT, ZTest_DEALT)] })
    expect(m.tracks).toHaveLength(1)
    expect(m.tracks[0].who).toBe('Team')
    expect(m.tracks[0].turns[0].who).toBe('moth')
    expect(m.tracks[0].turns[0].text).toBe('C (C1) <-> D (D1)')
    expect(m.tracks[0].result).toBe('1/6 swaps used')
  })

  it('compete mid-game prints ONLY my board', () => {
    expect(makeModel().tracks.map((t) => t.who)).toEqual(['You'])
  })

  it('compete once ended gives each player their OWN swaps, not the pooled log', () => {
    const m = makeModel({
      ...ENDED,
      events: [
        ZTest_swap(1, 'u1', [0, 1], ZTest_DEALT, ZTest_DEALT),
        ZTest_swap(2, 'u2', [4, 5], ZTest_DEALT, ZTest_DEALT),
        ZTest_swap(3, 'u1', [2, 3], ZTest_DEALT, ZTest_DEALT),
      ],
    })
    expect(m.tracks.map((t) => t.who)).toEqual(['me (you)', 'moth'])
    expect(m.tracks[0].turns).toHaveLength(2)
    expect(m.tracks[1].turns).toHaveLength(1)
    // A compete track is one person's, so the rows don't repeat their name.
    expect(m.tracks[0].turns[0].who).toBe('')
  })

  it('reports each track’s own outcome', () => {
    const m = makeModel({
      ...ENDED,
      players: [
        { ...TWO[0]!, nSwapsUsed: 1, solvedAt: '2026-01-01T00:00:00Z', board: ZTest_SOLVED },
        { ...TWO[1]!, nSwapsUsed: 6 },
      ],
    })
    expect(m.tracks[0].result).toBe('Solved in 1 swap')
    expect(m.tracks[1].result).toBe('6/6 swaps used')
  })
})
