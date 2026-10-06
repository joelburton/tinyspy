// cs-unmet

import type { GFacts } from '../types'

/**
 * wordle's state line — "3/6 guesses" — drawn from my side's facts, `gd.me`:
 * the team's in coop, my own in compete.
 *
 * A fragment, not a box: the caller supplies the element and its styling
 * (`InfoCol`'s `.infoState` paragraph). One caller today — wordle has no
 * mobile status bar, since the board is the count — but the same name and
 * shape as every game's state line (docs/playarea.md → Info-column readouts).
 */
export function StateLine({ facts }: { facts: GFacts }) {
  return (
    <>
      <strong>{facts.nGuessesUsed}/{facts.maxGuesses}</strong> guesses
    </>
  )
}
