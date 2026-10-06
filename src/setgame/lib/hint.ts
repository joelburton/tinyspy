// cs-unmet

import type { GEvent, GTile } from '../types'
import { findSet, third } from './tiles'

/**
 * The hint, computed on the client.
 *
 * It can be, and that is the whole design: the board is face-up and this file
 * holds the same algebra the server does, so a hint is a local search rather
 * than a lookup. Two things follow — the ring appears on the keystroke instead
 * of after a round trip (it also SELECTS the tiles, so a lag would be felt),
 * and there is no private column for the server to mask.
 *
 * The server still hears about it: `record_hint` charges the asker and writes
 * the event, because the ring is transient UI while the ASKING is history and
 * belongs in the event log. See `supabase/sql/setgame.sql`.
 *
 * ── The ladder ──────────────────────────────────────────────────────────────
 * Each press reveals one more tile of the SAME set:
 *
 *   1st → one tile    "there is a set through here"
 *   2nd → two tiles   "these two go together"
 *   3rd → all three   which, since three picked tiles submit a claim, hands
 *                     you the set outright
 *
 * The third rung needs no special case anywhere: it returns three tiles, the
 * caller picks them, and the existing "three picked tiles claim" rule does
 * the rest.
 */

/**
 * Extend `showing` by one tile of the set it belongs to, or start a new hint.
 * Returns null only when the board holds no set at all, which a playing game
 * never does (the deal rule guarantees one).
 *
 * Growing the SAME set matters: recomputing from scratch could point at a
 * different set on the second press, and the player would be chasing two
 * answers at once. From two tiles the third is determined outright, so the
 * ladder can't wander.
 */
export function nextHint(board: readonly GTile[], showing: readonly GTile[]): GTile[] | null {
  const byId = new Map(board.map((t) => [t.id, t]))
  // The board's own tiles, for the ones still on it.
  const live = showing.flatMap((tile) => byId.get(tile.id) ?? [])

  if (live.length === 0) {
    const found = findSet(board)
    return found ? [found[0]] : null
  }

  if (live.length === 1) {
    // Any set through the ringed tile will do: scan the board against it.
    for (const other of board) {
      if (other.id === live[0].id) continue
      const completer = byId.get(third(live[0], other).id)
      if (completer !== undefined &&
        completer.id !== live[0].id &&
        completer.id !== other.id) {
        return [live[0], other]
      }
    }
    return null
  }

  if (live.length === 2) {
    const completer = byId.get(third(live[0], live[1]).id)
    return completer !== undefined ? [live[0], live[1], completer] : null
  }

  // Already showing the whole set: NOTHING. Returning the set again looks
  // harmless and isn't — a complete ring means its claim has already been
  // fired, so a fast fourth press would compute from a board that is about to
  // change and re-submit the same three tiles. The server saw both halves of
  // that: `bad-hint` (a hinted tile is not on the board) followed by
  // `cards-gone`. A press with nothing left to reveal should do nothing.
  return null
}

/**
 * The ring to show after a reload, recovered from the log: the tiles of my
 * most recent hint, but only if no claim has happened since.
 *
 * This is the persistence that storing the ring server-side would have bought,
 * for free — the event row already records what the asker was shown, and a
 * claim is exactly the thing that invalidates it (the board moves, and the
 * tiles may be gone).
 */
export function ringFromLog(events: readonly GEvent[], myId: string): GTile[] {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.kind === 'claim') return []
    if (event.by.id === myId) return event.tiles
  }
  return []
}
