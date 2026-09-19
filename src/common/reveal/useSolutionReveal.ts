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

/**
 * "Did I produce the solution?" — the predicate a game passes as `impliedBy`.
 *
 * Only the games where a player's own finished board IS the puzzle-solution
 * call this: wordle can only be finished by typing the target. Where the two
 * are different things — crosswords' author grid, codenamesduet's partner key
 * card, wordiply's best word, letterboxed's seeded pair — no result puts the
 * puzzle-solution on screen, so there is nothing to compute and the game passes
 * no `impliedBy` at all. Both terms: `common/reveal/doc.md`.
 *
 * **Compete: pass your own per-player solved bit.** The game's verdict is no
 * proxy for it — wordle writes `won_compete` when SOMEONE wins, and the racer
 * three guesses off never produced the word.
 *
 * **Coop ignores `mine` and asks the game**, because one board means one
 * answer: if the table solved it, every player is looking at the solution. Pass
 * whatever the game has; it is not read. (Why a per-player row can't stand in
 * for the game here: docs/ui.md → Terminal results.)
 *
 * `playState === 'won'` is the coop win in the shared vocabulary (docs/states.md);
 * 'ended' and 'lost' are terminals nobody solved.
 */
export function solvedByMe({
  isCompete,
  playState,
  mine,
}: {
  isCompete: boolean
  playState: string
  // The caller's own per-player solved bit — compete's answer.
  mine: boolean
}): boolean {
  return isCompete ? mine : playState === 'won'
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
export function useSolutionReveal({ impliedBy = false }: { impliedBy?: boolean } = {}): SolutionReveal {
  // NULL = "no opinion, follow `impliedBy`"; only an explicit press writes here.
  // That is what keeps a solve that lands AFTER mount working: `impliedBy` is
  // false on the first render whatever the game state, since the per-player rows
  // it reads arrive a render or two later, so a `useState(impliedBy)` initializer
  // would capture that false and never notice the win.
  const [pick, setPick] = useState<boolean | null>(null)
  const revealed = pick ?? impliedBy
  const toggle = useCallback(() => setPick((p) => !(p ?? impliedBy)), [impliedBy])
  return { revealed, toggle, impliedBySolve: impliedBy && pick === null }
}
