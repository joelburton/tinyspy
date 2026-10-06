// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildGameEndingMessage } from './gameEndingMessage'
import { buildPlayerEndingMessage } from './playerEndingMessage'

const COOP = { mode: 'coop' as const, winnerNames: [], nWinnerSets: null }
const RACE = { mode: 'compete' as const, nTilesLeft: 6 }

describe('buildGameEndingMessage — coop', () => {
  it('a clear that strands tiles is an ordinary win, said without the leftovers', () => {
    expect(buildGameEndingMessage({
      ...COOP, gameOutcome: 'won', reason: 'reached_goal', playerOutcome: 'won', nSetsFound: 24, nTilesLeft: 9,
    })).toEqual({ pillText: 'Won: all sets found, 24 sets', infoColText: 'All sets found', outcome: 'won' })
  })

  it('an empty table is a perfect clear', () => {
    expect(buildGameEndingMessage({
      ...COOP, gameOutcome: 'won', reason: 'reached_goal', playerOutcome: 'won', nSetsFound: 27, nTilesLeft: 0,
    })).toEqual({ pillText: 'Won: the whole deck, 27 sets', infoColText: 'A perfect clear!', outcome: 'won' })
  })

  it('the clock is the loss, and says what the table got', () => {
    expect(buildGameEndingMessage({
      ...COOP, gameOutcome: 'lost', reason: 'timeout', playerOutcome: 'lost', nSetsFound: 1, nTilesLeft: 12,
    })).toEqual({ pillText: 'Lost: out of time, 1 set', infoColText: '1 set found', outcome: 'lost' })
  })

  it('a Stop says what the table got, with no verdict', () => {
    expect(buildGameEndingMessage({
      ...COOP, gameOutcome: 'neutral', reason: 'stopped', playerOutcome: 'neutral', nSetsFound: 9, nTilesLeft: 12,
    })).toEqual({ pillText: 'Ended: 9 sets', infoColText: '9 sets found', outcome: 'neutral' })
  })
})

describe('buildGameEndingMessage — compete', () => {
  it('a lone winner, from both sides', () => {
    const won = { ...RACE, gameOutcome: 'won' as const, reason: 'resource_exhausted' as const, nSetsFound: 24, winnerNames: ['ada'], nWinnerSets: 14 }
    expect(buildGameEndingMessage({ ...won, playerOutcome: 'won' }))
      .toEqual({ pillText: 'Won: 14 sets', infoColText: 'You won!', outcome: 'won' })
    expect(buildGameEndingMessage({ ...won, playerOutcome: 'lost' }))
      .toEqual({ pillText: 'ada won with 14', infoColText: 'ada won', outcome: 'lost' })
  })

  it('a tie names every winner — there is no speed tiebreak', () => {
    const tied = { ...RACE, gameOutcome: 'won' as const, reason: 'timeout' as const, nSetsFound: 24, winnerNames: ['ada', 'bea'], nWinnerSets: 12 }
    expect(buildGameEndingMessage({ ...tied, playerOutcome: 'won' }))
      .toEqual({ pillText: 'Won: tied on 12', infoColText: 'You tied for the win!', outcome: 'won' })
    expect(buildGameEndingMessage({ ...tied, playerOutcome: 'lost' }))
      .toEqual({ pillText: 'ada & bea tied on 12', infoColText: 'ada & bea tied', outcome: 'lost' })
  })

  it('a race nobody won says why', () => {
    const lost = { ...RACE, gameOutcome: 'lost' as const, playerOutcome: 'lost' as const, nSetsFound: 0, winnerNames: [], nWinnerSets: null }
    expect(buildGameEndingMessage({ ...lost, reason: 'conceded' }))
      .toEqual({ pillText: 'Lost: all conceded', infoColText: 'All conceded', outcome: 'lost' })
    expect(buildGameEndingMessage({ ...lost, reason: 'timeout' }))
      .toEqual({ pillText: 'Lost: nobody found a set', infoColText: 'Nobody scored', outcome: 'lost' })
  })
})

describe('buildPlayerEndingMessage', () => {
  it('a racer who conceded, while the others play on', () => {
    expect(buildPlayerEndingMessage({ reason: 'conceded', outcome: 'lost' }))
      .toEqual({ pillText: 'Conceded — race continues', infoColText: 'You conceded', outcome: 'lost' })
  })
})
