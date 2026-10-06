// cs-unmet

import { Dot } from '@/common/members/Dot'
import type { GGameData } from '../types'

/**
 * scrabble's live-state readout — "Your turn · 7 in bag" or "Turn: ● moth · 7
 * in bag" in compete, "Ended · 0 in bag" once a race is over, and "Team score:
 * 152 · 7 in bag" in coop, drawn from my side's facts (`gd.me`) and the turn.
 *
 * Drawn twice, in two places that must never drift: the info column's
 * `.infoState` line, and the mobile status bar above the board, where the info
 * column is off-canvas. A fragment; each caller wraps it.
 *
 * Compete folds the turn into its first clause, where the other turn games
 * draw the shared `<TurnStatusLine>`; coop's turn order, when it has one, is
 * the info column's separate line. The other player's turn reads "Turn: ●
 * name", never the possessive.
 */
export function StateLine({ gd }: { gd: GGameData }) {
  /** The first clause: compete's turn, or coop's score. "Ended" rather than a
   *  blank once a race is over: a bare "0 in bag" reads as a fragment. */
  function makeFirstClause() {
    if (gd.coop) return <>Team score: <strong>{gd.me.score}</strong></>
    if (gd.ended) return <>Ended</>
    if (gd.me.onTurn) return <strong>Your turn</strong>
    // A race always has a turn while it is played.
    const holder = gd.turns!.holder
    return <>Turn: <Dot color={holder.color} /> {holder.username}</>
  }

  return (
    <>
      {makeFirstClause()}
      {' · '}
      {gd.me.nBagTiles} in bag
    </>
  )
}
