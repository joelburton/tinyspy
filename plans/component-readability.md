# Component readability — what psychicnum settled, for the next game

**Read this when a game's area opens its `PlayArea.tsx`, `BoardCol.tsx` or
`InfoCol.tsx`,** beside [playarea-readability.md](playarea-readability.md) (the
section shape) and [tile-feedback.md](tile-feedback.md) (the board's feedback).
psychicnum is the control: these are the choices Joel made on it, component by
component, in commits tagged `playarea-refactor`, `BoardCol-refactor` and
`infocol-refactor`, then `a7040014` (players), `ff36623e` (one in-flight
guard) and `bf1454db` (Board and `WordTile`). The grouped-values trial
([DO-NOT-READ-grouped-values.md](DO-NOT-READ-grouped-values.md)) was run on
psychicnum, and its outcome is recorded here, in the `gd` section below.

What is durable is already in `docs/playarea.md` (the four layers, Board owning
the board, BoardCol owning the move) and psychicnum's `doc.md`. This file is the
checklist of choices, so the next game makes them the same way without
re-deriving them.

## How a component pass goes

One component per pass: PlayArea, then BoardCol, then InfoCol, then Board (and
the tile it draws). Each pass:

1. Read the file and propose, numbered, with no code yet: the hooks worth making,
   names, arrow constants to turn into named functions, how to shape a child's
   props, and comments to cut.
2. Joel answers by number. An item he doesn't answer is still open: ask it
   again rather than assume.
3. Build, then do a close read: wrap long lines, cut comments that explain other
   code.
4. Joel reviews the diff, then commits and tags the component (`<component>-refactor`).

## `gd` — what `useGame` returns

- **One object, `gd`, grouped by meaning, never by source.** Where a value came
  from (the page's row, a status copy, the game's tables) is `makeGameData`'s
  business. A fact the statuses carry is read from them; otherwise from the
  tables. A key goes into a status because the page shows it, never only to
  feed `gd` (plans/common-tables.md → The statuses).
- **Groups are real concepts;** a lone value stays flat. psychicnum's:
  `readout` (the state line's counts), `board` (words, `tileResults`,
  `decidedBy`, `guessCount`), `standing` (where I stand), and the players.
  Ending values are flat: `gameEnding`, `isGameEnded`, `winner`.
- **Players:** `gd.players` (the list, seat order) and `gd.playersById` (the
  same objects), plus `gd.me`. The game's player type is `Member & { … }`
  (psychicnum's `PsychicnumPlayer`), so it goes straight to shared pieces that
  take `Member[]`. `GamePlayer` is read only inside `useGame`. No `roster`
  beside `gd`; no alias like `Player = Member`.
- **Don't destructure a group back into loose names.** `tiles.results` says
  what it is and where it came from; a bare `results` is generic. Read the
  field through its group (`gd.standing.isMyTurn`, `tiles.results`).
- **What a child gets:** the two columns take `gd` whole. A leaf gets fields or
  its own groups, never `gd`: `Board` takes `tiles`, `marks`, `historyView`;
  `StateLine` takes `readout`.
- **Identity:** `gd` is rebuilt each render. What an effect depends on keeps its
  identity: memoize the players and setup rows, and depend on fields
  (`gd.standing.isMyTurn`), never on a group.

## Endings

- **Two builders in `lib/`:** `buildGameEndingMessage` and
  `buildPlayerEndingMessage`. They return `{ pillText, infoColText, outcome }`,
  with each condition written out (`if` / `else if`, then a `throw` for a
  reachable-by-type case the game never writes).
- **The outcome comes from the database, never the front end.** It is MY
  outcome (`gd.me.outcome`), not the game's: a compete loser's pill is `lost`
  while the game's outcome is `won`. A player's outcome is written when they
  end (docs/win-lose.md → `outcome-at-player-end`), not only at the game's end.
  A watcher falls back to the game's outcome, tagged `SPECTATING:`.
- **Two hooks** (`useGetGameEndingMessage`, `useGetPlayerEndingMessage`) memoize
  on the strings, and the player one returns null once the game has ended. One
  common hook shows both: `useShowEndingFeedback(slot, { gameEndingMessage,
  playerEndingMessage })`.
- **`endingMessage = gameEndingMessage ?? playerEndingMessage`** is picked once,
  in PlayArea. It feeds the board frame (`endingOutcome`) and InfoCol's action-row
  line. Back to club's filled look reads `gd.isGameEnded`.
- **The frame:** `makeEndingFrameClasses(outcome, isViewingHistory)` gives
  `.endingFrame` + `.endingFrame_${outcome}`. The type is `EndOutcome`, which
  includes `near`.

## PlayArea

Beyond playarea-readability's sections: the ending hooks above, `useHistoryView`
(which returns `HistoryView`, including `isViewing`),
`useBindActionsAndPublishMenu` (the game's actions and its menu),
`useShowOppsFoundMessages`, and the common `useShowWaitingMessage`. Comments say
what happens on each line and point at the hook; the hook's docstring holds how
it works.

## Board and BoardCol

- **Board owns the board:** its display order and Shuffle (`useWordShuffle`,
  which binds `act-shuffle`), and the keyboard cursor (`useWordCursor`), which
  reports a pick up through `onPick`. Board makes its own Shuffle button.
- **BoardCol owns the move:** `usePickedWord` (the pick, and `shownPickedWord`),
  `useSubmitGuess` (the RPC, the local refusal, `inFlightWord`), and
  `useBoardColActions` (Submit, Clear).
- **One in-flight guard:** a bound action's own `pending` blocks a second
  Submit. There's no `isSubmitting` alongside it.
- **Before the return,** complex conditions become named values
  (`isDecidedByShown`, `buttonShow`, `isLocalFeedbackShown`).

## Board and its tile

- **A tile is its own component** (`WordTile`, with its own
  `WordTile.module.css`): the button, the word, the dot, and the tile's CSS
  (the decided fills, the dot, the history ring). Board's loop works out each
  tile's values and hands them over; the eleven-class button lives in the
  tile.
- **The tile's props:** `word`, `decidedOutcome`, `guesser`, a `marks` group
  (`isPicked`, `isUnderCursor`, `isInFlight`, `isFlashing`, `isShaking`,
  `isHistoryLit`), `isDisabled`, `onClick`. The decided fill is
  `styles[`decided_${decidedOutcome}`]`, the same pattern as the ending frame.
- **The marks that follow a decision** (the attention flash, then the
  head-shake on a wrong one) are one hook, `useDecidedTileMarks`, returning
  `{ flashingWords, shakingWords }`; the long rationale is its docstring.
- **Ask the answer table, don't fake a row:** a tile's color is
  `getGuessOutcome(word, isCorrect)` in `lib/answer.ts`, which `eventToOutcome`
  also calls — not a made-up event handed to `eventToOutcome`.
- **One rule, written once:** `canPick` (`isInteractive && !isViewingHistory`)
  feeds both the cursor and the tile's `isDisabled`; the cursor's position is
  worked out once per render, not once per tile.

## InfoCol

It takes `gd`, `selfId`, `endingMessage`, `actions` and `historyView`. The
strip's cell comes from a named function (`getScoreOrOut`), and a player who has
ended reads "out". `OpponentStrip` is generic, so the cell gets the game's
player and needs no lookup. The event log takes `events` and `historyView`.
Comments on each button go; the actions' own rules live with the actions.

## Naming and style rules applied

- Functions are verbs and values are nouns. When the natural value name is a
  function's, the function gets the verb (`makeBoardShape` → `boardShape`).
- A function defined directly in a component is a `function` declaration, not
  an arrow constant. Arrows inside objects or `useCallback` are fine.
- A name with a game sense and a player sense says which. A name about history
  says so. No new synonym for an existing word (`roster`, `racer`, `budget`,
  `commit` for submit).
- An action hook is `use<Component>Actions`, with no "bind".
- A name says what the value is (`isPhone`, `isLocalFeedbackShown`,
  `getScoreOrOut`).
- No `?.` / `?? 0` on a lookup that cannot miss: remove the lookup, or use `!`.
  Check the schema before deciding it can miss: psychicnum's `decidedBy` needs
  no `undefined`, because a player's guess rows go with their profile
  (`on delete cascade`). Say the guarantee in a comment beside the `!`.
- A count is named as one: `numCols`, `numRows` (the shared `BoardShape`
  fields), never a bare `cols` / `rows` that reads like a list.
- A type's field comments say what the field MEANS, not what the UI does
  with it; the code that draws it says that.
- A plain type alias for the one string a game passes everywhere
  (psychicnum's `TileWord` in `lib/tileResults.ts`), so a map or a set says
  what it holds. Only where it earns it; not an alias for every string, and
  no branded types.
- CSS rationale goes in the CSS; a comment never explains another file's code.

## Tests

A hook or lib function gets its own test when it holds a rule the page makes
awkward to reach (the in-flight dim, the shuffle staying put across reloads,
every ending's words). Keyboard behavior is tested through PlayArea. Verify a
new test by planting the bug it guards against. psychicnum's e2e specs are
`e2e/psychicnum-*.e2e.ts`, plus the psychicnum cases in `board-focus`,
`events-realtime`, `page-no-scroll` and the two `infosheet-*` specs. Ask before
running them.

## What wordle added

wordle took the same passes in the same order (PlayArea `7f9c90b2`, BoardCol
`9d6982e2`, Board `82eebe11`, InfoCol `45d932b0`), untagged: the tags were only
psychicnum's. What it settled beyond psychicnum:

- **A component per visual unit.** wordle's unit is the row — it flips, rings
  when refused, and is what the history view lights — so Board draws
  `LetterRow`s and each row draws `LetterTile`s, each with its own CSS module.
  Board's loop works out each row's values and hands them over.
- **Name a value that has cases with `if`s, not a ternary chain.** A row's word
  is `getRowWord()`, a small function declared where its inputs are, with one
  `if` per kind of row.
- **BoardCol's move splits in two,** as psychicnum's did: the entry
  (`useTypedGuess`, the typed word from either keyboard) and the round trip
  (`useSubmitGuess`, the word out with the server and the refusal mark).
  `submitGuess` resolves to whether the guess was accepted.
- **One Submit action.** `act-submit-entry` is gone: a typed entry
  (`useCaptureKeys`) and a board-built move both bind `act-submit`.
- **A closed set names every case, and `default` throws.** `getTileColor
  (colorCode: ColorCode)` names `g`/`y`/`x`/`.` and throws on anything else; a
  tile with no colors is its caller's to call `blank`. A switch over a union
  names each value.
- **An animation reads the class's tokens.** The flip lands on the tile's own
  color class (`--tile-slot-*`), not on colors worked out in TypeScript, and a
  kept e2e spec (`wordle-colors`) checks the painted result, since jsdom can't.
- **What the page shows may come from a status,** read by any part of the page
  (plans/common-tables.md → The statuses) — wordle's compete tie wording reads
  `player_status.tie_broken_by_clock`.
- **An RPC's answer key says what it means:** `submit_guess` answers
  `game_ended`, true only when that guess ended the game for everyone.
- **Ending builders nest their words function,** and the player's own outcome
  is `playerOutcome` beside the game's `gameEnding.outcome` — a trial in
  psychicnum and wordle, not yet a rule.
- **Comments:** a prop whose name says what it is has no comment; a type's
  field comment says what the field means.

## Owed, not done at psychicnum

- The terminal sweep: `TerminalMessage` → `EndingMessage`, the `isTerminal` /
  `isLocallyTerminal` names on shared components and `PlayAreaLoaderProps`, and the
  `--outcomes-*-terminalFrame-color` tokens. In `src/common/`'s hooks the
  wording appears in `useClubGames.isTerminal` (ClubPage reads it),
  `useChangeCause`, `useSetupDialog`, `useSolutionReveal`, `useGameTimer`,
  `useCaptureKeys`, `useWordListFilter`, `useEventLogPlayerPicker`,
  `useShowEndingFeedback` and `useStandardGameActions`.
- `PlayAreaLoaderProps` carries `cg` and `manifest` beside the legacy fields
  copied off them. Each game, as it converts, reads `ctx.cg.title`,
  `ctx.cg.standing`, `ctx.cg.turns`, `ctx.cg.timer` and so on, and
  `ctx.manifest.name` for `ctx.brand`; its `gd.standing` spreads
  `ctx.cg.standing`. Once the last game reads only those, the legacy fields
  go, leaving `{ cg, manifest, authSession, resubscribeCount,
  globalFeedbackSlot, menu, goToFollowUpGame }`.
- `GamePlayer` → `CommonGamePlayer` once every game converts
  (`src/common/members/todo.md`).
- A Stop drops a win that already stands (`src/common/terminal/todo.md`).
- One `.d.ts` for CSS custom properties in `style` (`todo.md`).
- Test-only attributes (`data-board`, `data-tile`) become `data-testid`, as
  one sweep across the games (`todo.md`). Until then, a new test-only
  attribute on a converted game is still written as `data-testid`.
- `board-geometry.e2e.ts` measures psychicnum's board only once every board it
  lists can be created.
