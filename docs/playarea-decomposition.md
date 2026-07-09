# PlayArea decomposition + turn-history

Every standard game is decomposed into `BoardCol` / `InfoCol` (bananagrams via its
own engine-hook + views shape — see below). The shared turn-history viewer
(`useHistoryViewer` + a per-game replay helper) ships in the **seven** games whose
board can replay a past turn — stackdown, connections, psychicnum, codenamesduet,
wordle, waffle (each via its own `lib/history.ts`) and scrabble (via `boardUpToSeq`
in `lib/play.ts`); spellingbee + boggle are decomposed but have **no** viewer (a
`WordList` isn't chronological).

**Read [What building it taught us](#what-building-it-taught-us) before extracting
`InfoCol` / `BoardCol` for a new game** — it records where the "target architecture"
table below was too clean, learned by actually building it.

## Why

The per-game `PlayArea.tsx` files are large — most were 450–900 lines
(scrabble 892, spellingbee 680, connections 670, …). Per CLAUDE.md's
"the codebase itself is part of the artifact" priority, a 450+-line React
component is too big to hold in your head. We want a **consistent, readable
decomposition** across games, and we want it shaped by the one feature that most
stresses the seams: **turn-history viewing**.

## Target architecture — four layers

A per-game recipe, applied to the ~9 standard two-column games (bananagrams is the
layout exception — see below):

| layer | owns | interface |
|---|---|---|
| **`Board`** | pure presentation of a board state | state **down**, clicks **up**. |
| **`BoardCol`** | the **live input engine** (drag / cursor / keyboard / word-building) + local below-board feedback; renders `Board` | **takes the board-state-to-render** (live *or* a historical snapshot) + a `readOnly` flag **down**; emits **one committed action up** (`onPlayWord` / `onGuess` / `onSubmitWord`). |
| **`InfoCol`** | almost nothing — arranges the shared pieces (`OpponentStrip`, `TerminalActionRow`, `SetupDisclosure`, `TurnLog`) around a game-specific readout | props **down** + a few named callbacks **up** (`onSelectTurn`, `onHint`, `onEndGame`, `onConcede`, …). Near-zero internal state. |
| **`PlayArea`** | game data (`useGame`), server mutations (RPCs), and **cross-column coordination state** (e.g. `viewingSeq`) | wires `BoardCol` ↔ `InfoCol`. |

### The load-bearing contract

**`BoardCol` owns *editing*; `PlayArea` hands it the *board to show*.** This is the
one seam to get right. `BoardCol` does NOT own the live game state — it owns "how
I'm editing, given a board handed to me." That's what makes turn-history a drop-in
everywhere: viewing a past turn is just "hand `BoardCol` a historical snapshot +
`readOnly=true`", no reopening the columns.

### Cautions

- **A review overclaims uniformity every time.** Always diff all N PlayAreas
  before extracting; the shared core is real, the tail is deliberate per-game
  difference. Extract the core, name it honestly, leave the outlier, document it.
- **Refactor ≠ feature.** A decomposition step must be a behavior-preserving no-op
  (verify via the render tests + `e2e/board-geometry.e2e.ts`); a feature adds
  behavior. Never mix them in one commit.
- **bananagrams is the v3 layout exception** (board fills / hand+peel+dump in the
  info area / no turn log). It does NOT map onto the two-column `BoardCol`/`InfoCol`
  model, because its input engine spans BOTH columns (the hand tiles are drag SOURCES
  into the board; the dump zone is a drop TARGET during a board drag; the derived hand
  is a function of board state; the keyboard cursor types onto the board but checks the
  hand). It's handled via its **OWN shape** — the honest analog of "engine + views + thin
  coordinator": the cross-column engine lifted into a hook **`usePlayerBoard`** (557),
  two thin presentational VIEWS **`BoardArena`** (board column, 137) + **`HandCard`**
  (info column, 125) — deliberately NOT named `BoardCol`/`InfoCol` since they own no
  input — and a now-thin **`PlayerBoard`** (711→183) that lays out the two columns.
  Note the TWO-LEVEL coordinator: `PlayArea` (298) stays the OUTER
  coordinator (data / peel-dump-concede RPCs / feedback channel / terminal verdict, via
  the `infoTop`/`infoActions`/`localPill` slots) above `PlayerBoard`, the columns'
  coordinator. CSS left INTACT (`PlayerBoard.module.css` imported by all three) — the
  board + hand tiles SHARE `.tile`/`.handTile`/`.lifted`, so a split would duplicate
  them (same call as connections). bananagrams is OUT of the geometry harness (a fill
  arena, not a hug board), so the no-op net is the 4 `PlayArea.test.tsx` render tests +
  the full `e2e/bananagrams.e2e.ts`. See docs/games/bananagrams.md.

## Per-game history-viewer specifics

The viewer is one shared machine (`useHistoryViewer` + the `#N` handle + the shared
exit paths — see [What building it taught us](#what-building-it-taught-us)). What
stays per-game is **snapshot computation** (each game's `lib/history.ts`) and **turn
identity** (a game-wide ordinal vs a log position). The variations that matter when
adding a viewer to a new game:

- **stackdown** — keyed by **log position**; **strictly-before** snapshot: the board
  minus tiles cleared by valid submissions with `seq < N`, so turn N's own word tiles
  are still present and greened (the same green scrabble uses for a turn's placements).
  Invalid / hint / reveal turns carry no tiles → snapshot = removed-by-valid `< N`, no
  green, a kind-aware description. `lib/history.ts`, pure + unit-tested.
- **scrabble** — keyed by the stable **`seq`** (game-wide ordinal, not log position);
  the snapshot is `boardUpToSeq` in `lib/play.ts`. Its fat `BoardCol` runs `boardUpToSeq`
  itself (the raw `plays` already live there for the live board) rather than being handed
  a ready board.
- **connections** — keyed by **log position**; the first **mutating** board (a correct
  guess collapses four tiles into a band), so **strictly-before** like stackdown: the
  viewed turn's four tiles stay on the grid, tinted by outcome + ringed. Needed a `#N`
  column added to its two-`<tr>` log.
- **wordle** — keyed by **log position**; **inclusive / add-style**: the snapshot
  (`src/wordle/lib/history.ts`) is the first N guess rows, the last ringed
  history-yellow (`Board` gains `viewing` + `highlightRow`). Twist: the log has a
  **"whose board" picker**, so the `#N` handle is a live control ONLY when the log shows
  the board that replays (coop team / my own — `boardIsShown = teamView || picked ===
  selfId`); an opponent's revealed log (compete terminal) keeps a plain read-only `#N`.
- **psychicnum** — keyed by **log position**; add-style; the guessed tile shows its
  green/red outcome color + a yellow ring.
- **codenamesduet** — keyed by **`turn_number`** (game-wide ordinal, like scrabble's
  `seq`, not log position); the snapshot (`src/codenamesduet/lib/history.ts`) folds the
  guess log onto the fixed board (global `revealed_as` + per-seat `neutral_a/b`) and
  rings that turn's own cells. A two-input game — its `BoardCol` owns the **guess** RPC
  (the guess is a board click; `CluePanel` keeps the clue RPCs).
- **waffle** — keyed by **log position**; `highlight` = a viewed swap's neutral cell ring.

UX is uniform (and matches across the history games): enter by clicking a turn's `#N`
handle; the input freezes and the board shows the historical state; any interaction
(keystroke / click anywhere / the banner ✕) returns to live; works at terminal too
(reviewing the finished board is a prime use).

## Prop conventions for the columns

These keep the columns legible AND consistent across games — the second is
load-bearing: a `BoardCol`/`InfoCol` prop that means the same thing in two games
MUST be spelled the same, or reading the second game means re-deriving what you
already knew. Drift here causes real head-scratching.

- **Flat prop lists, grouped by region, NOT prefixed.** A long, explicit prop list
  beats a giant component with no seams. Keep the props flat (no `actionsOnHint` /
  `oppStripHintCount` prefixes — they stutter against the `on*` convention, reinvent
  namespacing as strings, and force a single taxonomy onto props that serve two
  regions). Instead, order the props to mirror the render order and separate them
  with `// ── Section ──` header comments, and mirror that same order at the call
  site. That answers "what is this prop for?" by eye at zero cost. (No React.memo
  anywhere in the app, so grouping into objects would buy nothing; if a future
  memoized *child* ever needs a grouped object, `useMemo` it — but that's not today.)
  **Header placement: the `// ── Section ──` headers live on the TYPE block** (next
  to the per-prop docstrings, which document each group); the destructure above is a
  flat list with a short lead comment pointing at them. All six columns
  (stackdown/waffle/scrabble × BoardCol/InfoCol) follow this — don't put the headers
  in the destructure and leave the type block bare.
- **One vocabulary across all games.** For the same idea, use the same prop name
  everywhere: `readOnly`, `over`, `isTerminal`, `isCompete`, `isPlayer`,
  `viewingDescription`, `onExitViewing`, `onSelectTurn`, `players`, `selfId`,
  `playerStates`, `concededIds`, `myConceded`, `setup`, `solution`, `onEndGame`,
  `onConcede`, `onBackToClub`, … When a new game needs a prop that an earlier column
  already has under some name, REUSE that name; only diverge when the meaning truly
  differs, and say so. Treat this list as the seed glossary; grow it as games land.
  Easy to re-drift, so worth calling out:
  - **Below-board feedback follows the `useLocalFeedback` hook's own names:** the
    folded pill to render is **`localPill`** (`GenericFeedbackMsg | null` — the hook's
    raw `localFeedback` with the terminal verdict folded in by PlayArea), and the
    input-engine callbacks are **`showLocalFeedback` / `clearLocalFeedback`** (not
    `showFeedback` / `localFeedbackMsg` — both had drifted).
  - **`isLocallyDone`** = "I'm out (conceded), the others race on" — the codebase
    majority (boggle/spellingbee/wordle/stackdown share the identical
    `isCompete && myConceded && !isTerminal`). waffle deliberately uses **`selfDone`**
    instead because its condition is *broader* (per-player-board race: solved / out of
    swaps / conceded); the different name flags the different meaning. Don't "unify"
    these — the split is the point.
  - **Deliberate, documented divergences** (same idea, different name because the
    meaning genuinely differs): `viewingIndex` (log position — stackdown/waffle) vs
    `viewingSeq` (stable turn `seq` — scrabble, which `boardUpToSeq` indexes by);
    `greenTiles`/`green` (a viewed turn's played-word ring, coloured green — stackdown)
    vs `highlight` (a viewed swap's neutral cell ring — waffle). Both aliases of the
    shared history hook's neutral `viewingId`.
  - **Snapshot ownership is NOT uniform, on purpose.** stackdown/waffle compute the
    historical board in PlayArea and hand a ready board *down* (the load-bearing
    contract); scrabble's fat BoardCol takes the raw `plays` + `viewingSeq` and runs
    `boardUpToSeq` itself, because the raw play data already lives there for the live
    board (same exception that makes it own its RPCs). Documented in its header.
- **A real object only for a genuinely cohesive cluster** that always travels
  together to one child (e.g. the OpponentStrip's inputs) — never to hit a number.

## What building it taught us

These are the places the "target architecture" table above was too clean — learned by
actually building the seam on stackdown first, then rolling it out. Read them before
extracting `InfoCol`/`BoardCol` for the next game.

- **The word-building buffer stays in the data hook, not `BoardCol`.** stackdown's
  `currentWord` / `appendTile` / `retractTo` / `commitWord` live in `useGame`
  because they're coupled to its optimistic-removal + realtime bookkeeping. So
  `BoardCol` does NOT own the buffer — `PlayArea` passes the editing primitives
  *down*, and `BoardCol` emits the completed word *up* (`onSubmitWord`); `PlayArea`
  owns the RPC + commit/clear. The contract ("BoardCol owns editing") means it owns
  the *input gesture → word*, not the *word state itself*. Expect the same wherever
  the buffer is entangled with server/realtime state (scrabble's `staged`, etc.).

- **Local below-board feedback lifts to `PlayArea`, NOT `BoardCol`.** The target
  table put "local below-board feedback" under `BoardCol`; building it disproved
  that for stackdown. The pill has **four** sources and three are outside the board
  column: the terminal verdict (derived), submit results, and — critically — the
  **reveal/hint cheats, which are `InfoCol` actions**. A channel written from both
  columns is coordination state, so the **coordinator owns it**: `PlayArea` holds
  `useLocalFeedback`, computes `localPill`, passes it *down* to `BoardCol` to render,
  and passes `showFeedback`/`clearFeedback` down for `BoardCol`'s own input-engine
  messages (no-match / ambiguous letter). Watch for this in any game whose info-column
  actions surface a result in the below-board slot.

- **Split flashes by their trigger, not by where they render.** Both of stackdown's
  flashes *render* inside `BoardCol`'s subtree, but ownership follows the trigger:
  the red ambiguous-tile flash (`useFlash`) is purely input-engine → lives in
  `BoardCol`; the green/red word-slot flash lives in `PlayArea` because a **coop
  teammate's move** (via `useGlobalFeedback`) is one of its triggers. Render location
  ≠ state location — lift state to wherever all its triggers already are.

- **`readOnly` cleanly encodes `viewing || !canPlay`.** `BoardCol` takes one
  `readOnly` flag (not separate viewing/canPlay), because when NOT viewing it equals
  "can't play right now" — so the key handler is just `if (viewing) exit; if
  (readOnly) return`. This kept the board-to-show contract to two props
  (board-state + `readOnly`) as the table intended.

- **Verify a decomposition step with the geometry harness, not just render tests.**
  The no-op proof was `e2e/board-geometry.e2e.ts`: `BASELINE=1` on the
  stashed pre-refactor tree, `git stash pop`, re-run → the post-refactor `.boardCol`
  box matched to the pixel across all 8 boards. Render tests + `tsc` + eslint pass
  both before and after a botched CSS-relocation; the geometry diff is what actually
  catches a moved boundary. Use the same stash/baseline/compare dance for each
  game's `BoardCol`/`InfoCol` extraction.

- **`BoardCol` owns its RPCs when commit is inseparable from input state (scrabble).**
  The target contract is "BoardCol emits ONE committed action up; PlayArea does the
  RPC" (stackdown/waffle). scrabble breaks it: `play_word`/`exchange` claim
  `lastActionRef` *before the await* (the realtime-beats-RPC race) and their results
  mutate `optimistic`/`staged`/the flashes — all state the version-reset effect reads.
  Splitting the RPC from that state tears one atomic machine in half, so scrabble's
  `BoardCol` owns the RPCs directly (PlayArea hands it `game` + `gameId`). The rule:
  emit-up when the coordinator can own the *result*; own-the-RPC when the result
  mutates deep input state. (Feedback still lifted to PlayArea, like stackdown —
  InfoCol's End/Concede write the same below-board pill, so that channel IS
  cross-column even though the move RPCs aren't.)

- **For a heavy-input game, gate the extraction behind a real gameplay e2e first.**
  scrabble's component tests mock `useGame`/`db`, so they never exercise the turn
  machine (drag/cursor staging → `play_word` → optimistic hold → version-reset rack
  rebuild) — exactly what `BoardCol` moves. Before cutting, we added
  `e2e/scrabble.e2e.ts` (pin the coop rack via `setScrabbleRack`, type a word at the
  center, Submit, assert the "+score" acceptance + rack refill), ran it green on the
  pre-refactor tree, then re-ran it after — a behavioral before/after gate alongside
  the geometry one. Do this for any game whose input engine the tests can't reach.

- **The turn-viewer affordance is the "#N handle", shared across all history games.**
  A turn is opened on the board viewer by clicking its **`#N` number** (the shared
  `<TurnLogNumber>` in `common/components/game/lists/TurnLog.tsx`), which rings *itself* yellow
  while that turn is open — NOT by clicking the whole row. Why: several games render a
  turn as multiple `<tr>`s (codenamesduet's clue + guess rows), where a whole-row
  "viewing" outline draws a broken box and a per-row hover lights only half the turn —
  a single small handle stays crisp regardless of row count. The yellow "viewing"
  marker is `historyViewer.module.css → .viewedNumber`. A history log therefore
  needs a `#N` cell to hang the handle on (a future history game without one must add
  it). The handle is a **`<span>`, not a `<button>`** — a focused button re-fires its
  click on Space, so pressing Space to leave the viewer would re-select the turn; a
  span takes no keystroke, so Space falls through to the exit-on-key handler.

- **Exiting the viewer is intrinsic to `useHistoryViewer` — no per-game wiring.**
  Three exits, all shared: (1) a **keystroke** — `exitOnKey`, the one path a game
  still wires (it must cooperate with the game's own key handler); (2) a **click
  anywhere** — a document-level listener *inside the hook* that exits on any click
  except one on a `#N` handle (`[data-turn-number]`, which selects that turn); (3)
  the banner **✕**. For the click path to also cover the board, the shared
  `historyViewer.module.css → .frame` sets `pointer-events: none` (a framed board is
  a read-only snapshot), so a board click falls through to the document listener.
  Verified in a real browser (`e2e/codenamesduet-history.e2e.ts` exercises Space, a
  board click, and an info-column click).

## Resolved along the way

- **`useHistoryViewer`** (rule of three): once turn-history reached three games the
  coordination itself (the `viewingId` + "am I viewing" flags + the enter/exit
  affordances) lifted into `common/hooks/game/useHistoryViewer.ts`, pulling that growth
  back out of `PlayArea`. What stays per-game is snapshot *computation* (each game's
  `lib/history.ts`) and turn *identity* (a game-wide ordinal vs a log position). See
  the hook's own docstring.
- **bananagrams**: handled via its own shape — the cross-column engine hook
  `usePlayerBoard` + the `BoardArena` / `HandCard` views (NOT `BoardCol` / `InfoCol`,
  since they own no input), under a two-level coordinator. See the bananagrams
  caution above and docs/games/bananagrams.md.
