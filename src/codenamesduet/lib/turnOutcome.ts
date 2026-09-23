// cs-met-codenamesduet

import type { Outcome } from '@/common/outcomes/outcomes'
import type { GuessEvent } from './events'

/**
 * A codenamesduet turn = one clue + its 0..N guesses, rendered as ONE event-log
 * row — so the per-turn outcome bar needs a single verdict for a turn that can
 * hold several guesses of mixed result. Precedence (does this turn advance us?):
 *   - any **assassin** → `lost` (it ends the game — the worst result);
 *   - **only neutrals** → `lost` (a wasted turn is a setback);
 *   - **mixed** agent + neutral → `near`;
 *   - **all agents** (≥1) → `won`;
 *   - **no guesses** (passed) → `neutral`.
 *
 * **Sudden death reads differently**, as the game does: any guess that is not
 * an agent loses it, so a sudden-death turn is `lost` the moment it holds one,
 * `won` while it holds only agents, and `neutral` before its first guess.
 *
 * **This is the whole of a guess's outcome.** Nothing shows a single guess's
 * outcome: a guess answers with a REVEAL and the board says it, so the
 * pill deliberately stays silent, and where the log prints the guessed words it
 * draws them in the key-card palette (`--codenamesduet-agent` and its two
 * siblings) rather than in outcome colors. The TURN is the only thing wearing
 * one, and this fold is where it is decided: the bar reads the turn rather
 * than its last guess, and `near` for a mixed turn is a rule the turn owns.
 *
 * It folds over the key LETTERS because its three questions are about the key
 * card — did anything end the game, did we advance, did we waste a word — and
 * not about what a guess was worth. `submit_guess`'s answers carry no outcome:
 * they state what was turned over, and this is the only place it becomes one.
 */
export function turnOutcome(
  guesses: ReadonlyArray<GuessEvent>,
  { suddenDeath = false }: { suddenDeath?: boolean } = {},
): Outcome {
  if (guesses.length === 0) return 'neutral'
  if (suddenDeath) return guesses.every((g) => g.guess_result === 'G') ? 'won' : 'lost'
  if (guesses.some((g) => g.guess_result === 'A')) return 'lost'
  const hasAgent = guesses.some((g) => g.guess_result === 'G')
  const hasNeutral = guesses.some((g) => g.guess_result === 'N')
  if (hasAgent && hasNeutral) return 'near'
  return hasAgent ? 'won' : 'lost'
}
