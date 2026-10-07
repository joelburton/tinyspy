// cs-blessed-codenamesduet

/**
 * Tests for the codenamesduet print model.
 *
 * The renderer is smoke-tested by `e2e/codenamesduet-print.e2e.ts`. What's
 * pinned here is the judgment, and the load-bearing item is the **partner's
 * key**: it's the secret the whole game rests on, so paper must not carry it a
 * moment before the screen does.
 *
 * Built on the fixture, so `gd` is what the page would hold: me (`u1`, seat A,
 * agents at 0–8, the assassin at 9) and leah (`u2`, seat B).
 */

import { describe, expect, it } from 'vitest'
import { makeGameData } from '../hooks/useGame'
import {
  ZTest_clue,
  ZTest_guess,
  ZTest_makeGameDataRaw,
  type ZTest_GameDataFacts,
} from '../lib/gameData.fixture'
import { buildCodenamesduetPrintModel } from './model'

const ENDED: ZTest_GameDataFacts = {
  ending: { reason: 'stopped', detail: 'stopped', by: 'u1' },
  outcome: 'neutral',
}

/** The model of a game from these facts, seen by `viewer`. */
function modelOf(facts: ZTest_GameDataFacts = {}, partnerKeyShown = false, viewer = 'u1') {
  return buildCodenamesduetPrintModel({
    date: '1 Jan 2026',
    gd: makeGameData(ZTest_makeGameDataRaw(facts), viewer),
    partnerKeyShown,
  })
}

describe('buildCodenamesduetPrintModel — the partner key is a secret', () => {
  it('withholds it mid-game, even when asked for', () => {
    const m = modelOf({}, true)
    expect(m.showsBothKeys).toBe(false)
    expect(m.tiles.every((c) => c.partner === null)).toBe(true)
  })

  it('prints it once the game has ended and I asked to see it', () => {
    const m = modelOf(ENDED, true)
    expect(m.showsBothKeys).toBe(true)
    expect(m.tiles[15]!.partner).toBe('assassin')
    expect(m.tiles[10]!.partner).toBe('agent')
  })

  it('keeps it back at the end until I ask', () => {
    expect(modelOf(ENDED, false).showsBothKeys).toBe(false)
  })

  it('still shows MY key mid-game — that is the point of the printout', () => {
    const m = modelOf()
    expect(m.tiles[0]!.mine).toBe('agent')
    expect(m.tiles[9]!.mine).toBe('assassin')
  })
})

describe('buildCodenamesduetPrintModel — what happened on a tile', () => {
  const facts: ZTest_GameDataFacts = {
    turnNum: 2,
    events: [
      ZTest_clue(1, 'u1', 1, 'ocean', 2),
      ZTest_guess(2, 'u2', 1, 0, 'G'),
      ZTest_guess(3, 'u2', 1, 20, 'N'),
    ],
  }

  it('maps what a tile shows', () => {
    const m = modelOf(facts)
    expect(m.tiles[0]!.revealed).toBe('agent')
    expect(m.tiles[20]!.revealed).toBe('neutral')
  })

  it('leaves an untouched word revealing nothing', () => {
    expect(modelOf(facts).tiles[5]!.revealed).toBeNull()
  })
})

describe('buildCodenamesduetPrintModel — the bystander triangles', () => {
  const facts: ZTest_GameDataFacts = {
    turnNum: 3,
    clueSeat: 'A',
    events: [
      ZTest_clue(1, 'u2', 1, 'x', 1),
      ZTest_guess(2, 'u1', 1, 20, 'N'),
      ZTest_clue(3, 'u1', 2, 'y', 1),
      ZTest_guess(4, 'u2', 2, 21, 'N'),
    ],
  }

  it('keeps mine and my partner’s apart', () => {
    // The asymmetry is the point: a word my partner burned is still mine to
    // guess; one I burned is locked to me.
    const m = modelOf(facts)
    expect([m.tiles[20]!.burnedByMe, m.tiles[20]!.burnedByPartner]).toEqual([true, false])
    expect([m.tiles[21]!.burnedByMe, m.tiles[21]!.burnedByPartner]).toEqual([false, true])
  })

  it('flips with who is looking', () => {
    const m = modelOf(facts, false, 'u2')
    expect([m.tiles[20]!.burnedByMe, m.tiles[20]!.burnedByPartner]).toEqual([false, true])
  })
})

describe('buildCodenamesduetPrintModel — the clue log', () => {
  it('reads a turn as its clue plus what the clue actually got', () => {
    const m = modelOf({
      events: [ZTest_clue(1, 'u1', 1, 'ocean', 2), ZTest_guess(2, 'u2', 1, 0, 'G'), ZTest_guess(3, 'u2', 1, 1, 'G')],
    })
    // '»', not '→': jsPDF's core fonts are WinAnsi, which has the guillemet but
    // not the arrow (U+2192 printed as `!'`). Verified by rendering.
    expect(m.turns[0]).toEqual({ seq: 1, who: 'me', text: 'OCEAN 2 » WORD0, WORD1' })
  })

  it('shows a clue that got nothing as just the clue', () => {
    const m = modelOf({ clueSeat: 'B', events: [ZTest_clue(1, 'u2', 1, 'ocean', 2)] })
    expect(m.turns[0]).toEqual({ seq: 1, who: 'leah', text: 'OCEAN 2' })
  })

  it('prints each sudden-death guess as its own row, after the clues, under its guesser', () => {
    const m = modelOf({
      turnNum: 12,
      clueSeat: null,
      events: [ZTest_clue(1, 'u1', 1, 'ocean', 2), ZTest_guess(2, 'u1', 10, 2, 'G'), ZTest_guess(3, 'u2', 11, 3, 'G')],
    })
    expect(m.turns.slice(1)).toEqual([
      { seq: 10, who: 'me', text: 'SUDDEN DEATH » WORD2' },
      { seq: 11, who: 'leah', text: 'SUDDEN DEATH » WORD3' },
    ])
  })
})

describe('buildCodenamesduetPrintModel — summary', () => {
  // Three agents found in the first three turns, during turn 4.
  const PLAYED = [
    ZTest_guess(1, 'u2', 1, 0, 'G'),
    ZTest_guess(2, 'u2', 2, 1, 'G'),
    ZTest_guess(3, 'u2', 3, 2, 'G'),
  ]

  it('mirrors the on-screen readout: the turns used, during turn 4', () => {
    expect(modelOf({ turnNum: 4, events: PLAYED }).summary).toBe('3/15 agents contacted · 3/9 turns spent')
  })

  it('counts the turn a game ended on', () => {
    expect(modelOf({ turnNum: 3, events: PLAYED, ...ENDED }).summary).toBe(
      '3/15 agents contacted · 3/9 turns spent',
    )
  })

  it('says sudden death once the budget is gone, and still after such a game has ended', () => {
    expect(modelOf({ turnNum: 11, clueSeat: null, events: PLAYED }).summary).toBe(
      '3/15 agents contacted · sudden death',
    )
    expect(modelOf({ turnNum: 11, clueSeat: null, events: PLAYED, ...ENDED }).summary).toBe(
      '3/15 agents contacted · sudden death',
    )
  })
})
