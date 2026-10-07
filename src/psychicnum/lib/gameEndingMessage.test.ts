// cs-blessed-psychicnum

/**
 * Unit test for psychicnum's game-ending message (lib/gameEndingMessage.ts).
 * Pure — no DOM, no supabase.
 *
 * It walks EVERY ending a psychicnum game can reach, in both modes — the
 * outcome and reason pairs its RPCs write, with the outcome
 * `common._end_game` then writes for me — which is the whole input space,
 * since the builder reads nothing else. What that buys: the pill and the
 * info-column line are two texts for one outcome, and a table is the only way
 * to see at a glance that no cell says "won" beside an outcome of `lost`, or
 * leaves a loss reading as neutral.
 */
import { describe, expect, it } from 'vitest'
import type { EndOutcome, GameEndedReason, GameEnding } from '@/common/ending/gameEnding'
import { buildGameEndingMessage } from './gameEndingMessage'

/** A game's ending with the given outcome and reason; the rest does not
 *  matter here. */
function makeGameEnding(outcome: EndOutcome, reason: GameEndedReason): GameEnding {
  return { outcome, reason, reasonDetail: reason, endedByUserId: 'u-bea' }
}

const WINNER = { winnerName: 'Bea' }

describe('coop', () => {
  it('a win is the team win', () => {
    expect(
      buildGameEndingMessage({
        ...WINNER, mode: 'coop', gameEnding: makeGameEnding('won', 'reached_goal'), playerOutcome: 'won',
      }),
    ).toEqual({ pillText: 'Won: all found', infoColText: 'You won!', outcome: 'won' })
  })

  it('a loss names the clock or the budget, and they never both apply', () => {
    expect(
      buildGameEndingMessage({
        ...WINNER, mode: 'coop', gameEnding: makeGameEnding('lost', 'resource_exhausted'), playerOutcome: 'lost',
      }),
    ).toEqual({ pillText: 'Lost: out of guesses', infoColText: 'Out of guesses', outcome: 'lost' })
    expect(
      buildGameEndingMessage({
        ...WINNER, mode: 'coop', gameEnding: makeGameEnding('lost', 'timeout'), playerOutcome: 'lost',
      }),
    ).toEqual({ pillText: 'Lost: out of time', infoColText: 'Timer elapsed', outcome: 'lost' })
  })

  it('a Stop is neutral — nobody won, which is not everybody losing', () => {
    const msg = buildGameEndingMessage({
      ...WINNER, mode: 'coop', gameEnding: makeGameEnding('neutral', 'stopped'), playerOutcome: 'neutral',
    })
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended')
  })
})

describe('compete', () => {
  it('the player who completed the set won; the others were beaten', () => {
    const gameWon = makeGameEnding('won', 'reached_goal')
    expect(
      buildGameEndingMessage({ ...WINNER, mode: 'compete', gameEnding: gameWon, playerOutcome: 'won' }),
    ).toEqual({ pillText: 'Won: the race', infoColText: 'You won!', outcome: 'won' })
    expect(
      buildGameEndingMessage({ ...WINNER, mode: 'compete', gameEnding: gameWon, playerOutcome: 'lost' }),
    ).toEqual({ pillText: 'Beaten to the punch', infoColText: 'Bea won', outcome: 'lost' })
  })

  // A race nobody finished: the pill says so, and does not congratulate the
  // last player standing. Three ways to get there, and the ending's reason is
  // what tells them apart — the words are the club-list label's.
  it('a race that ran out says no winner, by budget, by clock or by everyone conceding', () => {
    const lostBy = (reason: GameEndedReason) => buildGameEndingMessage({
      ...WINNER, mode: 'compete', gameEnding: makeGameEnding('lost', reason), playerOutcome: 'lost',
    })
    expect(lostBy('resource_exhausted')).toEqual(
      { pillText: 'Out of guesses — no winner', infoColText: 'Out of guesses', outcome: 'lost' })
    expect(lostBy('timeout')).toEqual(
      { pillText: 'Out of time — no winner', infoColText: 'Timer elapsed', outcome: 'lost' })
    expect(lostBy('conceded')).toEqual(
      { pillText: 'All conceded — no winner', infoColText: 'All conceded', outcome: 'lost' })
  })

  it('a Stop is neutral here too, and says no winner', () => {
    const msg = buildGameEndingMessage({
      ...WINNER, mode: 'compete', gameEnding: makeGameEnding('neutral', 'stopped'), playerOutcome: 'neutral',
    })
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended — no winner')
  })
})

describe('the outcome is mine, as the database wrote it', () => {
  // A Stop leaves a conceder `lost`: the game's outcome is neutral, mine is
  // not, and the message reads mine.
  it('a conceder in a stopped game reads lost', () => {
    const msg = buildGameEndingMessage({
      ...WINNER, mode: 'compete', gameEnding: makeGameEnding('neutral', 'stopped'), playerOutcome: 'lost',
    })
    expect(msg.outcome).toBe('lost')
  })

  it('a ranking below first reads near, as the database wrote it', () => {
    const msg = buildGameEndingMessage({
      ...WINNER, mode: 'compete', gameEnding: makeGameEnding('won', 'reached_goal'), playerOutcome: 'near',
    })
    expect(msg.outcome).toBe('near')
  })

  // SPECTATING: a guess until the design settles what a watcher sees.
  it('a watcher reads the game\'s outcome, and is told who won', () => {
    expect(
      buildGameEndingMessage({
        ...WINNER, mode: 'compete', gameEnding: makeGameEnding('won', 'reached_goal'), playerOutcome: null,
      }),
    ).toEqual({ pillText: 'Bea won', infoColText: 'Bea won', outcome: 'won' })
  })
})

describe('an ending psychicnum never writes', () => {
  it('throws rather than guess at words for it', () => {
    expect(() => buildGameEndingMessage({
      ...WINNER, mode: 'coop', gameEnding: makeGameEnding('lost', 'conceded'), playerOutcome: 'lost',
    })).toThrow(/BUG/)
  })
})

describe('every ending, in both modes', () => {
  // The table is the point: one place to see that no cell pairs a winning
  // sentence with a losing outcome, and that nothing is left unnamed. These
  // are the endings psychicnum's RPCs write (supabase/sql/psychicnum.sql),
  // each with the outcome `common._end_game` gives me.
  const CASES = [
    { mode: 'coop', outcome: 'won', reason: 'reached_goal', mine: 'won' },
    { mode: 'coop', outcome: 'lost', reason: 'resource_exhausted', mine: 'lost' },
    { mode: 'coop', outcome: 'lost', reason: 'timeout', mine: 'lost' },
    { mode: 'coop', outcome: 'neutral', reason: 'stopped', mine: 'neutral' },
    { mode: 'compete', outcome: 'won', reason: 'reached_goal', mine: 'won' },
    { mode: 'compete', outcome: 'won', reason: 'reached_goal', mine: 'lost' },
    { mode: 'compete', outcome: 'lost', reason: 'resource_exhausted', mine: 'lost' },
    { mode: 'compete', outcome: 'lost', reason: 'timeout', mine: 'lost' },
    { mode: 'compete', outcome: 'lost', reason: 'conceded', mine: 'lost' },
    { mode: 'compete', outcome: 'neutral', reason: 'stopped', mine: 'neutral' },
  ] as const

  it.each(CASES)('$mode $outcome/$reason, mine $mine, reads mine, with both texts filled', (c) => {
    const msg = buildGameEndingMessage({
      ...WINNER, mode: c.mode, gameEnding: makeGameEnding(c.outcome, c.reason), playerOutcome: c.mine,
    })
    expect(msg.outcome).toBe(c.mine)
    expect(msg.pillText.length).toBeGreaterThan(0)
    expect(msg.infoColText.length).toBeGreaterThan(0)
    // A pill LABEL, never a sentence — it ellipsizes at about 48 characters
    // on a phone, and nothing in this vocabulary is punctuated.
    expect(msg.pillText.endsWith('.')).toBe(false)
    expect(msg.infoColText.endsWith('.')).toBe(false)
  })
})
