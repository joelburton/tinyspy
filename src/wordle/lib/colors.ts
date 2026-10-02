// cs-blessed-wordle

/**
 * wordle's color module = the shared code→class-key mapper (the server,
 * `common._wordle_colors`, is authoritative — the FE never recomputes,
 * it doesn't hold the target) plus the wordle-only helpers below that
 * drive the on-screen keyboard.
 */
export { getTileColor, type TileColor } from '@/shared/wordle-style/tileColor'
import { getTileColor, type TileColor } from '@/shared/wordle-style/tileColor'
import type { KeyColor } from '@/shared/onscreen-keyboard/GuessKeyboard'
import type { GBoardRow } from '../types'
import { WORD_LENGTH } from './setup'

/** Strength order so the on-screen keyboard can keep the BEST color
 *  seen for a letter across all guesses (green beats yellow beats
 *  gray). Higher = stronger. */
export function colorRank(c: TileColor): number {
  switch (c) {
    case 'wordleGreen':
      return 3
    case 'wordleYellow':
      return 2
    case 'wordleGray':
      return 1
    case 'blank':
      return 0
  }
}

/**
 * Each letter's key color: the strongest color it has earned across the
 * board's rows (green beats yellow beats gray). A letter never guessed has no
 * entry, and its key stays neutral.
 */
export function makeKeyColors(rows: readonly GBoardRow[]): ReadonlyMap<string, KeyColor> {
  const keyColors = new Map<string, KeyColor>()
  for (const row of rows) {
    for (let i = 0; i < WORD_LENGTH; i++) {
      const letter = row.word[i]!
      const color = getTileColor(row.colors[i])
      if (color === 'blank') continue
      const earned = keyColors.get(letter)
      if (!earned || colorRank(color) > colorRank(earned)) keyColors.set(letter, color)
    }
  }
  return keyColors
}
