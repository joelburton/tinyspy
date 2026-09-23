// cs-met-codenamesduet

import type { KeyLabel } from './labels'

/**
 * The agents a pair has to find: fifteen on every board, the key-card table's
 * nine per side less the three that are agents on both. Every count out of it
 * — the readout, the club line, the celebration, the printout — reads this.
 */
export const TOTAL_AGENTS = 15

/**
 * Has a seat found all of its agents?
 *
 * A seat's agents are the `'G'` cells on its **own** key view; an agent
 * is "contacted" once the board's global reveal marks that position
 * green (`revealed_as === 'G'` — green reveals are global in Duet, true
 * for both seats the moment they happen). This returns true when every
 * one of the key's agents is contacted, i.e. the seat has no words left
 * to give clues for.
 *
 * Per the Duet rulebook that seat then gives no more clues — its partner
 * takes every remaining turn (enforced server-side in `codenamesduet._end_turn`;
 * surfaced to both players as a banner in the info column).
 */
export function agentsAllContacted(
  key: KeyLabel[],
  words: { position: number; revealed_as: string | null }[],
): boolean {
  const contacted = new Set(
    words.filter((w) => w.revealed_as === 'G').map((w) => w.position),
  )
  // Guard the empty key (not yet loaded): `[].every(...)` is vacuously
  // true, and a seat with no agents loaded must not read as "finished".
  return (
    key.length > 0 &&
    key.every((label, pos) => label !== 'G' || contacted.has(pos))
  )
}
