// cs-unmet

import { describe, expect, it } from 'vitest'
import { buildGameEndingMessage } from './gameEndingMessage'

/** The message for one ending, with a chain of 3 words covering 9 letters. */
function messageFor(
  mode: 'coop' | 'compete',
  outcome: 'won' | 'lost' | 'neutral',
  reason: 'reached_goal' | 'timeout' | 'conceded' | 'stopped',
  playerOutcome: 'won' | 'lost' | 'neutral',
  winnerNames: string[] = [],
) {
  return buildGameEndingMessage({
    mode,
    gameEnding: { outcome, reason },
    playerOutcome,
    nWordsUsed: 3,
    nCoveredLetters: 9,
    winnerNames,
  })
}

describe('letterboxed buildGameEndingMessage', () => {
  it('coop: a win counts the words, a timeout is the one loss, a Stop is the shared neutral', () => {
    expect(messageFor('coop', 'won', 'reached_goal', 'won')).toEqual({
      pillText: 'Won: all twelve in 3 words', infoColText: 'All letters used!', outcome: 'won',
    })
    expect(messageFor('coop', 'lost', 'timeout', 'lost')).toEqual({
      pillText: 'Lost: out of time at 9/12', infoColText: 'Out of time', outcome: 'lost',
    })
    expect(messageFor('coop', 'neutral', 'stopped', 'neutral')).toEqual({
      pillText: 'Stopped', infoColText: 'Stopped', outcome: 'neutral',
    })
  })

  it('compete solve: the solver got there first, the rest were beaten to it', () => {
    expect(messageFor('compete', 'won', 'reached_goal', 'won', ['me']).infoColText)
      .toBe('You got there first!')
    expect(messageFor('compete', 'won', 'reached_goal', 'lost', ['moth'])).toEqual({
      pillText: 'Lost: moth got there first', infoColText: 'Beaten to it', outcome: 'lost',
    })
  })

  it('compete timeout: the most letters wins, and a tie says it is one', () => {
    expect(messageFor('compete', 'won', 'timeout', 'won', ['me']).pillText)
      .toBe('Won: most letters (9/12)')
    expect(messageFor('compete', 'won', 'timeout', 'won', ['me', 'moth']).pillText)
      .toBe('Won: tied at most letters (9/12)')
    expect(messageFor('compete', 'won', 'timeout', 'lost', ['moth', 'bea']).pillText)
      .toBe('Lost: moth & bea covered more')
  })

  it('compete with no winner: everyone conceded, or nobody covered anything', () => {
    expect(messageFor('compete', 'lost', 'conceded', 'lost').pillText).toBe('Lost: everyone conceded')
    expect(messageFor('compete', 'lost', 'timeout', 'lost').pillText).toBe('Lost: nobody covered the board')
  })

  it('an ending the game never writes is a bug, not a guess', () => {
    expect(() => messageFor('coop', 'lost', 'conceded', 'lost')).toThrow(/no words/)
  })
})
