// cs-unmet

import type { GFacts, GGameData } from '../types'

/**
 * waffle's state line — "Swaps 3/12 (9 left) · Par 10" — drawn from my side's
 * facts, `gd.me`: the team's count in coop, my own in compete; par is the
 * deal's.
 *
 * Rendered TWICE, in two places that must never drift: the info column's
 * `.infoState` line (desktop) and the mobile `<MobileStatusBar>` above the
 * board. A fragment, not a box: each caller supplies its own element and
 * styling (docs/mobile.md → The mobile status bar).
 *
 * The counters are bold and the labels aren't: the numbers are what's read at a
 * glance.
 */
export function StateLine({ facts, puzzle }: { facts: GFacts; puzzle: GGameData['puzzle'] }) {
  const nSwapsLeft = Math.max(0, facts.maxSwaps - facts.nSwapsUsed)
  return (
    <>
      Swaps{' '}
      <strong>
        {facts.nSwapsUsed}/{facts.maxSwaps}
      </strong>{' '}
      ({nSwapsLeft} left) · Par <strong>{puzzle.parSwaps}</strong>
    </>
  )
}
