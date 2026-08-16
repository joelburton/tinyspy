import { findSet, third, type Card } from './cards'

/**
 * The hint, computed on the client.
 *
 * It can be, and that is the whole design: the board is face-up and this file
 * holds the same algebra the server does, so a hint is a local search rather
 * than a lookup. Two things follow — the ring appears on the keystroke instead
 * of after a round trip (it also SELECTS the cards, so a lag would be felt),
 * and there is no private column for the server to mask.
 *
 * The server still hears about it: `record_hint` charges the asker and writes
 * the event, because the ring is transient UI while the ASKING is history and
 * belongs in the turn log. See `supabase/sql/setgame.sql`.
 *
 * ── The ladder ──────────────────────────────────────────────────────────────
 * Each press reveals one more card of the SAME set:
 *
 *   1st → one card    "there is a set through here"
 *   2nd → two cards   "these two go together"
 *   3rd → all three   which, since three selected cards submit a claim, hands
 *                     you the set outright
 *
 * The third rung needs no special case anywhere: it returns three cards, the
 * caller selects them, and the existing "three selected cards claim" rule does
 * the rest.
 */

/**
 * Extend `showing` by one card of the set it belongs to, or start a new hint.
 * Returns null only when the board holds no set at all, which a playing game
 * never does (the deal rule guarantees one).
 *
 * Growing the SAME set matters: recomputing from scratch could point at a
 * different set on the second press, and the player would be chasing two
 * answers at once. From two cards the third is determined outright, so the
 * ladder can't wander.
 */
export function nextHint(board: readonly Card[], showing: readonly Card[]): Card[] | null {
  const live = showing.filter((card) => board.includes(card))

  if (live.length === 0) {
    const found = findSet(board)
    return found ? [found[0]] : null
  }

  if (live.length === 1) {
    // Any set through the ringed card will do; findSet's pair loop finds one by
    // scanning the board against it.
    for (const other of board) {
      if (other === live[0]) continue
      const completer = third(live[0], other)
      if (completer !== live[0] && completer !== other && board.includes(completer)) {
        return [live[0], other]
      }
    }
    return null
  }

  if (live.length === 2) {
    const completer = third(live[0], live[1])
    return board.includes(completer) ? [live[0], live[1], completer] : null
  }

  // Already showing the whole set: NOTHING. Returning the set again looks
  // harmless and isn't — a complete ring means its claim has already been
  // fired, so a fast fourth press would compute from a board that is about to
  // change and re-submit the same three cards. The server saw both halves of
  // that: `bad-hint` (a hinted card is not on the board) followed by
  // `cards-gone`. A press with nothing left to reveal should do nothing.
  return null
}

/**
 * The ring to show after a reload, recovered from the log: the cards of the
 * most recent hint, but only if no claim has happened since.
 *
 * This is the persistence that storing the ring server-side would have bought,
 * for free — the event row already records what the asker was shown, and a
 * claim is exactly the thing that invalidates it (the board moves, and the
 * cards may be gone).
 */
export function ringFromLog(
  events: readonly { kind: 'claim' | 'hint'; user_id: string; cards: Card[] }[],
  selfId: string,
): Card[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.kind === 'claim') return []
    if (event.user_id === selfId) return event.cards
  }
  return []
}
