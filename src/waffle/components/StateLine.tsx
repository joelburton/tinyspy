// cs-unmet

import type { GStateLineData } from '../types'

/**
 * waffle's state line — "Swaps 3/12 (9 left) · Par 10" — drawn from
 * `gd.stateLineData`: the team's count in coop, my own in compete.
 *
 * Rendered TWICE, in two places that must never drift: the info column's
 * `.infoState` line (desktop) and the mobile `<MobileStatusBar>` above the
 * board. A fragment, not a box: each caller supplies its own element and
 * styling (docs/mobile.md → The mobile status bar).
 *
 * The counters are bold and the labels aren't: the numbers are what's read at a
 * glance.
 */
export function StateLine({ data }: { data: GStateLineData }) {
  const nSwapsLeft = Math.max(0, data.maxSwaps - data.nSwapsUsed)
  return (
    <>
      Swaps{' '}
      <strong>
        {data.nSwapsUsed}/{data.maxSwaps}
      </strong>{' '}
      ({nSwapsLeft} left) · Par <strong>{data.parSwaps}</strong>
    </>
  )
}
