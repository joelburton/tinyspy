// cs-blessed-reveal

import { useCallback, useState } from 'react'

/** What `useSolutionReveal` hands back — see the hook. */
export interface SolutionReveal {
  // Is the solution on screen for ME, right now? Gates whatever this game draws
  // as its answer, and picks which of the two faces its `act-reveal` wears
  // (`describeReveal`).
  revealed: boolean
  // The button's onClick — show it, or put it away again.
  toggle: () => void
  // Is the answer on screen because I SOLVED it, with no choice of mine
  // involved? Drives the disabled Reveal button + its "Solution already shown"
  // words — there is nothing for the control to do.
  impliedBySolve: boolean
}

type SolutionRevealOptions = {
  impliedBy?: boolean
}

/**
 * The terminal solution reveal — "am I looking at the answer?" — as LOCAL,
 * per-player, unpersisted state: nothing is written, nothing rides realtime,
 * and my looking opens nothing on anybody else's screen. `toggle` goes both
 * ways, so a game whose reveal rewrites the board can always put back the one
 * the players finished with.
 *
 * `impliedBy` says this player is looking at the answer already, so the control
 * has nothing left to do. It means one thing: **their own board-solution IS the
 * puzzle-solution** — wordle's typed target, waffle's solved grid. Those games
 * pass `solvedByMe(...)`; their solver starts revealed and `impliedBySolve`
 * stays true until they choose otherwise, which is what the game's Reveal
 * button reads to go inert. A game whose puzzle-solution is a distinct artifact
 * (the author's grid, the partner's key card) passes nothing — no way of
 * finishing puts that in front of anyone.
 *
 * A restart needs nothing from the caller: `GamePage` keys the play surface on
 * `common.games.restarts`, so the replayed run mounts a fresh hook and starts
 * blind.
 *
 * The two terms, why the reveal is personal and temporary, and which games pass
 * what: `src/common/reveal/doc.md`.
 */
export function useSolutionReveal({ impliedBy = false }: SolutionRevealOptions = {}): SolutionReveal {
  // NULL = "no opinion, follow `impliedBy`"; only an explicit press writes here.
  // That is what keeps a solve that lands AFTER mount working: `impliedBy` is
  // false on the first render whatever the game state, since the per-player rows
  // it reads arrive a render or two later, so a `useState(impliedBy)` initializer
  // would capture that false and never notice the win.
  const [myChoice, setMyChoice] = useState<boolean | null>(null)
  const revealed = myChoice ?? impliedBy
  const toggle = useCallback(
    () => setMyChoice((prevChoice) => !(prevChoice ?? impliedBy)),
    [impliedBy],
  )
  return { revealed, toggle, impliedBySolve: impliedBy && myChoice === null }
}
