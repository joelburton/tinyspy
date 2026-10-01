// cs-blessed-reveal

import { IconHideSolution } from '@/common/icons/icons'
import type { Described } from '@/common/actions/useBindAction'
import type { EndOutcome } from '../terminal/gameEnding'

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
  // The plain eye, not the crossed one: a solver never pressed Reveal, so there
  // is no "on" for a struck-through eye to be the "off" of.
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
 * **Compete: pass your own per-player solved bit.** The game's outcome is no
 * proxy for it — a wordle race is `won` when SOMEONE wins, and the racer three
 * guesses off never produced the word.
 *
 * **Coop ignores `mine` and asks the game**, because one board means one
 * answer: if the table solved it, every player is looking at the solution. Pass
 * whatever the game has; it is not read. (Why a per-player row can't stand in
 * for the game here: this folder's doc.md.)
 *
 * A coop game's outcome `won` is the table's win (docs/states.md → How a game
 * ends); `lost` and `neutral` are endings nobody solved.
 */
export function solvedByMe({
  isCompete,
  gameOutcome,
  mine,
}: {
  isCompete: boolean
  // The game's outcome (`gameEnding?.outcome`), null while it is played.
  gameOutcome: EndOutcome | null
  // The caller's own per-player solved bit — compete's answer.
  mine: boolean
}): boolean {
  return isCompete ? mine : gameOutcome === 'won'
}
