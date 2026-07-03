# PlayArea decomposition + turn-history — plan

Status: **Phase A + B DONE on stackdown** (branch `stackdown-turn-history`);
Phase C not started. Written 2026-07-02; updated as the stackdown prototype landed.
This file is the source of truth for the work; read it first. Phase A shipped the
turn-history viewer on the still-monolithic stackdown; Phase B decomposed stackdown
into the four layers as a verified no-op. **What the prototype taught us** — the
findings that should shape the Phase-C rollout — is recorded in its own section
below; read it before extracting `InfoCol`/`BoardCol` for the next game.

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
  info area / no turn log; whole shell delegated to `<PlayerBoard>`, 735 lines). It
  does NOT map onto the two-column `InfoCol` model. Handle it separately / later; it
  is explicitly out of scope for the `InfoCol` rollout.

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

### Phase C — roll out

- `InfoCol` to the other 7 standard games (waffle, boggle, wordle, connections,
  psychicnum, spellingbee, codenamesduet). bananagrams excepted.
- `BoardCol` to the heavy-input games (scrabble ✅ done, spellingbee); `Board` for boggle.
- Add turn-history to the games where the board history is meaningful
  (codenamesduet/tinyspy, connections, waffle) — now a drop-in against the contract.

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
- **One vocabulary across all games.** For the same idea, use the same prop name
  everywhere: `readOnly`, `over`, `isTerminal`, `isCompete`, `isPlayer`,
  `onExitViewing`, `viewingIndex`/`viewingDescription`, `onSelectTurn`, `members`,
  `selfId`, `onBackToClub`, … When a new game needs a prop that an earlier column
  already has under some name, REUSE that name; only diverge when the meaning truly
  differs, and say so. Treat this list as the seed glossary; grow it as games land.
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

## Future / open

- **`useHistoryViewer`** (rule of three): once turn-history lands in 3+ games, the
  coordination itself (`viewingSeq` + snapshot selection + "am I viewing" flags)
  becomes a shared hook, pulling that growth back out of `PlayArea`.
- **bananagrams**: its right-column needs its own approach; revisit after the
  standard-game pattern is proven.
