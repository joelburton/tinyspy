// cs-unmet

import type { GStateLineData } from '../types'

/**
 * bananagrams' live-state readout — "Tiles: You 14 · Bunch 60 · Bag 3" —
 * drawn from `gd.stateLineData`. Bare inline content; the caller supplies the
 * wrapper and its text styling.
 *
 * The bag shows only when it holds tiles: a reduced bunch or dump-to-bag sets
 * some aside. The counters are bold and the labels aren't: the numbers are
 * what's read at a glance.
 */
export function StateLine({ data }: { data: GStateLineData }) {
  return (
    <>
      <b>Tiles: </b>
      You: <strong>{data.nTiles}</strong>
      {' · '}
      Bunch: <strong>{data.nBunchTiles}</strong>
      {data.nBagTiles > 0 && (
        <>
          {' · '}
          Bag: <strong>{data.nBagTiles}</strong>
        </>
      )}
    </>
  )
}
