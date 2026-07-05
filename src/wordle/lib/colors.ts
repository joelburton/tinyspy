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
    case 'green':
      return 'var(--wordle-green)'
    case 'yellow':
      return 'var(--wordle-yellow)'
    case 'gray':
      return 'var(--wordle-gray)'
    default:
      return undefined
  }
}

/** Strength order so the on-screen keyboard can keep the BEST color
 *  seen for a letter across all guesses (green beats yellow beats
 *  gray). Higher = stronger. */
export function colorRank(c: TileColor): number {
  switch (c) {
    case 'green':
      return 3
    case 'yellow':
      return 2
    case 'gray':
      return 1
    default:
      return 0
  }
}
