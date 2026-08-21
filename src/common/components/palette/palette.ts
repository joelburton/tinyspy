/**
 * Every color FAMILY in `common/themes/daylight.css`, written out cell by cell.
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
 * `src/guards/cssTokens.test.ts` fails on a token nobody reads — correctly, since a
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
 *   'var(--outcomes-won-ink-color)'   ✅ a reference — the token is kept alive
 *   `var(--outcome-${m}-ink-color)`  ❌ the scanner keeps only the `--outcome-`
 *                                       prefix, which then vouches for every
 *                                       token starting with it — including ones
 *                                       that no longer exist. This is exactly
 *                                       why the eight member-hue tokens are
 *                                       unguarded today: `<Dot>` builds their
 *                                       names from a color name at runtime.
 *   '--outcomes-won-ink-color'        ❌ a bare quoted token name is read as a
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
  name: string;
  /**
   * The bucket every member of this family SHOULD wear — written bare (`outcome`,
   * not `--outcome-`; see the file docstring). A cell whose token sits outside it
   * is a borrow from another bucket, and the page marks it — which is the whole
   * diagnosis for the pill tones below.
   */
  bucket: string;
  /** One line: what this family is for, and anything odd about it. */
  note: string;
  /** Column headings — the variants every member carries, in order. */
  variants: string[];
  members: Member[];
};

export type Member = {
  name: string;
  /** One `var(--token)` string per variant, in the SAME ORDER as `variants`. */
  cells: string[];
};

/** The bare token name inside a `var(--x)` cell, for display + `getComputedStyle`. */
export const tokenOf = (cell: string) =>
  cell.slice(cell.indexOf("--"), cell.lastIndexOf(")"));

export const FAMILIES: Family[] = [
  {
    name: "Outcomes",
    bucket: "outcomes",
    note:
      "How a move or a game went. `base` is the anchor every other cell derives " +
      "from and nothing paints. The rest are the shapes an outcome takes: thin " +
      "lines and text (ink), a filled piece (fill), that piece's border (edge), " +
      "a much lighter tint (wash), a turn log's left bar (bar), and the band " +
      "around a board that is no longer a live position (terminalFrame). `noted` " +
      "and `error` are anchored at INK weight rather than at the 400 the other " +
      "five use — look for the row whose base and fill are the same color, which " +
      "is the thing to fix.",
    variants: ["base", "ink", "fill", "edge", "wash", "bar", "terminalFrame"],
    members: [
      {
        name: "won",
        cells: [
          "var(--outcomes-won-base-color)",
          "var(--outcomes-won-ink-color)",
          "var(--outcomes-won-fill-color)",
          "var(--outcomes-won-edge-color)",
          "var(--outcomes-won-wash-color)",
          "var(--outcomes-won-bar-color)",
          "var(--outcomes-won-terminalFrame-color)",
        ],
      },
      {
        name: "lost",
        cells: [
          "var(--outcomes-lost-base-color)",
          "var(--outcomes-lost-ink-color)",
          "var(--outcomes-lost-fill-color)",
          "var(--outcomes-lost-edge-color)",
          "var(--outcomes-lost-wash-color)",
          "var(--outcomes-lost-bar-color)",
          "var(--outcomes-lost-terminalFrame-color)",
        ],
      },
      {
        name: "near",
        cells: [
          "var(--outcomes-near-base-color)",
          "var(--outcomes-near-ink-color)",
          "var(--outcomes-near-fill-color)",
          "var(--outcomes-near-edge-color)",
          "var(--outcomes-near-wash-color)",
          "var(--outcomes-near-bar-color)",
          "var(--outcomes-near-terminalFrame-color)",
        ],
      },
      {
        name: "warning",
        cells: [
          "var(--outcomes-warning-base-color)",
          "var(--outcomes-warning-ink-color)",
          "var(--outcomes-warning-fill-color)",
          "var(--outcomes-warning-edge-color)",
          "var(--outcomes-warning-wash-color)",
          "var(--outcomes-warning-bar-color)",
          "var(--outcomes-warning-terminalFrame-color)",
        ],
      },
      {
        name: "neutral",
        cells: [
          "var(--outcomes-neutral-base-color)",
          "var(--outcomes-neutral-ink-color)",
          "var(--outcomes-neutral-fill-color)",
          "var(--outcomes-neutral-edge-color)",
          "var(--outcomes-neutral-wash-color)",
          "var(--outcomes-neutral-bar-color)",
          "var(--outcomes-neutral-terminalFrame-color)",
        ],
      },
      {
        name: "noted",
        cells: [
          "var(--outcomes-noted-base-color)",
          "var(--outcomes-noted-ink-color)",
          "var(--outcomes-noted-fill-color)",
          "var(--outcomes-noted-edge-color)",
          "var(--outcomes-noted-wash-color)",
          "var(--outcomes-noted-bar-color)",
          "var(--outcomes-noted-terminalFrame-color)",
        ],
      },
      {
        name: "error",
        cells: [
          "var(--outcomes-error-base-color)",
          "var(--outcomes-error-ink-color)",
          "var(--outcomes-error-fill-color)",
          "var(--outcomes-error-edge-color)",
          "var(--outcomes-error-wash-color)",
          "var(--outcomes-error-bar-color)",
          "var(--outcomes-error-terminalFrame-color)",
        ],
      },
    ],
  },

  {
    name: "Button families",
    bucket: "button",
    note:
      "What kind of action a control offers, graded by consequence. The family " +
      "and the TREATMENT are separate axes: primary is the filled button, " +
      "secondary the outline, and any family can wear either — which is why every " +
      "one carries both, including quiet's primary trio and the whole of " +
      "`success`, which nothing reads today. `base` is the anchor; the other four " +
      "are one formula away from it, and this is the family that proves the model " +
      "works.",
    variants: [
      "base",
      "primary",
      "primary-hover",
      "primary-ink",
      "secondary",
      "secondary-hover",
    ],
    members: [
      {
        name: "normal",
        cells: [
          "var(--button-normal-base-color)",
          "var(--button-normal-primary-color)",
          "var(--button-normal-primary-hover-color)",
          "var(--button-normal-primary-ink-color)",
          "var(--button-normal-secondary-color)",
          "var(--button-normal-secondary-hover-color)",
        ],
      },
      {
        name: "success",
        cells: [
          "var(--button-success-base-color)",
          "var(--button-success-primary-color)",
          "var(--button-success-primary-hover-color)",
          "var(--button-success-primary-ink-color)",
          "var(--button-success-secondary-color)",
          "var(--button-success-secondary-hover-color)",
        ],
      },
      {
        name: "destructive",
        cells: [
          "var(--button-destructive-base-color)",
          "var(--button-destructive-primary-color)",
          "var(--button-destructive-primary-hover-color)",
          "var(--button-destructive-primary-ink-color)",
          "var(--button-destructive-secondary-color)",
          "var(--button-destructive-secondary-hover-color)",
        ],
      },
      {
        name: "caution",
        cells: [
          "var(--button-caution-base-color)",
          "var(--button-caution-primary-color)",
          "var(--button-caution-primary-hover-color)",
          "var(--button-caution-primary-ink-color)",
          "var(--button-caution-secondary-color)",
          "var(--button-caution-secondary-hover-color)",
        ],
      },
      {
        name: "quiet",
        cells: [
          "var(--button-quiet-base-color)",
          "var(--button-quiet-primary-color)",
          "var(--button-quiet-primary-hover-color)",
          "var(--button-quiet-primary-ink-color)",
          "var(--button-quiet-secondary-color)",
          "var(--button-quiet-secondary-hover-color)",
        ],
      },
    ],
  },

  {
    name: "Warm tile ramp",
    bucket: "tile",
    note:
      "The wood-and-ivory ramp a game piece is cut from, lightest to darkest, " +
      "plus the darker shade beyond it for a piece that is spent. Depth, not " +
      "meaning: a game reads its resting fill off this, and stackdown reads " +
      "shades 2–5 as stack depth.",
    variants: ["fill", "edge"],
    members: [
      {
        name: "1",
        cells: ["var(--tile-1-fill-color)", "var(--tile-1-edge-color)"],
      },
      {
        name: "2",
        cells: ["var(--tile-2-fill-color)", "var(--tile-2-edge-color)"],
      },
      {
        name: "3 (normal)",
        cells: ["var(--tile-3-fill-color)", "var(--tile-3-edge-color)"],
      },
      {
        name: "4",
        cells: ["var(--tile-4-fill-color)", "var(--tile-4-edge-color)"],
      },
      {
        name: "5",
        cells: ["var(--tile-5-fill-color)", "var(--tile-5-edge-color)"],
      },
      {
        name: "spent",
        cells: ["var(--tile-spent-fill-color)", "var(--tile-spent-edge-color)"],
      },
    ],
  },

  {
    name: "Member hues",
    bucket: "member",
    note:
      "Player identity — one hue per value of `common.profiles.color`, so the DB " +
      "decides how many members this family has. The borders are hand-tuned per " +
      "hue rather than computed: one formula gave a yellow that vanished and a " +
      "purple that went black.",
    variants: ["fill", "edge"],
    members: [
      {
        name: "blue",
        cells: [
          "var(--member-blue-fill-color)",
          "var(--member-blue-edge-color)",
        ],
      },
      {
        name: "brown",
        cells: [
          "var(--member-brown-fill-color)",
          "var(--member-brown-edge-color)",
        ],
      },
      {
        name: "green",
        cells: [
          "var(--member-green-fill-color)",
          "var(--member-green-edge-color)",
        ],
      },
      {
        name: "orange",
        cells: [
          "var(--member-orange-fill-color)",
          "var(--member-orange-edge-color)",
        ],
      },
      {
        name: "pink",
        cells: [
          "var(--member-pink-fill-color)",
          "var(--member-pink-edge-color)",
        ],
      },
      {
        name: "purple",
        cells: [
          "var(--member-purple-fill-color)",
          "var(--member-purple-edge-color)",
        ],
      },
      {
        name: "red",
        cells: ["var(--member-red-fill-color)", "var(--member-red-edge-color)"],
      },
      {
        name: "yellow",
        cells: [
          "var(--member-yellow-fill-color)",
          "var(--member-yellow-edge-color)",
        ],
      },
    ],
  },

  {
    name: "Pill tones",
    bucket: "pill",
    note:
      "The feedback pill: the color is its whole border, the tint its background " +
      "when the pill is permanent. ALL SEVEN are the outcome families, by name " +
      "and by alias — a pill reporting a won game and a board showing one are one " +
      "message. It got there by promoting the two the pill used to own: `info` " +
      "became the outcome `noted`, and `error` became an outcome once a move " +
      "could break rather than lose. This family mints no color of its own; the " +
      "tints are the irregular part, five at 18% and two at 8%.",
    variants: ["color", "tint"],
    members: [
      {
        name: "won",
        cells: ["var(--pill-won-color)", "var(--pill-won-tint-color)"],
      },
      {
        name: "lost",
        cells: ["var(--pill-lost-color)", "var(--pill-lost-tint-color)"],
      },
      {
        name: "near",
        cells: ["var(--pill-near-color)", "var(--pill-near-tint-color)"],
      },
      {
        name: "warning",
        cells: ["var(--pill-warning-color)", "var(--pill-warning-tint-color)"],
      },
      {
        name: "neutral",
        cells: ["var(--pill-neutral-color)", "var(--pill-neutral-tint-color)"],
      },
      {
        name: "noted",
        cells: ["var(--pill-noted-color)", "var(--pill-noted-tint-color)"],
      },
      {
        name: "error",
        cells: ["var(--pill-error-color)", "var(--pill-error-tint-color)"],
      },
    ],
  },

  {
    name: "Toast stripes",
    bucket: "toast",
    note:
      "A toast's left stripe, and nothing else — the message text carries the " +
      "meaning. Deliberately three copies rather than reaching into the outcome " +
      "or chrome palettes, which a toast has no relationship to.",
    variants: ["stripe"],
    members: [
      { name: "info", cells: ["var(--toast-info-stripe-color)"] },
      { name: "success", cells: ["var(--toast-success-stripe-color)"] },
      { name: "error", cells: ["var(--toast-error-stripe-color)"] },
    ],
  },

  {
    name: "Wordle letters",
    bucket: "wordle",
    note:
      "The letter-judgment palette, shared by wordle and waffle. Color words on " +
      'purpose, against the semantic-names rule: "wordle green" is a phrase ' +
      "people say, and the `wordle-` prefix is what keeps it honest in a theme " +
      "swap. (`--wordle-blank-fill-color` is not a member — it says there is no " +
      "letter here yet, which is not a judgment.)",
    variants: ["fill", "edge", "ink"],
    members: [
      {
        name: "green",
        cells: [
          "var(--wordle-green-fill-color)",
          "var(--wordle-green-edge-color)",
          "var(--wordle-green-ink-color)",
        ],
      },
      {
        name: "yellow",
        cells: [
          "var(--wordle-yellow-fill-color)",
          "var(--wordle-yellow-edge-color)",
          "var(--wordle-yellow-ink-color)",
        ],
      },
      {
        name: "gray",
        cells: [
          "var(--wordle-gray-fill-color)",
          "var(--wordle-gray-edge-color)",
          "var(--wordle-gray-ink-color)",
        ],
      },
    ],
  },
];
