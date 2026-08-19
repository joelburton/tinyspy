/**
 * Shared render-only mapping from a server per-letter color code to a
 * CSS-module class key, used by the letter-coloring games (wordle and
 * waffle). The server is the single source of truth for the colors —
 * it computes the feedback string from the hidden answer/solution and
 * the FE never recomputes them (it doesn't hold the secret). This just
 * turns each code into a class key the grid can style:
 *
 *   'g' wordleGreen  — right letter, right spot
 *   'y' wordleYellow — in the word, wrong spot
 *   'x' wordleGray   — not in the word
 *   anything else → 'blank' (an un-evaluated tile, or a hole/absent cell)
 *
 * The color *values* are the shared "Wordle colors" in common/theme.css
 * (`--wordle-green-fill-color/yellow/gray/blank`) — one palette across the
 * letter-coloring games, so a player reads the same green/yellow/gray in
 * waffle and wordle. This code→key mapping is shared too; only each game's
 * own chrome (wordle's reveal-animation var + keyboard color-rank, waffle's
 * pickup ring) stays per-game.
 *
 * ── WHY THE NAMES CARRY THE GAME ─────────────────────────────────────────
 * The colour words are deliberate — "wordle green" is a phrase people say, and
 * a semantic name like `correct` would have to be translated back on every
 * read. The PREFIX is what keeps that honest: it says whose green this is. A
 * pink-mode wordle still has a wordle green, and "green" on its own is already
 * taken elsewhere in this codebase — it is a PLAYER'S IDENTITY COLOUR
 * (common.profiles.color, memberColor.ts), which has nothing to do with
 * letters.
 *
 * The prefix lives in the TYPE and not only in the stylesheet because these
 * values ARE the class names: every board does `styles[tileColor(code)]`, so
 * the union is the CSS vocabulary. Prefixing only the CSS would mean a
 * translation table at each of the four call sites — which is exactly what the
 * shared keyboard used to carry, and what this deletes.
 *
 * `blank` keeps no prefix, and that asymmetry is the point: the three judged
 * states are wordle's vocabulary, while "nothing has judged this tile yet" is
 * not a claim about letters at all.
 */
export type TileColor = 'wordleGreen' | 'wordleYellow' | 'wordleGray' | 'blank'

export function tileColor(code: string | undefined): TileColor {
  switch (code) {
    case 'g':
      return 'wordleGreen'
    case 'y':
      return 'wordleYellow'
    case 'x':
      return 'wordleGray'
    default:
      return 'blank'
  }
}
