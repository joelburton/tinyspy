// cs-unmet

/**
 * Tests for the wordiply print model.
 *
 * The renderer is smoke-tested end to end by `e2e/wordiply-print.e2e.ts` (jsPDF's
 * runtime is unreachable from a mocked component test). What's worth pinning
 * HERE is the judgment the model makes, and above all the one rule paper has to
 * keep: wordiply withholds the length score, the letter count and the longest
 * possible word until the end, and a printout is just another view of the same
 * game — so paper has to withhold them too.
 *
 * The model is fed what `gd` holds, built from the fixture's blob.
 */

import { describe, expect, it } from 'vitest'
import { buildWordiplyPrintModel } from './model'
import { makeGameData } from '../hooks/useGame'
import { ZTest_guess, ZTest_makeGameDataRaw, type ZTest_GameDataFacts } from '../lib/gameData.fixture'

const TWO = [
  { id: 'u1', username: 'me', color: 'red' },
  { id: 'u2', username: 'moth', color: 'blue' },
]
const STOPPED: Pick<ZTest_GameDataFacts, 'ending' | 'outcome'> = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
  outcome: 'neutral',
}

/** The model a print would build, viewed by me (u1), on a board whose longest
 *  possible word is HANGARING (9). */
function modelOf(facts: ZTest_GameDataFacts, solutionShown = false) {
  const gd = makeGameData(
    ZTest_makeGameDataRaw({ players: TWO, maxWordLen: 9, longestWords: ['hangaring'], ...facts }),
    'u1',
  )
  return buildWordiplyPrintModel({
    brand: gd.brand,
    gameTitle: gd.title,
    date: '1 Jan 2026',
    mode: gd.mode,
    isGameEnded: gd.ended,
    puzzle: gd.puzzle,
    solutionShown,
    events: gd.events,
    players: gd.players,
    me: gd.me,
    track: gd.me,
    setupRows: gd.setupRows,
  })
}

describe('buildWordiplyPrintModel — the end-only rule', () => {
  it('withholds the scores MID-GAME', () => {
    const m = modelOf({ events: [ZTest_guess(1, 'u1', 'hangars'), ZTest_guess(2, 'u1', 'cars')] })
    expect(m.summary).toBe('Starter AR · 2 / 5 guesses')
    expect(m.summary).not.toMatch(/%|letters/)
    expect(m.scores).toEqual([])
  })

  it('shows the scores once the game has ended', () => {
    // hangars (7) + cars (4): 11 letters, the longest 7 of 9.
    const m = modelOf({ events: [ZTest_guess(1, 'u1', 'hangars'), ZTest_guess(2, 'u1', 'cars')], ...STOPPED })
    expect(m.summary).toBe('Starter AR · Length score 78% · 11 letters across 2 guesses')
  })

  it('prints the best possible word only while it is revealed on screen', () => {
    expect(modelOf({ ...STOPPED }).reveal).toBeNull()
    expect(modelOf({ ...STOPPED }, true).reveal).toEqual({ word: 'HANGARING', length: 9 })
  })

  it('says "1 guess", not "1 guesses"', () => {
    const m = modelOf({ events: [ZTest_guess(1, 'u1', 'cars')], ...STOPPED })
    expect(m.summary).toContain('across 1 guess')
    expect(m.summary).not.toContain('1 guesses')
  })
})

describe('buildWordiplyPrintModel — the event log', () => {
  it('prints rejects alongside accepted guesses, each with its reason', () => {
    const m = modelOf({
      events: [
        ZTest_guess(1, 'u1', 'hangars'),
        ZTest_guess(2, 'u1', 'arqqq', 'not_a_word'),
        ZTest_guess(3, 'u1', 'zzzz', 'missing_base'),
        ZTest_guess(4, 'u1', 'ar', 'too_short'),
      ],
    })
    expect(m.turns.map((t) => t.text)).toEqual([
      'HANGARS (7)',
      'ARQQQ — not a word',
      'ZZZZ — no base',
      'AR — too short',
    ])
  })

  it('numbers by LOG POSITION — a reject occupies no board line', () => {
    const m = modelOf({
      events: [
        ZTest_guess(1, 'u1', 'hangars'),
        ZTest_guess(2, 'u1', 'arqqq', 'not_a_word'),
        // Board line 2 — but the third thing that happened.
        ZTest_guess(3, 'u1', 'arcs'),
      ],
    })
    expect(m.turns.map((t) => t.seq)).toEqual([1, 2, 3])
  })

  it('names the guesser on every row', () => {
    const m = modelOf({ events: [ZTest_guess(1, 'u1', 'arcs'), ZTest_guess(2, 'u2', 'arbs')] })
    expect(m.turns.map((t) => t.who)).toEqual(['me', 'moth'])
  })
})

describe('buildWordiplyPrintModel — compete', () => {
  const RACE = [
    ZTest_guess(1, 'u2', 'arcs'),
    ZTest_guess(2, 'u1', 'arbs'),
    ZTest_guess(3, 'u2', 'arts'),
    ZTest_guess(4, 'u1', 'army'),
  ]

  it('groups the log by player (me first), not chronologically', () => {
    // Compete tracks are PARALLEL races — interleaving them by time reads as
    // nonsense, so each player's run stays a contiguous block. Once the race
    // has ended, everyone's rows are mine to see.
    const m = modelOf({ mode: 'compete', events: RACE, ...STOPPED })
    expect(m.turns.map((t) => t.who)).toEqual(['me', 'me', 'moth', 'moth'])
    // …and within a player, still in play order.
    expect(m.turns.map((t) => t.text)).toEqual(['ARBS (4)', 'ARMY (4)', 'ARCS (4)', 'ARTS (4)'])
  })

  it('keeps coop in play order (one shared sequence)', () => {
    const m = modelOf({ events: RACE })
    expect(m.turns.map((t) => t.who)).toEqual(['moth', 'me', 'moth', 'me'])
  })

  it('builds the per-player scores block once ended, marking the winner', () => {
    const m = modelOf({
      mode: 'compete',
      events: [ZTest_guess(1, 'u1', 'cars'), ZTest_guess(2, 'u2', 'hangars')],
      players: [TWO[0]!, { ...TWO[1]!, outcome: 'won', finalRanking: 1 }],
      ending: { reason: 'resource_exhausted', detail: 'complete', by: 'u2' },
      outcome: 'won',
    })
    expect(m.scores).toEqual([
      { who: 'me', lengthScore: 44, nLetters: 4, won: false },
      { who: 'moth', lengthScore: 78, nLetters: 7, won: true },
    ])
  })

  it('has no scores block in coop (the header summary carries the one result)', () => {
    expect(modelOf({ ...STOPPED }).scores).toEqual([])
  })
})
