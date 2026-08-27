// cs-unmet

/**
 * The OUTCOME vocabulary — the words the app uses for how a thing turned out.
 *
 * Its own file because it is a vocabulary rather than a feature: a pill, a
 * board, a tile, a turn-log row and a server result all reach for the same
 * words, and none of them should have to import a manifest type to get them.
 *
 * See docs/ui.md → the feedback pill and the color system.
 */

/**
 * Tone variants the feedback pill renders. See docs/ui.md → Feedback pill.
 *
 * **The first five are the OUTCOME families**, named identically on purpose: a
 * pill reporting a won game and a board showing one say the same thing, and the
 * two spellings this list used to have (`success` / `error` for won / lost) hid
 * that behind a rename buried in a CSS rule.
 *
 * The last two are the pill saying something rather than adjudicating
 * something, which is why no board has them:
 *
 *   error — a real failure, not a bad move: a lost connection, a service that
 *           didn't answer, a server result nobody wrote words for. Angrier red
 *           than `lost`, which is the whole reason it is its own tone.
 *   noted — a turn that COUNTS without being a verdict, and news that isn't a
 *           result at all: "Leah invited you", "everyone here has played every
 *           puzzle".
 */
export type GenericFeedbackTone =
  | 'won'
  | 'lost'
  | 'near'
  | 'warning'
  | 'neutral'
  | 'error'
  | 'noted'

/**
 * How an `ok` server result reads on screen.
 *
 * DERIVED rather than restated, because a hand-copied list would drift the
 * moment anyone added a tone.
 *
 * `error` is excluded, and the exclusion IS the rule: that tone means "a real
 * failure, not a bad move", and a real failure comes back as `not-ok` carrying
 * a `severity`. So it can never be an outcome — which is how the line between
 * `lost`, `warning` and `error` gets drawn structurally rather than by
 * judgment, per plans/error-system.md.
 */
export type Outcome = Exclude<GenericFeedbackTone, 'error'>
