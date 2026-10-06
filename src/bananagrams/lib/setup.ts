// cs-unmet

import type { FormErrors } from '@/common/forms/formState'
import type { GSetup, GWordCheck } from '../types'

/**
 * bananagrams' setup constants and the dialog's gate. The setup's shape is
 * `GSetup` in `types.ts`; this file holds what the form offers for each field
 * and the one cross-field rule the dialog checks before Start.
 *
 * Lives in `lib/` (not inline in `manifest.ts`) so the SetupForm body
 * can import it without dragging the manifest into its chunk.
 */

/** The full Bananagrams bag — the hard cap on `bunch_size`. */
export const BANANAGRAMS_BUNCH_MAX = 144

/** Initial setup the manifest hands the SetupGameModal wrapper as
 *  `defaults`. Full 144-tile bag, no word check (the classic game). */
export const DEFAULT_BANANAGRAMS_SETUP: GSetup = {
  hand_size: 15,
  bunch_size: BANANAGRAMS_BUNCH_MAX,
  word_check: 'off',
  dict_2: 4,
  dict_3plus: 4,
  dump_to_bag: false,
  timer: { kind: 'none' },
}

/** The allowed `hand_size` values — drives the radio rendering and
 *  matches the SQL `check (hand_size in (15, 21))`. */
export const HAND_SIZE_OPTIONS = [15, 21] as const

/** The `word_check` radio options, in escalating strictness — drives the
 *  SetupForm control and matches the SQL `word_check in ('off','win','strict')`. */
export const WORD_CHECK_OPTIONS: ReadonlyArray<{ value: GWordCheck; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'win', label: 'At win' },
  { value: 'strict', label: 'Every peel' },
]

/**
 * The number of tiles a game needs to deal: one starter hand per player.
 * Drives both the bunch-size hint and the gate below.
 */
export function tilesNeeded(setup: GSetup, playerCount: number): number {
  return playerCount * setup.hand_size
}

/**
 * Why the current `bunch_size` can't start a game, or `null` if it's fine.
 * The dialog uses this to gate Start (via the manifest's `validate`) and
 * the SetupForm shows it inline. Mirrors `create_game`'s server-side
 * checks: 1..144, and big enough to deal every player their hand.
 */
export function bunchSizeError(
  setup: GSetup,
  playerCount: number,
): FormErrors {
  const { bunch_size } = setup
  if (!Number.isInteger(bunch_size) || bunch_size < 1) {
    return { bunch_size: 'Bunch size must be a whole number of at least 1.' }
  }
  if (bunch_size > BANANAGRAMS_BUNCH_MAX) {
    return { bunch_size: `The bunch holds at most ${BANANAGRAMS_BUNCH_MAX} tiles.` }
  }
  const needed = tilesNeeded(setup, playerCount)
  if (bunch_size < needed) {
    return {
      bunch_size: `Bunch too small: needs ${needed} (${playerCount} × ${setup.hand_size}) — add tiles or lower hands.`,
    }
  }
  return {}
}
