/**
 * Every color FAMILY in `common/theme.css`, written out cell by cell.
 *
 * A family is a set of MEMBERS (won / lost / near …) that each carry the same
 * set of VARIANTS (ink / fill / edge …). The variant list differs from family to
 * family — the tile ramp's two are nothing like the chrome tones' five — but
 * within one family it is the same list for every member, always. A member
 * missing a variant is not a small gap; it means the family isn't one.
 *
 * This file has two jobs, and both depend on how it is written.
 *
 * ── 1. It is why an unread cell is not dead code ──────────────────────────
 *
 * A family is picked at one sitting, by one formula, and that includes cells
 * nothing consumes yet: a value derived alone in two years, next to the one
 * button that needed it, is reasoned about differently and drifts out of family.
 * `src/cssTokens.test.ts` fails on a token nobody reads — correctly, since a
 * token nobody reads is usually a rename that half-landed. This page reads them,
 * so the guard keeps its teeth everywhere else while the reserved cells survive.
 *
 * It replaces a hand-maintained exception list in that test. An exception list
 * argues ("is this one really needed?"); a page does not — you look at it.
 *
 * ── 2. It fails when a family loses a cell ────────────────────────────────
 *
 * Delete a token from `theme.css` and its `var()` here resolves to nothing:
 * `cssTokens.test.ts`'s FIRST guard (every reference is defined) fails, naming
 * the token. `palette.test.ts` beside this file adds the other direction — every
 * member carries every variant, so a family cannot be extended by one member
 * only.
 *
 * ── How to write a cell, and why it looks repetitive ──────────────────────
 *
 * **Spell each token out in full, inside `var(…)`.** Both rules are load-bearing
 * against the scanner in `cssTokens.test.ts`:
 *
 *   'var(--outcome-won-ink-color)'   ✅ a reference — the token is kept alive
 *   `var(--outcome-${m}-ink-color)`  ❌ the scanner keeps only the `--outcome-`
 *                                       prefix, which then vouches for every
 *                                       token starting with it — including ones
 *                                       that no longer exist. This is exactly
 *                                       why the eight member-hue tokens are
 *                                       unguarded today: `<Dot>` builds their
 *                                       names from a color name at runtime.
 *   '--outcome-won-ink-color'        ❌ a bare quoted token name is read as a
 *                                       DEFINITION (that is how components set
 *                                       tokens inline), so this would tell the
 *                                       guard the token exists — the opposite of
 *                                       what we want.
 *
 * So: forty-odd near-identical strings, on purpose. The repetition is the
 * mechanism.
 *
 * The second rule bites harder than it looks, and this file proved it on its own
 * first run: `prefix` below started as `'--outcome-'`, which the scanner duly
 * read as five new token definitions that nothing reads. Hence `'outcome'` — the
 * bucket name, no dashes, assembled where it is compared. **Nowhere in `src/`
 * may a quoted string begin with `--`** unless it really is setting that token.
 *
 * ── What is NOT here ──────────────────────────────────────────────────────
 *
 * Single tokens that aren't part of a family (`--chrome-fault-color`,
 * `--view-history-color`, the mark dims), and per-game brand palettes, which
 * live in that game's own `theme.css` and are complete by the game's rules
 * rather than by ours. Adding them would make this page a token dump; it is a
 * page about families.
 */

export type Family = {
  /** Heading. */
  name: string
  /**
   * The bucket every member of this family SHOULD wear — written bare (`outcome`,
   * not `--outcome-`; see the file docstring). A cell whose token sits outside it
   * is a borrow from another bucket, and the page marks it — which is the whole
   * diagnosis for the pill tones below.
   */
  bucket: string
  /** One line: what this family is for, and anything odd about it. */
  note: string
  /** Column headings — the variants every member carries, in order. */
  variants: string[]
  members: Member[]
}

export type Member = {
  name: string
  /** One `var(--token)` string per variant, in the SAME ORDER as `variants`. */
  cells: string[]
}

/** The bare token name inside a `var(--x)` cell, for display + `getComputedStyle`. */
export const tokenOf = (cell: string) => cell.slice(cell.indexOf('--'), cell.lastIndexOf(')'))

export const FAMILIES: Family[] = [
  {
    name: 'Outcome',
    bucket: 'outcome',
    note:
      'How a move or a game went. The five variants are the shapes an outcome ' +
      'takes: thin lines and text (ink), a filled piece or log bar (fill), that ' +
      "piece's border (edge), a much lighter tint (wash), and the band around a " +
      'board that is no longer a live position (terminal-frame).',
    variants: ['ink', 'fill', 'edge', 'wash', 'terminal-frame'],
    members: [
      {
        name: 'won',
        cells: [
          'var(--outcome-won-ink-color)',
          'var(--outcome-won-fill-color)',
          'var(--outcome-won-edge-color)',
          'var(--outcome-won-wash-color)',
          'var(--outcome-won-terminal-frame-color)',
        ],
      },
      {
        name: 'lost',
        cells: [
          'var(--outcome-lost-ink-color)',
          'var(--outcome-lost-fill-color)',
          'var(--outcome-lost-edge-color)',
          'var(--outcome-lost-wash-color)',
          'var(--outcome-lost-terminal-frame-color)',
        ],
      },
      {
        name: 'near',
        cells: [
          'var(--outcome-near-ink-color)',
          'var(--outcome-near-fill-color)',
          'var(--outcome-near-edge-color)',
          'var(--outcome-near-wash-color)',
          'var(--outcome-near-terminal-frame-color)',
        ],
      },
      {
        name: 'warning',
        cells: [
          'var(--outcome-warning-ink-color)',
          'var(--outcome-warning-fill-color)',
          'var(--outcome-warning-edge-color)',
          'var(--outcome-warning-wash-color)',
          'var(--outcome-warning-terminal-frame-color)',
        ],
      },
      {
        name: 'neutral',
        cells: [
          'var(--outcome-neutral-ink-color)',
          'var(--outcome-neutral-fill-color)',
          'var(--outcome-neutral-edge-color)',
          'var(--outcome-neutral-wash-color)',
          'var(--outcome-neutral-terminal-frame-color)',
        ],
      },
    ],
  },

  {
    name: 'Chrome tones',
    bucket: 'chrome',
    note:
      'What kind of action a control offers. The tone and the TREATMENT are ' +
      'separate axes: primary is the filled button, secondary the outline, and ' +
      'any tone can wear either — which is why every tone carries both, ' +
      "including quiet's primary trio, which nothing reads today.",
    variants: ['primary', 'primary-hover', 'primary-ink', 'secondary', 'secondary-hover'],
    members: [
      {
        name: 'action',
        cells: [
          'var(--chrome-action-primary-color)',
          'var(--chrome-action-primary-hover-color)',
          'var(--chrome-action-primary-ink-color)',
          'var(--chrome-action-secondary-color)',
          'var(--chrome-action-secondary-hover-color)',
        ],
      },
      {
        name: 'caution',
        cells: [
          'var(--chrome-caution-primary-color)',
          'var(--chrome-caution-primary-hover-color)',
          'var(--chrome-caution-primary-ink-color)',
          'var(--chrome-caution-secondary-color)',
          'var(--chrome-caution-secondary-hover-color)',
        ],
      },
      {
        name: 'destructive',
        cells: [
          'var(--chrome-destructive-primary-color)',
          'var(--chrome-destructive-primary-hover-color)',
          'var(--chrome-destructive-primary-ink-color)',
          'var(--chrome-destructive-secondary-color)',
          'var(--chrome-destructive-secondary-hover-color)',
        ],
      },
      {
        name: 'quiet',
        cells: [
          'var(--chrome-quiet-primary-color)',
          'var(--chrome-quiet-primary-hover-color)',
          'var(--chrome-quiet-primary-ink-color)',
          'var(--chrome-quiet-secondary-color)',
          'var(--chrome-quiet-secondary-hover-color)',
        ],
      },
    ],
  },

  {
    name: 'Warm tile ramp',
    bucket: 'tile',
    note:
      'The wood-and-ivory ramp a game piece is cut from, lightest to darkest, ' +
      'plus the darker shade beyond it for a piece that is spent. Depth, not ' +
      'meaning: a game reads its resting fill off this, and stackdown reads ' +
      'shades 2–5 as stack depth.',
    variants: ['color', 'edge'],
    members: [
      { name: '1', cells: ['var(--tile-1-color)', 'var(--tile-1-edge-color)'] },
      { name: '2', cells: ['var(--tile-2-color)', 'var(--tile-2-edge-color)'] },
      { name: '3 (normal)', cells: ['var(--tile-3-color)', 'var(--tile-3-edge-color)'] },
      { name: '4', cells: ['var(--tile-4-color)', 'var(--tile-4-edge-color)'] },
      { name: '5', cells: ['var(--tile-5-color)', 'var(--tile-5-edge-color)'] },
      {
        name: 'disabled',
        cells: ['var(--tile-disabled-color)', 'var(--tile-disabled-edge-color)'],
      },
    ],
  },

  {
    name: 'Member hues',
    bucket: 'member',
    note:
      'Player identity — one hue per value of `common.profiles.color`, so the DB ' +
      'decides how many members this family has. The borders are hand-tuned per ' +
      'hue rather than computed: one formula gave a yellow that vanished and a ' +
      'purple that went black.',
    variants: ['dot', 'border'],
    members: [
      { name: 'blue', cells: ['var(--member-blue-dot-color)', 'var(--member-blue-border-color)'] },
      {
        name: 'brown',
        cells: ['var(--member-brown-dot-color)', 'var(--member-brown-border-color)'],
      },
      {
        name: 'green',
        cells: ['var(--member-green-dot-color)', 'var(--member-green-border-color)'],
      },
      {
        name: 'orange',
        cells: ['var(--member-orange-dot-color)', 'var(--member-orange-border-color)'],
      },
      { name: 'pink', cells: ['var(--member-pink-dot-color)', 'var(--member-pink-border-color)'] },
      {
        name: 'purple',
        cells: ['var(--member-purple-dot-color)', 'var(--member-purple-border-color)'],
      },
      { name: 'red', cells: ['var(--member-red-dot-color)', 'var(--member-red-border-color)'] },
      {
        name: 'yellow',
        cells: ['var(--member-yellow-dot-color)', 'var(--member-yellow-border-color)'],
      },
    ],
  },

  {
    name: 'Pill tones',
    bucket: 'pill',
    note:
      'The feedback pill: the color is its whole border, the tint its background ' +
      'when the pill is permanent. The first five ARE the outcome families, by ' +
      'name and by alias — a pill reporting a won game and a board showing one ' +
      'are one message. The last two are the pill saying something rather than ' +
      'adjudicating something: `error` is a real failure (the fault red, angrier ' +
      'than a lost move on purpose) and `info` is news.',
    variants: ['color', 'tint'],
    members: [
      {
        name: 'won',
        cells: ['var(--pill-won-color)', 'var(--pill-won-tint-color)'],
      },
      {
        name: 'lost',
        cells: ['var(--pill-lost-color)', 'var(--pill-lost-tint-color)'],
      },
      {
        name: 'near',
        cells: ['var(--pill-near-color)', 'var(--pill-near-tint-color)'],
      },
      {
        name: 'warning',
        cells: ['var(--pill-warning-color)', 'var(--pill-warning-tint-color)'],
      },
      {
        name: 'neutral',
        cells: ['var(--pill-neutral-color)', 'var(--pill-neutral-tint-color)'],
      },
      {
        name: 'error',
        cells: ['var(--pill-error-color)', 'var(--pill-error-tint-color)'],
      },
      {
        name: 'info',
        cells: ['var(--pill-info-color)', 'var(--pill-info-tint-color)'],
      },
    ],
  },

  {
    name: 'Toast stripes',
    bucket: 'toast',
    note:
      "A toast's left stripe, and nothing else — the message text carries the " +
      'meaning. Deliberately three copies rather than reaching into the outcome ' +
      'or chrome palettes, which a toast has no relationship to.',
    variants: ['stripe'],
    members: [
      { name: 'info', cells: ['var(--toast-info-stripe-color)'] },
      { name: 'success', cells: ['var(--toast-success-stripe-color)'] },
      { name: 'error', cells: ['var(--toast-error-stripe-color)'] },
    ],
  },

  {
    name: 'Wordle letters',
    bucket: 'wordle',
    note:
      'The letter-judgement palette, shared by wordle and waffle. Color words on ' +
      'purpose, against the semantic-names rule: "wordle green" is a phrase ' +
      'people say, and the `wordle-` prefix is what keeps it honest in a theme ' +
      'swap. (`--wordle-blank-fill-color` is not a member — it says there is no ' +
      'letter here yet, which is not a judgement.)',
    variants: ['fill', 'edge', 'ink'],
    members: [
      {
        name: 'green',
        cells: [
          'var(--wordle-green-fill-color)',
          'var(--wordle-green-edge-color)',
          'var(--wordle-green-ink-color)',
        ],
      },
      {
        name: 'yellow',
        cells: [
          'var(--wordle-yellow-fill-color)',
          'var(--wordle-yellow-edge-color)',
          'var(--wordle-yellow-ink-color)',
        ],
      },
      {
        name: 'gray',
        cells: [
          'var(--wordle-gray-fill-color)',
          'var(--wordle-gray-edge-color)',
          'var(--wordle-gray-ink-color)',
        ],
      },
    ],
  },
]
