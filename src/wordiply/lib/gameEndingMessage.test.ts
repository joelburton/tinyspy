// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildGameEndingMessage } from './gameEndingMessage'

/** Every ending wordiply says something about, and the words it says. */
describe('wordiply buildGameEndingMessage', () => {
  const coop = { mode: 'coop' as const, teamScores: { lengthScore: 71, nLetters: 8 }, winner: null }
  const race = { mode: 'compete' as const, teamScores: null }
  const moth = { username: 'moth', color: 'blue', lengthScore: 78 }

  it('coop: the five words spent is a win, worded Ended, with the scores', () => {
    expect(buildGameEndingMessage({
      ...coop,
      gameEnding: { outcome: 'won', reason: 'resource_exhausted' },
      playerOutcome: 'won',
    })).toEqual({ pillText: 'Ended: 71%, 8 letters', infoColText: 'Length 71%', outcome: 'won' })
  })

  it('coop: a Stop reads the same, in its own color', () => {
    expect(buildGameEndingMessage({
      ...coop,
      gameEnding: { outcome: 'neutral', reason: 'stopped' },
      playerOutcome: 'neutral',
    })).toEqual({ pillText: 'Ended: 71%, 8 letters', infoColText: 'Length 71%', outcome: 'neutral' })
  })

  it('coop: a timeout is the one loss', () => {
    expect(buildGameEndingMessage({
      ...coop,
      gameEnding: { outcome: 'lost', reason: 'timeout' },
      playerOutcome: 'lost',
    })).toEqual({ pillText: 'Lost: out of time, 71%', infoColText: 'Length 71%', outcome: 'lost' })
  })

  it('compete: my win, at my score', () => {
    expect(buildGameEndingMessage({
      ...race,
      winner: { ...moth, username: 'me' },
      gameEnding: { outcome: 'won', reason: 'resource_exhausted' },
      playerOutcome: 'won',
    })).toEqual({ pillText: 'Won: 78%', infoColText: 'You won!', outcome: 'won' })
  })

  it('compete: someone else\'s win names them, in my outcome', () => {
    expect(buildGameEndingMessage({
      ...race,
      winner: moth,
      gameEnding: { outcome: 'won', reason: 'conceded' },
      playerOutcome: 'near',
    })).toEqual({ pillText: 'won at 78%', infoColText: 'moth won', outcome: 'near', actor: moth })
  })

  it('compete: nobody scored, for each cause', () => {
    const lost = (reason: 'conceded' | 'timeout' | 'resource_exhausted') =>
      buildGameEndingMessage({ ...race, winner: null, gameEnding: { outcome: 'lost', reason }, playerOutcome: 'lost' })
    expect(lost('conceded').pillText).toBe('Lost: all conceded')
    expect(lost('timeout').pillText).toBe('Lost: out of time, nobody scored')
    expect(lost('resource_exhausted').pillText).toBe('Lost: out of guesses, nobody scored')
  })

  it('compete: a Stop is the shared neutral ending', () => {
    expect(buildGameEndingMessage({
      ...race,
      winner: null,
      gameEnding: { outcome: 'neutral', reason: 'stopped' },
      playerOutcome: 'neutral',
    })).toMatchObject({ pillText: 'Stopped — no winner', outcome: 'neutral' })
  })
})
