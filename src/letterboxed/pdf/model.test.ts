// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildLetterboxedPrintModel } from './model'
import { makeGameData } from '../hooks/useGame'
import {
  ZTest_event,
  ZTest_makeGameDataRaw,
  type ZTest_GameDataFacts,
} from '../lib/gameData.fixture'

const TWO = [
  { id: 'u1', username: 'alice' },
  { id: 'u2', username: 'bea' },
]

/** The model as the print action builds it, from `gd` as alice sees it. */
function buildModelFor(facts: ZTest_GameDataFacts, solutionRevealed = false) {
  const gd = makeGameData(ZTest_makeGameDataRaw(facts), 'u1')
  return buildLetterboxedPrintModel({
    brand: 'SnakeBox',
    gameTitle: 'ABC-DEF-GHI-JKL',
    date: '5 Aug 2026',
    sides: 'abcdefghijkl',
    mode: gd.mode,
    solution: gd.puzzle.solution,
    solutionRevealed,
    players: gd.players,
    events: gd.events,
    summary: '3/12 letters · 1/5 words',
    setupRows: [{ key: 'legal_band', label: 'Dictionary', value: '5 (Obscure)' }],
  })
}

const STOPPED = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
  outcome: 'neutral',
} as const

describe('buildLetterboxedPrintModel', () => {
  it('coop prints ONE track, for the board rather than a person', () => {
    const m = buildModelFor({
      players: TWO,
      chain: ['adg'],
      events: [ZTest_event(1, 'u1', 'word', 'adg', 3)],
    })
    expect(m.tracks).toHaveLength(1)
    expect(m.tracks[0].who).toBe('Team')
    expect(m.tracks[0].chain).toEqual(['adg'])
  })

  it('compete prints one track per player, each with only their own moves', () => {
    const m = buildModelFor({
      mode: 'compete',
      players: [{ ...TWO[0]!, chain: ['adg'] }, { ...TWO[1]!, chain: ['gjb', 'beh'] }],
      events: [
        ZTest_event(1, 'u1', 'word', 'adg', 3),
        ZTest_event(2, 'u2', 'word', 'gjb', 3),
        ZTest_event(3, 'u2', 'word', 'beh', 5),
      ],
      ...STOPPED,
    })
    expect(m.tracks.map((t) => t.who)).toEqual(['alice', 'bea'])
    expect(m.tracks[0].turns).toHaveLength(1)
    expect(m.tracks[1].turns).toHaveLength(2)
  })

  it('omits a compete rival whose chain is still withheld', () => {
    // Mid-race the seat rule nulls a rival's chain, so their column would be a
    // blank board — printing only what the viewer may see is the honest thing.
    const m = buildModelFor({
      mode: 'compete',
      players: [{ ...TWO[0]!, chain: ['adg'] }, { ...TWO[1]!, chain: ['gjb'] }],
      events: [ZTest_event(1, 'u1', 'word', 'adg', 3)],
    })
    expect(m.tracks.map((t) => t.who)).toEqual(['alice'])
  })

  it('DOES NOT print the solution until it has been revealed on screen', () => {
    const facts = { chain: ['adg'], ...STOPPED }
    expect(buildModelFor(facts, false).solution).toBeNull()
    expect(buildModelFor(facts, true).solution).toEqual(['adgjbehk', 'kcfil'])
  })

  it('marks exactly the letters the chain covered', () => {
    const m = buildModelFor({ chain: ['adg', 'gjb'] })
    expect([...m.tracks[0].covered].sort()).toEqual(['a', 'b', 'd', 'g', 'j'])
  })

  it('keeps retreats, hints and spoilers in the printed log', () => {
    const m = buildModelFor({
      events: [
        ZTest_event(1, 'u1', 'undo', 'adg', 0),
        ZTest_event(2, 'u1', 'hint', 'kcfil', 0),
        ZTest_event(3, 'u1', 'spoiler', 'kcfil', 0),
      ],
    })
    expect(m.tracks[0].turns.map((t) => t.text)).toEqual([
      'took back ADG',
      'took a hint',
      'was shown KCFIL',
    ])
  })
})
