// cs-unmet

import type { GStateLineData } from '../types'

/**
 * wordle's state line — "3/6 guesses" — drawn from `gd.stateLineData`.
 *
 * A fragment, not a box: the caller supplies the element and its styling
 * (`InfoCol`'s `.infoState` paragraph). One caller today — wordle has no
 * mobile status bar, since the board is the count — but the same name and
 * shape as every game's state line (docs/playarea.md → Info-column readouts).
 */
export function StateLine({ data }: { data: GStateLineData }) {
  return (
    <>
      <strong>{data.guessesUsed}/{data.maxGuesses}</strong> guesses
    </>
  )
}
