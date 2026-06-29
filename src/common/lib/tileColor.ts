/**
 * Shared render-only mapping from a server per-letter color code to a
 * CSS-module class key, used by the letter-coloring games (wordle and
 * waffle). The server is the single source of truth for the colors —
 * it computes the feedback string from the hidden answer/solution and
 * the FE never recomputes them (it doesn't hold the secret). This just
 * turns each code into a class key the grid can style:
 *
 *   'g' green  — right letter, right spot
 *   'y' yellow — in the word, wrong spot
 *   'x' gray   — not in the word
 *   anything else → 'blank' (an un-evaluated tile, or a hole/absent cell)
 *
 * The color *values* are the shared "Wordle colors" in common/theme.css
 * (`--wordle-green/yellow/gray/blank`) — one palette across the
 * letter-coloring games, so a player reads the same green/yellow/gray in
 * waffle and wordle. This code→key mapping is shared too; only each game's
 * own chrome (wordle's reveal-animation var + keyboard color-rank, waffle's
 * pickup ring) stays per-game.
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
