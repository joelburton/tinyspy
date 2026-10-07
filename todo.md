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

- **No shared counter.** The same four lines — a `Map<string, number>`, a loop,
  `m.set(ch, (m.get(ch) ?? 0) + 1)` — are written out by hand in wordwheel's
  `BoardCol` twice, its `hooks/useSubmitWord.ts` and `lib/spend.ts`,
  bananagrams' `lib/board.ts` twice and scrabble's `lib/rank.ts`. One
  `countBy(items)` in `common/utils`, beside `shuffle`, with a test; the
  running counts in wordwheel's `lib/tiles.ts` and `TypedWord` are a different
  shape and stay (2026-10-04).

## Soon

- **Every folder directly under `src/shared/` and `src/common/` gets a
  `types.ts`.** A game's exported types live in its `types.ts` (docs/
  code-conventions.md → A game's types), and the shared folders should read
  the same way: one place to see the data a folder slings around, side by
  side. No shared folder has one today; forty of them export a type from the
  module that happens to define it (`beeGameData.ts`, `foundWords.ts`,
  `gameData.ts`). The names stay bare — the `G` is a game's — and
  `src/guards/gameTypes.test.ts` can then hold the placement for shared
  folders as it does for games (2026-10-04).
- **An actor is a player, and an absent one is null.** The history views
  (`GHistoryView.actor` in every game that has one) return `undefined` for
  "no one to name", and `HistoryBanner`, `ActorMention`, `FeedbackMessage`'s
  peer and chat builders and the ending message each take an `Actor`
  (`Pick<Member, 'username' | 'color'>`), so a view that holds the whole
  player narrows it to a name and a color, and a reader cannot tell a missing
  actor from an unset prop. Two changes, once every game is on the page blobs
  and holds its players: `Actor` retires in favor of `Member` (`Player`, the
  same thing), so a dot or a mention carries the id a hover or a profile link
  would want; and "no one" is `null` everywhere, `undefined` meaning only
  "not passed". Until then the rule for a converted game is that a hook or
  `gd` hands over the player, and only a render site's prop may still say
  `Actor`. What keeps `Actor` alive today: the unconverted games' PlayAreas
  build one from a winner's or leader's name read out of a status
  (wordiply, wordwheel, crosswords, stackdown, spellingbee, boggle,
  codenamesduet) and the console's `puppill` helper; both go as the games
  convert.

- **Every jsonb key the app designs is camelCase, as the page blobs' are.**
  Today code-conventions makes `setup`, `status` and the rest snake_case,
  with the page blobs the one exception, so a key stored snake lands in `gd`
  camel and a reader has two spellings of one thing to follow. The rule
  becomes one spelling, and the stored keys move to it in one pass, all games
  at once, since the setup is a cross-game contract: `common.games.setup` and
  each club's `clubs_gametypes.default_setup` (`max_guesses`, `word_count`,
  `coop_style`, `first_turn_user_id`, `puzzle_id`, the shared `timer`), with
  `common._require_valid_timer`, `common._assign_turn_order`, every game's
  setup form, `create_game` and `setupRows`; and spellingbee's and wordwheel's
  `is_pangram` in their word arrays. One migration rewrites the two setup
  stores; the game tables' object keys that are already camel
  (`connections.games.board.tileOrder`, strands' `solution.themeWords`) or
  single words (`rank`, `name`, `tiles`, `word`, `points`, `x`, `y`, `letter`)
  need nothing. Not ours to rename: crosswords' `puzzle_content`, an ipuz
  import, and `common.words_edits.old` / `new`, a journal's snapshots of a
  row's columns. Do it after the games convert, when every game's `gd` reads
  the keys.

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

- **A thing's facts kept in parallel lists, joined by whoever draws it.** The
  tile was the clearest case and is decided (plans/seat-view.md → A tile is an instance the builder writes:
  the builder writes the instance with its settled facts, the screen adds its
  marks beside it). The same shape is elsewhere: an event log's rows and
  their authors, a printer's tracks rebuilt from the log, connections' picks
  and marks per tile. Test each against that decision when its area is next
  open; not a sweep.

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
- **Setup options for which words a game may show: "don't show slur /
  offensive / non-American / … words".** The word games would then filter
  their word lists by those flags, and a hidden word never appears in the
  missed words or the full list, whatever its band. That is a better way to
  avoid showing people unclean words, or dinging them for not finding one,
  than a rule tied to the bands: today a band's unclean words are bonus words,
  shown and revealed like any other (2026-10-04).

## Won't do
