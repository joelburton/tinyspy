// cs-unmet

import { CATEGORY_COUNT } from '../lib/board'
import type { GFacts } from '../types'

/**
 * connections' state line — "2/4 categories found · 1/4 mistakes" — drawn
 * from my side's facts, `gd.me`: the team's in coop, my own in compete.
 *
 * A fragment, not a box: the caller supplies the element and its styling
 * (`InfoCol`'s `.infoState` paragraph). The same name and shape as every
 * game's state line (docs/playarea.md → Info-column readouts).
 */
export function StateLine({ facts }: { facts: GFacts }) {
  return (
    <>
      <strong>{facts.nMatchedCats}/{CATEGORY_COUNT}</strong> categories found ·{' '}
      <strong>{facts.nMistakes}/{facts.maxMistakes}</strong> mistakes
    </>
  )
}
