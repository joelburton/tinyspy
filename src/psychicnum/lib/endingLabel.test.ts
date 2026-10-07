// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { makeEndingLabel } from './endingLabel'

/**
 * psychicnum's ending label for every ending it reaches, in both modes: the
 * common word, psychicnum's detail after it, my outcome, and which ending it
 * is. A table, so a reader sees at a glance that no row pairs a winning word
 * with a losing outcome.
 */

type Player = Parameters<typeof makeEndingLabel>[0]

/** A player out of play, unless a case says otherwise. */
const player = (over: Partial<Player> = {}): Player => ({
  outcome: 'lost',
  conceded: false,
  finalRanking: null,
  solved: false,
  stillPlaying: false,
  ending: null,
  ...over,
})

/** A player who ended on their own, for this reason, while the race goes on. */
const endedEarly = (reason: 'conceded' | 'resource_exhausted', over: Partial<Player> = {}) =>
  player({
    ending: { at: '2026-10-06T00:00:00Z', reason, detail: reason },
    conceded: reason === 'conceded',
    ...over,
  })

const gameEnded = (mode: 'coop' | 'compete', reason: GameEndedReason) =>
  ({ mode, ended: true, reason }) as const
const racePlaying = { mode: 'compete', ended: false, reason: null } as const

describe('makeEndingLabel', () => {
  it('has no label while I still play', () => {
    expect(makeEndingLabel(player({ stillPlaying: true, outcome: null }), racePlaying)).toBeNull()
  })

  it.each([
    ['coop win', player({ outcome: 'won', finalRanking: 1 }), gameEnded('coop', 'reached_goal'),
      { labelType: 'won', word: 'Won', long: '', pill: 'all found', outcome: 'won', endedBy: 'game' }],
    ['coop out of guesses', player(), gameEnded('coop', 'resource_exhausted'),
      { labelType: 'lost', word: 'Lost', long: 'out of guesses', pill: 'out of guesses', outcome: 'lost', endedBy: 'game' }],
    ['coop out of time', player(), gameEnded('coop', 'timeout'),
      { labelType: 'lost', word: 'Lost', long: 'out of time', pill: 'out of time', outcome: 'lost', endedBy: 'game' }],
    ['coop Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped'),
      { labelType: 'stopped', word: 'Stopped', long: '', pill: '', outcome: 'neutral', endedBy: 'game' }],
    ['I won the race', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'reached_goal'),
      { labelType: 'won', word: 'Won', long: '', pill: 'the race', outcome: 'won', endedBy: 'game' }],
    ['beaten to the win', player(), gameEnded('compete', 'reached_goal'),
      { labelType: 'lost', word: 'Lost', long: '', pill: 'beaten to the punch', outcome: 'lost', endedBy: 'game' }],
    ['every budget spent', player(), gameEnded('compete', 'resource_exhausted'),
      { labelType: 'lost', word: 'Lost', long: 'out of guesses', pill: 'out of guesses', outcome: 'lost', endedBy: 'game' }],
    ['the race ran out of time', player(), gameEnded('compete', 'timeout'),
      { labelType: 'lost', word: 'Lost', long: 'out of time', pill: 'out of time', outcome: 'lost', endedBy: 'game' }],
    ['everyone conceded', endedEarly('conceded'), gameEnded('compete', 'conceded'),
      { labelType: 'conceded', word: 'Conceded', long: '', pill: '', outcome: 'lost', endedBy: 'game' }],
    ['a race Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped'),
      { labelType: 'stopped', word: 'Stopped', long: '', pill: 'no winner', outcome: 'neutral', endedBy: 'game' }],
    ['I conceded, the race goes on', endedEarly('conceded'), racePlaying,
      { labelType: 'conceded', word: 'Conceded', long: 'race continues', pill: 'race continues', outcome: 'lost', endedBy: 'player' }],
    ['I ran out of guesses, the race goes on', endedEarly('resource_exhausted'), racePlaying,
      { labelType: 'lost', word: 'Lost', long: 'out of guesses', pill: 'out of guesses', outcome: 'lost', endedBy: 'player' }],
  ] as const)('%s', (_name, me, game, expected) => {
    expect(makeEndingLabel(me, game)).toEqual(expected)
  })

  it('shows a reason this bundle has no words for raw, rather than crash', () => {
    const label = makeEndingLabel(player(), gameEnded('compete', 'a_reason_from_the_future' as GameEndedReason))
    expect(label?.long).toBe('a_reason_from_the_future')
  })

  it('throws for a result psychicnum never writes', () => {
    // A race has no place below first.
    expect(() => makeEndingLabel(player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'timeout')))
      .toThrow(/BUG/)
  })
})
