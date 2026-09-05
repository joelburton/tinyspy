// cs-blessed-game-lib

import { describe, expect, it } from 'vitest'
import { terminalOutcomeVerb } from './terminalOutcomeVerb'
import type { GamePlayer } from './member'

/**
 * The whole truth table for the OpponentStrip's terminal verb.
 *
 * Three branches whose ORDER is the contract, so these pin every branch
 * INCLUDING the two that are easy to lose: an absent member, and the
 * win-beats-concede precedence.
 */

/** A player row, defaulted to the ordinary "played and did not win" case. */
const player = (over: Partial<GamePlayer> = {}): GamePlayer => ({
  user_id: 'u1',
  username: 'ada',
  color: 'red',
  conceded: false,
  conceded_at: null,
  result: null,
  ...over,
})

describe('terminalOutcomeVerb', () => {
  it('says Won when the end-state says they won', () => {
    expect(terminalOutcomeVerb(player({ result: { won: true } }))).toBe('Won')
  })

  it('says Quit for a conceder', () => {
    expect(terminalOutcomeVerb(player({ conceded: true, conceded_at: '2026-09-03T00:00:00Z' }))).toBe('Quit')
  })

  it('says Lost for anyone else who did not win', () => {
    expect(terminalOutcomeVerb(player())).toBe('Lost')
    expect(terminalOutcomeVerb(player({ result: { won: false } }))).toBe('Lost')
    // A result that exists but says nothing about winning is still not a win.
    expect(terminalOutcomeVerb(player({ result: { score: 40 } }))).toBe('Lost')
  })

  it('lets Won TRUMP a concede, which is branch order and not an accident', () => {
    // Reachable: concede a race that someone has already ended in your favor.
    // If the branches were reordered this would read "Quit" and nothing else
    // in the suite would notice.
    expect(terminalOutcomeVerb(player({ conceded: true, result: { won: true } }))).toBe('Won')
  })

  it('says Lost for a member it cannot resolve', () => {
    // A peer missing from the roster did not win. The strip renders a verb per
    // player, so this must return a word rather than throw or come back empty.
    expect(terminalOutcomeVerb(undefined)).toBe('Lost')
  })

  it('only ever answers with one of the three verbs', () => {
    const cases: (GamePlayer | undefined)[] = [
      undefined,
      player(),
      player({ conceded: true }),
      player({ result: { won: true } }),
      player({ conceded: true, result: { won: true } }),
      player({ result: {} }),
    ]
    for (const c of cases) expect(['Won', 'Quit', 'Lost']).toContain(terminalOutcomeVerb(c))
  })
})
