// cs-unmet

import type { TurnOutcome } from '@/common/turn-log/TurnLog'
import type { GuessRow } from '../hooks/useBoard'

/**
 * A codenamesduet turn = one clue + its 0..N guesses, rendered as ONE turn-log
 * row — so the per-turn outcome bar needs a single verdict for a turn that can
 * hold several guesses of mixed outcome. Precedence (does this turn advance us?):
 *   - any **assassin** → `lost` (it ends the game — the worst result);
 *   - **only neutrals** → `lost` (a wasted turn is a setback);
 *   - **mixed** agent + neutral → `near`;
 *   - **all agents** (≥1) → `won`;
 *   - **no guesses** (passed) → `neutral`.
 */
export function turnOutcome(guesses: GuessRow[]): TurnOutcome {
  if (guesses.length === 0) return 'neutral'
  if (guesses.some((g) => g.result === 'A')) return 'lost'
  const hasAgent = guesses.some((g) => g.result === 'G')
  const hasNeutral = guesses.some((g) => g.result === 'N')
  if (hasAgent && hasNeutral) return 'near'
  return hasAgent ? 'won' : 'lost'
}
