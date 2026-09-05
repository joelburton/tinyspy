// cs-met-outcomes

/**
 * The OUTCOME vocabulary — the words the app uses for how a thing turned out.
 *
 * Its own file because it is a vocabulary rather than a feature: a pill, a
 * board, a tile, a turn-log row and a server result all reach for the same
 * words, and none of them should have to import a manifest type to get them.
 *
 * What each word means, and everywhere it is shown, is in docs/outcomes.md.
 */

/**
 * How a thing turned out. **One list, seven words, no second spelling** — a
 * pill reporting a won game, a board showing one, a turn-log bar and a server
 * result all name it identically. (The two spellings this list once had,
 * `success` / `error` for won / lost, hid that behind a rename buried in a CSS
 * rule.)
 *
 * The first five are the families a board and a tile also use. The last two are
 * the ones that say something rather than adjudicate something, which is why no
 * board has them:
 *
 *   error — a real failure, not a bad move: a lost connection, a service that
 *           didn't answer, a bug. Angrier red than `lost`, which is the whole
 *           reason it is its own word.
 *   noted — a turn that COUNTS without being a verdict, and news that isn't a
 *           result at all: "Leah invited you", "everyone here has played every
 *           puzzle".
 *
 * **`error` is a full member.** It reads as an outcome, it has the same four
 * theme roles as the rest, and a `not-ok` envelope's default appearance IS this
 * word — so a type that excluded it made the one value a failure needs
 * unsayable. What stays true is narrower and lives where it can be checked: a
 * SUCCESSFUL result never reads as a failure, so no `PA` raise may take `error`
 * as its outcome, and `src/guards/raiseCodes.test.ts` enforces exactly that.
 */
export type Outcome =
  | 'won'
  | 'lost'
  | 'near'
  | 'warning'
  | 'neutral'
  | 'error'
  | 'noted'
