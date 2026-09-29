// cs-blessed-psychicnum

/**
 * Unit test for psychicnum's terminal message (lib/terminal.ts). Pure — no DOM,
 * no supabase.
 *
 * It walks EVERY ending a psychicnum game can reach, in both modes — the
 * outcome and reason pairs its RPCs write — which is the whole input space,
 * since the builder reads nothing else. What that buys: the pill and the
 * info-column line are two texts for one outcome, and a table is the only way
 * to see at a glance that no cell says "won" beside an outcome of `lost`, or
 * leaves a loss reading as neutral.
 */
import { describe, expect, it } from 'vitest'
import type { EndOutcome, GameEndedReason, GameEnding } from '@/common/terminal/gameEnding'
import { buildTerminalMessage } from './terminal'

/** A game's ending with the given outcome and reason; the rest does not
 *  matter here. */
function makeGameEnding(outcome: EndOutcome, reason: GameEndedReason): GameEnding {
  return { outcome, reason, reasonDetail: reason, endedByUserId: 'u-bea' }
}

/** The defaults every case overrides one field of. */
const base = { selfWon: false, winnerName: 'Bea' }

describe('coop', () => {
  it('a win is the team win', () => {
    expect(
      buildTerminalMessage({ ...base, mode: 'coop', gameEnding: makeGameEnding('won', 'reached_goal') }),
    ).toEqual({ pillText: 'Won: all found', infoColText: 'You won!', outcome: 'won' })
  })

  it('a loss names the clock or the budget, and they never both apply', () => {
    expect(
      buildTerminalMessage({ ...base, mode: 'coop', gameEnding: makeGameEnding('lost', 'resource_exhausted') }),
    ).toEqual({ pillText: 'Lost: out of guesses', infoColText: 'Out of guesses', outcome: 'lost' })
    expect(
      buildTerminalMessage({ ...base, mode: 'coop', gameEnding: makeGameEnding('lost', 'timeout') }),
    ).toEqual({ pillText: 'Lost: out of time', infoColText: 'Timer elapsed', outcome: 'lost' })
  })

  it('a Stop is neutral — nobody won, which is not everybody losing', () => {
    const msg = buildTerminalMessage({ ...base, mode: 'coop', gameEnding: makeGameEnding('neutral', 'stopped') })
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended')
  })
})

describe('compete', () => {
  it('the player who completed the set won; the others were beaten', () => {
    const gameWon = makeGameEnding('won', 'reached_goal')
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', gameEnding: gameWon, selfWon: true }),
    ).toEqual({ pillText: 'Won: the race', infoColText: 'You won!', outcome: 'won' })
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', gameEnding: gameWon, selfWon: false }),
    ).toEqual({ pillText: 'Beaten to the punch', infoColText: 'Bea won', outcome: 'lost' })
  })

  // A race nobody finished: the pill says so, and does not congratulate the
  // last player standing. Three ways to get there, and the ending's reason is
  // what tells them apart — the words are the club-list label's.
  it('a race that ran out says no winner, by budget, by clock or by everyone conceding', () => {
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', gameEnding: makeGameEnding('lost', 'resource_exhausted') }),
    ).toEqual({ pillText: 'Out of guesses — no winner', infoColText: 'Out of guesses', outcome: 'lost' })
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', gameEnding: makeGameEnding('lost', 'timeout') }),
    ).toEqual({ pillText: 'Out of time — no winner', infoColText: 'Timer elapsed', outcome: 'lost' })
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', gameEnding: makeGameEnding('lost', 'conceded') }),
    ).toEqual({ pillText: 'All conceded — no winner', infoColText: 'All conceded', outcome: 'lost' })
  })

  it('a Stop is neutral here too, and says no winner', () => {
    const msg = buildTerminalMessage({ ...base, mode: 'compete', gameEnding: makeGameEnding('neutral', 'stopped') })
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended — no winner')
  })

  // `selfWon` is a compete question. Coop reads it and must not: the team won
  // or the team did not, and a coop win with selfWon false is the case that
  // would catch the branch being written the other way round.
  it('coop ignores selfWon; compete is the only mode that asks', () => {
    const coopWin = { ...base, mode: 'coop', gameEnding: makeGameEnding('won', 'reached_goal') } as const
    expect(buildTerminalMessage({ ...coopWin, selfWon: false })).toEqual(
      buildTerminalMessage({ ...coopWin, selfWon: true }),
    )
  })
})

describe('every ending, in both modes', () => {
  // The table is the point: one place to see that no cell pairs a winning
  // sentence with a losing outcome, and that nothing is left unnamed. These
  // are the endings psychicnum's RPCs write (supabase/sql/psychicnum.sql).
  const CASES = [
    { mode: 'coop', outcome: 'won', reason: 'reached_goal', reads: 'won' },
    { mode: 'coop', outcome: 'lost', reason: 'resource_exhausted', reads: 'lost' },
    { mode: 'coop', outcome: 'lost', reason: 'timeout', reads: 'lost' },
    { mode: 'coop', outcome: 'neutral', reason: 'stopped', reads: 'neutral' },
    { mode: 'compete', outcome: 'won', reason: 'reached_goal', reads: 'lost' }, // selfWon false by default
    { mode: 'compete', outcome: 'lost', reason: 'resource_exhausted', reads: 'lost' },
    { mode: 'compete', outcome: 'lost', reason: 'timeout', reads: 'lost' },
    { mode: 'compete', outcome: 'lost', reason: 'conceded', reads: 'lost' },
    { mode: 'compete', outcome: 'neutral', reason: 'stopped', reads: 'neutral' },
  ] as const

  it.each(CASES)('$mode $outcome/$reason reads $reads, with both texts filled', (c) => {
    const msg = buildTerminalMessage({ ...base, mode: c.mode, gameEnding: makeGameEnding(c.outcome, c.reason) })
    expect(msg.outcome).toBe(c.reads)
    expect(msg.pillText.length).toBeGreaterThan(0)
    expect(msg.infoColText.length).toBeGreaterThan(0)
    // A pill LABEL, never a sentence — it ellipsizes at about 48 characters
    // on a phone, and nothing in this vocabulary is punctuated.
    expect(msg.pillText.endsWith('.')).toBe(false)
    expect(msg.infoColText.endsWith('.')).toBe(false)
  })
})
