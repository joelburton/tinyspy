# app-wide — todo

**Almost every todo belongs in a folder, not here.** Put it in the `todo.md`
of the folder you would edit to do the work — `src/common/<folder>/`,
`src/shared/<folder>/` or `src/<game>/` — where it sits next to the code and
gets read when that area opens. This file is only for work that no single
folder owns: a change across the whole app, or a question about the app as a
whole.

The five sections are the same as every folder's: Bugs · Soon · Someday ·
Maybe are a ramp of certainty, and Won't do is not a queue — it records a
decision against, so a review doesn't propose it again
([docs/common-folders.md](docs/common-folders.md#every-folder-carries-a-docmd-and-a-todomd)).

## Bugs

## Soon

- **Three ways to handle a guess's mark and its feedback.** My answer shows
  in the local slot and lands on the board, and the two have to agree and
  leave together; each converted game solved it its own way. wordle:
  `useSubmitGuess` shows the slot and keeps the mark itself (`useMark`, on a
  timer). psychicnum: the submit path shows the slot and
  `useDecidedTileMarks` marks, separately, on its own timer. connections:
  `useVerdictMark` owns the mark, `markTiles` colors the tiles and shows a
  message beside them as one thing that leaves with the pill, and
  `useMarkForeignGuesses` marks a teammate's miss off their row. One shape,
  decided across the three before the next game converts.

- **Every test seam ends in `_ForTest`.** An export that only tests call
  should say so where it is called, and the underscore makes it easy to spot.
  `faultStore`'s two (`clearFaultMessages_ForTest`, `peekFaultMessages_ForTest`)
  already do; `peekFeedbackSlotForTest` (`feedback/feedbackSlotRegistry.ts`)
  and `__resetChannelTeardowns` (`realtime/channelTeardown.ts`) spell it other
  ways, and a sweep should look for seams whose names don't say it at all.

- **Two mobile behaviors need a check on a real phone; headless Playwright
  reproduces neither.** `viewport-fit=cover` stops the browser letterboxing, so
  every full-bleed surface has to clear the notch and the home indicator itself,
  and only FloatingPanel's sheet reads `env(safe-area-inset-*)`: check the game
  header, club page, toasts and celebration dialog on a notched phone.
  `touch-action: manipulation` on the tap-heavy boards is meant to stop iOS
  double-tap zoom and the tap delay: confirm on iOS that rapid taps don't zoom.

- **One declaration for CSS custom properties in `style`.** React's
  `CSSProperties` has no entry for `--x`, so the app works around it three
  ways: a computed key (`['--cols' as string]`, 18 in 8 files), a cast of the
  whole object (`{ … } as CSSProperties`, in wordwheel, letterboxed, setgame,
  ChatButton), which also hides a typo in a real property, and a typed-out
  `CSSProperties` object (crosswords). A `.d.ts` that widens it —
  `declare module 'react' { interface CSSProperties { [key: `--${string}`]:
  string | number } }` — makes `{ '--cols': cols }` type-check with no cast,
  still rejects an unknown real property, and lets every workaround go.

- **Test-only attributes become `data-testid`.** A `data-*` attribute that
  nothing but a test reads should say so by its name, so it needs no comment
  and nobody wonders whether the app or the CSS depends on it. `data-testid`
  is the standard name, and both Testing Library and Playwright read it
  (`getByTestId`). Two shared conventions today: `data-board` (on nine games'
  boards; about 32 e2e files, including the specs that measure every board,
  and psychicnum's vitest) and `data-tile={word}` (psychicnum, connections,
  wordwheel; four e2e specs and three games' tests), which become
  `data-testid="board"` and `data-testid={`tile-${word}`}`. The common
  components' own attributes (`MobileStatusBar`'s `data-mobile-status`,
  `HistoryBanner`'s, `DefinableWord`'s) join the sweep only after checking
  that no CSS or app code reads them. One sweep, across every game at once,
  since the shared specs find every board the same way. Do it once more games
  have converted, so their e2e can check it.

## Someday

- **The guards' comment strippers can blank real code.** Several guards strip
  `/* … */` by regex, so a `/*` inside a string literal (a glob like
  `'themes/*.css'`) hides everything up to the next `*/`, and a scanning guard
  passes while a violation ships. Nothing a guard checks is hidden today. Fix
  them all at once with `ts.createScanner` (`typescript` is already a
  devDependency), or not at all: fixing one leaves strippers that disagree.
- **Sweep `cell` vs `tile` to the rule in `docs/naming.md`.** A cell is an
  empty spot on the board to fill; a tile is a letter in a grid. Most games mix
  the two, often in one file. One sweep rather than per-game work; CSS classes
  that name what is drawn are exempt. setgame's `card` → `tile` rename is filed
  with setgame, and needs a forward migration.
- **Decide what the database hides.** Most games' `games_state` and
  `players_state` views, and thirteen end-of-game security rules on child
  tables, exist to hide an answer or a rival's progress until it may be shown
  — which the trust model doesn't ask for. Either drop the hiding (the page
  shows only what the game allows) or go the other way and hide properly,
  which is ambitious: a truly secure game is hard. Until then they stay, and
  follow their tables (plans/common-tables-schema.md → The views).
- **Decide when a fact worked out from the moves gets a column.** The games
  chose independently: wordle and waffle keep their budget counters as
  columns while wordiply recounts its 5-guess budget from `events` on every
  move, and spellingbee, wordwheel and boggle count `found_words` every time.
  A candidate rule: a column when a move's rule compares against it (a budget;
  bananagrams' `unplaced_count`) or when working it out is game logic, not a count
  or filter (letterboxed's chain, scrabble's score); otherwise count the
  moves. Whatever the rule, one source per fact — connections'
  `found_categories_count`, psychicnum's `found_secrets_count`, stackdown's
  `found_count` and setgame's `sets_found` are each a column that the moves
  also count from `events`, so two sources that agree only because one RPC
  writes both. The same question for history replay: most games rebuild a past
  board in the browser from the moves, while setgame stores `board_after` and
  waffle each swap's colors.

## Maybe

- **A dictionary of the repo's words: what each means, and what it must never
  mean.** Split `docs/naming.md`: its lexicon, canonical names and watch list
  become a one-table dictionary, one line per word plus a pointer to the doc
  that owns it, and the naming advice stays. The "never for" column is the
  point, filled only where two meanings have actually clashed. A possible
  guard: an identifier matching a reserved word may appear only in that word's
  allowed folders.
- **Stats, leaderboards and achievements across games.** Nothing is built: no
  `common` table, no RPC, no screen. Solo clubs are meant to anchor per-user
  stats, with each game writing through one `common` RPC. Nobody has asked yet,
  so the shape would be guesswork — which stats, per club or overall, computed
  live or written at `end_game`. Wait for a concrete want. Within a club this
  fits the audience; rankings among strangers don't.
- **A guard that a capitalized stylesheet is imported only by its component.**
  An import of `Foo.module.css` from anything but `Foo.tsx` / `Foo.test.tsx`
  would fail; lowercase sheets are shared and exempt
  ([code-conventions.md → CSS](docs/code-conventions.md#css)). Siblings in one
  folder read a component's sheet today (letterboxed's components read
  `PlayArea.module.css`), so the guard either exempts the same folder or those
  imports move first.
- **Declare the board slots in one place.** Shared sheets read custom
  properties only a game declares: the tile sizing `playArea.module.css` reads,
  the bee board's units, the rank ladder's text and gap. A slot nobody fills
  voids the declaration that reads it, silently. Give each family a declared
  default block beside its reader, as `--local-feedback-min-height` has in
  `base.css`, so a game filling one sees the whole set. (A per-mount guard was
  ruled out: see `common/game-page/todo.md` → Won't do.)
- **Rename each game's `theme.css` to `brand.css`?** Most of those files hold
  nothing but brand tokens, and the name would make any line that isn't brand
  stand out. Against it: per-game file names are role names (`manifest.ts`,
  `logo.svg`), and `docs/tokens.md` documents `theme.css`. If the name stays,
  say so where the file layout is described.
- **Branded id types: `GameId`, `UserId`.** `type GameId = string & {
  readonly __brand: 'GameId' }` keeps its name on hover and makes passing a
  user id, a club handle or an unchecked string where a game id belongs a type
  error. (A plain `type GameId = string` shows only in parameter hints; hover
  says `string`.) A branded id still passes anywhere a `string` is taken. The
  cost is a cast at every edge where an id enters the app: route params, row
  reads, realtime payloads, test fixtures. It has to be done as one organized
  pass rather than drifting in: brand the edges first (the game gate's
  `isGameId` becomes a type guard), then tighten parameters from the edges
  inward, since a parameter can only become `GameId` once all its callers
  supply one.

## Won't do
