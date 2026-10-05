// cs-unmet

/**
 * Unit test for waffle's game-ending message (lib/gameEndingMessage.ts). Pure —
 * no DOM, no supabase.
 *
 * It walks every ending a waffle game can reach, in both modes — the outcome
 * and reason pairs its RPCs write, with each outcome a player can have in it —
 * which is the whole input space, since the builder reads nothing else. A table
 * is the only way to see at a glance that no cell says "won" beside an outcome
 * of `lost`, or leaves a loss reading as neutral.
 */
import { describe, expect, it } from 'vitest'
import type { EndOutcome, GameEndedReason } from '@/common/terminal/gameEnding'
import { buildGameEndingMessage } from './gameEndingMessage'

/** The message for one ending; on par unless a case says otherwise. */
function build(
  mode: 'coop' | 'compete',
  outcome: EndOutcome,
  reason: GameEndedReason,
  playerOutcome: EndOutcome,
  nSwapsOverPar = 0,
) {
  return buildGameEndingMessage({ mode, gameEnding: { outcome, reason }, playerOutcome, nSwapsOverPar })
}

/** The message a case expects: the pill, the info column's line, the
 *  outcome. */
function message(pillText: string, infoColText: string, outcome: EndOutcome) {
  return { pillText, infoColText, outcome }
}

describe('coop', () => {
  it('a win is measured against par', () => {
    expect(build('coop', 'won', 'reached_goal', 'won', 0))
      .toEqual(message('Won: par!', 'Won: par!', 'won'))
    expect(build('coop', 'won', 'reached_goal', 'won', 2))
      .toEqual(message('Won: par +2', 'Won: par +2', 'won'))
  })

  it('a loss names the timeout or the swaps', () => {
    expect(build('coop', 'lost', 'resource_exhausted', 'lost'))
      .toEqual(message('Lost: out of swaps', 'Out of swaps', 'lost'))
    expect(build('coop', 'lost', 'timeout', 'lost'))
      .toEqual(message('Lost: out of time', 'Out of time', 'lost'))
  })

  it('a Stop is neutral — nobody won, which is not everybody losing', () => {
    expect(build('coop', 'neutral', 'stopped', 'neutral').outcome).toBe('neutral')
  })
})

describe('compete', () => {
  it('a race somebody won reads from my side of it', () => {
    expect(build('compete', 'won', 'reached_goal', 'won'))
      .toEqual(message('Won: fewest swaps', 'You won!', 'won'))
    expect(build('compete', 'won', 'reached_goal', 'near'))
      .toEqual(message('Lost: beaten on swaps', 'Opponent won', 'near'))
    expect(build('compete', 'won', 'reached_goal', 'lost'))
      .toEqual(message('Lost: beaten on swaps', 'Opponent won', 'lost'))
  })

  it('a race whose last act was a concede still has its winner', () => {
    expect(build('compete', 'won', 'conceded', 'won'))
      .toEqual(message('Won: fewest swaps', 'You won!', 'won'))
  })

  it('a race nobody won names why, with no "Lost:" — nobody was beaten', () => {
    expect(build('compete', 'lost', 'timeout', 'lost'))
      .toEqual(message('Out of time — no winner', 'Out of time', 'lost'))
    expect(build('compete', 'lost', 'conceded', 'lost'))
      .toEqual(message('All conceded — no winner', 'All conceded', 'lost'))
    expect(build('compete', 'lost', 'resource_exhausted', 'lost'))
      .toEqual(message('Nobody solved', 'No winner', 'lost'))
  })
})

it('throws for an ending waffle never writes', () => {
  expect(() => build('coop', 'lost', 'conceded', 'lost')).toThrow(/BUG/)
})
