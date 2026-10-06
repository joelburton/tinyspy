// cs-blessed-psychicnum

import type { GFacts } from '../types'


/**
 * psychicnum's core live-state readout — "1/3 found · 4/7 guesses used" —
 * drawn from my side's facts, `gd.me`: the team's in coop, my own in compete.
 *
 * Its own component because it's rendered TWICE, in two places that must never
 * drift: the info column's `.infoState` line (desktop) and the mobile
 * `<MobileStatusBar>` above the board (below the `--mobile` breakpoint, where
 * the info column is off-canvas in the InfoSheet). Bare inline content — each
 * caller supplies its own wrapper element + text styling.
 *
 * The counters are bold and the labels aren't: the numbers are what's read at
 * a glance.
 */
export function StateLine({ facts }: { facts: GFacts }) {
  return (
    <>
      <strong>
        {facts.nFoundSecrets}/{facts.nReqdSecrets}
      </strong>{' '}
      found ·{' '}
      <strong>
        {facts.nGuessesUsed}/{facts.maxGuesses}
      </strong>{' '}
      guesses used
    </>
  )
}
