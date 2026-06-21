/**
 * Render-only helper: map a server color code (from the per-tile
 * feedback string `waffle.compute_colors` produces) to a CSS-module
 * class key. The server is authoritative for the colors themselves —
 * the FE never recomputes them (it doesn't hold the solution).
 *
 *   'g' green  — right letter, right cell
 *   'y' yellow — in the word, wrong cell
 *   'x' gray   — not in the word
 *   '.' hole / absent
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
