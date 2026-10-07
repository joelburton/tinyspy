// cs-unmet

import type { GFacts } from '../types'

/**
 * wordleone's state line — "3 misses" — drawn from my side's facts, `gd.me`:
 * the team's in coop, my own in compete. There is no budget to count against.
 *
 * A fragment, not a box: the caller supplies the element and its styling
 * (`InfoCol`'s `.infoState` paragraph), the same name and shape as every
 * game's state line (docs/playarea.md → Info-column readouts).
 */
export function StateLine({ facts }: { facts: GFacts }) {
  return (
    <>
      <strong>{facts.nMisses}</strong> {facts.nMisses === 1 ? 'miss' : 'misses'}
    </>
  )
}
