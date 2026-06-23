/**
 * Render-only mapping from the server's per-letter color codes to CSS
 * class keys. The server (`wordle.compute_colors`) is the single source
 * of truth for the colors — the FE never recomputes them (it doesn't
 * hold the target). A guess row carries a 5-char string of:
 *
 *   'g' green  — right letter, right spot
 *   'y' yellow — in the word, wrong spot
 *   'x' gray   — not in the word
 *
 * plus 'blank' for an un-evaluated tile (the active typing row).
 */
export type TileColor = 'green' | 'yellow' | 'gray' | 'blank'

export function tileColor(code: string | undefined): TileColor {
  switch (code) {
    case 'g':
      return 'green'
    case 'y':
      return 'yellow'
    case 'x':
      return 'gray'
    default:
      return 'blank'
  }
}

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
