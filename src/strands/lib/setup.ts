// cs-unmet

import type { GSetup } from '../types'

/**
 * strands' setup defaults, one per manifest. Here rather than in `manifest.ts`
 * so the SetupForm body can import them without dragging the manifest into its
 * lazy chunk.
 *
 * Band 5 matches the other word games' "legal" default: generous enough that
 * hints are earnable without handing them out.
 */
/* NO `puzzle_id` KEY — not `''`. The server reads an ABSENT puzzle_id as "you
 * choose"; an empty string is present-but-unparseable and would fail the uuid
 * cast instead. */
export const DEFAULT_STRANDS_SETUP_COOP: GSetup = {
  band: 5,
  hint_cost: 3,
  min_word_length: 4,
  timer: { kind: 'none' },
  coop_style: 'free-for-all',
}

/** Compete's defaults. Identical to coop's but for the pacing field, which is
 *  meaningless in a race — everyone plays at once, always. */
export const DEFAULT_STRANDS_SETUP_COMPETE: GSetup = {
  ...DEFAULT_STRANDS_SETUP_COOP,
  coop_style: 'free-for-all',
}
