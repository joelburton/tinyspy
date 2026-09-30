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
import type { EndOutcome, GameEndedReason } from '@/common/terminal/gameEnding'
import { buildGameEndingMessage } from './gameEndingMessage'

/** The defaults every case overrides a field or two of. */
const base = {
  winnerName: 'Bea',
  iSolved: false,
  isMyTieBrokenByClock: false,
}

/** A game's ending with the given outcome and reason. */
function makeGameEnding(outcome: EndOutcome, reason: GameEndedReason) {
  return { outcome, reason }
}

describe('coop', () => {
  it('a win is the team win', () => {
    expect(
      buildGameEndingMessage({
        ...base, mode: 'coop', gameEnding: makeGameEnding('won', 'reached_goal'), playerOutcome: 'won',
      }),
    ).toEqual({ pillText: 'Won: solved it', infoColText: 'Solved it!', outcome: 'won' })
  })

  it('a loss names the clock or the guesses', () => {
    expect(
      buildGameEndingMessage({
        ...base, mode: 'coop', gameEnding: makeGameEnding('lost', 'resource_exhausted'), playerOutcome: 'lost',
      }),
    ).toEqual({ pillText: 'Lost: out of guesses', infoColText: 'Out of guesses', outcome: 'lost' })
    expect(
      buildGameEndingMessage({
        ...base, mode: 'coop', gameEnding: makeGameEnding('lost', 'timeout'), playerOutcome: 'lost',
      }),
    ).toEqual({ pillText: 'Lost: out of time', infoColText: 'Out of time', outcome: 'lost' })
  })

  it('a Stop is neutral — nobody won, which is not everybody losing', () => {
    const msg = buildGameEndingMessage({
      ...base, mode: 'coop', gameEnding: makeGameEnding('neutral', 'stopped'), playerOutcome: 'neutral',
    })
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended')
  })
})

describe('compete', () => {
  const someoneWon = makeGameEnding('won', 'reached_goal')

  // Won by fewest guesses, the earlier solve breaking a tie — and the words
  // say which one it was, on both sides of the result.
  it('the winner won on guesses, or on the clock', () => {
    expect(
      buildGameEndingMessage({ ...base, mode: 'compete', gameEnding: someoneWon, playerOutcome: 'won', iSolved: true }),
    ).toEqual({ pillText: 'Won: fewest guesses', infoColText: 'You won!', outcome: 'won' })
    expect(
      buildGameEndingMessage({
        ...base, mode: 'compete', gameEnding: someoneWon, playerOutcome: 'won', iSolved: true, isMyTieBrokenByClock: true,
      }),
    ).toEqual({ pillText: 'Won: same guesses, but faster', infoColText: 'You won (faster)', outcome: 'won' })
  })

  it('a loser was beaten on guesses, or on the clock', () => {
    expect(
      buildGameEndingMessage({ ...base, mode: 'compete', gameEnding: someoneWon, playerOutcome: 'lost' }),
    ).toEqual({ pillText: 'Lost: beaten on guesses', infoColText: 'Opponent won', outcome: 'lost' })
    expect(
      buildGameEndingMessage({
        ...base, mode: 'compete', gameEnding: someoneWon, playerOutcome: 'near', iSolved: true, isMyTieBrokenByClock: true,
      }),
    ).toEqual({ pillText: 'Lost: beaten on the clock', infoColText: 'Opponent won (faster)', outcome: 'near' })
  })

  // The countdown ending a game SOMEBODY had solved: the player still guessing
  // was stopped, not outscored; the winner solved in time; a solver who had
  // used more guesses was beaten on them all the same; a tie is still a tie.
  it('a game the clock ended with a solver says so, on both sides', () => {
    const timedOut = { ...base, mode: 'compete', gameEnding: makeGameEnding('won', 'timeout') } as const
    expect(buildGameEndingMessage({ ...timedOut, playerOutcome: 'won', iSolved: true })).toEqual({
      pillText: 'Won: solved before time ran out', infoColText: 'You won!', outcome: 'won',
    })
    expect(buildGameEndingMessage({ ...timedOut, playerOutcome: 'lost' })).toEqual({
      pillText: 'Lost: time ran out', infoColText: 'Opponent won', outcome: 'lost',
    })
    expect(buildGameEndingMessage({ ...timedOut, playerOutcome: 'near', iSolved: true })).toEqual({
      pillText: 'Lost: beaten on guesses', infoColText: 'Opponent won', outcome: 'near',
    })
    expect(
      buildGameEndingMessage({ ...timedOut, playerOutcome: 'near', iSolved: true, isMyTieBrokenByClock: true }),
    ).toEqual({ pillText: 'Lost: beaten on the clock', infoColText: 'Opponent won (faster)', outcome: 'near' })
    expect(
      buildGameEndingMessage({ ...timedOut, playerOutcome: 'won', iSolved: true, isMyTieBrokenByClock: true }),
    ).toEqual({ pillText: 'Won: same guesses, but faster', infoColText: 'You won (faster)', outcome: 'won' })
  })

  it('a game nobody solved says which of the three ways it ran out', () => {
    expect(
      buildGameEndingMessage({
        ...base, mode: 'compete', gameEnding: makeGameEnding('lost', 'resource_exhausted'), playerOutcome: 'lost',
      }),
    ).toEqual({ pillText: 'Nobody solved', infoColText: 'No winner', outcome: 'lost' })
    expect(
      buildGameEndingMessage({
        ...base, mode: 'compete', gameEnding: makeGameEnding('lost', 'timeout'), playerOutcome: 'lost',
      }),
    ).toEqual({ pillText: 'Out of time — no winner', infoColText: 'Out of time', outcome: 'lost' })
    // Every player walked away, and the club-list label reads "all conceded"
    // off the same reason.
    expect(
      buildGameEndingMessage({
        ...base, mode: 'compete', gameEnding: makeGameEnding('lost', 'conceded'), playerOutcome: 'lost',
      }),
    ).toEqual({ pillText: 'All conceded — no winner', infoColText: 'All conceded', outcome: 'lost' })
  })

  it('a Stop is neutral here too, and says no winner', () => {
    const msg = buildGameEndingMessage({
      ...base, mode: 'compete', gameEnding: makeGameEnding('neutral', 'stopped'), playerOutcome: 'neutral',
    })
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended — no winner')
  })

  // SPECTATING: a guess until the design settles what a watcher sees.
  it('a watcher is told who won, in the game\'s outcome', () => {
    expect(
      buildGameEndingMessage({ ...base, mode: 'compete', gameEnding: someoneWon, playerOutcome: null }),
    ).toEqual({ pillText: 'Bea won', infoColText: 'Bea won', outcome: 'won' })
  })

  // The two flags are compete questions. Coop reads neither: the team won or
  // the team did not.
  it('coop ignores the flags; compete is the only mode that asks', () => {
    const coopLoss = {
      ...base, mode: 'coop', gameEnding: makeGameEnding('lost', 'resource_exhausted'), playerOutcome: 'lost',
    } as const
    expect(buildGameEndingMessage({ ...coopLoss, iSolved: true, isMyTieBrokenByClock: true })).toEqual(
      buildGameEndingMessage(coopLoss),
    )
  })

  it('throws for an ending wordle never writes', () => {
    expect(() =>
      buildGameEndingMessage({
        ...base, mode: 'coop', gameEnding: makeGameEnding('lost', 'conceded'), playerOutcome: 'lost',
      }),
    ).toThrow(/BUG/)
  })
})

describe('every ending, in both modes, for every player', () => {
  // The table is the point: one place to see that no cell pairs a winning
  // sentence with a losing outcome, and that nothing is left unnamed. These
  // are the endings wordle's RPCs write (supabase/sql/wordle.sql), each with
  // the outcomes a player can have in it. A compete game with a winner ends on
  // the last player's act, whichever it was.
  const CASES = [
    { mode: 'coop', outcome: 'won', reason: 'reached_goal', player: 'won' },
    { mode: 'coop', outcome: 'lost', reason: 'resource_exhausted', player: 'lost' },
    { mode: 'coop', outcome: 'lost', reason: 'timeout', player: 'lost' },
    { mode: 'coop', outcome: 'neutral', reason: 'stopped', player: 'neutral' },
    ...(['reached_goal', 'resource_exhausted', 'conceded', 'timeout'] as const).flatMap((reason) =>
      (['won', 'near', 'lost'] as const).map((player) => ({ mode: 'compete', outcome: 'won', reason, player }) as const),
    ),
    { mode: 'compete', outcome: 'lost', reason: 'resource_exhausted', player: 'lost' },
    { mode: 'compete', outcome: 'lost', reason: 'timeout', player: 'lost' },
    { mode: 'compete', outcome: 'lost', reason: 'conceded', player: 'lost' },
    { mode: 'compete', outcome: 'neutral', reason: 'stopped', player: 'neutral' },
  ] as const

  it.each(CASES)('$mode $outcome/$reason, player $player, reads the player\'s, with both texts filled', (c) => {
    for (const iSolved of [false, true]) {
      for (const isMyTieBrokenByClock of [false, true]) {
        const msg = buildGameEndingMessage({
          ...base,
          mode: c.mode,
          gameEnding: makeGameEnding(c.outcome, c.reason),
          playerOutcome: c.player,
          iSolved,
          isMyTieBrokenByClock,
        })
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
