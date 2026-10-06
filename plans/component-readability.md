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

- **One object, `gd`: the `game_data` blob, read.** The game's builder writes the
  blob in the page's names (plans/seat-view.md → The page is written, not
  assembled); `makeGameData` turns its links into players, builds the setup
  rows, and applies the seat rule. Nothing is read from a table; a fact goes
  into the blob because the page shows it.
- **Every seat fact is on the player** (plans/seat-view.md → One home): the
  counts, the budget, the board, where they stand (`p.onTurn`, `p.conceded`,
  `p.solved`). The viewer is `gd.me`, one of them. Groups the game owns are
  real concepts: psychicnum's `puzzle` (words, secrets), `turns`, `ending`, and
  on each player `board` (`tileResults`, `decidedBy`).
- **Players:** `gd.players` (the list, seat order) and `gd.playersById` (the
  same objects), plus `gd.me`. The game's player type is `Member & { … }`
  (psychicnum's `GPlayer`), so it goes straight to shared pieces that
  take `Member[]`. No `roster` beside `gd`; no alias like `Player = Member`.
- **Don't destructure a group back into loose names.** `tiles.results` says
  what it is and where it came from; a bare `results` is generic. Read the
  field through its group (`gd.me.onTurn`, `tiles.results`).
- **What a child gets:** the two columns take `gd` whole. A leaf gets fields or
  its own groups, never `gd`: `Board` takes `tiles`, `marks`, `historyView`;
  `StateLine` takes a player.
- **Whatever takes `gd` takes nothing `gd` already holds.** No `myId` beside
  `gd`: the viewer is `gd.me.id`. The same for a component, a hook, and the
  `PlayArea`, which therefore needs no `auth`.
- **Identity:** `gd` is memoized on the blob, so it is rebuilt when the page
  hands down a new one and not on every render. What an effect depends on is
  a field (`gd.me.onTurn`), never a group.

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
(which returns `GHistoryView`, including `isViewing`),
`useActionsAndMenu` (the game's actions and its menu),
`useShowOppsFoundMessages`, and the common `useShowWaitingMessage`. Comments say
what happens on each line and point at the hook; the hook's docstring holds how
it works.

## Board and BoardCol

- **Board owns the board:** its display order and Shuffle (`useTileShuffle`,
  which binds `act-shuffle`), and the keyboard cursor (`useTileCursor`), which
  reports a pick up through `onPick`. Board makes its own Shuffle button.
- **BoardCol owns the move:** `usePickedTile` (`pick.tile`, `pick.shownTile`,
  `pick.choose`, `pick.clear`), `useSubmitGuess` (`submission.send`,
  `submission.inFlight`, the local refusal), and `useBoardColActions`
  (`actions.actSubmit`, `actions.actClearPicks`). A hook that returns a named
  thing is kept as that thing and read through its name, with the subject
  said once: `verdict.clear`, not `clearVerdictMark` loose.
- **One in-flight guard:** an action's own `pending` blocks a second
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
  `{ flashingTiles, shakingTiles }`; the long rationale is its docstring.
- **Ask the answer table, don't fake a row:** a tile's color is
  `getGuessOutcome(word, isCorrect)` in `lib/answer.ts`, which `eventToOutcome`
  also calls — not a made-up event handed to `eventToOutcome`.
- **One rule, written once, named for its purpose:** `BoardCol` computes
  `canPick` (`gd.me.onTurn && !historyView.isViewing`) once and hands it to
  `Board` — the cursor and the tile's `isDisabled` — and to Clear and Submit,
  which add the pick. `Board` is never taught whose turn it is or why a past
  turn blocks a click; it is told "the tiles take picks right now". A game
  with no off-turn drafting has that one gate, not scrabble's two.

## InfoCol

It takes `gd`, `myId`, `endingMessage`, `actions` and `historyView`. The
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
- The viewing player is `my…` / `me`, never `self…` — `myId`, `gd.me`,
  `isMyTurn` (docs/code-conventions.md → Names about the viewing player). The
  shared components take `myId` too; a game converting from `selfWon`,
  `selfSolved` or `selfRankIdx` picks the `my…` name that reads best.
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
  (psychicnum's `GTileWord` in `types.ts`), so a map or a set says
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

## What connections added

connections' BoardCol pass (2026-10-03) settled, beyond the two games above:

- **`isInteractive`, not `canPick`.** The one gate — my move, on the live
  board — says the surface responds to me and promises nothing about any one
  gesture landing: a fifth pick is refused by the picks rule, a decided tile
  by the tile, and `canPick` claimed otherwise. Computed once in `BoardCol`,
  it feeds `Board`, the actions hook and the pick handler; inside the column
  the short form is enough, and a component's prop is about itself, so it is
  `isInteractive` on `Board` too. psychicnum's `canPick` takes the same name
  when it next opens.
- **A fact three readers count is decided once.** "Four tiles are held" was
  worked out in the actions hook, in `send` and in the picks rule; it is
  `picks.isComplete`, computed in `useGame` beside `union`.
- **The board to show is picked in PlayArea.** Live, the reveal's (the same
  board with no loose tiles, and the unmatched categories as `revealedCats`),
  or a past turn's — `Board` consults nothing but the `board` it is handed.
- **A leaf gets the answer.** `Board` took a tile → picker-id map, a
  user → color map and `isSharedBoard`, and joined them per tile. `BoardCol`
  hands one `tileToPickerColor` map: a picked tile is a key, its value the
  picker's color where whose pick is worth saying and null where it is not.
- **A component per visual unit, again.** connections' board has two: `Tile`
  (the loose tile and the marks this screen adds, with `pickerColor` and a
  `verdict` of `{phase, outcome}` so the tile draws flash, shake and fill off
  one value) and `Band` (a category across the row). Each has its own CSS
  module; `Board.module.css` keeps the wrapper and the grid. The cursor is
  `useTileCursor`, as psychicnum's; it hands back the cursor's `position` so
  the loop asks `position === i` and nothing else.
- **The InfoCol pass took psychicnum's answers whole**: `getScoreOrOut` reads
  "out" for any racer who has ended (an elimination included, where the
  inline arrow had said conceded only), the help line shows on my move alone,
  the event log takes `events` and `historyView`, and a verdict label asks
  the rule (`result === 'oneAway'`) and not the color. A fold rule gets a
  name before the return (`isHintListShown`).
- **connections' tile is `{id, word}`, the word its id.** The builder writes
  it in `puzzle.tiles` (the sixteen in this game's order), a category's four
  and a seat's `tilesLeft`, through `_make_json_tile` / `_make_json_tiles` /
  `_make_json_cat`; `gd` builds `puzzle.tilesById` beside the list and
  resolves the log's rows' tiles through it. What is held is ids, named as
  such: `inFlightTileIds`, the verdict's `tileIds`, `litTileIds`, the picks,
  the shuffle's order; what is passed and drawn is the tile. The printer
  takes words at its seam.
- **Live state nothing above the column reads is the column's.** The picks
  (the map, the Broadcast room, the two senders) were `useGame`'s and rode
  through PlayArea as a prop that only `BoardCol` read; they are `usePicks`,
  a hook of `BoardCol`'s, and `useGame` hands back `gd` alone.

## What spellingbee and wordwheel added

The two bee games converted in tandem (2026-10-03/04), one shared shape under
two folders, and settled beyond the three games above:

- **Twins are byte-identical where the game is the same.** `PlayArea`,
  `InfoCol`, `StateLine`, the actions hook and the four ending and narration
  hooks differ only in the game's name; `Board`, `Tile`, `BoardCol` and
  `useSubmitWord` differ only where the multiset does. What both need lives in
  `shared/bee-games` — the blob shape and `makeBeeGameData`, the two ending
  builders, `useTileShuffle` — under BARE names, since `G` means "this game's";
  each `types.ts` names them as its own.
- **The move is a hook, as psychicnum's.** `useSubmitWord` owns the lookup over
  `gd.puzzle.words`, the `submit_word` call, what each answer shows and the
  refused mark; the column passes `gameId`, `words`, `foundWords`, the center,
  `isMyTurn` and the slot, and gets the typed word, `submit` and the mark back.
  The engine's option for the RPC is `send`, psychicnum's word — never
  "commit", which is not a word for submit.
- **Wordwheel's claims are tile ids.** A click claims the tile it landed on, held
  as `claimedTileIds` beside the word in the hook, for exactly as long as its
  letter is in the word; `lib/spend.ts` works in ids, and the leftover spend
  falls to the puzzle's order, which a shuffle no longer moves. `gd.puzzle`
  carries `tilesById` for the lookup.
- **The Board owns its display order and the Shuffle**, through the shared
  `useTileShuffle` over tiles, and renders the `ShuffleButton` itself; the
  `floatingControl` prop went.
- **One case, the data's.** The word list is lowercase, so the typed word, the
  marks and the claims stay lowercase and the capitals are put on at the draw
  point: `text-transform` on the typed word and the wheel's face, by hand for
  the SVG tile, the pill's sentence and the PDF. Nothing lowercases on the way
  in.
- **A fact read in two places is one component.** `StateLine` draws the ladder
  and the figures from `gd.stateLineData` in the info column and the mobile
  status bar; the strip's cell reads `player.ending` for "out", as the
  siblings' do.
- **An alias earns its place by being transparent.** `sld` for
  `gd.stateLineData` where the full path six times in a line hid the sentence;
  `readout`, a second word for the same thing, did not.
- **`isCenter`, `used` and `spent` are required booleans** on the tiles: every
  Board passes them, so an optional lied.

## What boggle added

boggle converted alone (2026-10-04) and settled, beyond the games above:

- **A component that takes `gd` takes no `myId`.** It reads `gd.me.id`; a
  `myId` beside `gd` is a second copy of one fact. The earlier games' columns
  dropped theirs, and `PlayArea` needs no `auth` once nothing below it does.
- **Types that reach React live in `reactTypes.ts`.** A game whose edge
  function imports its `types.ts` keeps that file to relative `.ts` imports with
  no `@/` and no package name, since the edge runtime resolves neither; the
  types that name React's (`GActions`, the refused mark) go beside it, still
  under `G` names. The `edgeFunctionImports` guard checks the rule.
- **`BoardCol` lays out; the word the board and the entry share is a hook
  above both.** `useTracedWord` holds the move (`useSubmitWord`), the tapped
  path, the typing rules and the marks; a tap adds a letter to the entry and a
  typed letter lights tiles, so neither child can own it.
- **The Board owns a view-only transform,** as the bees' Board owns the
  Shuffle: `useBoardRotation` hands back the tiles in draw order and the
  Rotate action. Because every mark is held as tile ids, a turn carries the
  marks, a half-tapped path included, with nothing remapped.
- **A value `gd` can build once, it builds.** `gd.puzzle.traceBoard`, the
  board the tracer walks, is made in `makeGameData`, not per keystroke.
- **One word per idea, from the function to the pixel.** The tracer's
  `settled` / `maybe` are the marks' and the CSS's words; `bonus`, not
  `isBonus`, is the blob's and `GAnswer`'s.
- **Capitals are drawn.** A two-letter tile reads `Qu` through CSS
  `capitalize` over lowercase letters; the typed word takes the entry box's
  uppercase.
- **A readout draws its cells itself.** `StateLine` lays out the four cells
  where `Stats` had been a second component for one caller.
- **Test-only helpers are `ZTest_`, in a `.fixture.ts`,** and one no test
  needs is deleted. A test reaches the writer players actually read
  (`makeSetupRows`) rather than a copy kept for the test.

## What codenamesduet added

codenamesduet converted alone (2026-10-04) and settled, beyond the games above:

- **The builder decides what a tile shows and who may guess it.** A tile's
  `revealed: {as, arrows}` is what the board draws — one shown state for both
  players, and the players to point an arrow at — and `guessableBy` is who may
  still guess it. Neither is worked out on the page, so a new rule (arrows on a
  contacted agent, say) is a builder change that `gd` and the frontend never
  see; the reveal is for appearance, not for guessing.
- **The puzzle is the deal; the team's board is what happened to it.** A board
  tile links to its puzzle tile, so the word lives once, and the keys are the
  puzzle's, by player — there is no key card on the player.
- **A fixed team's facts are the team's**, and a flag every reader would work
  out the same way is the builder's: each event's `suddenDeath`.
- **`gd.partner`** beside `gd.me`, for a game of exactly two.
- **A leaf gets one decided value where it would otherwise get the question**:
  the clue strip's `GClueStrip`, decided in `BoardCol` beside `isInteractive`.
  Passing `gd` below the columns stays unexpected rather than forbidden: where
  selecting would only copy fields, pass `gd`.
- **A game's own words keep the data's case**: lowercase stored, capitals drawn.

## What wordiply added

wordiply converted alone (2026-10-04) and settled, beyond the games above:

- **The board is the seat's view, on every player, in both modes** — wordle's
  way, not codenamesduet's `team.board`. A shared coop board that every seat
  sees the same goes on the player, so `gd.me.board` is always the board to
  draw and no reader branches on mode; `team.board` is for a board whose
  pieces carry per-seat facts the seat rule resolves.
- **A teammate's move is marked from the board's side**
  (`useMarkForeignGuesses` in `BoardCol`, connections' shape); `PlayArea`
  only narrates it in the header. No converted `PlayArea` reaches into the
  board.
- **The typed word splits from its trip to the server**, as wordle's does,
  even where the shared engine owns the word: `useSubmitGuess` (the engine,
  the RPC, the answer mark) and `useTypedGuess` (both keyboards typing into
  it).
- **A game's words can say less than its outcome.** Coop's five words spent is
  `won`, drawn green, but its pill and club card say "Ended"; only compete
  says "Won", and only a race win throws confetti.
- **An RPC's answer carries what a caller reads, and no more.** `submit_guess`
  answers `{result}`; what the word did, the page reads from the blobs.
- **A frontend copy of a server rule with no reader goes**, rather than being
  kept in lockstep: wordiply's `compareCompetitors` had drifted from the
  server's tiebreak.

## What waffle added

waffle converted alone (2026-10-05) and settled, beyond the games above:

- **A move with no action behind it is guarded by its own pending state.** A
  tap and a drag swap without an action, so `pending` cannot cover them; the
  swap still out (`useSubmitSwap`'s `pendingSwapTileIds`) is the one guard,
  and `useSingleFlight` went.
- **A move shown before its answer lasts until the log says it landed** — the
  newest row of `gd.events` changing, one fact — rather than until the RPC
  resolves, which beats the blob.
- **A state the data cannot hold is a mark, not a fake value.** A tile whose
  swap is out is unjudged; that is `inFlightTileIds` on the board, not a
  `'blank'` color forced into `GTile`.
- **Strings stay where a string is the thing.** The database stores a board as
  25 characters; the page is handed tiles, and every reader — the board, the
  answer words, the printer — reads tiles. No string form of a board is kept
  on the frontend for convenience.
- **An exposure goes when its reason does.** Coop held the solution mid-game
  for a viewer that recolored past boards; once every swap stored its colors,
  the solution waits for the end in both modes.
- **A key shared by two deploy targets ships in one deploy.** `create_game`'s
  `dealt` is read by SQL and written by the edge function; either alone breaks
  starting a game.

## What letterboxed added

letterboxed converted alone (2026-10-05) and settled, beyond the games above:

- **A count about the chain is the team's, not the player's.** Words used and
  letters covered describe what the team built, not what anyone did, so in coop
  they live on `team` alone and a coop player carries neither key; a racer
  carries their own. What a player DID — a hint, a spoiler — is on every player
  in both modes.
- **A long list names its exceptions.** The board's words go in the blob once,
  with the few a hint may not offer beside them (`uncleanWords`), rather than a
  second list nearly as long; `makeGameData` puts it in the clearest shape for
  the readers (`[{word, clean}]`).
- **One name for one list, from the builder to the page.** The board's words
  were `playable_words`, `legal_words` and `words` at three stops; they are
  `words` at all of them.
- **A function with no React in it is a `lib/` function**, even when only one
  hook calls it (`askForHintOrSpoiler`).
- **A tile's look and its click are two answers.** A letter that may not follow
  the last one ignores a click but still looks pressable, so the tile takes
  `isInteractive` and `isPickable` apart.
- **A file the edge function loads takes plain shapes.** `lib/board.ts` is
  reached through `customBoard.ts`, so its tile helpers take `{letter, side}`
  rather than importing `GTile`.

## What stackdown added

stackdown converted alone (2026-10-05), the first game to take the backfill —
the answers, the comment pass and the section order — inside its conversion,
and settled, beyond the games above:

- **A word being built is read off the board the blob draws**, not kept in
  step by hand: a word a teammate's clear took a tile from is empty, and an
  accepted word's held tiles drop as the blob has them gone — two derivations,
  no effect (`useCurrentWord`).
- **The send is an action's `run`, so the action's `pending` is the in-flight
  guard**, and the column's own gate (`canPick`) reads it rather than keeping
  a flag.
- **A flash holds ids, not letters**, when the tiles are on the puzzle: the
  letters come off `tilesById` after the tiles have left the board, so nothing
  changes case in state.
- **A mark carries its answer, not a color**, when two readers need two things
  from it: a teammate's word mark holds a `GAnswer`, which says both the color
  the tiles wear and whether they are held.
- **A keystroke the board turns away is not an answer.** It writes no row, so it
  stays out of `GAnswer`, and its pill is its only surface.

## What strands added

strands converted alone (2026-10-05), the backfill inside its conversion, and
settled, beyond the games above:

- **A name says which kind of thing it holds** when a game has several kinds
  of the same thing. strands has four kinds of word, so a bare `words` or
  `nFoundWords` could not be read without the mode and the rules in mind:
  `puzzleWords`, `foundPuzzleWords`, `nFoundPuzzleWords`. A bare `word` is
  kept for the one thing that can be any kind — the word a trace spelled —
  and the doc names the kinds once (docs/games/strands.md → Naming the words).
- **A pool is the team's, a count of acts is the player's.** Coop's hint bar
  and ringed hint are one pool — `team.hintPoints`, and the ring on the shared
  board — while the hints cashed are each player's own `nHintsUsed`, counted to
  whoever cashed.
- **A reducer takes tiles; the hook holds ids.** `lib/trace.ts` works on
  `GTile`s and `useTrace` keeps their ids, handing back the live tiles each
  render, so the geometry reads tiles and nothing stale is held.
- **A leaf that is live over a past turn says why.** The board's letters stay
  clickable while history is open, because a click there is how the board goes
  back to live; their `isDisabled` is not the column's `canPick`, and the code
  says so.

## What setgame added

setgame converted alone (2026-10-05) and settled:

- **A board that is the game's, not a seat's, sits on `gd`.** One contended
  table in both modes is `gd.board`, not a copy on every player; a seat's
  `board` stays the rule where seats differ.
- **An action placed on two surfaces is bound once.** Hint picks tiles, so the
  board column binds it; the info column shows the same action through
  `useAction('act-hint')` rather than having it handed across.
- **An action id says how it finds its target** where two gestures pick the
  same thing: `act-toggle-tile` is the cursor's Space, `act-pick-by-letter` the
  letter under a slot, `pickClicked` the mouse (Joel, 2026-10-05).
- **A board that substitutes in place holds what left before showing what
  came** (`useClaimMarks`): the shared marks at their shared lengths, the hold
  the same for everyone, and only pieces new to the board flash.

## What scrabble added

scrabble converted alone (2026-10-05) and settled, beyond the games above:

- **A cell is a spot, a tile is a piece** (docs/naming.md → `cell` vs `tile`):
  where a board has empty spots, `GCell {id, tile}` holds the `GTile` placed on
  it, and the tile's id is its cell's. `lib/` takes the cell list — the one
  array, no second copy of the board.
- **A board you may lay out before your turn has two gates**, computed once:
  `isInteractive` (stage, recall, reorder — off-turn too) and `canSubmit` (the
  turn-spending moves). A move already out grays the others through its
  action's `pending`, read lazily in `describe`.
- **A move claims what it changes before its RPC returns** (`useSubmitMove`):
  my own write can land first, and the landing must read it as mine. Every
  answer that wrote nothing gives the claim back.
- **One piece, two holders.** The board's tile and the rack's are one `Tile`,
  filling whatever holds it; where it sits (`where`) carries the few
  differences, and each holder sizes it.
- **A shared keyboard hook hands over the data's case.** `useBoardCursorKeys`
  passes a typed letter lowercase, as `useCaptureKeys` does; a game still in
  capitals uppercases in its own handler until it converts.
- **A tap can place.** One picked rack tile and a tap on an empty cell stage
  it there; with several picked, the tap can't say which, and does nothing.

## What bananagrams added

bananagrams converted alone (2026-10-06) and settled, beyond the games above:

- **Two coordinators where one input spans both columns.** The hand's tiles
  drop onto the board and the dump zone takes a tile dragged off it, so one
  editing board (`useEditingBoard`) sits in `EditingBoard`, between `PlayArea`
  (data, moves, the slot, the endings) and two views that own no input, and
  keeps a drag's per-move re-renders out of `PlayArea`. It is the editing
  board, never an engine, and the component, the hook and its type
  (`GEditingBoard`) share the name (Joel, 2026-10-06).
- **State the page owns is seeded from the blob once.** The board is the
  page's: `gd.me.board.letters` seeds it at mount, a later blob never
  re-seeds it, and the save is what puts it back.
- **A piece sized off its holder counts the borders.** `cqmin` measures
  inside a container's border, so `Tile`'s letter adds back the tile's border
  and, on the board, the cell's, and every letter stays 0.6 of its tile.
- **A shared keyboard hook's submit answers `hidden` to a button while the
  board is inert** (`useBoardCursorKeys`), and `SubmitWithScore` draws nothing
  for a hidden action.
- **An acknowledgment reads the log, not a guess.** A draw is the log's newest
  row through the shared seen-set (`useShowPeerFeedback` into the local slot),
  never a count growing on screen.

## What crosswords added

crosswords converted alone (2026-10-06), the last game, and settled, beyond
the games above:

- **A move at typing speed shows before its answer, until the blob is known to
  carry it** (`usePendingWrites`): an overlay of my writes over `gd`, each
  leaving once `gd`'s revision reaches the one its RPC answered — never by
  comparing letters, which would hide a teammate's overwrite. A failed write
  leaves at once.
- **A flash read off the blob is compared, not sent.** A teammate's letter
  flashes because the new board's cell changed and its writer is not me
  (`useTeammateFills`); no Broadcast carries it, so the letter and its flash
  cannot disagree.
- **A blob rebuilt per keystroke is packed, and `makeGameData` unpacks it.**
  Flat fills with the pencil in the letter's case, flags as cell indices; `gd`
  is the readable shape. What is sent once stays readable.
- **No columns where the move doesn't span them.** One coordinator over the
  grid and its leaves (`ActiveClueBar`, `ToolStrip`), each trip to the server
  a hook, the typing state one hook (`useGridEntry`).
- **A piece redrawn per keystroke takes plain values**, not the rebuilt
  object, so `memo` redraws only what changed (`Cell`).

## Owed, not done at psychicnum

- The terminal sweep: `TerminalMessage` → `EndingMessage`, the `isTerminal` /
  `isLocallyTerminal` names on shared components and `PlayAreaLoaderProps`, and the
  `--outcomes-*-terminalFrame-color` tokens. In `src/common/`'s hooks the
  wording appears in `useClubGames.isTerminal` (ClubPage reads it),
  `useChangeCause`, `useSetupDialog`, `useSolutionReveal`, `useGameTimer`,
  `useCaptureKeys`, `useWordListFilter`, `useEventLogPlayerPicker`,
  `useShowEndingFeedback` and `useStandardGameActions`.
- `GamePlayer` → `Player` once every game converts: common's types are the
  bare ones, a game's wear the `G` (`src/common/members/todo.md`).
- A Stop drops a win that already stands (`src/common/terminal/todo.md`).
- One `.d.ts` for CSS custom properties in `style` (`todo.md`).
- Test-only attributes (`data-board`, `data-tile`) become `data-testid`, as
  one sweep across the games (`todo.md`). Until then, a new test-only
  attribute on a converted game is still written as `data-testid`.
- `board-geometry.e2e.ts` measures psychicnum's board only once every board it
  lists can be created.
