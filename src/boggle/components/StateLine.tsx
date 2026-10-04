// cs-unmet

import { Stats } from './Stats'
import type { GStateLineData } from '../types'

/**
 * boggle's core live-state readout — the required and bonus words found, and
 * their points, against the board's — drawn from `gd.stateLineData`: the
 * team's figures in coop, my own in compete, decided once in `useGame`.
 *
 * Its own component because it's rendered TWICE, in two places that must never
 * drift: the top of the info column (desktop) and the mobile
 * `<MobileStatusBar>` above the board (below the `--mobile` breakpoint, where
 * the info column is off-canvas in the InfoSheet). A bare fragment — each
 * caller supplies its own wrapper.
 */
export function StateLine({ data }: { data: GStateLineData }) {
  return (
    <>
      <Stats data={data} />
    </>
  )
}
