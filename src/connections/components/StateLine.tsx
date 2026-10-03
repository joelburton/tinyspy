// cs-unmet

import { CATEGORY_COUNT } from '../lib/board'
import type { GStateLineData } from '../types'

/**
 * connections' state line — "2/4 categories found · 1/4 mistakes" — drawn
 * from `gd.stateLineData`.
 *
 * A fragment, not a box: the caller supplies the element and its styling
 * (`InfoCol`'s `.infoState` paragraph). The same name and shape as every
 * game's state line (docs/playarea.md → Info-column readouts).
 */
export function StateLine({ data }: { data: GStateLineData }) {
  return (
    <>
      <strong>{data.nMatchedCats}/{CATEGORY_COUNT}</strong> categories found ·{' '}
      <strong>{data.nMistakes}/{data.maxMistakes}</strong> mistakes
    </>
  )
}
