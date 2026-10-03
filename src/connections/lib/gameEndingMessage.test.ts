// cs-unmet

/**
 * Unit test for connections' game-ending message (lib/gameEndingMessage.ts).
 * Pure — no DOM, no supabase.
 *
 * It walks EVERY ending a connections game can reach, in both modes — the
 * outcome and reason pairs its RPCs write, with each outcome a player can have
 * in it — which is the whole input space, since the builder reads nothing
 * else. What that buys: the pill and the info-column line are two texts for
 * one outcome, and a table is the only way to see at a glance that no cell
 * says "won" beside an outcome of `lost`, or leaves a loss reading as neutral.
 */
import { describe, expect, it } from 'vitest'
import type { EndOutcome, GameEndedReason } from '@/common/terminal/gameEnding'
import { buildGameEndingMessage } from './gameEndingMessage'

/** The message for one ending, with the elimination flag off unless a case
 *  sets it. */
function build(
  mode: 'coop' | 'compete',
  outcome: EndOutcome,
  reason: GameEndedReason,
  playerOutcome: EndOutcome,
  flags: { iWasEliminated?: boolean } = {},
) {
  return buildGameEndingMessage({
    iWasEliminated: false,
    ...flags,
    mode,
    gameEnding: { outcome, reason },
    playerOutcome,
  })
}

/** The message a case expects: the pill, the info column's line, the
 *  outcome. */
function message(pillText: string, infoColText: string, outcome: EndOutcome) {
  return { pillText, infoColText, outcome }
}

describe('coop', () => {
  it('a win is the team win', () => {
    expect(build('coop', 'won', 'reached_goal', 'won'))
      .toEqual(message('You win!', 'You won!', 'won'))
  })

  it('a loss names the clock or the mistakes', () => {
    expect(build('coop', 'lost', 'resource_exhausted', 'lost'))
      .toEqual(message('Lost: out of mistakes', 'Out of mistakes', 'lost'))
    expect(build('coop', 'lost', 'timeout', 'lost'))
      .toEqual(message('Lost: out of time', 'Out of time', 'lost'))
  })

  it('a Stop is neutral — nobody won, which is not everybody losing', () => {
    const msg = build('coop', 'neutral', 'stopped', 'neutral')
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended')
  })
})

describe('compete', () => {
  it('the racer who matched all four won', () => {
    expect(build('compete', 'won', 'reached_goal', 'won'))
      .toEqual(message('Won: the race', 'You won!', 'won'))
  })

  // Two ways to have lost a race somebody won, and WHY matters: a racer who
  // spent their mistakes was out before the finish; one still racing was
  // beaten to it.
  it('a loser was eliminated or beaten to the punch', () => {
    expect(build('compete', 'won', 'reached_goal', 'lost', { iWasEliminated: true }))
      .toEqual(message('Lost: out of mistakes', 'Out of mistakes', 'lost'))
    expect(build('compete', 'won', 'reached_goal', 'lost'))
      .toEqual(message('Beaten to the punch', 'Opponent won', 'lost'))
  })

  // Three ways a race ends with nobody winning, and the server has told us
  // which: the mistakes, the clock, or a table that all walked away. A mixed
  // table is `resource_exhausted` — `connections.concede`'s own call, since
  // somebody played it out — so it reads as the elimination it mostly was.
  it('a race nobody finished says so: the mistakes, the clock, or the walk-away', () => {
    expect(build('compete', 'lost', 'resource_exhausted', 'lost'))
      .toEqual(message('Everyone eliminated', 'All eliminated', 'lost'))
    expect(build('compete', 'lost', 'timeout', 'lost'))
      .toEqual(message('Out of time — no winner', 'Out of time', 'lost'))
    expect(build('compete', 'lost', 'conceded', 'lost'))
      .toEqual(message('All conceded — no winner', 'All conceded', 'lost'))
  })

  it('a Stop is neutral here too, and says no winner', () => {
    const msg = build('compete', 'neutral', 'stopped', 'neutral')
    expect(msg.outcome).toBe('neutral')
    expect(msg.pillText).toBe('Game ended — no winner')
  })

  it('the outcome is mine, not the game\'s', () => {
    expect(build('compete', 'won', 'reached_goal', 'lost').outcome).toBe('lost')
    expect(build('compete', 'won', 'reached_goal', 'near').outcome).toBe('near')
  })
})

describe('every ending, in both modes, for every player outcome', () => {
  // The table is the point: one place to see that no cell pairs a winning
  // text with a losing outcome. The endings are the ones the RPCs write
  // (doc.md → How a game ends); a player outcome is the one `_end_game`
  // writes for that ending.
  const ENDINGS: Array<[EndOutcome, GameEndedReason]> = [
    ['won', 'reached_goal'],
    ['lost', 'resource_exhausted'],
    ['lost', 'timeout'],
    ['lost', 'conceded'],
    ['neutral', 'stopped'],
  ]

  it('never pairs a win text with a losing outcome, and never leaves a loss neutral', () => {
    for (const mode of ['coop', 'compete'] as const) {
      for (const [outcome, reason] of ENDINGS) {
        // Coop cannot concede.
        if (mode === 'coop' && reason === 'conceded') continue
        // A coop win ranks the whole team first; a compete win has one winner
        // and the rest lost or ranked below.
        const playerOutcomes: EndOutcome[] =
          outcome !== 'won' ? [outcome]
          : mode === 'coop' ? ['won']
          : ['won', 'lost', 'near']
        for (const playerOutcome of playerOutcomes) {
          const msg = build(mode, outcome, reason, playerOutcome)
          // A win text leads with the outcome word ("Won: the race", "You win!").
          const saysWon = /^(Won\b|You win)/.test(msg.pillText)
          if (saysWon) expect(msg.outcome).toBe('won')
          if (outcome === 'lost') expect(msg.outcome).toBe('lost')
          if (outcome === 'neutral') expect(msg.outcome).toBe('neutral')
        }
      }
    }
  })

  it('throws for an ending connections never writes', () => {
    expect(() => build('coop', 'lost', 'conceded', 'lost')).toThrow(/BUG/)
    expect(() => build('coop', 'won', 'reached_goal', 'won')).not.toThrow()
  })
})
