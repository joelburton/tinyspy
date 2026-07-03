# PlayArea decomposition + turn-history — plan

Status: **ALL PHASES DONE** (branch `stackdown-turn-history`). Every standard game
is decomposed into `BoardCol` / `InfoCol` (bananagrams via its own engine-hook +
views shape — see below); the shared turn-history viewer (`useHistoryViewer` +
per-game `lib/history.ts`) ships in the seven games whose board can replay a past
turn (scrabble, stackdown, connections, psychicnum, codenamesduet, wordle, waffle);
spellingbee + boggle are decomposed but have no viewer (a `WordList` isn't
chronological). Written 2026-07-02; updated as the work landed. This file is the
source of truth for the work; read it first. Phase A shipped the turn-history viewer
on the still-monolithic stackdown; Phase B decomposed stackdown into the four layers
as a verified no-op; Phase C rolled both out. **What the prototype taught us** — the
findings that shaped the rollout — is recorded in its own section below; read it
before extracting `InfoCol`/`BoardCol` for a new game.

## Why

The per-game `PlayArea.tsx` files are large — most 450–900 lines
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
| **`Board`** | pure presentation of a board state | state **down**, clicks **up**. Already extracted in 9/10 games (scrabble `Board`, waffle `WaffleGrid`, …); only **boggle** still renders inline. |
| **`BoardCol`** | the **live input engine** (drag / cursor / keyboard / word-building) + local below-board feedback; renders `Board` | **takes the board-state-to-render** (live *or* a historical snapshot) + a `readOnly` flag **down**; emits **one committed action up** (`onPlayWord` / `onGuess` / `onSubmitWord`). |
| **`InfoCol`** | almost nothing — arranges the shared pieces (`OpponentStrip`, `TerminalActionRow`, `SetupDisclosure`, `TurnLog`) around a game-specific readout | props **down** + a few named callbacks **up** (`onSelectTurn`, `onHint`, `onEndGame`, `onConcede`, …). Near-zero internal state. **Greenfield** — no game has this today; the prototype defines its shape. |
| **`PlayArea`** | game data (`useGame`), server mutations (RPCs), and **cross-column coordination state** (e.g. `viewingSeq`) | wires `BoardCol` ↔ `InfoCol`. |

### The load-bearing contract

**`BoardCol` owns *editing*; `PlayArea` hands it the *board to show*.** This is the
one seam to get right. `BoardCol` does NOT own the live game state — it owns "how
I'm editing, given a board handed to me." That's what makes turn-history a drop-in
everywhere: viewing a past turn is just "hand `BoardCol` a historical snapshot +
`readOnly=true`", no reopening the columns.

### Why this order of extraction

- **`InfoCol` first, across the standard games** — it's low-state, low-risk, pure
  consistency/readability win; the callbacks-up interface is short and
  self-documenting. Prototype it on **stackdown** (below), then roll out.
- **`BoardCol` where the input engine is heavy** (scrabble, bananagrams, stackdown,
  spellingbee). For thin-input games (wordle, connections, psychicnum) a `BoardCol`
  is a ~30-line wrapper — fine for consistency, but not a comprehension win, so it's
  lower priority.
- **`Board` for boggle** (the one inline outlier) as part of its pass.

### Cautions (learned the hard way in the §4 review cleanup)

- **The review overclaims uniformity every time.** Always diff all N PlayAreas
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
  hand). ✅ **DONE via its OWN shape** — the honest analog of "engine + views + thin
  coordinator": the cross-column engine lifted into a hook **`usePlayerBoard`** (557),
  two thin presentational VIEWS **`BoardArena`** (board column, 137) + **`HandCard`**
  (info column, 125) — deliberately NOT named `BoardCol`/`InfoCol` since they own no
  input — and a now-thin **`PlayerBoard`** (711→183) that lays out the two columns.
  Note the TWO-LEVEL coordinator: `PlayArea` (298, UNCHANGED) stays the OUTER
  coordinator (data / peel-dump-concede RPCs / feedback channel / terminal verdict, via
  the `infoTop`/`infoActions`/`localPill` slots) above `PlayerBoard`, the columns'
  coordinator. CSS left INTACT (`PlayerBoard.module.css` imported by all three) — the
  board + hand tiles SHARE `.tile`/`.handTile`/`.lifted`, so a split would duplicate
  them (same call as connections). Verified NO-OP: bananagrams is OUT of the geometry
  harness (a fill arena, not a hug board), so the net is the 4 `PlayArea.test.tsx`
  render tests + the full **`e2e/bananagrams.e2e.ts`** (6 tests: render, keyboard place
  + reload-persist, peel-win, peel-draw, drag-to-dump, live peer count) — which
  exercises the whole DOM/data-attr + drag + keyboard contract the extraction had to
  preserve. Full suite (587). See docs/games/bananagrams.md.

## The driving feature — stackdown turn-history

Ship this as real product (Joel wants it in stackdown), and use it to validate the
seam. **Feature-first**: build it on the still-monolithic stackdown, THEN decompose
stackdown — so the decomposition confronts the real cross-column coordination state.

### Mechanics (stackdown-specific)

stackdown clears a word by **removing its tiles**; each valid `submissions` row
carries the `tile_ids` it cleared. So, for viewing turn `N`:

- **Board snapshot** = full board minus tiles cleared by valid word submissions with
  `seq < N` (strictly before N) — so **turn N's own word tiles are still present**.
- **Green highlight** = turn N's `tile_ids` (if it's a valid word) — "this is the
  word that turn played", the same green scrabble uses for a turn's placements.
- **Invalid / hint / reveal turns** carry no tiles: snapshot = removed-by-valid `< N`,
  no green, and a kind-aware description ("entered EBATL — not a word", "requested
  hint", "revealed LEMON").

A pure `lib/history.ts` function computes this (unit-tested), parallel to scrabble's
`boardUpToSeq`.

### UX (matches scrabble's history-view for consistency)

- **Enter:** click **any** `TurnLog`/`FoundWords` row (not just valid words). The
  overlay describes the turn per kind.
- **Exit:** click anywhere / type anywhere (any interaction returns to live), same as
  scrabble.
- **While viewing:** tile input disabled; the viewed row highlighted; the board shows
  the historical stack (fuller) with the played word green.
- **Works at terminal too** (reviewing the finished stack is a prime use).

## Execution plan

### Phase A — stackdown turn-history (feature, on monolithic stackdown) — ✅ DONE

1. `stackdown/lib/history.ts` → snapshot(submissions, seq) = `{ offBoard: Set,
   greenTiles: Set, description }`; pure + Vitest.
2. `PlayArea`: add `viewingSeq` coordination state; when set, feed `Board` the
   historical `offBoard` + green highlight + `active={false}`.
3. `FoundWords`: rows clickable → `onSelectTurn(seq)`, viewed row highlighted (reuse
   scrabble PlayLog's `viewedRow` pattern); kind-aware description.
4. Verify: unit test for the snapshot fn; headless check the click→view→exit loop.

### Phase B — decompose stackdown into the four layers — ✅ DONE

- `PlayArea`: `useGame` + submit RPCs + `viewingSeq` (+ the concede/reveal handlers).
- `BoardCol`: the word-building input (tile clicks, `currentWord`, flash); **takes**
  the board-to-render (live or snapshot) + `readOnly`; emits `onSubmitWord`.
- `InfoCol`: `OpponentStrip` + cleared-count readout + `TerminalActionRow` +
  `SetupDisclosure` + `FoundWords`; emits `onSelectTurn` / `onHint` / `onReveal` /
  `onEndGame` / `onConcede`.
- `Board`: already exists.
- Verify: no-op (render tests + geometry harness unchanged); the Phase-A history
  feature still works through the new seam = proof the contract is right.

### Phase C — roll out — ✅ DONE

- `InfoCol` to the other 7 standard games (waffle, boggle, wordle, connections,
  psychicnum, spellingbee, codenamesduet). bananagrams excepted.
- `BoardCol` to the heavy-input games (scrabble ✅). boggle ✅ + spellingbee ✅
  decomposed (BoardCol/InfoCol, no-op verified) — NO history viewer (no turn log,
  just a WordList). Both are thin-input: the `useWordSubmit` entry engine stays in the
  coordinator (its feedback is also written by InfoCol's End/Concede), so the entry
  primitives pass down; BoardCol owns the board-visual shuffle/rotate + the letter
  input. boggle's inline tile grid moved into BoardCol (it was the one game whose board
  wasn't a component).
- Add turn-history to the games where the board history is meaningful
  (codenamesduet/tinyspy ✅ done — viewer + **decomposed** (BoardCol/InfoCol, no-op
  verified); psychicnum ✅ viewer + **decomposed** (BoardCol/InfoCol, no-op verified —
  the guessed tile shows its green/red outcome color + a yellow ring, keyed by log
  position; BoardCol owns the guess dispatch + board shuffle, `ownMove` pill builder
  pulled to `lib/ownMove.ts`); connections ✅ viewer (the first MUTATING board — a
  correct guess collapses tiles into a band — so **strictly-before** like stackdown:
  the viewed turn's 4 tiles stay on the grid, tinted by outcome + ringed; needed a
  `#N` column added to its two-`<tr>` log) + **decomposed** (BoardCol owns the guess
  dispatch + shuffle; the tile SELECTION stays in useGame — broadcast-coupled — so it's
  passed down; `ownGuess` → `lib/ownGuess.ts`); waffle ✅; wordle ✅ viewer + **decomposed**
  (BoardCol/InfoCol, no-op verified): ADD-style (like psychicnum), keyed by log position,
  INCLUSIVE — the snapshot (`src/wordle/lib/history.ts`) is just the first N guess rows,
  the last ringed history-yellow (`WordleGrid` gains `viewing` + `highlightRow`;
  `.viewedRow` ring). wordle's twist: the log has a **"whose board" picker**, so the `#N`
  handle is a live control ONLY when the log shows the board that replays (coop team / my
  own — `boardIsShown = teamView || picked === selfId`); an opponent's revealed log (compete
  terminal) keeps a plain read-only `#N`. Keystroke-exit rides `useGlobalKeyHandler(exitOnKey)`
  alongside `useCaptureKeys` (frozen via `disabled: !canGuess || viewing`); the banner overlays
  the whole below-board region (feedback slot + keyboard). e2e seeds guesses via a new
  `seedWordleGuesses` fixture (psql reads the hidden target + legal words, then the real RPC).
  **Decomposition** (617→350): `BoardCol` (261) OWNS the input engine — `current`/`pending`/
  `submitting` + `submit_guess` (Pattern A, like psychicnum's board-gesture BoardCol) +
  `useCaptureKeys` + the on-screen keyboard + `keyStates`; it takes the LIVE `rows` + the `snap`
  and picks live-vs-snapshot itself, derives `viewing = snap !== null`, and computes `canGuess =
  guessingAllowed && !submitting && !pendingWord` (PlayArea passes only the GAME-STATE half,
  `guessingAllowed`, so behavior is byte-identical). `InfoCol` (207) is presentational (guess
  count + OpponentStrip + action row + setup + terminal answer-reveal + GameTurnLog). Feedback
  channel stays in PlayArea (both columns write it); shared `localPill` builder → `lib/localPill.ts`
  (like psychicnum's `ownMove`); the below-board pill is RESOLVED in PlayArea and passed down as
  `localFeedbackMsg`. CSS split (psychicnum-style): `belowBoard`/`moveArea` → BoardCol.module.css,
  `answerLine`/`answerReveal` → InfoCol.module.css, only `.layout` left in PlayArea.module.css) —
  now a drop-in against the contract.
  codenamesduet keys the viewer by `turn_number` (game-wide ordinal, like scrabble's
  `seq`, not log position); its snapshot (`src/codenamesduet/lib/history.ts`) folds the
  guess log onto the fixed board (global `revealed_as` + per-seat `neutral_a/b`) and
  rings that turn's own cells. Its BoardCol owns the **guess** RPC (a two-input game —
  the guess is a board click; `CluePanel` keeps the clue RPCs); feedback lifts to
  PlayArea (both columns write the below-board pill).

### Prop conventions for the columns (decided during the stackdown prototype)

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
  in the destructure and leave the type block bare (waffle/scrabble InfoCol drifted
  that way and were realigned in the game-4 pre-flight review).
- **One vocabulary across all games.** For the same idea, use the same prop name
  everywhere: `readOnly`, `over`, `isTerminal`, `isCompete`, `isPlayer`,
  `viewingDescription`, `onExitViewing`, `onSelectTurn`, `members`, `selfId`,
  `playerStates`, `concededIds`, `myConceded`, `setup`, `solution`, `onEndGame`,
  `onConcede`, `onBackToClub`, … When a new game needs a prop that an earlier column
  already has under some name, REUSE that name; only diverge when the meaning truly
  differs, and say so. Treat this list as the seed glossary; grow it as games land.
  Settled during the 3-game review, and worth calling out because they're easy to
  re-drift:
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

## What the prototype taught us (Phase A + B findings)

Read this before extracting `InfoCol`/`BoardCol` for the next game — these are the
places the "target architecture" table above was too clean, learned by actually
building it on stackdown.

- **The word-building buffer stays in the data hook, not `BoardCol`.** stackdown's
  `currentWord` / `appendTile` / `retractTo` / `commitWord` live in `useGame`
  because they're coupled to its optimistic-removal + realtime bookkeeping. So
  `BoardCol` does NOT own the buffer — `PlayArea` passes the editing primitives
  *down*, and `BoardCol` emits the completed word *up* (`onSubmitWord`); `PlayArea`
  owns the RPC + commit/clear. The contract ("BoardCol owns editing") means it owns
  the *input gesture → word*, not the *word state itself*. Expect the same wherever
  the buffer is entangled with server/realtime state (scrabble's `staged`, etc.).

- **Local below-board feedback lifts to `PlayArea`, NOT `BoardCol`.** The target
  table put "local below-board feedback" under `BoardCol`; the prototype disproved
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
  The no-op proof for Phase B was `e2e/board-geometry.e2e.ts`: `BASELINE=1` on the
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
  `<TurnLogNumber>` in `common/components/TurnLog.tsx`), which rings *itself* yellow
  while that turn is open — NOT by clicking the whole row (the earlier Phase-A/B
  pattern, since replaced). Why: several games render a turn as multiple `<tr>`s
  (codenamesduet's clue + guess rows), where a whole-row "viewing" outline draws a
  broken box and a per-row hover lights only half the turn — a single small handle
  stays crisp regardless of row count. The yellow "viewing" marker is
  `historyViewer.module.css → .viewedNumber` (was `.viewedRow`). A history log therefore
  needs a `#N` cell to hang the handle on (all four current ones had it; a future
  history game without one must add it). The handle is a **`<span>`, not a
  `<button>`** — a focused button re-fires its click on Space, so pressing Space to
  leave the viewer would re-select the turn; a span takes no keystroke, so Space
  falls through to the exit-on-key handler. (No `outline` on the span for the same
  reason it isn't needed: `outline` is reserved for the yellow `.viewedNumber` marker.)

- **Exiting the viewer is intrinsic to `useHistoryViewer` — no per-game wiring.**
  Three exits, all shared: (1) a **keystroke** — `exitOnKey`, the one path a game
  still wires (it must cooperate with the game's own key handler); (2) a **click
  anywhere** — a document-level listener *inside the hook* that exits on any click
  except one on a `#N` handle (`[data-turn-number]`, which selects that turn); (3)
  the banner **✕**. For the click path to also cover the board, the shared
  `historyViewer.module.css → .frame` sets `pointer-events: none` (a framed board is
  a read-only snapshot), so a board click falls through to the document listener.
  This replaced the earlier per-game board-column `onClick={viewing ? exitViewing :
  undefined}` (and codenamesduet's dense-grid `pointer-events` workaround) — deleted
  from all games. Verified in a real browser (`e2e/codenamesduet-history.e2e.ts`
  exercises Space, a board click, and an info-column click).

## Resolved along the way

- **`useHistoryViewer`** (rule of three): once turn-history reached three games the
  coordination itself (the `viewingId` + "am I viewing" flags + the enter/exit
  affordances) lifted into `common/hooks/useHistoryViewer.ts`, pulling that growth
  back out of `PlayArea`. What stays per-game is snapshot *computation* (each game's
  `lib/history.ts`) and turn *identity* (a game-wide ordinal vs a log position). See
  the hook's own docstring.
- **bananagrams**: handled via its own shape — the cross-column engine hook
  `usePlayerBoard` + the `BoardArena` / `HandCard` views (NOT `BoardCol` / `InfoCol`,
  since they own no input), under a two-level coordinator. See the bananagrams
  caution above and docs/games/bananagrams.md.
