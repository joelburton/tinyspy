// cs-unmet

import type { GFacts } from '../types'

/**
 * bananagrams' live-state readout — "Tiles: You 14 · Bunch 60 · Bag 3" —
 * drawn from my facts, `gd.me`. Bare inline content; the caller supplies the
 * wrapper and its text styling.
 *
 * The bag shows only when it holds tiles: a reduced bunch or dump-to-bag sets
 * some aside. The counters are bold and the labels aren't: the numbers are
 * what's read at a glance.
 */
export function StateLine({ facts }: { facts: GFacts }) {
  return (
    <>
      <b>Tiles: </b>
      You: <strong>{facts.nTiles}</strong>
      {' · '}
      Bunch: <strong>{facts.nBunchTiles}</strong>
      {facts.nBagTiles > 0 && (
        <>
          {' · '}
          Bag: <strong>{facts.nBagTiles}</strong>
        </>
      )}
    </>
  )
}
