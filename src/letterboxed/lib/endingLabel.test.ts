// cs-unmet

import { describe, expect, it } from 'vitest'
import type { GameEndedReason } from '@/common/ending/gameEnding'
import { findOthersAtTheEnd, makeEndingLabel } from './endingLabel'

/**
 * letterboxed's ending label for every ending it reaches, in both modes: the
 * common word, letterboxed's detail after it — the words a coop win took, a
 * tie, what lost a place — my outcome, and which ending it is. A table, so a
 * reader sees at a glance that no row pairs a winning word with a losing
 * outcome.
 */

type Player = Parameters<typeof makeEndingLabel>[0]
type Game = Parameters<typeof makeEndingLabel>[1]
type Others = Parameters<typeof makeEndingLabel>[2]

/** A player out of play on 9 letters and 4 words, unless a case says otherwise. */
const player = (over: Partial<Player> = {}): Player => ({
  outcome: 'lost',
  conceded: false,
  finalRanking: null,
  solved: false,
  stillPlaying: false,
  ending: null,
  nCoveredLetters: 9,
  nWordsUsed: 4,
  ...over,
})

const conceded = (over: Partial<Player> = {}) =>
  player({
    ending: { at: '2026-10-07T00:00:00Z', reason: 'conceded', detail: 'conceded' },
    conceded: true,
    ...over,
  })

const gameEnded = (mode: 'coop' | 'compete', reason: GameEndedReason): Game =>
  ({ mode, ended: true, reason })

const racePlaying: Game = { mode: 'compete', ended: false, reason: null }

const none: Others = { ahead: [], tiedWithNames: [] }

describe('makeEndingLabel', () => {
  it('has no label while I still play', () => {
    expect(makeEndingLabel(player({ stillPlaying: true, outcome: null }), racePlaying, none)).toBeNull()
  })

  // [case, player, game, others, word, long, pill, outcome, endedBy]
  const cases: [string, Player, Game, Others, string, string, string, string, string][] = [
    ['coop: all twelve in 3', player({ outcome: 'won', finalRanking: 1, nCoveredLetters: 12, nWordsUsed: 3 }), gameEnded('coop', 'reached_goal'), none,
      'Won', '3 words', '3 words', 'won', 'game'],
    ['coop: all twelve in 1', player({ outcome: 'won', finalRanking: 1, nCoveredLetters: 12, nWordsUsed: 1 }), gameEnded('coop', 'reached_goal'), none,
      'Won', '1 word', '1 word', 'won', 'game'],
    ['coop: out of time', player(), gameEnded('coop', 'timeout'), none,
      'Lost', 'out of time', 'out of time', 'lost', 'game'],
    ['coop: a Stop', player({ outcome: 'neutral' }), gameEnded('coop', 'stopped'), none,
      'Stopped', '', '', 'neutral', 'game'],
    ['compete: I covered all twelve first', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'reached_goal'), none,
      'Won', '', '', 'won', 'game'],
    ['compete: someone else covered them first', player(), gameEnded('compete', 'reached_goal'), none,
      'Lost', '', '', 'lost', 'game'],
    ['compete: timeout, I led alone', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'timeout'), none,
      'Won', '', '', 'won', 'game'],
    ['compete: timeout, tied for the lead', player({ outcome: 'won', finalRanking: 1 }), gameEnded('compete', 'timeout'),
      { ahead: [], tiedWithNames: ['bea'] },
      'Won', 'tied with bea', 'tied with bea', 'won', 'game'],
    ['compete: timeout, 2nd on fewer letters', player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'timeout'),
      { ahead: [{ nCoveredLetters: 11, nWordsUsed: 5 }], tiedWithNames: [] },
      '2nd', 'fewer letters', 'fewer letters', 'near', 'game'],
    ['compete: timeout, 2nd on as many letters, more words', player({ outcome: 'near', finalRanking: 2 }), gameEnded('compete', 'timeout'),
      { ahead: [{ nCoveredLetters: 9, nWordsUsed: 3 }], tiedWithNames: [] },
      '2nd', 'more words', 'more words', 'near', 'game'],
    ['compete: timeout, nothing covered', player({ nCoveredLetters: 0, nWordsUsed: 0 }), gameEnded('compete', 'timeout'), none,
      'Lost', 'no words found', 'no words found', 'lost', 'game'],
    ['compete: a Stop', player({ outcome: 'neutral' }), gameEnded('compete', 'stopped'), none,
      'Stopped', '', 'no winner', 'neutral', 'game'],
    ['compete: I conceded, the game goes on', conceded(), racePlaying, none,
      'Conceded', 'game continues', 'game continues', 'lost', 'player'],
    ['compete: I conceded, the game has ended', conceded(), gameEnded('compete', 'conceded'), none,
      'Conceded', '', '', 'lost', 'game'],
  ]

  it.each(cases)('%s', (_case, p, game, others, word, long, pill, outcome, endedBy) => {
    expect(makeEndingLabel(p, game, others)).toMatchObject({ word, long, pill, outcome, endedBy })
  })
})

describe('findOthersAtTheEnd', () => {
  const players = [
    { id: 'a', name: 'ada', finalRanking: 1, nCoveredLetters: 11, nWordsUsed: 4 },
    { id: 'b', name: 'bea', finalRanking: 2, nCoveredLetters: 9, nWordsUsed: 3 },
    { id: 'c', name: 'cade', finalRanking: 2, nCoveredLetters: 9, nWordsUsed: 3 },
    { id: 'd', name: 'dee', finalRanking: null, nCoveredLetters: 0, nWordsUsed: 0 },
  ]

  it('names the others at my place, and returns everyone ranked above me', () => {
    expect(findOthersAtTheEnd(players[1]!, players)).toEqual({
      ahead: [players[0]],
      tiedWithNames: ['cade'],
    })
  })

  it('is empty for a player with no place', () => {
    expect(findOthersAtTheEnd(players[3]!, players)).toEqual({ ahead: [], tiedWithNames: [] })
  })
})
