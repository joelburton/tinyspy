// cs-unmet

import type { GScope } from '../types.ts'

/** Cap on a single cell's fill / solution length, in characters.
 *  Single letters are 1; rebus answers up to MAX_REBUS_LEN. The parsers
 *  and the server's `set_cell` enforce it; the rebus input uses it to
 *  size itself. */
export const MAX_REBUS_LEN = 8

/**
 * The user-facing word for each scope — the ONE place they're spelled.
 *
 * Two surfaces name these actions: the Controls bar under the board and the
 * game menu's Check / Reveal submenus. One table for both, so the app cannot
 * call one thing two names depending on where you clicked.
 *
 * Note `puzzle` → "Grid": the scope VALUE is the server's word (it rides the
 * check/reveal RPCs), "Grid" is the player's.
 */
export const SCOPE_LABEL: Record<GScope, string> = {
  letter: 'Letter',
  word: 'Word',
  puzzle: 'Grid',
}
