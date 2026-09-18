// cs-audited-reveal

import { useCallback, useState } from 'react'

/** What `useSolutionReveal` hands back — see the hook. */
export interface SolutionReveal {
  // Is the solution on screen for ME, right now? Gates whatever this game draws
  // as its answer, and picks which of the two faces the game's `act-reveal`
  // binding wears — each game names the thing in its own words.
  revealed: boolean
  // The button's onClick — show it, or put it away again.
  toggle: () => void
  // Put it away without asking whether it's open.
  hide: () => void
  // Forget my choice entirely, handing control back to `impliedBy`.
  reset: () => void
  // Is the answer on screen because I SOLVED it, with no choice of mine
  // involved? Drives the disabled Reveal button + its "Solution already shown"
  // words — there is nothing for the control to do.
  impliedBySolve: boolean
}

/**
 * "Did I produce the solution?" — the predicate a game passes as `impliedBy`.
 *
 * **Compete** asks the caller's own per-player bit: solving is personal there,
 * and the game's verdict is not a proxy for it (wordle writes `won_compete`
 * when SOMEONE wins, and the racer three guesses off never produced the word).
 *
 * **Coop asks the GAME**, because there is one board and one outcome: if the
 * table solved it, every player is looking at the solution. It is also the only
 * question coop can answer in every game, since three of them write no usable
 * per-player bit there:
 *
 *   - stackdown writes `players.solved` only `when mode = 'compete'`;
 *   - strands' coop branch ends the game directly and never touches it;
 *   - psychicnum counts `found_secrets_count` per CALLER, so two teammates
 *     finding 2 and 1 leaves neither at three.
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
 * `impliedBy` is "did I SOLVE it" — pass `solvedByMe(...)` from a game you can
 * only finish by producing the answer. Its player then starts with the answer
 * shown, and `impliedBySolve` stays true until they make a choice of their own,
 * which is what the game's Reveal button reads to go inert. A game whose win
 * does not mean you saw the answer passes nothing.
 *
 * Why the reveal is personal and temporary, and which games pass what:
 * `src/common/reveal/doc.md`.
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
  const hide = useCallback(() => setPick(false), [])
  const reset = useCallback(() => setPick(null), [])
  return { revealed, toggle, hide, reset, impliedBySolve: impliedBy && pick === null }
}
