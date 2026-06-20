# MonkeyGram

> **Status: greenlit; Phases 1–2 built.** Schema + dealing (Phase 1) and the
> interactive player board + snapshot persistence (Phase 2) are live in the real
> app. Still to come: peer counts (Phase 3), the "Done"/win flow (Phase 4), and
> the full game (peel / dump / word validation). The throwaway UX prototype in
> `monkeygram-ui/` (gitignored) is where the board feel was settled.

MonkeyGram is a **Bananagrams** clone: a real-time, simultaneous,
**competitive** word-tile race. Each player builds their own **player board**
— a private crossword laid out from a hand of letter tiles, drawing more from a
shared bank as they go. Note the term: in our other games a *board* is shared
(Boggle's tiles, the WordKnit grid); here every player has their own, so the
concept is a **player board** throughout — tables, components, variables.

It is the roster's **first compete-only** game. That breaks no rule — TinySpy is
coop-only for the same reason (Codenames Duet is cooperative) — it's simply a
single manifest, not a coop/compete sibling pair. Solo (1p) is just compete with
N = 1; the existing player-subset picker already allows min-1.

## State: what's shared, what's private

MonkeyGram keeps very little state shared. Three kinds, each handled differently:

| state | shared? | mechanism | notes |
|---|---|---|---|
| **The bank** (shuffled finite tile pool) | yes | atomic RPC (full game) | A contended finite pool that *must* hand out distinct tiles. v1 deals from it once at create-time; the live draw arrives with peel. Fits our **generated-board-from-seed** taxonomy (see [naming.md](../naming.md)): a seeded shuffle built by `create_game`. |
| **The player board** (their crossword) | **no** | snapshot to `jsonb` | Private (no peer sees it), high-frequency (many drag/place ops per second), and only needs Postgres for *restore* (post-pause / shelved game), not for sharing. It must **not** round-trip per move. |
| **The thin realtime surface** | yes | postgres-changes + presence | What crosses the wire to peers is small and low-frequency: the **unplaced count**, game-end. Player boards never go over the wire. |

### The player board is scratch state, not a move

Rearranging your own tiles is **not a validated move** — it's private scratch
state. So it lives in FE state and is **snapshotted** to a `jsonb` column on a
debounce + lifecycle events, not pushed through an RPC per move. Our "mutations
go through RPCs" rule governs *validated shared moves*; the only one (eventually)
is drawing from the bank. The player board has no server-validated moves (and no
validation at all in v1), so it isn't the kind of state that rule governs.

## Persistence: snapshot the player board on unmount

`PauseBoundary` **unmounts** the play area on pause (children UNMOUNT, not
visibility-hidden — see [common.md](../common.md)), and presence-pause fires
whenever anyone disconnects. So a player dropping → everyone else's player-board
component unmounts → **any un-snapshotted in-memory board is lost.**

That makes **"snapshot before unmount" mandatory.** The home is the player-board
component's unmount cleanup, mirroring how `useCommonGame` fires
`unset_current_view` on last-leaver unmount. One mechanism covers pause,
navigate-away, and shelve uniformly; on remount you rehydrate from the snapshot,
not from memory. A debounced autosave (~800 ms) during play bounds crash-loss
(acceptable per the alpha posture).

## The player board — a fixed 25×25 arena

The player board is a **fixed 25×25 grid**: a flat 625-char string
(`player_boards.state.board`), `board[row*25 + col]` = a letter or `'.'`
(empty). You navigate it with a **zoom slider + scrollbars**; the grid never
resizes.

That "never resizes" is the whole reason this code stays simple. Because the
arena is a fixed size, **placing a tile can never shift the view** — so there's
no growing, no re-centering, no scroll compensation, no view-box state machine.
A placement is just a string write at a bounded `[0, 24]` coordinate. (We *did*
try a board that grew and re-centered around the tiles; it was a tangle of
scroll-anchoring bugs. The fixed arena deletes that entire class of problem — and
it's also the better UX.)

**Why fixed, and why 25×25.** MonkeyGram is desktop-only (no mobile), played
maximized in landscape, so we assume a laptop-ish viewport. A completed half-bag
solo grid is ~72 tiles, and a reasonable interlocking crossword fills ~30% of its
bounding box → roughly 15×15, up to ~20 on the long axis. So **25×25 = 625 cells
is plenty** — a 72-tile game fills only ~12% — and it fits on a laptop at a
readable tile size when zoomed out. The hard cap is a real game rule (you can't
place outside the arena), but at ~12% fill it never binds except in pathological
cases we don't care about.

**Navigation.**
- **Zoom** (px-per-cell slider): the smallest zoom is computed to fit the whole grid (the board area's binding dimension ÷ 25), so you can always zoom out to see everything with no scrollbar, or zoom in for bigger tiles + scroll. Zoom keeps the viewport center fixed.
- **Center + fit** (one button): shifts the tiles to the middle of the arena (a string rewrite) AND sets the zoom so the used area + a few cells of margin fills the viewport, then scrolls to it. The "re-frame my work / give me room to keep building" action — and the *only* thing that shrinks the view (placing only ever fills cells). Players build down/right, so it's reached for often.
- A **thick outer border** marks the real edge of the arena, distinct from the thin internal cell lines.

**The hand** is likewise a string of the player's unplaced letters. Tiles are
**interchangeable by letter** — there are no per-tile ids — so both board and
hand are plain strings. That keeps the snapshot tiny and makes later word +
connectivity validation a simple scan / flood-fill over the 2D char array. A
peer's **unplaced count is the hand string's length** (`progress.unplaced`).

## Keyboard input — the crossword cursor

The crossword-style keyboard cursor is the fast path for placing a word you've
already formed in your head. (Drag stays the tool for incidental single-tile
moves and free rearrangement; the two coexist.) The cursor is **clamped to the
arena** — it can't move or advance past the edge.

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
loop and validation while exercising the whole architecture (private boards,
snapshot persistence, peer signal, terminal) end to end.

**In v1:**
- Compete-only (solo = 1 player); single manifest, bare gametype `monkeygram` (matching tinyspy's single-manifest naming — the `_compete` suffix only earns its keep with a `_coop` sibling).
- Each player is dealt a fixed **starter hand** at game start (size from setup, default 21). **No bank draw during play** — you get all your tiles up front.
- Build your private crossword with drag + the keyboard cursor.
- You see **peers' unplaced-tile counts only**, ticking toward zero — the race tension. You never see their boards.
- **First to place all their starter tiles and hit "Done" wins.** "Done" is offered once your hand is empty; the server checks only "hand empty" and does **no word/connectivity validity check** — placing all your tiles (even scattered, even gibberish) wins.

**Deferred to the full game (NOT in v1):** peel, dump, the live bank,
word/connectivity validation ("Bananas!"), any opponent-board visibility.

v1's win gate ("placed all starter tiles") is the same hand-empty condition peel
will later use — v1 *is* the full game with the bank loop and the validator
removed, not a different game.

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
| `monkeygram.player_boards` | `game_id`, `user_id`, `state jsonb` = `{ board, hand }` (both strings), `updated_at` | **owner only** (`user_id = auth.uid()`) | The private player board — the departure from our "every club member reads every game table" default, justified because peeking is a real competitive edge here. |
| `monkeygram.progress` | `game_id`, `user_id`, `unplaced`, `placed`, `done`, `finished_at` | club | The public projection peers read: unplaced count + done flag. The board stays hidden; only the count leaks. Drives the peer strip + winner surface. |

(Two tables rather than column-grants on one: each gets a single clean RLS
policy, and the RPCs write both. A peers-only *view* over `player_boards` is the
alternative; two tables reads simpler.)

### RPCs (all security-definer; no table write policies — writes go through these)

- `monkeygram.create_game(target_club, setup, player_user_ids)` — calls `common.create_game` (header), picks a `seed`, computes the shuffled bag, deals each player a `hand_size` slice as their starting **hand string**, and seeds one `player_boards` row (`state = { board: 625 dots, hand: "<letters>" }`) + one `progress` row (`unplaced = hand_size`) per player. Compete-only, so no `mode` param. Gated by `require_club_member`.
- `monkeygram.save_player_board(target_game, state jsonb)` — the snapshot endpoint. `require_game_player`; writes the caller's own `player_boards.state` and recomputes their `progress` (`unplaced = length(hand)`, `placed = filled board cells`). String shape guard (board must be 625 chars). Called **debounced during play and on player-board unmount** (the pause / navigate / shelve safety net). No-op once the game is terminal.
- `monkeygram.declare_done(target_game)` *(Phase 4)* — `require_game_player`; loads the caller's `state`, rejects unless the hand is empty (the only v1 check — no word/connectivity validation), then atomically (guarded on the game not already being terminal) sets `progress.done` and calls `common.end_game` with the caller as winner. First valid declare wins; a racing second sees terminal and is rejected.

### Realtime + FE

- **Inherited free** from the shell: `useCommonGame` (presence-pause — a MonkeyGram race pauses if anyone drops, per the house principle), the GamePage header, chat, suspend/shelve, the player-subset picker, the terminal result modal.
- **`monkeygram/useGame`**: loads the caller's own `player_boards` row once (private — no realtime; only I write it). Phase 3 adds a subscription to `monkeygram.progress` filtered by `game_id` (Pattern A) for peer counts + the winner. A *thin* realtime surface — player boards never cross the wire.
- **`PlayerBoard`** (the PlayArea): the fixed 25×25 arena — zoom + scroll, drag, keyboard cursor, Center + fit — plus the snapshot lifecycle (debounced autosave + save-on-unmount). Phase 4 adds a **Done** button enabled only when the hand is empty.
- **PeersStrip** *(Phase 3)*: opponents' unplaced counts — a `PlayersStrip`-shaped component fed `progress`.
- **SetupForm**: `hand_size` (15 / 21, default 21). No timer in v1. Manifest compete-only; solo is N = 1.

### Build order

1. **Schema + `create_game` + manifest + PlayArea load gate** — game starts, tiles deal, the board loads from `player_boards`. **✓ DONE** (migration `20260623000000_monkeygram_baseline.sql`, `src/monkeygram/`, pgTAP `tests/monkeygram/create_game_test.sql`).
2. **`PlayerBoard`** (fixed 25×25 arena) + `save_player_board` + snapshot lifecycle. **✓ DONE** (`components/PlayerBoard.tsx` + `lib/board.ts`; migration `20260624000000_monkeygram_save_player_board.sql`; pgTAP `save_player_board_test.sql`; e2e `e2e/monkeygram.e2e.ts`).
3. **`progress` realtime + PeersStrip** — watch a peer's count drop.
4. **`declare_done` + terminal** — first-to-finish wins; result modal.
5. **Polish** — hand sort/group, optional elapsed timer.

### What v1 deliberately sets up for the full game

| v1 choice | unlocks later, no rework |
|---|---|
| `seed` stored on `monkeygram.games` | peel draws the next letter from it (add a draw cursor) |
| hand string + `progress.unplaced` | peel appends letters to the hand; dump returns one; peer count already live |
| fixed 25×25 board as a char array | word + connectivity validation are a scan / flood-fill over the array |
| `declare_done` = "hand empty" gate | becomes "Bananas!" by adding the connectivity + word checks |

## Resolved decisions

- **Board:** a **fixed 25×25 arena** navigated with zoom + scroll (not a growing/recentering board — we tried that and it was needlessly complex).
- **Draw trigger (full game):** peel-gated — you draw only when your hand empties. v1 has no draw at all.
- **Peer visibility:** unplaced-tile **count only**, never the board.
- **Player-board RLS:** owner-only reads (the `player_boards` table).
- **Tiles have no ids:** board + hand are letter strings (tiles are interchangeable by letter).
- **Touch input:** explicit **non-goal** — desktop-only, cursor-typing needs a keyboard.

## The UX prototype (`monkeygram-ui/`)

A standalone, **pure-FE** Vite + React app at top-level `monkeygram-ui/`
(gitignored, intentionally *not* wired to Supabase or the real app). Its job was
to let Joel *feel* the board before building it for real — and it earned its
keep: we tried a growing/recentering board there, found it complex and fiddly,
and settled on the **fixed 25×25 arena + zoom/scroll** that shipped. No sharing,
persistence, peers, bank, or validation — just a board and a hand.

Run it:

```
cd monkeygram-ui
npm install
npm run dev
```
