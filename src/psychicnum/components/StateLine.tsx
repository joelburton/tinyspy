// cs-blessed-psychicnum

import type { GStateLineData } from '../types'


/**
 * psychicnum's core live-state readout — "1/3 found · 4/7 guesses used" —
 * drawn from `gd.stateLineData`.
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
export function StateLine({ data }: { data: GStateLineData }) {
  return (
    <>
      <strong>
        {data.nFoundSecrets}/{data.nReqdSecrets}
      </strong>{' '}
      found ·{' '}
      <strong>
        {data.nGuessesUsed}/{data.maxGuesses}
      </strong>{' '}
      guesses used
    </>
  )
}
