// cs-met-connections

/**
 * Unit test for connections' terminal message (lib/terminal.ts). Pure — no
 * DOM, no supabase.
 *
 * It walks EVERY play state a connections game can finish in, in both modes,
 * for every reason the server writes, for a caller who won, was eliminated,
 * or neither — the whole input space, since the builder reads nothing else.
 * What that buys: the pill and the info-column line are two texts for one
 * outcome, and a table is the only way to see at a glance that no cell says
 * "won" beside an outcome of `lost`, or leaves a loss reading as neutral.
 */
import { describe, expect, it } from 'vitest'
import { buildTerminalMessage } from './terminal'

/** The defaults every case overrides one field of. `reason` is
 *  `status.outcome` — the word the RPC that ended the game wrote. */
const base = { reason: 'mistakes', selfWon: false, selfEliminated: false }

/** Every word `common.games.status.outcome` can hold when connections is over,
 *  plus the undefined a game whose status never carried one hands us. */
const REASONS = ['mistakes', 'timeout', 'conceded', 'solved', 'manual', undefined]

describe('coop', () => {
  it('a win is the team win, whatever the caller did', () => {
    for (const selfWon of [true, false]) {
      expect(buildTerminalMessage({ ...base, mode: 'coop', playState: 'won', selfWon })).toEqual({
        pillText: 'You win!',
        infoColText: 'You won!',
        outcome: 'won',
      })
    }
  })

  it('a loss names the clock or the mistakes', () => {
    expect(buildTerminalMessage({ ...base, mode: 'coop', playState: 'lost' })).toEqual({
      pillText: 'Lost: out of mistakes',
      infoColText: 'Out of mistakes',
      outcome: 'lost',
    })
    expect(
      buildTerminalMessage({ ...base, mode: 'coop', playState: 'lost', reason: 'timeout' }),
    ).toEqual({
      pillText: 'Lost: out of time',
      infoColText: 'Out of time',
      outcome: 'lost',
    })
  })

  it('a manual end is neutral — nobody won, which is not everybody losing', () => {
    const msg = buildTerminalMessage({ ...base, mode: 'coop', playState: 'ended' })
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended')
  })
})

describe('compete', () => {
  it('the racer who matched all four won', () => {
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete', selfWon: true }),
    ).toEqual({ pillText: 'Won: the race', infoColText: 'You won!', outcome: 'won' })
  })

  // Two ways to have lost a race somebody won, and WHY matters: a racer who
  // spent their mistakes was out before the finish; one still racing was
  // beaten to it.
  it('a loser was eliminated or beaten to the punch', () => {
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete', selfEliminated: true }),
    ).toEqual({ pillText: 'Lost: out of mistakes', infoColText: 'Out of mistakes', outcome: 'lost' })
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete' }),
    ).toEqual({ pillText: 'Beaten to the punch', infoColText: 'Opponent won', outcome: 'lost' })
  })

  // Three ways a race ends with nobody winning, and the server has told us
  // which: the mistakes, the clock, or a table that all walked away. A mixed
  // table is `mistakes` — `connections.concede`'s own call, since somebody
  // played it out — so it reads as the elimination it mostly was.
  it('a race nobody finished says so: the mistakes, the clock, or the walk-away', () => {
    expect(buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete' })).toEqual({
      pillText: 'Everyone eliminated',
      infoColText: 'All eliminated',
      outcome: 'lost',
    })
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete', reason: 'timeout' }),
    ).toEqual({
      pillText: 'Out of time — no winner',
      infoColText: 'Out of time',
      outcome: 'lost',
    })
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete', reason: 'conceded' }),
    ).toEqual({
      pillText: 'All conceded — no winner',
      infoColText: 'All conceded',
      outcome: 'lost',
    })
  })

  it('a manual end is neutral here too, and says no winner', () => {
    const msg = buildTerminalMessage({ ...base, mode: 'compete', playState: 'ended' })
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended — no winner')
  })

  // `selfWon` is a compete question. Coop reads it and must not: the team won
  // or the team did not.
  it('coop ignores selfWon and selfEliminated; compete is the only mode that asks', () => {
    const coopLoss = { ...base, mode: 'coop', playState: 'lost' } as const
    expect(buildTerminalMessage({ ...coopLoss, selfEliminated: true })).toEqual(
      buildTerminalMessage({ ...coopLoss, selfEliminated: false }),
    )
  })
})

describe('every terminal state, in both modes, for every reason and every caller', () => {
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
    for (const reason of REASONS) {
      for (const selfEliminated of [false, true]) {
        const msg = buildTerminalMessage({ ...base, mode: c.mode, playState: c.playState, reason, selfEliminated })
        expect(msg.outcome).toBe(c.outcome)
        expect(msg.pillText.length).toBeGreaterThan(0)
        expect(msg.infoColText.length).toBeGreaterThan(0)
        // A pill LABEL, never a sentence — it ellipsizes at about 48 characters
        // on a phone, and nothing in this vocabulary is punctuated.
        expect(msg.pillText.endsWith('.')).toBe(false)
        expect(msg.infoColText.endsWith('.')).toBe(false)
      }
    }
  })
})
