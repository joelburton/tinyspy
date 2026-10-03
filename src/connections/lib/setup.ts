// cs-blessed-connections

import type { GSetup } from '../types'

/**
 * Initial setup the manifest hands the SetupGameModal wrapper as `defaults`.
 * The setup's shape is `GSetupValues` / `GSetup` (types.ts).
 *
 * NO `puzzle_id` KEY AT ALL — not `''`. The server reads an ABSENT puzzle_id as
 * "you choose"; an empty string is present-but-unparseable and fails the uuid
 * cast as a fault.
 */
export const DEFAULT_CONNECTIONS_SETUP: GSetup = {
  timer: { kind: 'none' },
  // Coop pacing: free-for-all by default; the "Co-op" setup section (coop,
  // 2+ players) offers turn-by-turn. first_turn_user_id is seeded by the field.
  coop_style: 'free-for-all',
}
