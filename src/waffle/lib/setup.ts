// cs-unmet

import type { GSetup } from '../types'

/** Initial setup the manifest hands the dialog as `defaults`. */
export const DEFAULT_WAFFLE_SETUP: GSetup = {
  dict_band: 2,
  extra_swaps: 5,
  timer: { kind: 'none' },
  // Coop pacing: free-for-all by default; the "Co-op" setup section (coop,
  // 2+ players) offers turn-by-turn. first_turn_user_id is seeded by the field.
  coop_style: 'free-for-all',
}

/**
 * The extra-swap choices the form offers, with a difficulty gloss.
 * par is ~9–11, so these land the budget around 12–19.
 */
export const EXTRA_SWAP_OPTIONS: ReadonlyArray<{
  value: number;
  label: string
}> = [
  { value: 3, label: 'Tight' },
  { value: 5, label: 'Normal' },
  { value: 8, label: 'Relaxed' },
]
