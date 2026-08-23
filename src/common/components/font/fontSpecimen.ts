// cs-unmet

/**
 * The data behind `/font` — sizes, weights, widths, grades and the words.
 *
 * It sits in its own file for the reason `palette.ts` does: a specimen page is
 * an instrument, and an instrument whose readings are buried in JSX is one
 * nobody can check. Everything here is a NUMBER WE ACTUALLY WRITE somewhere in
 * the app, or a deliberate extreme included to show what a dial does at its
 * ends. Nothing is decorative.
 *
 * The sizes are inline styles rather than CSS, and that is on purpose: on this
 * page a size is DATA — the thing being looked at — not a decision the
 * stylesheet is making. Writing them in `FontPage.module.css` would put nine
 * raw font-sizes into a stylesheet that the vocabulary guard reads, and it
 * would be right to complain.
 */

/** The candidate, and what it is. */
export const FONT = {
  family: 'Roboto Flex',
  file: '/fonts/roboto-flex.woff2',
  /** Our own subset — Latin plus `→ ← ≥ ≈ ≠` — carrying weight · width ·
   *  grade · slant · optical size. Built by `scripts/subset-font.py`. */
  sizeKB: 292,
  /** What the same file costs with fewer dials, measured from Google's CDN. */
  costs: [
    { dials: 'weight only', kb: 33 },
    { dials: 'weight + grade', kb: 55 },
    { dials: 'weight + width', kb: 58 },
    { dials: 'weight + width + grade', kb: 79 },
    { dials: '+ optical size', kb: 235 },
    { dials: '+ slant (what we ship)', kb: 292 },
  ],
} as const

/**
 * A sentence made of the app's own words, not lorem ipsum.
 *
 * Real text is the only honest specimen: it carries the letter pairs we
 * actually set, the capitals we actually use, and the brand names that have to
 * survive whatever face we pick.
 */
export const SAMPLE =
  'MothCubes, CrossPlay and MooseWheel are live. Joel started a game in Thursday Club — ' +
  'four players, two of them waiting on your clue.'

/** A shorter line, for the rows where a paragraph would be noise. */
export const LINE = 'The quick brown fox jumps over the lazy dog — 0123456789'

/**
 * Words that have to fit inside a tile whose width is fixed by the board.
 *
 * This is the case that made width worth having: psychicnum and connections
 * both put a whole word on a tile, and today the only lever is making the text
 * smaller. The last one is deliberately absurd — if a dial can hold that, it
 * can hold anything a word list will produce.
 */
export const TILE_WORDS = ['SALT', 'MERCURY', 'CONSTELLATION', 'PHOTOSYNTHESIS'] as const

/** The three steps of the font-size vocabulary, plus the sizes above them. */
export const SIZES = [
  { label: '--font-size-1 · body', css: '1rem' },
  { label: '--font-size-2', css: '0.85rem' },
  { label: '--font-size-3 · the quietest label', css: '0.75rem' },
  { label: 'h3-ish', css: '1.25rem' },
  { label: 'h1-ish', css: '2rem' },
  { label: 'a tile letter', css: '3rem' },
] as const

/**
 * Every hundred, with the five the app writes today marked.
 *
 * Measured across `src/`: 600 ×54, 700 ×40, 500 ×14, 800 ×9, 400 ×3.
 */
export const WEIGHTS = [
  { w: 100, used: false },
  { w: 200, used: false },
  { w: 300, used: false },
  { w: 400, used: true },
  { w: 500, used: true },
  { w: 600, used: true },
  { w: 700, used: true },
  { w: 800, used: true },
  { w: 900, used: false },
] as const

/**
 * Widths worth looking at. 100 is the design; 62.5 is as narrow as Noto Sans
 * can go, included as the comparison point; 25 is this font's floor and is here
 * to show where the cliff is, not as a candidate.
 */
export const WIDTHS = [100, 90, 80, 70, 62.5, 50, 25] as const

/**
 * Grades. Negative is lighter ink at identical widths, which is the dark-page
 * correction — light text on a dark ground reads heavier than the same weight
 * does dark-on-light.
 */
export const GRADES = [-150, -100, -50, 0, 50, 100] as const
