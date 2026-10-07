// cs-blessed-terminal

import { describe, expect, it } from 'vitest'
import { endingOutcomeVerb } from './endingOutcomeVerb'
import type { GamePlayerLegacy } from '../members/member'
import { ZTest_CONCEDED, ZTest_gp } from '../members/gamePlayer.fixture'

/**
 * The whole truth table for the compete strip's ending verb.
 *
 * Three branches, pinned INCLUDING the one that is easy to lose: an absent
 * member.
 */

/** A player row, defaulted to the ordinary "played and did not win" case. */
const player = (over: Parameters<typeof ZTest_gp>[3] = {}): GamePlayerLegacy => ZTest_gp('u1', 'ada', 'red', over)

describe('endingOutcomeVerb', () => {
  it('says Won when the player came out won', () => {
    expect(endingOutcomeVerb(player({ final_ranking: 1, outcome: 'won' }))).toBe('Won')
  })

  it('says Conceded for a conceder', () => {
    expect(endingOutcomeVerb(player({ ...ZTest_CONCEDED, outcome: 'lost' }))).toBe('Conceded')
  })

  it('says Lost for anyone else who did not win', () => {
    expect(endingOutcomeVerb(player())).toBe('Lost')
    expect(endingOutcomeVerb(player({ outcome: 'lost' }))).toBe('Lost')
    // Ranked below first is not a win.
    expect(endingOutcomeVerb(player({ final_ranking: 2, outcome: 'near' }))).toBe('Lost')
  })

  it('says Lost for a member it cannot resolve', () => {
    // A peer missing from the roster did not win. The strip renders a verb per
    // player, so this must return a word rather than throw or come back empty.
    expect(endingOutcomeVerb(undefined)).toBe('Lost')
  })

  it('only ever answers with one of the three verbs', () => {
    const cases: (GamePlayerLegacy | undefined)[] = [
      undefined,
      player(),
      player(ZTest_CONCEDED),
      player({ outcome: 'won' }),
      player({ outcome: 'near' }),
      player({ outcome: 'neutral' }),
    ]
    for (const c of cases) expect(['Won', 'Conceded', 'Lost']).toContain(endingOutcomeVerb(c))
  })
})
