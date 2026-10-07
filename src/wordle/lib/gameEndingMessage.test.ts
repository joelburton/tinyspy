// cs-blessed-wordle

/**
 * Unit test for wordle's game-ending message (lib/gameEndingMessage.ts). Pure —
 * no DOM, no supabase.
 *
 * It walks EVERY ending a wordle game can reach, in both modes — the outcome
 * and reason pairs its RPCs write, with each outcome a player can have in it,
 * on guesses or on the clock — which is the whole input space, since the
 * builder reads nothing else. What that buys: the pill and the info-column
 * line are two texts for one outcome, and a table is the only way to see at a
 * glance that no cell says "won" beside an outcome of `lost`, or leaves a loss
 * reading as neutral.
 */
import { describe, expect, it } from 'vitest'
import type { EndOutcome, GameEndedReason } from '@/common/ending/gameEnding'
import { buildGameEndingMessage } from './gameEndingMessage'

/** The message for one ending, with the compete flags off unless a case sets
 *  them. */
function build(
  mode: 'coop' | 'compete',
  outcome: EndOutcome,
  reason: GameEndedReason,
  playerOutcome: EndOutcome,
  flags: { iSolved?: boolean; isMyTieBrokenByClock?: boolean } = {},
) {
  return buildGameEndingMessage({
    iSolved: false,
    isMyTieBrokenByClock: false,
    ...flags,
    mode,
    gameEnding: { outcome, reason },
    playerOutcome,
  })
}

/** A solver whose place against the winner the earlier solve decided. */
const TIED_SOLVER = { iSolved: true, isMyTieBrokenByClock: true }

/** The message a case expects: the pill, the info column's line, the
 *  outcome. */
function message(pillText: string, infoColText: string, outcome: EndOutcome) {
  return { pillText, infoColText, outcome }
}

describe('coop', () => {
  it('a win is the team win', () => {
    expect(build('coop', 'won', 'reached_goal', 'won'))
      .toEqual(message('Won: solved it', 'Solved it!', 'won'))
  })

  it('a loss names the clock or the guesses', () => {
    expect(build('coop', 'lost', 'resource_exhausted', 'lost'))
      .toEqual(message('Lost: out of guesses', 'Out of guesses', 'lost'))
    expect(build('coop', 'lost', 'timeout', 'lost'))
      .toEqual(message('Lost: out of time', 'Out of time', 'lost'))
  })

  it('a Stop is neutral — nobody won, which is not everybody losing', () => {
    const msg = build('coop', 'neutral', 'stopped', 'neutral')
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Stopped')
  })
})

describe('compete', () => {
  // Won by fewest guesses, the earlier solve breaking a tie — and the words
  // say which one it was, on both sides of the result.
  it('the winner won on guesses, or on the clock', () => {
    expect(build('compete', 'won', 'reached_goal', 'won', { iSolved: true }))
      .toEqual(message('Won: fewest guesses', 'You won!', 'won'))
    expect(build('compete', 'won', 'reached_goal', 'won', TIED_SOLVER))
      .toEqual(message('Won: same guesses, but faster', 'You won (faster)', 'won'))
  })

  it('a loser was beaten on guesses, or on the clock', () => {
    expect(build('compete', 'won', 'reached_goal', 'lost'))
      .toEqual(message('Lost: beaten on guesses', 'Opponent won', 'lost'))
    expect(build('compete', 'won', 'reached_goal', 'near', TIED_SOLVER))
      .toEqual(message('Lost: beaten on the clock', 'Opponent won (faster)', 'near'))
  })

  // The countdown ending a game SOMEBODY had solved: the player still guessing
  // was stopped, not outscored; the winner solved in time; a solver who had
  // used more guesses was beaten on them all the same; a tie is still a tie.
  it('a game the clock ended with a solver says so, on both sides', () => {
    expect(build('compete', 'won', 'timeout', 'won', { iSolved: true }))
      .toEqual(message('Won: solved before time ran out', 'You won!', 'won'))
    expect(build('compete', 'won', 'timeout', 'lost'))
      .toEqual(message('Lost: time ran out', 'Opponent won', 'lost'))
    expect(build('compete', 'won', 'timeout', 'near', { iSolved: true }))
      .toEqual(message('Lost: beaten on guesses', 'Opponent won', 'near'))
    expect(build('compete', 'won', 'timeout', 'near', TIED_SOLVER))
      .toEqual(message('Lost: beaten on the clock', 'Opponent won (faster)', 'near'))
    expect(build('compete', 'won', 'timeout', 'won', TIED_SOLVER))
      .toEqual(message('Won: same guesses, but faster', 'You won (faster)', 'won'))
  })

  it('a game nobody solved says which of the three ways it ran out', () => {
    expect(build('compete', 'lost', 'resource_exhausted', 'lost'))
      .toEqual(message('Nobody solved', 'No winner', 'lost'))
    expect(build('compete', 'lost', 'timeout', 'lost'))
      .toEqual(message('Out of time — no winner', 'Out of time', 'lost'))
    // Every player walked away, and the club-list label reads "all conceded"
    // off the same reason.
    expect(build('compete', 'lost', 'conceded', 'lost'))
      .toEqual(message('All conceded — no winner', 'All conceded', 'lost'))
  })

  it('a Stop is neutral here too, and says no winner', () => {
    const msg = build('compete', 'neutral', 'stopped', 'neutral')
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Stopped — no winner')
  })

  // The two flags are compete questions. Coop reads neither: the team won or
  // the team did not.
  it('coop ignores the flags; compete is the only mode that asks', () => {
    expect(build('coop', 'lost', 'resource_exhausted', 'lost', TIED_SOLVER))
      .toEqual(build('coop', 'lost', 'resource_exhausted', 'lost'))
  })

  it('throws for an ending wordle never writes', () => {
    expect(() => build('coop', 'lost', 'conceded', 'lost')).toThrow(/BUG/)
  })
})

describe('every ending, in both modes, for every player', () => {
  // The table is the point: one place to see that no cell pairs a winning
  // sentence with a losing outcome, and that nothing is left unnamed. These
  // are the endings wordle's RPCs write (supabase/sql/wordle.sql), each with
  // the outcomes a player can have in it. A compete game with a winner ends on
  // the last player's act, whichever it was.
  const COMPETE_WON_REASONS = ['reached_goal', 'resource_exhausted', 'conceded', 'timeout'] as const
  const CASES = [
    { mode: 'coop', outcome: 'won', reason: 'reached_goal', player: 'won' },
    { mode: 'coop', outcome: 'lost', reason: 'resource_exhausted', player: 'lost' },
    { mode: 'coop', outcome: 'lost', reason: 'timeout', player: 'lost' },
    { mode: 'coop', outcome: 'neutral', reason: 'stopped', player: 'neutral' },
    ...COMPETE_WON_REASONS.flatMap((reason) =>
      (['won', 'near', 'lost'] as const).map(
        (player) => ({ mode: 'compete', outcome: 'won', reason, player }) as const,
      ),
    ),
    { mode: 'compete', outcome: 'lost', reason: 'resource_exhausted', player: 'lost' },
    { mode: 'compete', outcome: 'lost', reason: 'timeout', player: 'lost' },
    { mode: 'compete', outcome: 'lost', reason: 'conceded', player: 'lost' },
    { mode: 'compete', outcome: 'neutral', reason: 'stopped', player: 'neutral' },
  ] as const

  it.each(CASES)('$mode $outcome/$reason, player $player, reads the player\'s, with both texts filled', (c) => {
    for (const iSolved of [false, true]) {
      for (const isMyTieBrokenByClock of [false, true]) {
        const msg = build(c.mode, c.outcome, c.reason, c.player, { iSolved, isMyTieBrokenByClock })
        expect(msg.outcome).toBe(c.player)
        expect(msg.pillText.length).toBeGreaterThan(0)
        expect(msg.infoColText.length).toBeGreaterThan(0)
        // A pill LABEL, never a sentence — it ellipsizes at about 48
        // characters on a phone, and nothing in this vocabulary is punctuated.
        expect(msg.pillText.endsWith('.')).toBe(false)
        expect(msg.infoColText.endsWith('.')).toBe(false)
      }
    }
  })
})
