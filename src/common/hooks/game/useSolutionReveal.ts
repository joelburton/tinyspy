import { useCallback, useState } from 'react'

/** What `useSolutionReveal` hands back — see the hook. */
export interface SolutionReveal {
  /** Is the solution on screen for ME, right now? Gates whatever this game
   *  draws as its answer, and drives `<RevealButton revealed={…}>`. */
  revealed: boolean
  /** The button's onClick — show it, or put it away again. */
  toggle: () => void
  /** Put it away without asking whether it's open. For the paths that must
   *  start blind: a Restart hunts the SAME board again, and a replay whose
   *  answer is still on screen isn't a second try. */
  hide: () => void
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
 * Autoreveal isn't a mode here. A game that wants its answer up the moment it
 * ends is "the button starts pressed", which is a one-line change at the call
 * site the day one wants it — no parameter until then. (The three word-finding
 * games that DO show their missed words at game over — boggle, spellingbee,
 * wordwheel — don't use this hook at all: their word list's found/missed filter
 * IS the reveal control, and a second one would just be a confusing way to
 * switch the same two lists.)
 */
export function useSolutionReveal(): SolutionReveal {
  const [revealed, setRevealed] = useState(false)
  const toggle = useCallback(() => setRevealed((v) => !v), [])
  const hide = useCallback(() => setRevealed(false), [])
  return { revealed, toggle, hide }
}
