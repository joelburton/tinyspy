// cs-unmet

import type { GStateLineData } from '../types'

/**
 * The game in one line and its cheats beneath: words cleared out of the six,
 * then the hints and spoilers taken — the team's in coop, my own in compete
 * (`gd.stateLineData` decides which). Always drawn, even at 0, so taking one
 * doesn't shift the rows below.
 *
 * A fragment: the caller wraps it in the info column's state paragraph.
 */
export function StateLine({ data }: { data: GStateLineData }) {
  return (
    <>
      <strong>{data.nFoundWords}</strong> / {data.nReqdWords} words cleared
      <br />
      <strong>{data.nHintsUsed}</strong> hint{data.nHintsUsed === 1 ? '' : 's'} ·{' '}
      <strong>{data.nSpoilersUsed}</strong> spoiler{data.nSpoilersUsed === 1 ? '' : 's'} used
    </>
  )
}
