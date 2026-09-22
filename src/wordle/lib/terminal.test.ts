// cs-met-wordle

/**
 * Unit test for wordle's terminal message (lib/terminal.ts). Pure — no DOM,
 * no supabase.
 *
 * It walks EVERY play state a wordle game can finish in, in both modes, for
 * every reason the server can write, for a caller who won or lost, on guesses
 * or on the clock — the whole input space, since the builder reads nothing
 * else. What that buys: the pill and the info-column line are two texts for one
 * outcome, and a table is the only way to see at a glance that no cell says
 * "won" beside an outcome of `lost`, or leaves a loss reading as neutral.
 */
import { describe, expect, it } from 'vitest'
import { buildTerminalMessage } from './terminal'

/** The defaults every case overrides one field of. */
const base = {
  reason: 'exhausted' as string | undefined,
  selfWon: false,
  wonByClock: false,
  selfTiedWinner: false,
}

/** Every word `status.reason` can hold, plus the absence of one. */
const REASONS = ['solved', 'exhausted', 'timeout', 'conceded', 'manual', undefined] as const

describe('coop', () => {
  it('a win is the team win, whatever the caller did', () => {
    for (const selfWon of [true, false]) {
      expect(
        buildTerminalMessage({ ...base, mode: 'coop', playState: 'won', reason: 'solved', selfWon }),
      ).toEqual({
        pillText: 'Won: solved it',
        infoColText: 'Solved it!',
        outcome: 'won',
      })
    }
  })

  it('a loss names the clock or the guesses', () => {
    expect(buildTerminalMessage({ ...base, mode: 'coop', playState: 'lost' })).toEqual({
      pillText: 'Lost: out of guesses',
      infoColText: 'Out of guesses',
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
    const msg = buildTerminalMessage({ ...base, mode: 'coop', playState: 'ended', reason: 'manual' })
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended')
  })
})

describe('compete', () => {
  // A race is won by fewest guesses, the clock breaking a tie — and the words
  // say which one it was, on both sides of the result.
  it('the winner won on guesses, or on the clock', () => {
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete', reason: 'solved', selfWon: true }),
    ).toEqual({ pillText: 'Won: fewest guesses', infoColText: 'You won!', outcome: 'won' })
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete', reason: 'solved', selfWon: true, wonByClock: true }),
    ).toEqual({ pillText: 'Won: same guesses, but faster', infoColText: 'You won (faster)', outcome: 'won' })
  })

  it('a loser was beaten on guesses, or on the clock', () => {
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete', reason: 'solved' }),
    ).toEqual({ pillText: 'Lost: beaten on guesses', infoColText: 'Opponent won', outcome: 'lost' })
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'won_compete', reason: 'solved', selfTiedWinner: true }),
    ).toEqual({ pillText: 'Lost: beaten on the clock', infoColText: 'Opponent won (faster)', outcome: 'lost' })
  })

  it('a race nobody finished says which of the three ways it ran out', () => {
    expect(buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete' })).toEqual({
      pillText: 'Nobody solved',
      infoColText: 'No winner',
      outcome: 'lost',
    })
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete', reason: 'timeout' }),
    ).toEqual({
      pillText: 'Out of time — no winner',
      infoColText: 'Out of time',
      outcome: 'lost',
    })
    // The case the clock could not tell: every racer walked away, and the
    // club-list label reads "all conceded" off the same word.
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete', reason: 'conceded' }),
    ).toEqual({
      pillText: 'All conceded — no winner',
      infoColText: 'All conceded',
      outcome: 'lost',
    })
  })

  it('a manual end is neutral here too, and says no winner', () => {
    const msg = buildTerminalMessage({ ...base, mode: 'compete', playState: 'ended', reason: 'manual' })
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended — no winner')
  })

  // The three caller flags are compete questions. Coop reads none of them: the
  // team won or the team did not.
  it('coop ignores the caller flags; compete is the only mode that asks', () => {
    const coopLoss = { ...base, mode: 'coop', playState: 'lost' } as const
    expect(buildTerminalMessage({ ...coopLoss, selfWon: true, wonByClock: true, selfTiedWinner: true })).toEqual(
      buildTerminalMessage(coopLoss),
    )
  })

  // A row written before the status key was renamed carries no `reason` at all,
  // and a missing word must still leave both texts filled rather than blank.
  it('a missing reason falls back to the way a game usually runs out', () => {
    expect(
      buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete', reason: undefined }),
    ).toEqual(buildTerminalMessage({ ...base, mode: 'compete', playState: 'lost_compete', reason: 'exhausted' }))
    expect(
      buildTerminalMessage({ ...base, mode: 'coop', playState: 'lost', reason: undefined }),
    ).toEqual(buildTerminalMessage({ ...base, mode: 'coop', playState: 'lost', reason: 'exhausted' }))
  })
})

describe('every terminal state, in both modes, for every reason and every caller', () => {
  // The table is the point: one place to see that no cell pairs a winning
  // sentence with a losing outcome, and that nothing is left unnamed.
  const CASES = [
    { mode: 'coop', playState: 'won', selfWon: false, outcome: 'won' },
    { mode: 'coop', playState: 'lost', selfWon: false, outcome: 'lost' },
    { mode: 'coop', playState: 'ended', selfWon: false, outcome: 'neutral' },
    { mode: 'compete', playState: 'won_compete', selfWon: true, outcome: 'won' },
    { mode: 'compete', playState: 'won_compete', selfWon: false, outcome: 'lost' },
    { mode: 'compete', playState: 'lost_compete', selfWon: false, outcome: 'lost' },
    { mode: 'compete', playState: 'ended', selfWon: false, outcome: 'neutral' },
  ] as const

  it.each(CASES)('$mode/$playState (selfWon $selfWon) reads $outcome, with both texts filled', (c) => {
    for (const reason of REASONS) {
      for (const wonByClock of [false, true]) {
        for (const selfTiedWinner of [false, true]) {
          const msg = buildTerminalMessage({
            mode: c.mode, playState: c.playState, selfWon: c.selfWon,
            reason, wonByClock, selfTiedWinner,
          })
          expect(msg.outcome).toBe(c.outcome)
          expect(msg.pillText.length).toBeGreaterThan(0)
          expect(msg.infoColText.length).toBeGreaterThan(0)
          // A pill LABEL, never a sentence — it ellipsizes at about 48 characters
          // on a phone, and nothing in this vocabulary is punctuated.
          expect(msg.pillText.endsWith('.')).toBe(false)
          expect(msg.infoColText.endsWith('.')).toBe(false)
        }
      }
    }
  })
})
