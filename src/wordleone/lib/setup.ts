// cs-unmet

import { dictBandValue } from '@/common/setup-form/dictBand'
import type { GDifficulty, GSetup } from '../types'

/** Initial setup the manifest hands the dialog as `defaults`: the NYT answer
 *  list, as wordle's default is, and a medium puzzle. */
export const DEFAULT_WORDLEONE_SETUP: GSetup = {
  answer_band: 0,
  difficulty: 'medium',
  timer: { kind: 'none' },
  // Coop pacing: free-for-all by default; the setup dialog's "Co-op"
  // section (coop, 2+ players) offers turn-by-turn. first_turn_user_id is
  // seeded by the field when turns is picked.
  coop_style: 'free-for-all',
}

/** The difficulties the form offers. The labels say no more than the tier:
 *  which shapes of colors each allows is the generator's (Joel, 2026-10-07). */
export const DIFFICULTY_OPTIONS: ReadonlyArray<{
  value: GDifficulty;
  label: string
}> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'any', label: 'Any' },
]

/** The setup row's value for the answer band. `0` = the curated NYT-Wordle
 *  answer list; `1..6` = a clean word of that dictionary band or easier. */
export function answerBandValue(n: number): string {
  return n === 0 ? 'NYT Wordle list' : `${dictBandValue(n)} or easier`
}

/** Every wordleone word is five letters: the starter, the answer, a guess, a
 *  board row, and the dictionary slice the band control offers. One home, so
 *  the board, the entry, the form and the printer cannot disagree. */
export const WORD_LENGTH = 5

/** The glyph a blank holds in the typed word — a slot the player has not
 *  settled, typed with `.` on either keyboard so the word's shape can be laid
 *  out before every letter is known. It is never sent: see `hasBlank`. */
export const BLANK = '.'

/** Whether the typed word still holds a blank — a word that cannot be
 *  submitted, so the entry vetoes Enter and its cap until each is replaced. */
export function hasBlank(word: string): boolean {
  return word.includes(BLANK)
}

/** The board's rows: the starter, and the one row a guess is typed into and
 *  the solve lands in. A miss is the log's, not a row. */
export const BOARD_ROWS = 2
