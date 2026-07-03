# PlayArea decomposition + turn-history — plan

Status: **planned, not started.** Written 2026-07-02 at the end of a long session
(the post-v3 code-review cleanup, branch `playarea-layout`). The actual work
happens in a **fresh branch** off `main` after this plan lands and `playarea-layout`
merges. This file is the source of truth for that work; read it first.

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

### Phase A — stackdown turn-history (feature, on monolithic stackdown)

1. `stackdown/lib/history.ts` → snapshot(submissions, seq) = `{ offBoard: Set,
   greenTiles: Set, description }`; pure + Vitest.
2. `PlayArea`: add `viewingSeq` coordination state; when set, feed `Board` the
   historical `offBoard` + green highlight + `active={false}`.
3. `FoundWords`: rows clickable → `onSelectTurn(seq)`, viewed row highlighted (reuse
   scrabble PlayLog's `viewedRow` pattern); kind-aware description.
4. Verify: unit test for the snapshot fn; headless check the click→view→exit loop.

### Phase B — decompose stackdown into the four layers

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
- `BoardCol` to the heavy-input games (scrabble, spellingbee); `Board` for boggle.
- Add turn-history to the games where the board history is meaningful
  (codenamesduet/tinyspy, connections, waffle) — now a drop-in against the contract.

## Future / open

- **`useHistoryViewer`** (rule of three): once turn-history lands in 3+ games, the
  coordination itself (`viewingSeq` + snapshot selection + "am I viewing" flags)
  becomes a shared hook, pulling that growth back out of `PlayArea`.
- **bananagrams**: its right-column needs its own approach; revisit after the
  standard-game pattern is proven.
