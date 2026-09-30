// cs-blessed-wordle

/**
 * wordle's color module = the shared code→class-key mapper (the server,
 * `common._wordle_colors`, is authoritative — the FE never recomputes,
 * it doesn't hold the target) plus the wordle-only helpers below that
 * drive the reveal animation and the on-screen keyboard.
 */
export { getTileColor, type TileColor } from '@/shared/wordle-style/tileColor'
import { getTileColor, type TileColor } from '@/shared/wordle-style/tileColor'
import type { KeyColor } from '@/shared/onscreen-keyboard/GuessKeyboard'
import type { BoardRow } from './board'
import { WORD_LENGTH } from './setup'

/**
 * The CSS custom-property reference for a feedback color, used to drive
 * the tile-flip reveal animation: the keyframes paint the tile with
 * `var(--reveal-bg)` only at the flip's midpoint, so a tile set inline
 * to this value stays blank until it flips. `blank` has no reveal color.
 */
export function revealVar(c: TileColor): string | undefined {
  switch (c) {
    case 'wordleGreen':
      return 'var(--wordle-green-fill-color)'
    case 'wordleYellow':
      return 'var(--wordle-yellow-fill-color)'
    case 'wordleGray':
      return 'var(--wordle-gray-fill-color)'
    case 'blank':
      return undefined
    default:
      throw new Error(`BUG: revealVar has no answer for the tile color ${c}`)
  }
}

/**
 * The matching EDGE for a feedback color — the darker shade a settled tile
 * wears (see `--wordle-*-edge-color`).
 *
 * Its own variable because the flip's keyframes paint the tile themselves and
 * `animation-fill-mode: both` makes the final frame stick: a freshly-flipped
 * tile keeps whatever the keyframes left it with, so they have to paint the
 * same edge the static class gives a row that was already on screen at mount.
 */
export function revealBorderVar(c: TileColor): string | undefined {
  switch (c) {
    case 'wordleGreen':
      return 'var(--wordle-green-edge-color)'
    case 'wordleYellow':
      return 'var(--wordle-yellow-edge-color)'
    case 'wordleGray':
      return 'var(--wordle-gray-edge-color)'
    case 'blank':
      return undefined
    default:
      throw new Error(`BUG: revealBorderVar has no answer for the tile color ${c}`)
  }
}

/**
 * The matching INK — the color the letter takes once the flip lands on a
 * judgment.
 *
 * Its own variable for the same reason the edge has one. Not a hard
 * `--ink-onDark-color`: that is only right while the page is light — the judged
 * ink is half of a contrast whose other half is the page, and it flips with the
 * theme (themes/daylight.css → WORDLE INK).
 */
export function revealInkVar(c: TileColor): string | undefined {
  switch (c) {
    case 'wordleGreen':
      return 'var(--wordle-green-ink-color)'
    case 'wordleYellow':
      return 'var(--wordle-yellow-ink-color)'
    case 'wordleGray':
      return 'var(--wordle-gray-ink-color)'
    case 'blank':
      return undefined
    default:
      throw new Error(`BUG: revealInkVar has no answer for the tile color ${c}`)
  }
}

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
export function makeKeyColors(rows: readonly BoardRow[]): ReadonlyMap<string, KeyColor> {
  const keyColors = new Map<string, KeyColor>()
  for (const row of rows) {
    for (let i = 0; i < WORD_LENGTH; i++) {
      const letter = row.guess[i]!
      const color = getTileColor(row.colors[i])
      if (color === 'blank') continue
      const earned = keyColors.get(letter)
      if (!earned || colorRank(color) > colorRank(earned)) keyColors.set(letter, color)
    }
  }
  return keyColors
}
