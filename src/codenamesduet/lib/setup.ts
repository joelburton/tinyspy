// cs-blessed-codenamesduet

import type { GSetup } from '../types'


/**
 * Initial setup the manifest hands the SetupGameModal wrapper
 * as `defaults`. `first_clue_giver_user_id` starts empty — the
 * defaults are evaluated at module-load time, before any club
 * is known, so a real user-id can't be filled in until the body
 * mounts inside a specific club's dialog. `SetupForm` seeds it with the
 * first chosen player, and again whenever that one is unticked.
 *
 * Timer defaults to `none` — Duet's pacing already comes from
 * the turn budget; a wall-clock countdown is opt-in for
 * players who want extra pressure.
 */
export const DEFAULT_CODENAMESDUET_SETUP: GSetup = {
  turns: 9,
  first_clue_giver_user_id: '',
  timer: { kind: 'none' },
}

/** The allowed `turns` values — drives the radio rendering. */
export const TURN_OPTIONS = [9, 10, 11] as const
