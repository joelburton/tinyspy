# MonkeyGram

> **Status: greenlit — v1 planned, not yet built.** The UX prototype in
> `monkeygram-ui/` (gitignored) validated the riskiest piece (the grid
> render / grow / recenter, plus drag and keyboard-cursor input), so we're
> confident we'll build this game. No schema, RPCs, or FE exist in the real
> app yet. This doc is the design-of-record: the architecture thinking, the
> [keyboard rules](#keyboard-input--the-crossword-cursor), and the
> [v1 build plan](#v1--scope) below. The full game (peel / dump / word
> validation) comes after v1.

MonkeyGram is a **Bananagrams** clone: a real-time, simultaneous,
**competitive** word-tile race. Each player builds their own **player board**
— a private crossword laid out from a hand of letter tiles, drawing more from a
shared bank as they go. Note the term: in our other games a *board* is shared
(Boggle's tiles, the WordKnit grid); here every player has their own, so the
concept is a **player board** throughout — tables, components, variables.

It would be the roster's **first compete-only** game. That breaks no rule —
TinySpy is coop-only for the same reason (Codenames Duet is cooperative) —
it's simply a single manifest, not a coop/compete sibling pair. Solo (1p) is
just compete with N = 1; the existing player-subset picker already allows
min-1.

## State: what's shared, what's private

MonkeyGram keeps very little state shared. Three kinds, each handled differently:

| state | shared? | mechanism | notes |
|---|---|---|---|
| **The bank** (shuffled finite tile pool) | yes | atomic RPC | Concurrent draws from a contended finite pool *must* hand out distinct tiles — an atomic-RPC-with-row-lock job. Fits our **generated-board-from-seed** taxonomy (see [naming.md](../naming.md)): the bank is a seeded shuffle built by `create_game`. |
| **The player board** (their crossword) | **no** | snapshot to `jsonb` | Private (no peer sees it), high-frequency (many drag/place ops per second), and only needs Postgres for *restore* (post-pause / shelved game), not for sharing. It must **not** round-trip per drag. |
| **The thin realtime surface** | yes | postgres-changes + presence | What crosses the wire to peers is small and low-frequency: the **bank count**, draw/peel events, game-end. Player boards never go over the wire. |

### The player board is scratch state, not a move

Rearranging your own tiles is **not a validated move** — it's private scratch
state. So it lives in FE state and is **snapshotted** to a `jsonb` column on
lifecycle events, not pushed through an RPC per drag. Our "mutations go through
RPCs" rule governs *validated shared moves*; the only one here is drawing from
the bank. The player board has no server-validated moves (and no validation at
all in v1), so it isn't the kind of state that rule governs.

## Persistence: snapshot the player board on unmount

`PauseBoundary` **unmounts** the play area on pause (children UNMOUNT, not
visibility-hidden — see [common.md](../common.md)), and presence-pause fires
whenever anyone disconnects. So a player dropping → everyone else's
player-board component unmounts → **any un-snapshotted in-memory board is
lost.**

That makes **"snapshot before unmount" mandatory.** The clean home is the
player-board component's unmount cleanup, mirroring how `useCommonGame` fires
`unset_current_view` on last-leaver unmount. One mechanism covers pause,
navigate-away, and shelve uniformly; on remount you rehydrate from the `jsonb`
snapshot, not from memory. Pair it with a debounced autosave during play to
bound crash-loss (acceptable per the alpha posture — but name the window).

## The player board — rendering

The player board is the bulk of the build and is net-new: nothing in `common/`
helps. It's a draggable 2D crossword that grows in **any** direction (including
up/left), recentering and growing as the player rearranges. The whole design
hangs on one decision.

### Big idea: separate the logical model from the rendered viewport

Tiles live at integer `(row, col)` coordinates in an **unbounded virtual
plane, including negative coordinates**, and that placement set is the only
source of truth. A placement is just `{ tileId, row, col }`. The grid *is*
the set of placements. The model knows nothing about margins, centering, the
viewport, or where the screen is looking — those are all **derived** at
render time. This single separation makes "recenter and grow" almost free,
and it's the same substrate the real game's validator will need.

**Persistence shape follows from this:**  Use a **sparse** representation 
(a list of placements, or a map
keyed `"r,c"`): negative coords are fine, the origin never moves, and the
snapshot stays compact (only occupied cells).

### How the render derives (each render is a pure function of placements)

1. **Extent** — bounding box of all placed tiles (min/max row & col).
2. **Window** — the extent padded by a margin (~5 cells) on every side, with a
   minimum size so an empty board isn't a cramped square. The padded box is
   what you draw.
3. **Map logical → screen** — render the window as a fixed-cell CSS Grid (e.g.
   40px squares). A tile at logical `(r, c)` goes in grid cell `(r − win.top,
   c − win.left)`. Every window cell is either occupied (draw the tile) or
   empty (a faint drop target).

"Recenter and grow" isn't imperative code — it's what *happens* because you
recompute extent + margin every render and let React reconcile the DOM.

### The margin is the growth *affordance*

The ~5-cell pad isn't decoration — those empty cells **are the legal drop
targets that let the board grow.** There's always a droppable ring around your
work, in every direction; drop into it and next render re-pads a fresh ring
beyond it. The board "breathes" outward as you build. That's the whole
mechanism behind "grows in any direction."

### The real UX hazard: grow continuously, recenter sparingly

If you recompute extent and recenter on *every* placement, the whole board
jumps under the cursor (adding a tile on the left shifts everything right) —
disorienting, and it wrecks drag precision. The principle:

> **Growth is continuous and automatic. Recentering is occasional and
> anchored.**

Concretely: the board sits in a fixed-size scroll frame; the logical window
can exceed it and the frame scrolls over it. When the window grows on the
top/left — say `k` rows are prepended above — content shifts down by `k`
cells, so in the *same frame* you bump `scrollTop` by `k × cellSize` to keep
what the user is looking at visually pinned (the classic "maintain scroll
anchor when prepending content" trick; do it in a layout effect to avoid
flicker). True *recentering* — pulling the grid back to frame-center — is an
explicit affordance (a button, maybe a gentle idle snap), never an every-move
reflex.

### The hand, and the peer count

Model the **hand** (unplaced tiles) as a first-class list of tile IDs, separate
from placements. Moving a tile just transfers its ID between the hand list and
placements-with-a-coord; nothing else changes. Each tile carries identity (its
letter rides on the `tileId`), which is also what makes *dump* clean later.

A peer's **unplaced-tile count is `hand.length`** — v1 surfaces exactly that
(`progress.unplaced`, below), publishing only the integer, never the hand's
contents or the board.

## Keyboard input — the crossword cursor

The prototype proved out a crossword-style keyboard cursor — the fast path for
placing a word you've already formed in your head. (Drag stays the tool for
incidental single-tile moves and free rearrangement; the two coexist.) These
are the **locked rules**; the prototype's `monkeygram-ui/src/App.jsx` is the
reference implementation to port.

**Getting a cursor.**
- Click any cell (filled or empty) → a **horizontal** cursor appears there.
- <kbd>Esc</kbd> or <kbd>Return</kbd> dismisses it; click again for a fresh one.

**Direction.** A cursor always has a direction — it starts horizontal — shown
by its thick edges: horizontal = thick top/bottom, vertical = thick left/right.
- An arrow **along** the current axis moves one cell; an arrow **across** it flips the axis (no move).
- "Forward" (for typing and advancing) is **right** (horizontal) / **down** (vertical).

**Typing a letter** at the cursor cell:

| cell state | result |
|---|---|
| filled with the **same** letter | advance forward (lets you run through shared/crossing letters) |
| filled with a **different** letter | error (red pulse); don't move, no change |
| empty, letter **in hand** | place it (consume from hand), advance forward |
| empty, letter **not in hand** | error; don't move |

**Backspace** steps back one cell in the current direction; if the cursor was
**on a tile**, that tile returns to the hand first. An empty cell just moves —
Backspace never deletes the cell it lands on.

## v1 — scope

v1 is a genuinely shippable, genuinely competitive slice that omits the bank
loop and validation while exercising the whole architecture (private grids,
snapshot persistence, peer signal, terminal) end to end.

**In v1:**
- Compete-only (solo = 1 player); single manifest, bare gametype `monkeygram` (matching tinyspy's single-manifest naming — the `_compete` suffix only earns its keep with a `_coop` sibling).
- Each player is dealt a fixed **starter hand** at game start (size from setup, default 21). **No bank draw during play** — you get all your tiles up front.
- Build your private crossword with drag + the keyboard cursor.
- You see **peers' unplaced-tile counts only**, ticking toward zero — the race tension. You never see their boards.
- **First to place all their starter tiles and hit "Done" wins.** "Done" is offered once your hand is empty; the server checks only "hand empty" and does **no word/connectivity validity check** — placing all your tiles (even scattered, even gibberish) wins.

**Deferred to the full game (NOT in v1):** peel, dump, the live bank,
word/connectivity validation ("Bananas!"), any opponent-board visibility.

v1's win gate ("placed all starter tiles") is the same `hand.length === 0`
condition peel will later use — v1 *is* the full game with the bank loop and
the validator removed, not a different game.

## v1 — the Supabase build

Follows every house pattern (gametype-per-schema, server-authoritative state
via security-definer RPCs, the common shell for clubs / presence-pause / chat /
header / terminal). The one deliberate departure: the **private player board is
not RPC-per-move** — it's FE state snapshotted to `jsonb` (see [Persistence:
snapshot the player board on unmount](#persistence-snapshot-the-player-board-on-unmount)).

### Schema (`monkeygram`)

A two-table split **by visibility class** — the one novel schema call, forced
by "peers see counts, never boards":

| table | columns (sketch) | RLS read | why |
|---|---|---|---|
| `monkeygram.games` | `game_id` (PK → `common.games`), `seed`, `hand_size` | club | The seeded shuffle source. v1 deals from it once; storing the **seed** (not the dealt tiles) is what lets peel draw the next tile later — generated-board-from-seed. |
| `monkeygram.player_boards` | `game_id`, `user_id`, `state jsonb` = `{ placements, hand }`, `updated_at` | **owner only** (`user_id = auth.uid()`) | The private player board — the departure from our "every club member reads every game table" default, justified because peeking is a real competitive edge here. |
| `monkeygram.progress` | `game_id`, `user_id`, `unplaced`, `placed`, `done`, `finished_at` | club | The public projection peers read: unplaced count + done flag. The board stays hidden; only the count leaks. Drives the peer strip + winner surface. |

(Two tables rather than column-grants on one: each gets a single clean RLS
policy, and the RPCs write both. A peers-only *view* over `player_boards` is the
alternative; two tables reads simpler.)

### RPCs (all security-definer; no table write policies — writes go through these)

- `monkeygram.create_game(target_club, setup, player_user_ids, mode)` — calls `common.create_game` (header), picks a `seed`, computes the shuffled bag, deals each player a `hand_size` starter hand, and seeds one `player_boards` row (`state = { placements: [], hand: [...dealt] }`) + one `progress` row (`unplaced = hand_size`) per player. Gated by `require_club_member`.
- `monkeygram.save_player_board(game_id, state jsonb)` — the snapshot endpoint. `require_game_player`; writes the caller's own `player_boards.state` and recomputes their `progress` (`unplaced = hand.length`, `placed = placements.length`). Called **debounced during play and on player-board unmount** (the pause / navigate / shelve safety net).
- `monkeygram.declare_done(game_id)` — `require_game_player`; loads the caller's `state`, rejects unless `hand` is empty (the only v1 check — no word/connectivity validation), then atomically (guarded on the game not already being terminal) sets `progress.done` and calls `common.end_game` with the caller as winner. First valid declare wins; a racing second sees terminal and is rejected.

### Realtime + FE

- **Inherited free** from the shell: `useCommonGame` (presence-pause — a MonkeyGram race pauses if anyone drops, per the house principle), the GamePage header, chat, suspend/shelve, the player-subset picker, the terminal result modal.
- **`monkeygram/useGame`**: loads the caller's own `player_boards` row once (private — no realtime; only I write it) and subscribes to `monkeygram.progress` filtered by `game_id` via `useRealtimeRefetch` (Pattern A) for peer counts + the winner. A *thin* realtime surface — player boards never cross the wire.
- **`PlayerBoard`** (the PlayArea): ports the prototype's `board.js` model + grid / drag / cursor / hand, and adds the snapshot lifecycle (debounced autosave + snapshot-on-unmount) plus a **Done** button enabled only when the hand is empty.
- **PeersStrip**: opponents' unplaced counts — a `PlayersStrip`-shaped component fed `progress`.
- **SetupForm**: `hand_size` (default 21). No timer in v1 (optional count-up "elapsed" later). Manifest compete-only; solo is N = 1.

### Suggested build order

1. **Schema + `create_game` + manifest + a stub PlayArea** — game starts, tiles deal, the board loads from `player_boards`. Plumbing alive end to end. **✓ DONE** (migration `20260623000000_monkeygram_baseline.sql`, `src/monkeygram/`, pgTAP `tests/monkeygram/create_game_test.sql`). The stub PlayArea shows the dealt hand; the draggable board is Phase 2.
2. **`PlayerBoard`** (port the prototype) + `save_player_board` + snapshot lifecycle — you can build a board and a reload restores it.
3. **`progress` realtime + PeersStrip** — watch a peer's count drop.
4. **`declare_done` + terminal** — first-to-finish wins; result modal.
5. **Polish** — hand sort/group, optional elapsed timer.

### What v1 deliberately sets up for the full game

| v1 choice | unlocks later, no rework |
|---|---|
| `seed` stored on `monkeygram.games` | peel draws the next tile from it (add a draw cursor) |
| hand-as-list in `state` + `progress.unplaced` | dump returns a tile to the bank; peer count already live |
| logical-coordinate placements | validation becomes a pure function added inside `declare_done` |
| `declare_done` = "hand empty" gate | becomes "Bananas!" by adding the connectivity + word checks |

## Resolved decisions

- **Draw trigger (full game):** peel-gated — you draw only when your hand empties. v1 has no draw at all.
- **Peer visibility:** unplaced-tile **count only**, never the board.
- **Player-board RLS:** owner-only reads (the `player_boards` table).
- **Keyboard removal:** yes — Backspace unplaces (see the rules above).
- **Touch input:** explicit **non-goal** for v1 — cursor-typing needs a keyboard, and we're desktop-first.

## The UX prototype (`monkeygram-ui/`)

A standalone, **pure-FE** Vite + React app at top-level `monkeygram-ui/`
(gitignored, intentionally *not* wired to Supabase or the real app). It exists
to let Joel *feel* the board before committing to a real implementation — and
it did its job: dragging, grid-scrolling, recenter-and-grow, and the
[keyboard cursor](#keyboard-input--the-crossword-cursor) are all confirmed.
No sharing, persistence, peers, bank, or validation — just a board and a hand.
Its `board.js` (the sparse-coordinate model + `computeWindow` deriver) and the
grid / drag / cursor logic in `App.jsx` are written to be **ported into the v1
`PlayerBoard`**.

Run it:

```
cd monkeygram-ui
npm install
npm run dev
```
