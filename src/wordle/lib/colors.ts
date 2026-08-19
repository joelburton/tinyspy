/**
 * wordle's color module = the shared code→class-key mapper (the server,
 * `common.wordle_colors`, is authoritative — the FE never recomputes,
 * it doesn't hold the target) plus the two wordle-only helpers below
 * that drive the reveal animation and the on-screen keyboard.
 */
export { tileColor, type TileColor } from '../../common/lib/color/tileColor'
import type { TileColor } from '../../common/lib/color/tileColor'

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
    default:
      return undefined
  }
}

/**
 * The matching EDGE for a feedback color — the darker shade a settled tile
 * wears (see `--wordle-*-border`).
 *
 * It needs its own variable because the flip's keyframes paint the tile
 * themselves, and `animation-fill-mode: both` makes the final frame stick. A
 * freshly-flipped tile therefore keeps whatever the keyframes left it with — so
 * when they painted `border-color` with the FILL, every new row ended up without
 * the darker edge, while rows already on screen at mount (which take the static
 * `.green` / `.yellow` class instead) had one. Two identical-looking tiles,
 * different borders, depending only on whether you were watching when they
 * landed.
 */
export function revealBorderVar(c: TileColor): string | undefined {
  switch (c) {
    case 'wordleGreen':
      return 'var(--wordle-green-edge-color)'
    case 'wordleYellow':
      return 'var(--wordle-yellow-edge-color)'
    case 'wordleGray':
      return 'var(--wordle-gray-edge-color)'
    default:
      return undefined
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
    default:
      return 0
  }
}
