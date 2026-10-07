// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildGameEndingMessage } from './gameEndingMessage'
import { buildPlayerEndingMessage } from './playerEndingMessage'

const MOTH = { username: 'moth', color: 'blue' }

describe('buildGameEndingMessage', () => {
  it('going out first, from both sides', () => {
    const won = { gameOutcome: 'won' as const, reason: 'reached_goal' as const, winner: MOTH }
    expect(buildGameEndingMessage({ ...won, playerOutcome: 'won' }))
      .toEqual({ pillText: '🍌 Bananas! You went out first', infoColText: 'You won!', outcome: 'won' })
    expect(buildGameEndingMessage({ ...won, playerOutcome: 'lost' }))
      .toEqual({ pillText: 'moth went out — Bananas!', infoColText: 'moth won', outcome: 'lost' })
  })

  it('the clock ran out on everyone', () => {
    expect(buildGameEndingMessage({
      gameOutcome: 'lost', reason: 'timeout', playerOutcome: 'lost', winner: null,
    })).toEqual({ pillText: "⏰ Time's up — no winner", infoColText: 'Out of time', outcome: 'lost' })
  })

  it('a race every player conceded', () => {
    expect(buildGameEndingMessage({
      gameOutcome: 'lost', reason: 'conceded', playerOutcome: 'lost', winner: null,
    })).toEqual({ pillText: '🏳️ All conceded — no winner', infoColText: 'All conceded', outcome: 'lost' })
  })

  it('a race lost for everyone any other way is a bug', () => {
    expect(() => buildGameEndingMessage({
      gameOutcome: 'lost', reason: 'stopped', playerOutcome: 'lost', winner: null,
    })).toThrow(/BUG/)
  })

  it('a Stop is the shared neutral ending', () => {
    expect(buildGameEndingMessage({
      gameOutcome: 'neutral', reason: 'stopped', playerOutcome: 'neutral', winner: null,
    })).toEqual({ pillText: 'Stopped — no winner', infoColText: 'Stopped', outcome: 'neutral' })
  })
})

describe('buildPlayerEndingMessage', () => {
  it('a player who conceded, while the others race on', () => {
    expect(buildPlayerEndingMessage({ reason: 'conceded', outcome: 'lost' }))
      .toEqual({ pillText: 'Conceded — race continues', infoColText: 'You conceded', outcome: 'lost' })
  })

  it('any other way out early is a bug', () => {
    expect(() => buildPlayerEndingMessage({ reason: 'reached_goal', outcome: 'won' })).toThrow(/BUG/)
  })
})
