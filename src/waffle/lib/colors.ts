// cs-unmet

/**
 * waffle's green/yellow/gray feedback is the SERVER's, in full. Every colored
 * board the frontend draws was colored by `waffle.board_colors` — the live one
 * off `players_state`, and a past one off the swap row that stored it
 * (`waffle.events.colors`). Nothing here recomputes any of it, and nothing here
 * holds the algorithm.
 *
 * What is left is the one color string that needs no answer to know: a board
 * that IS the solution.
 */
import { HOLE } from './waffle'

/**
 * The colors of a solved board — `g` on every filled cell, `.` on every hole.
 *
 * For the places that draw the solution itself: the end-of-game reveal, and the
 * six words the printed sheet lists. Coloring the solution against the solution
 * is green by definition, so these asked the algorithm a question whose answer
 * was already known.
 *
 * Reads the holes off the string rather than off the fixed grid, so it says
 * "whatever this board's holes are" instead of repeating a layout that lives in
 * `waffle.ts`.
 */
export function allGreen(solution: string): string {
  return [...solution].map((ch) => (ch === HOLE ? HOLE : 'g')).join('')
}
