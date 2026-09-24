// cs-unmet

import { useState } from 'react'

/** What `useSelectionCursor` hands back. `P` is whatever names a place: a row
 *  index in a list, a cell on a board. */
export type SelectionCursor<P> = {
  // Where the cursor is, painted or not.
  at: P
  // Whether it is painted. The caller may hide it further (a list without
  // focus, a board that is not live), but never show it when this is false.
  revealed: boolean
  // A RELATIVE key (an arrow, a page) asking to go to `to`. The first press
  // only reveals; the next one goes.
  step: (to: P) => void
  // An ABSOLUTE key (Home, End) naming `to`: reveal and go in one press.
  jump: (to: P) => void
  // A click on `to`: the cursor goes there and hides.
  point: (to: P) => void
  // The move itself went to `to` another way (strands' typed letter): the
  // cursor goes there, shown or hidden as it already was.
  follow: (to: P) => void
}

/**
 * The state of a **selection cursor** — an alternative to clicking, hidden
 * from a player who never touches the keys. It owns the rules every selection
 * cursor keeps alike, so a list and a board cannot drift apart on them:
 *
 * - **Hidden until a movement key asks.** A mouse player never sees it.
 * - **The first relative press reveals rather than moves.** "One from where I
 *   am" has no honest answer before there is a where-I-am, so that press
 *   paints the resting place and the next one steps.
 * - **An absolute press reveals and moves.** It named a destination.
 * - **A click moves it and hides it**, so going back to the keys resumes where
 *   the hand left off.
 * - **A move made another way can carry it along** (`follow`) without showing
 *   or hiding it — strands' typed letter, so the next arrow starts beside it.
 *
 * Where a move lands — clamping to a list's ends, stepping over a board's
 * holes — is the caller's, handed in as the destination. So is what the keys
 * ARE, and what acts on the cursor: a caller that acts on it must not while
 * `revealed` is false.
 *
 * Contrast a geographic cursor (crosswords' cell, the letter-grid games'
 * `gridCursor`), which the player needs to read the board and which never
 * hides.
 */
export function useSelectionCursor<P>(start: P): SelectionCursor<P> {
  const [at, setAt] = useState(start)
  const [revealed, setRevealed] = useState(false)
  return {
    at,
    revealed,
    step: (to) => (revealed ? setAt(to) : setRevealed(true)),
    jump: (to) => {
      setAt(to)
      setRevealed(true)
    },
    point: (to) => {
      setAt(to)
      setRevealed(false)
    },
    follow: setAt,
  }
}
