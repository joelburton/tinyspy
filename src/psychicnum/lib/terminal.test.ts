// cs-unmet

/**
 * Unit test for psychicnum's terminal message (lib/terminal.ts). Pure — no DOM,
 * no supabase.
 *
 * It walks EVERY play state a psychicnum game can finish in, in both modes,
 * with the timer expired and not — which is the whole input space, since the
 * builder reads nothing else. What that buys: the pill and the info-column line
 * are two texts for one outcome, and a table is the only way to see at a glance
 * that no cell says "won" beside an outcome of `lost`, or leaves a loss reading
 * as neutral.
 */
import { describe, expect, it } from 'vitest'
import { buildTerminalMessage } from './terminal'

/** The defaults every case overrides one field of. */
const base = { timerExpired: false, selfWon: false, winnerName: 'Bea' }

describe('coop', () => {
  it('a win is the team win, whatever the clock says', () => {
    for (const timerExpired of [false, true]) {
      expect(buildTerminalMessage({ ...base, mode: 'coop', playState: 'won', timerExpired })).toEqual({
        pillText: 'Won: all found',
        infoColText: 'You won!',
        outcome: 'won',
      })
    }
  })

  it('a loss names the clock or the budget, and they never both apply', () => {
    expect(buildTerminalMessage({ ...base, mode: 'coop', playState: 'lost' })).toEqual({
      pillText: 'Lost: out of guesses',
      infoColText: 'Out of guesses',
      outcome: 'lost',
    })
    expect(
      buildTerminalMessage({ ...base, mode: 'coop', playState: 'lost', timerExpired: true }),
    ).toEqual({
      pillText: 'Lost: out of time',
      infoColText: 'Timer elapsed',
      outcome: 'lost',
    })
  })

  it('a manual end is neutral — nobody won, which is not everybody losing', () => {
    expect(buildTerminalMessage({ ...base, mode: 'coop', playState: 'ended' }).outcome).toBe('neutral')
    expect(buildTerminalMessage({ ...base, mode: 'coop', playState: 'ended' }).pillText).toBe('Game ended')
  })
})

describe('compete', () => {
  it('the racer who completed the set won; the others were beaten', () => {
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete', selfWon: true }),
    ).toEqual({ pillText: 'Won: the race', infoColText: 'You won!', outcome: 'won' })
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete', selfWon: false }),
    ).toEqual({ pillText: 'Beaten to the punch', infoColText: 'Bea won', outcome: 'lost' })
  })

  // A race nobody finished: the pill says so, and does not congratulate the
  // last player standing.
  it('a race that ran out says no winner, by clock or by budget', () => {
    expect(buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete' })).toEqual({
      pillText: 'Out of guesses — no winner',
      infoColText: 'Out of guesses',
      outcome: 'lost',
    })
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete', timerExpired: true }),
    ).toEqual({
      pillText: 'Out of time — no winner',
      infoColText: 'Timer elapsed',
      outcome: 'lost',
    })
  })

  it('a manual end is neutral here too, and says no winner', () => {
    const msg = buildTerminalMessage({ ...base, mode: 'compete', playState: 'ended' })
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended — no winner')
  })

  // `selfWon` is a compete question. Coop reads it and must not: the team won
  // or the team did not, and a coop win with selfWon false is the case that
  // would catch the branch being written the other way round.
  it('coop ignores selfWon; compete is the only mode that asks', () => {
    const coopWin = { ...base, mode: 'coop', playState: 'won' } as const
    expect(buildTerminalMessage({ ...coopWin, selfWon: false })).toEqual(
      buildTerminalMessage({ ...coopWin, selfWon: true }),
    )
  })
})

describe('every terminal state, in both modes', () => {
  // The table is the point: one place to see that no cell pairs a winning
  // sentence with a losing outcome, and that nothing is left unnamed.
  const CASES = [
    { mode: 'coop', playState: 'won', outcome: 'won' },
    { mode: 'coop', playState: 'lost', outcome: 'lost' },
    { mode: 'coop', playState: 'ended', outcome: 'neutral' },
    { mode: 'compete', playState: 'won_compete', outcome: 'lost' }, // selfWon false by default
    { mode: 'compete', playState: 'lost_compete', outcome: 'lost' },
    { mode: 'compete', playState: 'ended', outcome: 'neutral' },
  ] as const

  it.each(CASES)('$mode/$playState reads $outcome, with both texts filled', (c) => {
    for (const timerExpired of [false, true]) {
      const msg = buildTerminalMessage({ ...base, mode: c.mode, playState: c.playState, timerExpired })
      expect(msg.outcome).toBe(c.outcome)
      expect(msg.pillText.length).toBeGreaterThan(0)
      expect(msg.infoColText.length).toBeGreaterThan(0)
      // A pill LABEL, never a sentence — it ellipsises at about 48 characters
      // on a phone, and nothing in this vocabulary is punctuated.
      expect(msg.pillText.endsWith('.')).toBe(false)
      expect(msg.infoColText.endsWith('.')).toBe(false)
    }
  })
})
