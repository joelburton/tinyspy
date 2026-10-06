// cs-unmet

import type { GFacts, GGameData } from '../types'

/**
 * The game in one line and its cheats beneath: words cleared out of the six,
 * then the hints and spoilers taken — my side's facts, `gd.me`: the team's in
 * coop, my own in compete; the six are the puzzle's. Always drawn, even at 0,
 * so taking one doesn't shift the rows below.
 *
 * A fragment: the caller wraps it in the info column's state paragraph.
 */
export function StateLine({ facts, puzzle }: { facts: GFacts; puzzle: GGameData['puzzle'] }) {
  return (
    <>
      <strong>{facts.nFoundWords}</strong> / {puzzle.nReqdWords} words cleared
      <br />
      <strong>{facts.nHintsUsed}</strong> hint{facts.nHintsUsed === 1 ? '' : 's'} ·{' '}
      <strong>{facts.nSpoilersUsed}</strong> spoiler{facts.nSpoilersUsed === 1 ? '' : 's'} used
    </>
  )
}
