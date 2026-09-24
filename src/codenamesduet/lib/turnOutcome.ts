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
 * A single guess has no outcome: `submit_guess` answers with what was turned
 * over and the board shows it. This fold is the only place a result becomes
 * an outcome, and it is the turn's, read off the key letters.
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
