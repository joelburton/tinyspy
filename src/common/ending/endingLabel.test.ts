// cs-unmet

import { describe, expect, it } from 'vitest'
import { makeEndingLabelWord, makeEndingMessage, type EndingLabel } from './endingLabel'

/**
 * The common half of every game's ending label: which word a player's result
 * is, read from the server's facts in a fixed order, and the message a label
 * makes on the game page.
 */

type Player = Parameters<typeof makeEndingLabelWord>[0]

/** A player out of play who lost, unless a case says otherwise. */
const player = (over: Partial<Player> = {}): Player => ({
  outcome: 'lost',
  conceded: false,
  finalRanking: null,
  solved: false,
  stillPlaying: false,
  ...over,
})

const ENDED = { ended: true, reason: 'timeout' } as const
const STOPPED = { ended: true, reason: 'stopped' } as const
const PLAYING = { ended: false, reason: null } as const

describe('makeEndingLabelWord', () => {
  it('has no word while the player still plays', () => {
    expect(makeEndingLabelWord(player({ stillPlaying: true, outcome: null }), PLAYING)).toBeNull()
  })

  it('reads the result in its order: won, conceded, placed, stopped, solved, finished, lost', () => {
    expect(makeEndingLabelWord(player({ outcome: 'won', finalRanking: 1 }), ENDED))
      .toEqual({ labelType: 'won', word: 'Won' })
    expect(makeEndingLabelWord(player({ conceded: true }), ENDED))
      .toEqual({ labelType: 'conceded', word: 'Conceded' })
    expect(makeEndingLabelWord(player({ outcome: 'near', finalRanking: 2 }), ENDED))
      .toEqual({ labelType: 'placed', word: '2nd' })
    expect(makeEndingLabelWord(player({ outcome: 'neutral' }), STOPPED))
      .toEqual({ labelType: 'stopped', word: 'Stopped' })
    expect(makeEndingLabelWord(player({ outcome: 'neutral', solved: true }), PLAYING))
      .toEqual({ labelType: 'solved', word: 'Solved' })
    expect(makeEndingLabelWord(player({ outcome: 'neutral' }), PLAYING))
      .toEqual({ labelType: 'finished', word: 'Finished' })
    expect(makeEndingLabelWord(player(), ENDED))
      .toEqual({ labelType: 'lost', word: 'Lost' })
  })

  it('keeps a conceder conceded in a stopped game', () => {
    expect(makeEndingLabelWord(player({ conceded: true }), STOPPED)?.labelType).toBe('conceded')
  })

  it('keeps a loser lost when a decided game is stopped after', () => {
    expect(makeEndingLabelWord(player({ outcome: 'lost' }), STOPPED)?.labelType).toBe('lost')
  })

  it('says a place for every ranking below first, the teens included', () => {
    const place = (ranking: number) =>
      makeEndingLabelWord(player({ outcome: 'near', finalRanking: ranking }), ENDED)?.word
    expect([2, 3, 4, 11, 12, 13, 21, 22, 23].map(place))
      .toEqual(['2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd'])
  })

  it('has no word of its own for a game that ended with no result', () => {
    expect(() => makeEndingLabelWord(player({ outcome: 'neutral' }), ENDED)).toThrow(/BUG/)
  })
})

describe('makeEndingMessage', () => {
  const label = (over: Partial<EndingLabel>): EndingLabel => ({
    labelType: 'lost',
    word: 'Lost',
    long: '',
    pill: '',
    outcome: 'lost',
    endedBy: 'game',
    ...over,
  })

  it('leads both lengths with the word, the pill after a colon and the line in parentheses', () => {
    expect(makeEndingMessage(label({ long: 'out of guesses', pill: 'out of guesses' }), 'compete'))
      .toEqual({ pillText: 'Lost: out of guesses', infoColText: 'Lost (out of guesses)', outcome: 'lost' })
  })

  it('is the word alone where the label adds nothing', () => {
    expect(makeEndingMessage(label({ labelType: 'won', word: 'Won', outcome: 'won' }), 'compete'))
      .toEqual({ pillText: 'Won', infoColText: 'Won', outcome: 'won' })
  })

  it('says a Stop in the shared words, by mode', () => {
    const stopped = label({ labelType: 'stopped', word: 'Stopped', outcome: 'neutral' })
    expect(makeEndingMessage(stopped, 'coop').pillText).toBe('Stopped')
    expect(makeEndingMessage(stopped, 'compete').pillText).toBe('Stopped — no winner')
  })
})
