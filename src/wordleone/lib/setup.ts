// cs-unmet

import type { GDifficulty, GSetup } from '../types'

/** Initial setup the manifest hands the dialog as `defaults`: band 2, the
 *  everyday words the NYT's own answers come from, and a medium puzzle. */
export const DEFAULT_WORDLEONE_SETUP: GSetup = {
  legal_band: 2,
  difficulty: 'medium',
  timer: { kind: 'none' },
  // Coop pacing: free-for-all by default; the setup dialog's "Co-op"
  // section (coop, 2+ players) offers turn-by-turn. first_turn_user_id is
  // seeded by the field when turns is picked.
  coop_style: 'free-for-all',
}

/** The difficulties the form offers, with what each means to a player. */
export const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: GDifficulty; label: string }> = [
  { value: 'easy', label: 'Easy — three greens' },
  { value: 'medium', label: 'Medium — one or two greens' },
  { value: 'hard', label: 'Hard — no greens' },
  { value: 'any', label: 'Any' },
]

/** Every wordleone word is five letters: the starter, the answer, a guess, a
 *  board row, and the dictionary slice the band control offers. One home, so
 *  the board, the entry, the form and the printer cannot disagree. */
export const WORD_LENGTH = 5

/** The board's rows: the starter, and the one row a guess is typed into and
 *  the solve lands in. A miss is the log's, not a row. */
export const BOARD_ROWS = 2
