import type { Shape } from './cards'

/**
 * The card's geometry — every number the card art needs, in one place, so the
 * SVG component stays declarative and a future printer has something to read.
 *
 * These paths are **ours**. The obvious reference is the Wikimedia
 * `Set_isomorphic_cards.svg`, but it is CC BY-SA, and three pieces of trivial
 * geometry are not worth a share-alike obligation on the repo.
 */

/**
 * The box each symbol is drawn in: tall and narrow, like the real cards.
 *
 * **2.1 : 1**, measured off a photograph of a real deck rather than picked. The
 * first version was 2.5 and looked stretched beside the real thing — and since
 * the card's height follows the symbol's, the extra length was also costing the
 * board vertical space it needed on a phone.
 */
export const SYMBOL_BOX = { width: 40, height: 84 } as const

/** How much taller than wide a symbol is — the one number the whole card's
 *  proportion hangs off, so nothing can scale the shapes non-uniformly. */
export const SYMBOL_ASPECT = SYMBOL_BOX.height / SYMBOL_BOX.width

/**
 * The card face's own coordinate space.
 *
 * Deliberately NOT the 5:7 of a real playing card. A physical card is tall
 * because a hand of them fans out and because it has a back, a border and a
 * factory's margins; ours has none of that, and at 5:7 the symbols sat in the
 * middle of a lot of empty white. Short enough that the symbols nearly fill it,
 * which also buys the board real estate back — three rows of a shorter card
 * leave more height for the cards to be WIDE.
 *
 * Its HEIGHT tracks the symbol: at 2.1 the symbols are shorter, so the card
 * came down 112 → 94 to keep the same margin above and below them. (A real
 * card is landscape too, for what it's worth.) Anything laying cards out has to
 * follow — the `aspect-ratio` in Board / Card / LastSet, and the board's
 * height-bound card-size term.
 */
export const CARD_BOX = { width: 100, height: 94 } as const

/**
 * How the 1–3 symbols sit on the face. Symbol size does NOT vary with the
 * count — one symbol is the same size as each of three, exactly as on a real
 * card — so `pips` changes how many are drawn and nothing else.
 */
export const SYMBOL_LAYOUT = {
  /** Drawn width of one symbol, in card units. */
  width: 28,
  /** Space between adjacent symbols. */
  gap: 4,
  /** Drawn height, DERIVED so the scale is always uniform — a hand-written
   *  height here is how a shape gets quietly stretched. */
  height: 28 * SYMBOL_ASPECT,
} as const

/**
 * The three shapes, as path data in [`SYMBOL_BOX`] coordinates.
 *
 * The squiggle is the one worth reading. It is a **reverse S**: a thick ribbon
 * whose top lobe leans right and bottom lobe leans left, with a real waist
 * between them where the two lobes cross. Two things it must keep, both
 * measured against a real deck — the ribbon stays THICK the whole way (a thin
 * one reads as a wire, and worse, its striped and open versions become
 * indistinguishable, which costs the game three of its nine looks), and the
 * lobes must actually lean opposite ways. An earlier version was built to be
 * point-symmetric about the box's center, and a rebuild that enforced that
 * symmetry strictly came out a peanut: the S needs the two halves to differ.
 */
export const SHAPE_PATHS: Record<Shape, string> = {
  diamond: 'M 20 2 L 38 42 L 20 82 L 2 42 Z',
  squiggle:
    'M 6 20 C 6 6 18 0 28 4 C 37 8 39 20 34 32 C 30 42 26 46 24 52' +
    ' C 22 60 28 66 32 70 C 36 76 32 84 24 82 C 14 80 4 70 6 56' +
    ' C 8 44 14 38 16 32 C 18 24 12 22 6 20 Z',
  // A stadium: two semicircular caps joined by straight sides.
  oval: 'M 20 2 A 18 18 0 0 1 38 20 L 38 64 A 18 18 0 0 1 20 82 A 18 18 0 0 1 2 64 L 2 20 A 18 18 0 0 1 20 2 Z',
}

/**
 * Stripe geometry for the `striped` shading, in symbol coordinates.
 *
 * **Horizontal**, and that is load-bearing rather than taste: the symbols are
 * tall and narrow, so vertical stripes gave a diamond two or three lines and it
 * read as "solid with a scratch on it". Across the long axis there is room for
 * about ten.
 *
 * The pitch is unchanged by the 2.5 → 2.1 reshape, and deliberately: it lives in
 * symbol coordinates, and the symbol occupies the same 0.7 of its box either
 * way, so the ON-SCREEN spacing is identical. A shorter symbol simply holds
 * fewer bands.
 */
export const STRIPE = { pitch: 8, thickness: 3.4 } as const

/** Outline weight, in symbol coordinates — what draws an `open` card. */
export const SYMBOL_STROKE = 4
