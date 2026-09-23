// cs-met-codenamesduet

import type { Outcome } from '@/common/outcomes/outcomes'
import type { GuessRow } from '../hooks/useBoard'

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
 * **This is the whole of the game's outcome decision**, which is why there is no
 * `lib/answer.ts` here as there is in the other games. Nothing shows a single
 * guess's outcome: a guess answers with a REVEAL and the board says it, so the
 * pill deliberately stays silent, and where the log prints the guessed words it
 * draws them in the key-card palette (`--codenamesduet-agent` and its two
 * siblings) rather than in outcome colors. The TURN is the only thing wearing
 * one, and this fold is where it is decided — kept per Joel's ruling
 * (2026-09-16) that the bar reads the turn rather than its last guess, `near`
 * for a mixed turn being a rule the turn owns and no single guess can express.
 *
 * It folds over the key LETTERS because its three questions are about the key
 * card — did anything end the game, did we advance, did we waste a word — and
 * not about what a guess was worth. `submit_guess`'s answers carry no outcome:
 * they state what was turned over, and this is the only place it becomes one.
 */
export function turnOutcome(guesses: GuessRow[]): Outcome {
  if (guesses.length === 0) return 'neutral'
  if (guesses.some((g) => g.result === 'A')) return 'lost'
  const hasAgent = guesses.some((g) => g.result === 'G')
  const hasNeutral = guesses.some((g) => g.result === 'N')
  if (hasAgent && hasNeutral) return 'near'
  return hasAgent ? 'won' : 'lost'
}
