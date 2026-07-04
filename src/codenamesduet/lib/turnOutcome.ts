import type { TurnOutcome } from '../../common/components/game/lists/TurnLog'
import type { GuessRow } from '../hooks/useBoard'

/**
 * A codenamesduet turn = one clue + its 0..N guesses, rendered as ONE turn-log
 * row — so the per-turn outcome bar needs a single verdict for a turn that can
 * hold several guesses of mixed outcome. Precedence (does this turn advance us?):
 *   - any **assassin** → `bad` (it ends the game — the worst result);
 *   - **only neutrals** → `bad` (a wasted turn is a setback);
 *   - **mixed** agent + neutral → `partial`;
 *   - **all agents** (≥1) → `good`;
 *   - **no guesses** (passed) → `neutral`.
 */
export function turnOutcome(guesses: GuessRow[]): TurnOutcome {
  if (guesses.length === 0) return 'neutral'
  if (guesses.some((g) => g.outcome === 'A')) return 'bad'
  const hasAgent = guesses.some((g) => g.outcome === 'G')
  const hasNeutral = guesses.some((g) => g.outcome === 'N')
  if (hasAgent && hasNeutral) return 'partial'
  return hasAgent ? 'good' : 'bad'
}
