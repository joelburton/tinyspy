// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildGameEndingMessage } from './gameEndingMessage'
import { buildPlayerEndingMessage } from './playerEndingMessage'

const COOP = { mode: 'coop' as const, teamScore: 312, winners: [] }
const RACE = { mode: 'compete' as const, teamScore: null }
const ADA = { username: 'ada', color: 'red' }
const BEA = { username: 'bea', color: 'blue' }

describe('buildGameEndingMessage — coop', () => {
  it('the bag played out is a win that says Completed, with the score', () => {
    expect(buildGameEndingMessage({
      ...COOP, gameOutcome: 'won', reason: 'resource_exhausted', playerOutcome: 'won',
    })).toEqual({ pillText: 'Completed', infoColText: '312 pts', outcome: 'won' })
  })

  it('the clock is the loss', () => {
    expect(buildGameEndingMessage({
      ...COOP, gameOutcome: 'lost', reason: 'timeout', playerOutcome: 'lost',
    })).toEqual({ pillText: 'Lost: out of time', infoColText: '312 pts', outcome: 'lost' })
  })

  it('a Stop is the shared neutral ending', () => {
    expect(buildGameEndingMessage({
      ...COOP, gameOutcome: 'neutral', reason: 'stopped', playerOutcome: 'neutral',
    })).toEqual({ pillText: 'Stopped', infoColText: 'Stopped', outcome: 'neutral' })
  })
})

describe('buildGameEndingMessage — compete', () => {
  it('a lone winner, from both sides — the loser\'s pill names them', () => {
    const won = { ...RACE, gameOutcome: 'won' as const, reason: 'resource_exhausted' as const, winners: [ADA] }
    expect(buildGameEndingMessage({ ...won, playerOutcome: 'won' }))
      .toEqual({ pillText: 'You won', infoColText: 'You won!', outcome: 'won' })
    expect(buildGameEndingMessage({ ...won, playerOutcome: 'near' }))
      .toEqual({ pillText: 'won', infoColText: 'ada won', outcome: 'near', actor: ADA })
  })

  it('a tie is a win for every tied player, and names them all to the rest', () => {
    const tied = { ...RACE, gameOutcome: 'won' as const, reason: 'all_passed' as const, winners: [ADA, BEA] }
    expect(buildGameEndingMessage({ ...tied, playerOutcome: 'won' }))
      .toEqual({ pillText: 'Tied', infoColText: 'Tied', outcome: 'won' })
    expect(buildGameEndingMessage({ ...tied, playerOutcome: 'near' }))
      .toEqual({ pillText: 'ada & bea won', infoColText: 'ada & bea won', outcome: 'near' })
  })

  it('a race every player conceded', () => {
    expect(buildGameEndingMessage({
      ...RACE, gameOutcome: 'lost', reason: 'conceded', playerOutcome: 'lost', winners: [],
    })).toEqual({ pillText: 'All conceded', infoColText: 'All conceded', outcome: 'lost' })
  })

  it('a race lost for everyone any other way is a bug', () => {
    expect(() => buildGameEndingMessage({
      ...RACE, gameOutcome: 'lost', reason: 'timeout', playerOutcome: 'lost', winners: [],
    })).toThrow(/BUG/)
  })

  it('a Stop is the shared neutral ending', () => {
    expect(buildGameEndingMessage({
      ...RACE, gameOutcome: 'neutral', reason: 'stopped', playerOutcome: 'neutral', winners: [],
    })).toEqual({ pillText: 'Stopped — no winner', infoColText: 'Stopped', outcome: 'neutral' })
  })
})

describe('buildPlayerEndingMessage', () => {
  it('a player who conceded, while the others play on', () => {
    expect(buildPlayerEndingMessage({ reason: 'conceded', outcome: 'lost' }))
      .toEqual({ pillText: 'Conceded — race continues', infoColText: 'You conceded', outcome: 'lost' })
  })
})
