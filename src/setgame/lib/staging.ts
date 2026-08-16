import type { Card } from './cards'
import { CLAIM_SIZE } from './selection'

/**
 * How long between one replacement card landing and the next.
 *
 * The refill happens IN PLACE — three cards leave and three arrive in the same
 * slots — which keeps the rest of the table still, but makes the change itself
 * easy to miss, especially in coop where the claim was someone else's. Dealing
 * the replacements one at a time, into slots that are visibly empty first, turns
 * a silent substitution into something you watch happen.
 */
export const DEAL_STAGGER_MS = 300

/** A slot on the displayed board: a card, or an empty place waiting for one. */
export type Slot = Card | null

/**
 * The board as it should be DISPLAYED the instant a new server board arrives:
 * every slot whose card changed goes empty, and the rest stay exactly as they
 * were. The caller fills the empties back in one per [`DEAL_STAGGER_MS`].
 *
 * Two situations deliberately SKIP the staging and show the board at once,
 * because in both the animation would be describing something that didn't
 * happen:
 *
 *   - **The first board.** Until the game loads there is nothing on screen, so
 *     staging would deal the opening twelve one a second — a twelve-second wait
 *     to start playing.
 *   - **A wholesale replacement.** A restart re-deals every card; that is a new
 *     board, not cards arriving onto one, and staging it would be another
 *     twelve seconds.
 *
 * Telling those apart counts only the slots REPLACED IN PLACE — positions that
 * existed before and now hold a different card. A claim replaces at most three
 * that way. Cards APPENDED past the old end are excluded from the count, and
 * that exclusion is the whole subtlety: a claim that also grows the board (the
 * deal-three rule firing on a set-free table) changes three slots in place AND
 * appends three more, and counting all six read as a wholesale replacement —
 * so the new column used to snap in with no stagger while an ordinary claim
 * dealt one card at a time. Appended cards are exactly the ones most worth
 * watching arrive.
 *
 * `prevShown` may still hold empty slots from a deal that hasn't finished (a
 * second claim landed mid-arrival); those stay empty and carry on filling. The
 * count is taken from the two server BOARDS rather than from what is shown, so
 * pending empties can't be mistaken for changes.
 */
export function stageBoard(
  prevShown: readonly Slot[],
  prevBoard: readonly Card[],
  next: readonly Card[],
  maxStaged: number = CLAIM_SIZE,
): Slot[] {
  if (prevBoard.length === 0) return [...next]
  const replacedInPlace = next
    .slice(0, prevBoard.length)
    .filter((card, i) => prevBoard[i] !== card).length
  if (replacedInPlace > maxStaged) return [...next]
  return next.map((card, i) => (prevShown[i] === card ? card : null))
}

/** The first slot still waiting for its card, or -1 when the deal is complete. */
export function nextPendingSlot(shown: readonly Slot[]): number {
  return shown.findIndex((slot) => slot === null)
}
