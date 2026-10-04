// cs-unmet

/**
 * The sentences a finished bee game says, for every ending the server writes:
 * the three coop outcomes, and in compete the win from either side, the two
 * collective losses told apart by the reason, and the Stop.
 */
import { describe, expect, it } from 'vitest'
import type { BeePlayer } from './beeGameData'
import { buildBeeGameEndingMessage, buildBeePlayerEndingMessage } from './endingMessage'

/** 47 of 50 points is rank 5 (Amazing); the target is rank 6 (Genius). */
const stateLineData = { nFoundWords: 20, foundWordsScore: 47, rankIdx: 5, targetRankIdx: 6, nReqdWords: 30, reqdWordsScore: 50 }
const alice = { id: 'u2', username: 'alice', color: 'blue' } as BeePlayer

describe('coop', () => {
  it('a win names the rank the team set out for, not the one it reached', () => {
    expect(buildBeeGameEndingMessage({
      mode: 'coop', gameEnding: { outcome: 'won', reason: 'reached_goal' }, playerOutcome: 'won', winner: null, stateLineData,
    })).toEqual({ pillText: 'Won: "Genius" 47/50 points', infoColText: 'You won!', outcome: 'won' })
  })

  it('a loss is the clock beating an unreached target', () => {
    expect(buildBeeGameEndingMessage({
      mode: 'coop', gameEnding: { outcome: 'lost', reason: 'timeout' }, playerOutcome: 'lost', winner: null, stateLineData,
    })).toEqual({ pillText: 'Lost: ran out of time', infoColText: 'Out of time', outcome: 'lost' })
  })

  it('an ending is neutral and names the rank reached, whatever it is', () => {
    for (const reason of ['timeout', 'stopped'] as const) {
      expect(buildBeeGameEndingMessage({
        mode: 'coop', gameEnding: { outcome: 'neutral', reason }, playerOutcome: 'neutral', winner: null,
        stateLineData: { ...stateLineData, targetRankIdx: null },
      })).toEqual({ pillText: 'Ended: Amazing 47/50 points', infoColText: 'Amazing', outcome: 'neutral' })
    }
  })
})

describe('compete', () => {
  const won = { outcome: 'won', reason: 'reached_goal' } as const

  it('my win names the target rank', () => {
    expect(buildBeeGameEndingMessage({ mode: 'compete', gameEnding: won, playerOutcome: 'won', winner: alice, stateLineData }))
      .toEqual({ pillText: 'Won: "Genius" 47/50 points', infoColText: 'You won!', outcome: 'won' })
  })

  it("somebody else's win names them as the actor, with no Lost prefix", () => {
    expect(buildBeeGameEndingMessage({ mode: 'compete', gameEnding: won, playerOutcome: 'lost', winner: alice, stateLineData }))
      .toEqual({ pillText: 'won at "Genius"', infoColText: 'alice won', outcome: 'lost', actor: alice })
  })

  it('the two collective losses are told apart by the reason', () => {
    expect(buildBeeGameEndingMessage({
      mode: 'compete', gameEnding: { outcome: 'lost', reason: 'conceded' }, playerOutcome: 'lost', winner: null, stateLineData,
    })).toEqual({ pillText: 'Lost: all conceded', infoColText: 'All conceded', outcome: 'lost' })
    expect(buildBeeGameEndingMessage({
      mode: 'compete', gameEnding: { outcome: 'lost', reason: 'timeout' }, playerOutcome: 'lost', winner: null, stateLineData,
    })).toEqual({ pillText: 'Lost: ran out of time', infoColText: 'Out of time', outcome: 'lost' })
  })

  it('a Stop is the shared neutral sentence', () => {
    expect(buildBeeGameEndingMessage({
      mode: 'compete', gameEnding: { outcome: 'neutral', reason: 'stopped' }, playerOutcome: 'neutral', winner: null, stateLineData,
    }).outcome).toBe('neutral')
  })
})

describe('a player who ended while the race goes on', () => {
  it('conceded', () => {
    expect(buildBeePlayerEndingMessage({ reason: 'conceded', outcome: 'lost' }))
      .toEqual({ pillText: 'Conceded — race continues', infoColText: 'You conceded', outcome: 'lost' })
  })
})
