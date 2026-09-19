// cs-audited-reveal

import { IconHideSolution } from '@/common/icons/icons'
import type { Described } from '@/common/actions/useBoundAction'

/**
 * How a game's `act-reveal` looks right now — the one `describe()` every game
 * with a reveal places, so their three states cannot drift apart.
 *
 * `noun` is the word after the verb: "solution" almost everywhere, since that
 * is what the control shows (`doc.md` → puzzle-solution). A game says something
 * else only where the thing genuinely is not a solution — wordiply's "best
 * solution", codenamesduet's "key cards".
 *
 * Omit `impliedBySolve` where a game never starts revealed; the branch simply
 * never fires. A game needing a state of its own puts it in front of this call
 * rather than in here — psychicnum hides the BUTTON while you are still
 * hunting, and its `describe` answers that before asking this.
 */
export function describeReveal({
  noun,
  revealed,
  impliedBySolve = false,
  isTerminal,
}: {
  noun: string
  revealed: boolean
  impliedBySolve?: boolean
  isTerminal: boolean
}): Described {
  if (impliedBySolve) return { state: 'disabled', label: 'Solution already shown' }
  if (revealed) return { state: 'active', label: `Hide ${noun}`, icon: IconHideSolution }
  // Named in the inert case too: the registry's bare "Reveal" would make the
  // row change its words as the game ended, which is not what it says. And the
  // tooltip is why it is gray, in every game — the reveal waits for the game to
  // be over for EVERYONE, so a player who dropped out cannot spoil a live race.
  return isTerminal
    ? { state: 'active', label: `Reveal ${noun}` }
    : { state: 'disabled', label: `Reveal ${noun}`, tooltip: "Can't reveal until all end" }
}
