# MonkeyGram

> **Status: v2 complete (the full bank loop).** v1 (schema + dealing, the
> interactive player board + snapshot persistence, live peer counts) plus v2:
> the hand is now **derived** (`board` + `tiles` split — see below), the ⟲
> **shuffle** is a shared common control, **peel** draws a round or goes out
> (→ Bananas!), and **dump** swaps one tile
> for three. The only thing the real Bananagrams has that we don't: word/board
> **validation** (we trust players — any placement, even gibberish, counts). The
> throwaway UX prototype in `monkeygram-ui/` (gitignored) is where the board
> feel was settled.

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
| **The bunch** (`monkeygram.games.pool`, hidden) | yes | atomic RPC | The finite tile pool. `create_game` deals from it once; peel/dump draw/swap during play. A mutating string (dump returns tiles), so it's materialized rather than seed-derived — the column is hidden; the FE only learns its count. |
| **`tiles`** (what a player holds) | **per-player** | server-owned column, owner-only | Set at the deal, grown by peel, swapped by dump. The hand the player sees is *derived* (`tiles − placed`), never stored — that's what lets peel grow every player's holdings at once without colliding with live FE placement. |
| **`board`** (their placements) | **no** | snapshot to a `text` column | Private (no peer sees it), high-frequency (many drag/place ops per second), and only needs Postgres for *restore* (post-pause / shelved game), not for sharing. It must **not** round-trip per move. |
| **The thin realtime surface** | yes | postgres-changes + presence | `progress` (unplaced counts, game-end) to the whole club; each player's own `player_boards` row to themselves (so a peel/dump's `tiles` change arrives). Boards never go to *peers*. |

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
(`player_boards.board`), `board[row*25 + col]` = a letter or `'.'`
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

**The hand is DERIVED, not stored.** A player's `tiles` (server-owned) is
everything they hold — hand *and* board. The hand they see is
`deriveHand(tiles, board)` = the held letters minus what's already placed. This
is the keystone of peel/dump: those RPCs only ever append to / swap within
`tiles` (server-side, all players at once), while each FE independently edits
its own `board`; the two never write the same column, so a tile dealt by a peel
appears in the hand by *re-derivation* — no merge, no lost-tile race on reload.
A local shuffle order (the ⟲ button) is layered on top via `reconcileHandOrder`
(multiset-aware: letters repeat). Tiles are **interchangeable by letter** — no
per-tile ids — so everything is plain strings, which also keeps later word +
connectivity validation a simple scan / flood-fill over the 2D char array. A
peer's **unplaced count** is `tiles − placed` (`progress.unplaced`).

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

## Scope

The game played today:
- Compete-only (solo = 1 player); single manifest, bare gametype `monkeygram` (matching tinyspy's single-manifest naming — the `_compete` suffix only earns its keep with a `_coop` sibling).
- Each player is dealt a **starter hand** (size from setup, default 21) from a shuffled 144-tile bag; the leftover is the shared **bunch**.
- Build your private crossword with drag + the keyboard cursor.
- You see **peers' unplaced-tile counts only**, ticking toward zero — the race tension. You never see their boards.
- **Peel** when your hand empties: everyone draws, or — if the bunch can't refill the table — you go out and win (**Bananas!**). **Dump** an awkward tile for three from the bunch. **⟲ Shuffle** your hand for a fresh look.
- **No word/connectivity validation** — the one Bananagrams rule we trust players on. Placing all your tiles (even scattered, even gibberish) and peeling a dry bunch wins.

The build landed in two arcs: **v1** stood up the architecture (private boards, snapshot persistence, peer signal, terminal) with a hand-empty win and no bank loop; **v2** added the bank loop (peel/dump) — which forced the `board`/`tiles` split and the derived hand — plus the shared shuffle control. The only thing the real game still has that we don't is the validator.

## The Supabase build

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
| `monkeygram.games` | `id` (PK → `common.games`), `club_handle` (→ `common.clubs`, RLS-bearing), `pool`, `hand_size`, `created_at` | club (`pool` column-hidden) | `pool` is the live bunch — the undealt remainder, mutated by peel/dump. Hidden because its contents are the upcoming draws; the FE learns only the count (via status). |
| `monkeygram.player_boards` | `game_id`, `user_id`, `board text`, `tiles text`, `updated_at` | **owner only** (`user_id = auth.uid()`) | The private player board. `board` = FE-owned placements; `tiles` = server-owned holdings. Owner-only RLS is the departure from our "every club member reads every game table" default, justified because peeking is a real competitive edge. |
| `monkeygram.progress` | `game_id`, `user_id`, `unplaced`, `placed`, `done`, `finished_at` | club | The public projection peers read: unplaced count + done flag. The board/tiles stay hidden; only the count leaks. Drives the peer strip + winner surface. |

(Splitting `board`/`tiles` into two columns with one writer each — FE for
`board`, server for `tiles` — is what makes peel/dump conflict-free; see the
table comment in the baseline migration.)

### RPCs (all security-definer; no table write policies — writes go through these)

- `monkeygram.create_game(target_club, setup, player_user_ids)` — calls `common.create_game` (header), shuffles the 144-tile bag, deals each player a `hand_size` slice as their starting `tiles`, materializes the leftover as `games.pool` (the bunch), and seeds one `player_boards` row (`board` = 625 dots, `tiles` = "<letters>") + one `progress` row (`unplaced = hand_size`) per player. Compete-only, so no `mode` param. Gated by `require_club_member`.
- `monkeygram.save_player_board(target_game, board)` — the snapshot endpoint. `require_game_player`; writes the caller's own `player_boards.board` (only — `tiles` is server-owned) and recomputes their `progress` (`placed = filled cells`, `unplaced = length(tiles) − placed`). Length guard (board must be 625 chars). Called **debounced during play and on player-board unmount** (the pause / navigate / shelve safety net). No-op once the game is terminal.
- `monkeygram.peel(target_game)` — the draw/endgame, and the game's *win* terminal. `require_game_player`; rejects unless the hand is empty (`placed == length(tiles)`, no word/connectivity validation). Then: if the bunch can't refill the whole table (`length(pool) < players × peel_count`), the peeler **goes out and wins** (`end_game('won', {winner_username, pool_remaining}, …)`); otherwise **every player draws `peel_count`** from the front of the pool (their `tiles` grows), the pool advances, and `status.pool_remaining` updates. `peel_count` from setup (default 1). Locks the gametype row up front so concurrent peels serialize; a peel on a non-`playing` game is rejected (`game is not active`).
- `monkeygram.dump(target_game, tile)` *(v2)* — swap one held tile for `dump_count` (setup, default 3) from the bunch. `require_game_player`; rejects if the game's over, if `length(pool) < dump_count`, or if the caller doesn't hold `tile`. Draws `dump_count` from the FRONT of the pool and returns the dumped tile to the BACK (so you can't redraw the same tile — same *letter* is possible), nets `tiles` +`(dump_count − 1)` and `pool` −`(dump_count − 1)`, updates `progress.unplaced` + `status.pool_remaining`. Locks the gametype row (serializes against peel on the shared pool).
- `monkeygram.submit_timeout(target_game)` — **countdown expiry** (modeled on `stackdown.submit_timeout`). When a chosen countdown hits 0 before anyone goes out, GamePage fires this and the race ends as a **collective loss**: `play_state='lost'`, `status={outcome:'timeout'}` (NO `winner_username`), and **every** player's result `{"won": false}`. The RPC is timer-agnostic (it just ends the in-progress game; the FE decides *when*). `require_game_player`, gametype-row lock, same `P0001 'game is not in progress'` idempotency + realtime touch as `end_game`. The PlayArea renders the no-winner timeout as a red "⏰ Time's up — nobody went out." pgTAP: `submit_timeout_test.sql`.
- `monkeygram.end_game(target_game)` — **manual stop** (modeled on `freebee.end_game`). MonkeyGram's automatic terminals are the peel-win and the countdown timeout above; this lets the friends quit a stale race before either fires. `require_game_player` — **any** game player can fire it (the friends decide together, no empty-hand gate). Writes `play_state='ended'`, `status={outcome:'manual'}` (NO `winner_username`), and **every** player's result `{"won": false}` — agreeing to stop is a valid outcome, not a loss. Locks the gametype row (serializes against a concurrent peel-win); rejects a non-`playing` game with `P0001 'game is not in progress'` (idempotency — a click racing a real peel-win is swallowed the same way). Realtime touch: a no-op self-set on `progress.unplaced` so `useProgress`/`useGame` subscribers wake (same trick as freebee's `freebee.games` touch; `common.end_game` writes only `common.games`). pgTAP: `end_game_test.sql`.

### Realtime + FE

- **Inherited free** from the shell: `useCommonGame` (presence-pause — a MonkeyGram race pauses if anyone drops, per the house principle), the GamePage header, chat, suspend/shelve, the player-subset picker, the terminal result modal.
- **`monkeygram/useGame`**: `useGame` reads the caller's own `player_boards` row — `board` once (for seeding; the FE owns it after) and `tiles` LIVE via a Pattern-A subscription to its own row (so a peel/dump's `tiles` change folds into the derived hand). `useProgress` subscribes to `monkeygram.progress` for peers' counts. A peer's board never crosses the wire; only your own row reaches you.
- **`PlayerBoard`** (the PlayArea): the fixed 25×25 arena — zoom + scroll, drag, keyboard cursor, Center + fit, ⟲ shuffle — plus the snapshot lifecycle (debounced autosave + save-on-unmount, board only), the **Peel** button + bunch count (enabled only when the derived hand is empty; flushes the board first so the server's `placed == tiles` check is current; also fired by **Enter** or **Space** when a peel is legal — the `doPeel` action is shared between button and keyboard), and the **dump slot** (a drop target below the hand — drop a tile to `dump` it, from the hand *or* dragged off the board; a board-sourced dump clears its cell so `board` stays in lock-step with the server dropping the letter from `tiles`; lights up while any tile is dragged, dims when the bunch can't cover the draw). Every board mutation writes the board only — the hand re-derives. `PlayArea` owns the terminal modal (watches the `is_terminal` flip via `useTerminalModal`, reads the winner from `status.winner_username` — same `common.games` update as the flip, so no cross-channel verdict flash) **and the draw announcement**: it watches its own `tiles` length grow and shows a timed pill — "🍌 Peel!" for a draw, "♻️ Dumped" when a `dumpPending` ref flags it was the caller's own dump (only the dumper's tiles change on a dump; a peel changes everyone's, so the two never collide here).
- **`PlayArea` end-game menu + verdict** (manual stop): a `useEffect(syncMenuItems)` registers a single per-game **"End game"** item via `ctx.menu.setGameItems` (confirm → `db.rpc('end_game')`; disabled once terminal; cleared on unmount) — same shape as freebee's PlayArea. The terminal verdict branches on `status.outcome === 'manual'` **first**: a manual end shows a neutral green "🍌 Game ended." (`GameOverModal` outcome `'won'`). This must precede the win/loss computation — a manual end has no `winner_username`, so the peel-win path would otherwise fall through to "someone went out — Bananas!" (red) for everyone. The `labelFor` (manifest) maps `play_state==='ended'` → "game ended" so the ClubPage listing doesn't show the raw enum.
- **`PeersStrip`**: opponents' tiles-left counts (sorted by closest-to-done), slotted above the hand in the right column. Renders nothing in a solo game.
- **SetupForm**: `hand_size` (15 / 21, default 21) + the shared `TimerField` (none / count-up / countdown MM:SS, default none). A countdown that runs out ends the race as a collective loss (`submit_timeout`). Manifest compete-only; solo is N = 1.

### Build order

1. **Schema + `create_game` + manifest + PlayArea load gate** — game starts, tiles deal, the board loads from `player_boards`. **✓ DONE** (migration `20260623000000_monkeygram.sql`, `src/monkeygram/`, pgTAP `tests/monkeygram/create_game_test.sql`).
2. **`PlayerBoard`** (fixed 25×25 arena) + `save_player_board` + snapshot lifecycle. **✓ DONE** (`components/PlayerBoard.tsx` + `lib/board.ts`; migration `20260623000000_monkeygram.sql`; pgTAP `save_player_board_test.sql`; e2e `e2e/monkeygram.e2e.ts`).
3. **`progress` realtime + PeersStrip** — watch a peer's count drop. **✓ DONE** (`hooks/useGame.ts` → `useProgress` subscribes to `monkeygram.progress`; `components/PeersStrip.tsx` renders opponents' tiles-left; e2e covers the live update).
4. **Terminal + result modal** — the hand-empty win, surfaced by the `peel` step below (the win is detected inside `peel`). **✓ DONE**

**v2 build order:**
1. **Standard ⟲ ShuffleButton** (common; adopted in FreeBee + WordKnit). **✓ DONE** (`common/components/ShuffleButton`).
2. **Re-platform the hand as derived** (`board` + `tiles` + `pool`; live `tiles` subscription). **✓ DONE** (baseline + `save_player_board` migrations; `lib/board.ts` helpers; `useGame`/`PlayerBoard`).
3. **`peel`** — draw a round / go out (Bananas!); Peel button + bunch count + announcement. **✓ DONE** (migration `20260623000000_monkeygram.sql`; pgTAP `peel_test.sql`; e2e win + draw paths).
4. **`dump`** — swap one tile for three (drag-to-dump-slot). **✓ DONE** (migration `20260623000000_monkeygram.sql`; pgTAP `dump_test.sql`; e2e drag-to-dump).
5. **Polish / future** — hand sort/group, optional elapsed timer; eventually word/board validation (the one Bananagrams rule we still trust players on).

### From v1 to v2 — what held, what changed

v1 was built to make the bank loop a small addition. Two foundations held as
planned; two predictions were revised once peel/dump were real:

| v1 foundation | v2 outcome |
|---|---|
| fixed 25×25 board as a char array | **held** — a future validator is still just a scan / flood-fill over the array |
| `progress.unplaced` peer signal already live | **held** — peel/dump just recompute it; the strip needed no change |
| `seed` stored, "peel reads the next letter via a draw cursor" | **revised** — dump *returns* tiles to the bunch, which a fixed seed can't describe, so v2 materializes an explicit (hidden, mutable) `pool` instead |
| hand stored as a string, "peel appends to it" | **revised** — peel must grow *every* player's hand at once without colliding with live FE placement, so the hand became **derived** (`board`/`tiles` split); the hand-empty win gate now lives inside `peel` |

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
