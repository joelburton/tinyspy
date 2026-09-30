// cs-blessed-wordle-style

/**
 * A server per-letter color code → the CSS class key that paints it.
 *
 *   'g' wordleGreen  — right letter, right spot
 *   'y' wordleYellow — in the word, wrong spot
 *   'x' wordleGray   — not in the word
 *   '.' blank        — waffle's hole, and a cell taken back for a swap in
 *                      flight
 *
 * Any other code is a bug, and throws. A tile with no colors at all is the
 * caller's to call `blank`; it never reaches here.
 *
 * Render-only, and that is the whole of it. The server computes the feedback
 * string from the answer it holds and the FE never recomputes it; the color
 * VALUES are the `--wordle-*` tokens in `common/core-css/fixed.css`, one
 * palette so the same green reads the same in every game that has one.
 *
 * **These values ARE the class names** — a board does `styles[getTileColor(colorCode)]`
 * — which is why the prefix lives in the type rather than only in the
 * stylesheet, and why `tileColor.test.ts` goes looking for every stylesheet
 * that paints them and checks each one defines the lot: that lookup has no
 * compiler behind it. Why the names carry a game at all is docs/tokens.md → The
 * buckets.
 *
 * `blank` keeps no prefix, and the asymmetry is deliberate: the three judged
 * states are wordle's vocabulary, while "nothing has judged this tile yet" is
 * not a claim about letters at all.
 */
export type TileColor = 'wordleGreen' | 'wordleYellow' | 'wordleGray' | 'blank'

/** One character of the server's colors string: `'g'`, `'y'`, `'x'`, or
 *  waffle's `'.'`. A plain string, since it comes from indexing one; the name
 *  says what it holds. */
export type ColorCode = string

export function getTileColor(colorCode: ColorCode): TileColor {
  switch (colorCode) {
    case 'g':
      return 'wordleGreen'
    case 'y':
      return 'wordleYellow'
    case 'x':
      return 'wordleGray'
    case '.':
      return 'blank'
    default:
      throw new Error(`BUG: no tile color for the code ${JSON.stringify(colorCode)}`)
  }
}
