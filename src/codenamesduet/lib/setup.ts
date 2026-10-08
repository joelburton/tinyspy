// cs-blessed-codenamesduet

import type { FormErrors } from '@/common/forms/formState'
import type { GSetup, GWordPool } from '../types'


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
 *
 * The board's words default to the Codenames Duet list alone, the game's own.
 */
export const DEFAULT_CODENAMESDUET_SETUP: GSetup = {
  turns: 9,
  first_clue_giver_user_id: '',
  timer: { kind: 'none' },
  word_pools: ['duet'],
}

/** The allowed `turns` values — drives the radio rendering. */
export const TURN_OPTIONS = [9, 10, 11] as const

/**
 * The word pools, in pool order — the order `word_pool.pool` numbers them in
 * and every list of them is shown in. The third holds sexual terms, which its
 * label says on the checkbox itself.
 */
export const WORD_POOLS: { name: GWordPool; label: string }[] = [
  { name: 'duet', label: 'Codenames Duet' },
  { name: 'codenames', label: 'Codenames' },
  { name: 'undercover', label: 'Undercover (adult)' },
]

/** The chosen pools' labels, comma-separated in pool order: "Codenames Duet, Codenames". */
export function listWordPoolLabels(pools: GWordPool[]): string {
  return WORD_POOLS.filter((p) => pools.includes(p.name)).map((p) => p.label).join(', ')
}

/** Start waits for at least one word pool; `create_game` refuses none as a fault. */
export function wordPoolsError(setup: GSetup): FormErrors {
  return setup.word_pools.length === 0 ? { word_pools: 'Pick at least one word pool.' } : {}
}
