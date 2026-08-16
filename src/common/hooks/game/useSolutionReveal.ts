import { useCallback, useState } from 'react'

/** What `useSolutionReveal` hands back — see the hook. */
export interface SolutionReveal {
  /** Is the solution on screen for ME, right now? Gates whatever this game
   *  draws as its answer, and drives `<RevealButton revealed={…}>`. */
  revealed: boolean
  /** The button's onClick — show it, or put it away again. */
  toggle: () => void
  /** Put it away without asking whether it's open. */
  hide: () => void
  /** Forget my choice entirely, handing control back to `impliedBy`. What a
   *  Restart wants: `hide()` there would record an explicit "no" that outranks
   *  the implied default, so solving the replayed board wouldn't show it. */
  reset: () => void
  /** Is the answer on screen because I SOLVED it, with no choice of mine
   *  involved? Drives the disabled Reveal button + its "Solution already shown"
   *  tooltip — there is nothing for the control to do. */
  impliedBySolve: boolean
}

/**
 * The terminal solution reveal — "am I looking at the answer?" — as LOCAL,
 * per-player, unpersisted state.
 *
 * Three properties, and each is a deliberate answer to how this used to work
 * (one shared `common.games.solution_revealed` column, flipped by an RPC):
 *
 *   - **Personal.** Joel pressing Reveal doesn't open Moth's board. Losing a
 *     game and then sitting with it is a real thing friends do, and one
 *     impatient click used to end it for the whole table.
 *   - **Temporary.** `toggle` goes both ways. The games whose reveal REWRITES
 *     the board (crosswords, strands, waffle, connections) stop destroying the
 *     record of where the players actually got to — hide, and the board is the
 *     one they finished with.
 *   - **Unpersisted.** Nothing is written, so nothing has to be un-written on a
 *     replay, nothing rides realtime, and a reload lands back on the board as
 *     it ended. Under the friends trust model the answer is already on every
 *     client once the game is terminal (docs/ui.md → Terminal results), so
 *     withholding it server-side was never protecting anything a post-terminal
 *     display gate couldn't.
 *
 * ## `impliedBy` — the games you can only win by solving
 *
 * Six games have a **clear win**: reaching the end means you produced the
 * answer, so it is already in front of you (strands, psychicnum, stackdown,
 * waffle, connections, wordle). Asking those players to press Reveal is asking
 * them to uncover something they're looking at. Pass `impliedBy` and the answer
 * starts shown; the caller's Reveal button reads `impliedBySolve` and goes
 * disabled with a "Solution already shown" tooltip, since there is nothing left
 * for it to do.
 *
 * **The predicate is "did I SOLVE it", not "was the game won".** In compete
 * those come apart: wordle writes `won_compete` when *someone* wins, and the
 * player who was three guesses off never produced the word — starting them
 * revealed would hand over the answer unasked, the exact thing the personal
 * reveal exists to prevent. Each game passes its own per-player solved bit.
 * (It also gets strands compete right for free: a player who solved but lost on
 * hint count still consumed their board, so they should still start shown.)
 *
 * **Derived, never a `useState` initializer.** `impliedBy` is false at mount
 * whatever the game state — the per-player rows it comes from arrive a render
 * or two later (the waffle loading-race lesson) — and a game can be won
 * mid-session besides. An initializer would capture that first `false` and
 * never notice. So the state holds only the player's own explicit choice, and
 * `revealed` is recomputed each render; see
 * [[feedback_usestate_initializer_freezes_async_default]].
 *
 * The four games without a clear win pass nothing: letterboxed (a win is any
 * covering chain, not the seeded pair), crosswords (rebuses and quantum clues
 * mean your grid may legitimately differ from the author's), wordiply (winning
 * never means you found the best word), and codenamesduet (a win contacts all
 * fifteen agents, but the partner's card still names which of YOUR tiles were
 * bystanders — information you never saw).
 */
export function useSolutionReveal({ impliedBy = false }: { impliedBy?: boolean } = {}): SolutionReveal {
  // NULL = "no opinion, follow the game". Only an explicit press writes here,
  // which is what lets `impliedBy` keep working after mount.
  const [pick, setPick] = useState<boolean | null>(null)
  const revealed = pick ?? impliedBy
  const toggle = useCallback(() => setPick((p) => !(p ?? impliedBy)), [impliedBy])
  const hide = useCallback(() => setPick(false), [])
  const reset = useCallback(() => setPick(null), [])
  return { revealed, toggle, hide, reset, impliedBySolve: impliedBy && pick === null }
}
