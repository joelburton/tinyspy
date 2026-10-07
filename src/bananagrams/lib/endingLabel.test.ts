// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { makeEndingLabel } from './endingLabel'

/**
 * bananagrams' ending label for every ending it reaches: the common word,
 * bananagrams' detail after it, my outcome, and which ending it is. A table,
 * so a reader sees at a glance that no row pairs a winning word with a losing
 * outcome.
 */

type Player = Parameters<typeof makeEndingLabel>[0]
type Game = Parameters<typeof makeEndingLabel>[1]

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

const conceded = (over: Partial<Player> = {}) =>
  player({
    ending: { at: '2026-10-07T00:00:00Z', reason: 'conceded', detail: 'conceded' },
    conceded: true,
    ...over,
  })

const gameEnded = (reason: GameEndedReason): Game => ({ ended: true, reason })

const racePlaying: Game = { ended: false, reason: null }

describe('makeEndingLabel', () => {
  it('has no label while I still play', () => {
    expect(makeEndingLabel(player({ stillPlaying: true, outcome: null }), racePlaying)).toBeNull()
  })

  // [case, player, game, word, long, pill, outcome, endedBy]
  const cases: [string, Player, Game, string, string, string, string, string][] = [
    ['I went out first', player({ outcome: 'won', finalRanking: 1 }), gameEnded('reached_goal'),
      'Won', 'Bananas!', 'Bananas!', 'won', 'game'],
    ['someone else went out first', player(), gameEnded('reached_goal'),
      'Lost', '', '', 'lost', 'game'],
    ['out of time, nobody out', player(), gameEnded('timeout'),
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['a Stop', player({ outcome: 'neutral' }), gameEnded('stopped'),
      'Stopped', '', 'no winner', 'neutral', 'game'],
    ['I conceded, the race goes on', conceded(), racePlaying,
      'Conceded', 'game continues', 'game continues', 'lost', 'player'],
    ['I conceded, the game has ended', conceded(), gameEnded('conceded'),
      'Conceded', '', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, word, long, pill, outcome, endedBy) => {
    expect(makeEndingLabel(p, game)).toMatchObject({ word, long, pill, outcome, endedBy })
  })
})
