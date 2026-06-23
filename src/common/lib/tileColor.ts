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
 * The color *values* deliberately stay per-game (`--wordle-green` vs
 * `--waffle-green`) — only this code→key mapping is identical, so only
 * it is shared. Game-specific helpers (wordle's reveal-animation var and
 * keyboard color-rank) live in that game's own `lib/colors.ts`.
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
