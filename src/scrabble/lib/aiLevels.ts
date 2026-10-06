// cs-unmet

import type { GAiLevel } from '../types.ts'

/**
 * The bots' strength levels, weakest to strongest — the order the setup form
 * offers them in and the tuning script sweeps them in. What each plays like is
 * `lib/policy.ts`'s `LEVELS`. A module of its own so the setup form's chunk
 * can list them without loading the policy.
 */
export const AI_LEVELS: readonly GAiLevel[] =
  ['beginner', 'casual', 'intermediate', 'strong', 'best']
