# bananagrams

> **Status: v3 (the shared-layout redesign).** The bank loop (v1 schema +
> dealing + interactive player board + snapshot persistence; v2 derived hand
> [`board` + `tiles` split], ⟲ shuffle, **peel**, **dump**) sits on the shared
> two-column scaffold now (`common/components/PlayArea.module.css`) with the v3
> info-column chrome. bananagrams is the roster's **documented exception** to
> "everything needed to make a move lives in the board column": the board is a
> zoom/scroll arena that FILLS the left column, and the hand + peel + dump live
> in the RIGHT (info) column — deliberate for this desktop-only game. It also
> has **no turn log and no word list** (nothing to log). The old whole-table
> `end_game` is gone; a player now **concedes** (a per-player drop-out — a real
> loss, since the game is compete — that leaves the others racing; the last one
> out ends the game). A winning board must always be **one connected grid**
> (geography is structural); requiring its words to be **real** is opt-in
> ("Require real words to win") — off by default, we trust players on the
> dictionary. The throwaway UX prototype in `bananagrams-ui/` (gitignored) is
> where the board feel settled.

bananagrams is a **Bananagrams** clone: a real-time, simultaneous,
**competitive** word-tile race. Each player builds their own **player board**
— a private crossword laid out from a hand of letter tiles, drawing more from a
shared bank as they go. Note the term: in our other games a *board* is shared
(Boggle's tiles, the connections grid); here every player has their own, so the
concept is a **player board** throughout — tables, components, variables.

It is the roster's **first compete-only** game. That breaks no rule — codenamesduet is
coop-only for the same reason (Codenames Duet is cooperative) — it's simply a
single manifest, not a coop/compete sibling pair. Solo (1p) is just compete with
N = 1; the existing player-subset picker already allows min-1.

## State: what's shared, what's private

bananagrams keeps very little state shared. Three kinds, each handled differently:

| state | shared? | mechanism | notes |
|---|---|---|---|
| **The bunch** (`bananagrams.games.pool`, hidden) | yes | atomic RPC | The finite tile pool. `create_game` deals from it once; peel/dump draw/swap during play. A mutating string (dump returns tiles), so it's materialized rather than seed-derived — the column is hidden; the FE only learns its count. |
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

**Known race — accepted (code-review §1.4).** The unmount `save()` is
**fire-and-forget** (React unmount cleanup can't `await`), while the remount reads
the board back with a one-shot SELECT that fires immediately. So on a fast
pause→resume, the SELECT can out-race the in-flight save and read a **stale**
board — losing up to one debounce window (~800 ms) of un-autosaved placements; the
FE then rehydrates from the stale snapshot and its next autosave overwrites the
good one. It's inherent to the FE-owns-board design (the board isn't
server-authoritative per move) and the loss is a few re-placeable tiles, so it's
left as-is under the alpha posture. The real fix, if it ever matters, is a
monotonic board version / `updated_at`: `save_player_board` stamps it and the
remount SELECT (with a short retry) refuses a snapshot older than the last one
this client wrote.

## The player board — a fixed 25×25 arena

The player board is a **fixed 25×25 grid**: a flat 625-char string
(`player_boards.board`), `board[idx(x, y)]` = `board[y*25 + x]` = a letter or
`'.'` (empty) — x = column, y = row, the same x-first convention scrabble
uses. You navigate it with a **zoom slider + scrollbars**; the grid never
resizes.

That "never resizes" is the whole reason this code stays simple. Because the
arena is a fixed size, **placing a tile can never shift the view** — so there's
no growing, no re-centering, no scroll compensation, no view-box state machine.
A placement is just a string write at a bounded `[0, 24]` coordinate. (We *did*
try a board that grew and re-centered around the tiles; it was a tangle of
scroll-anchoring bugs. The fixed arena deletes that entire class of problem — and
it's also the better UX.)

**Why fixed, and why 25×25.** bananagrams is desktop-only (no mobile), played
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

**Typing a letter** at the cursor cell — a place-or-swap that always consumes
a tile from the hand:

| cell state | result |
|---|---|
| empty, letter **in hand** | place it (consume from hand), advance forward |
| filled, **typed letter in hand** | **swap**: the tile under the cursor returns to the hand, the typed tile takes its place, advance forward |
| filled with the **same** letter | a swap that nets nothing (the tile returns and goes right back) — so it just advances |
| **typed letter not in hand** | red box flashes around the **hand** ("you don't hold that tile"); don't move, no change |

The "available?" check, for a filled cell, counts the tile currently under the
cursor as back in the hand (you're typing over it) — so swapping `A`→`B`
needs a `B` you hold elsewhere, while typing `A` over `A` always works. Because
the hand is **derived** from the board (`deriveHand(tiles, board)`), one board
overwrite does both halves of the swap: the old letter re-derives into the
hand, the typed letter leaves it.

**Backspace** steps back one cell in the current direction; if the cursor was
**on a tile**, that tile returns to the hand first. An empty cell just moves —
Backspace never deletes the cell it lands on.

**Keyboard focus + gating.** The board reads keys off a window listener, so two
gates keep it from stealing keystrokes it shouldn't: (1) a **modifier bail** —
`Cmd`/`Ctrl`/`Alt` combos pass straight through (so `Cmd-R` reloads instead of
placing an "R"); only bare `a`–`z`, Backspace, the arrows, and Enter/Space (peel)
are handled. (2) a **focus handoff** — the cells are non-focusable `<div>`s, so
clicking the board (or a hand tile) explicitly **blurs a focused chat box**
(`blurActiveField`), handing the keyboard back to the game; without it, chat kept
focus after a board click and typed letters went to chat. (The window handler
also declines outright whenever an editable field is focused — the standard
`isEditableField` gate.)

## Scope

The game played today:
- Compete-only (solo = 1 player); single manifest, bare gametype `bananagrams` (matching codenamesduet's single-manifest naming — the `_compete` suffix only earns its keep with a `_coop` sibling).
- Each player is dealt a **starter hand** (size from setup, default 21) from a shuffled 144-tile bag; the leftover is the shared **bunch**.
- Build your private crossword with drag + the keyboard cursor.
- You see **peers' unplaced-tile counts only**, ticking toward zero — the race tension. You never see their boards.
- **Peel** when your hand empties: everyone draws, or — if the bunch can't refill the table — you go out and win (**Bananas!**). **Dump** an awkward tile for three from the bunch. **⟲ Shuffle** your hand for a fresh look.
- **A winning peel always requires one connected grid** — geography is structural, so even in trust-the-friends mode you can't win with scattered tiles. Requiring the **words** to be real is opt-in (setup: "Require real words to win", + a dictionary-obscurity band). Either failure flashes the offending tiles **red** until you fix them, and leaves the game in progress. Mid-play is never validated — only the peel that would end the game.

The build landed in two arcs: **v1** stood up the architecture (private boards, snapshot persistence, peer signal, terminal) with a hand-empty win and no bank loop; **v2** added the bank loop (peel/dump) — which forced the `board`/`tiles` split and the derived hand — plus the shared shuffle control. Validation later landed too: a winning board is always connectivity-checked, with an opt-in dictionary check on top.

## The Supabase build

Follows every house pattern (gametype-per-schema, server-authoritative state
via security-definer RPCs, the common shell for clubs / presence-pause / chat /
header / terminal). The one deliberate departure: the **private player board is
not RPC-per-move** — it's FE state snapshotted to `jsonb` (see [Persistence:
snapshot the player board on unmount](#persistence-snapshot-the-player-board-on-unmount)).

### Schema (`bananagrams`)

A two-table split **by visibility class** — the one novel schema call, forced
by "peers see counts, never boards":

| table | columns (sketch) | RLS read | why |
|---|---|---|---|
| `bananagrams.games` | `id` (PK → `common.games`), `club_handle` (→ `common.clubs`, RLS-bearing), `bag`, `pool`, `box`, `hand_size`, `created_at` | club (`bag` + `pool` + `box` column-hidden) | `bag` is the **immutable** shuffled tile sequence this game was dealt from (length = the chosen bag size, ≤ 144), hands-then-bunch in deal order — set once, the record a future "restart" re-deals from. `pool` is the live bunch — the undealt remainder, mutated by peel/dump. `box` is the out-of-play reserve: it starts with the `144 − bag_size` tiles left out of the bag, and in `dump_to_box` mode dumped tiles go there too. A short-bunch dump can dip into it. All three hidden because their order leaks upcoming draws; the FE learns only the bunch + box **counts** (via status). |
| `bananagrams.player_boards` | `game_id`, `user_id`, `board text`, `tiles text`, `updated_at` | **owner only** (`user_id = auth.uid()`) | The private player board. `board` = FE-owned placements; `tiles` = server-owned holdings. Owner-only RLS is the departure from our "every club member reads every game table" default, justified because peeking is a real competitive edge. |
| `bananagrams.progress` | `game_id`, `user_id`, `unplaced`, `placed`, `done`, `finished_at` | club | The public projection peers read: unplaced count + done flag. The board/tiles stay hidden; only the count leaks. Drives the peer strip + winner surface. |

(Splitting `board`/`tiles` into two columns with one writer each — FE for
`board`, server for `tiles` — is what makes peel/dump conflict-free; see the
table comment in the baseline migration.)

### RPCs (all security-definer; no table write policies — writes go through these)

- `bananagrams.create_game(target_club, setup, player_user_ids)` — calls `common.create_game` (header), shuffles the standard 144-tile Bananagrams set and **splits it at `setup.bag_size`** (1..144 — a smaller bag is a shorter game on a random subset): the first `bag_size` tiles are the immutable `games.bag`, and **the remaining `144 − bag_size` seed the out-of-play `games.box`** (not discarded). Deals each player a `hand_size` slice as their starting `tiles`, materializes the undealt bag as `games.pool` (the bunch), and seeds one `player_boards` row (`board` = 625 dots, `tiles` = "<letters>") + one `progress` row (`unplaced = hand_size`) per player. Validates `hand_size ∈ {15,21}`, `bag_size ∈ [1,144]`, **`player_count × hand_size ≤ bag_size`** (or the deal is impossible — the FE disables Start on the same check; see SetupForm), and — when `check_words` is on — `dict_2 ∈ [2,6]` and `dict_3plus ∈ [1,6]`. Compete-only, so no `mode` param. Gated by `require_club_member`.
- `bananagrams.save_player_board(target_game, board)` — the snapshot endpoint. `require_game_player`; writes the caller's own `player_boards.board` (only — `tiles` is server-owned) and recomputes their `progress` (`placed = filled cells`, `unplaced = length(tiles) − placed`). Length guard (board must be 625 chars). Called **debounced during play and on player-board unmount** (the pause / navigate / shelve safety net). No-op once the game is terminal.
- `bananagrams._win_blockers(board, dict_2, dict_3plus, check_words) → int[]` — the board validator (plain `language sql`). Returns the 0-indexed cells that block a legal win, or `{}` for a valid grid. **Connectivity is always checked**: tiles **not in the main 4-connected mass** (a recursive flood-fill from the top-left-most tile — diagonal touches don't connect) always flag. When `check_words` is true it ALSO flags every tile of a **2+ run that isn't a real word** — judged against the band for the word's LENGTH: `dict_2` for 2-letter words, `dict_3plus` for longer ones (2-letter words are a thin separate vocabulary, so they get their own band; single tiles aren't words, so never checked).
- `bananagrams.peel(target_game) → jsonb` — the draw/endgame, and the game's *win* terminal. `require_game_player`; rejects unless the hand is empty (`placed == length(tiles)`), and rejects a **conceded** caller (`you have conceded` — they're out of the race). **Active-player aware:** the table to refill and the win threshold count only the still-active players (`common.game_players where not conceded`), not the raw roster — a dropped-out player neither draws nor holds up the bunch math. If the bunch can't refill the active table (`length(pool) < active × peel_count`), it's a **winning peel** — **it first runs `_win_blockers` (always, for connectivity; with the word check when `setup.check_words` is on); a non-empty result leaves the game in progress and returns `{result: 'illegal', invalid_cells}`** for the FE to paint red. Otherwise the peeler **goes out and wins** (`common.end_game('won', …)`, returns `{result: 'won'}`). If the bunch *can* refill, **every active player draws `peel_count`** from the front of the pool (ranks are dense over the active set), the pool advances, `status.pool_remaining` updates (`{result: 'dealt'}`). A continuing peel is never validated — you're not winning yet. `peel_count` from setup (default 1). Locks the gametype row up front so concurrent peels serialize; a peel on a non-`playing` game is rejected (`game is not active`).
- `bananagrams.dump(target_game, tile)` *(v2)* — swap one held tile for `dump_count` (setup, default 3). `require_game_player`; rejects if the game's over, if **`length(pool) + length(box) < dump_count`**, or if the caller doesn't hold `tile`. Draws `dump_count` from the FRONT of the **pool**, topping up from the FRONT of the **box** if the pool is short (the box can hold tiles in either mode — the bag_size leftover, plus dumped tiles in to-box mode). The dumped tile then lands at the BACK of the pool (default — return-to-bag) or the BACK of the box (`setup.dump_to_box` on) — always after the draw, so it can't refill its own swap. The caller's hand nets +`(dump_count − 1)` either way; in to-box mode the dumped tile leaves the bunch (it goes to the box), so the bunch depletes and the game ends sooner. Updates `progress.unplaced` + `status.pool_remaining` + `status.box_remaining`. Locks the gametype row (serializes against peel on the shared pool).
- `bananagrams.submit_timeout(target_game)` — **countdown expiry** (modeled on `stackdown.submit_timeout`). When a chosen countdown hits 0 before anyone goes out, GamePage fires this and the race ends as a **collective loss**: `play_state='lost'`, `status={outcome:'timeout'}` (NO `winner_username`), and **every** player's result `{"won": false}`. The RPC is timer-agnostic (it just ends the in-progress game; the FE decides *when*). `require_game_player`, gametype-row lock, `P0001 'game is not in progress'` idempotency. The PlayArea renders the no-winner timeout as a red "⏰ Time's up — nobody went out." pgTAP: `submit_timeout_test.sql`.
- `bananagrams.concede(target_game)` — **a player drops out of the race.** bananagrams was the *origin* of per-player concede; that mechanism has since been promoted into `common` and made a whole-app feature (see [common.md → Concede](../common.md#concede--per-player-drop-out)), so this is now a **thin wrapper over `common.concede`**. The semantics are unchanged: conceding is a **real loss** for the conceder, it marks JUST the caller out and the **others keep racing**, and the game ends as a collective loss (`play_state='lost'`, `status={outcome:'conceded'}`, every `{"won": false}`, no `winner_username`) only when the LAST active player concedes (including a solo `N = 1` game). The `conceded` flag now lives on **`common.game_players`** (not `bananagrams.progress`), so `peel` / `save_player_board` read it from there to skip a dropped-out player, and the FE reads it off `ctx.players`; `useCommonGame`'s `common.game_players` realtime listener nudges peers, and the terminal's `common.end_game` wakes the modal. pgTAP: `concede_test.sql`. `save_player_board` no-ops for a conceded caller (their board is frozen).

### Title formula

Static: the string **"bananagrams"**, passed verbatim by `create_game`. Each
game is the player's own random tile draw — there's nothing puzzle-specific to
name — so the gametype logo carries identity in the club list and the title
stays constant.

### Realtime + FE

- **Inherited free** from the shell: `useCommonGame` (presence-pause — a bananagrams race pauses if anyone drops, per the house principle), the GamePage header, chat, suspend/shelve, the player-subset picker, the terminal result modal.
- **`bananagrams/useGame`**: `useGame` reads the caller's own `player_boards` row — `board` once (for seeding; the FE owns it after) and `tiles` LIVE via a Pattern-A subscription to its own row (so a peel/dump's `tiles` change folds into the derived hand). `useProgress` subscribes to `bananagrams.progress` for peers' counts. A peer's board never crosses the wire; only your own row reaches you.
- **`PlayerBoard` decomposition (the roster's inverted case).** Every other game splits its `PlayArea` into `BoardCol` + `InfoCol` (each column owns its own input). bananagrams **can't** — its input engine spans BOTH columns: the hand tiles (info column) are drag SOURCES that drop onto the board (board column), the dump zone (info column) is a drop TARGET during a board drag, the derived hand (`deriveHand(tiles, board)`) is a function of BOARD state, and the keyboard cursor types onto the board but checks the hand. So there's one cohesive cross-column engine. It's factored as **`usePlayerBoard` (hook, the engine)** + two thin presentational **VIEWS** — **`BoardArena`** (the board-column arena) and **`HandCard`** (the info-column hand card) — coordinated by a now-thin **`PlayerBoard`** (the two-column layout). This is the honest analog of "engine + views + thin coordinator" for a game whose columns share one engine; the views are deliberately NOT named `BoardCol`/`InfoCol` because they own no input. The DOM contract the drag gesture hit-tests (`data-cell`/`data-x`/`data-y`, `data-zone="hand"`/`"dump"`, `data-hand-tile`) lives in the views and is load-bearing. (Note the TWO-LEVEL coordinator: `PlayArea` is the OUTER coordinator — data / RPCs / feedback / verdict — above `PlayerBoard`, the columns' coordinator.)
- **`PlayerBoard`** (owns the shared two-column shell): the fixed 25×25 arena FILLS the left board column (drag, keyboard cursor, a translucent floating **zoom** panel + the shared **`ZoomFitButton`** — lucide `Fullscreen`, a plain square icon button) with a fixed-height **local feedback slot** below it. The board column does NOT compose the shared `.boardCol` (that hugs; bananagrams fills) — a documented deviation; it uses a self-sufficient per-game `.boardCol` (`flex: 1`) to avoid a hug-vs-fill override fight. The right/info column runs `PlayArea`'s `infoTop` (in the shared `.actionSlot`) → the **hand** → the bottom **action row**. The **hand** mirrors the shared WordList / TurnLog chrome: a plain black "Hand" heading OUTSIDE an evident 2px-framed box. Inside the box, the **dump zone** sits at the TOP of the tiles (you dump one of a few tiles often, so keep the target close), an info-blue (`--color-accent`) dashed drop target (lucide `arrow-left-right` glyph + "Drag tile here to dump" at button-label size) that greens when a tile hovers it — drop from the hand *or* dragged off the board (a board-sourced dump clears its cell so `board` stays in lock-step with `tiles`); the ⟲ shuffle floats over the TILES' top-right corner (below the dump zone). The bottom **action row** is `shared.infoActions` (natural-width buttons, NOT stretched): while playing it's **[Peel] [Concede]** side by side (the shared `PeelButton`, primary, label always "Peel", enabled only when the derived hand is empty — it flushes the board first so the server's `placed == tiles` check is current; also fired by **Enter** / **Space**, `doPeel` shared between button and keyboard); at terminal / locally-terminal it becomes the outcome line + back-to-club (no Peel). A **conceded** player's board is frozen: the pointer handlers bail via a ref, and the shared **`useBoardCursorKeys`** keyboard (bananagrams's + scrabble's common 2-D board-cursor entry — arrows move, a letter places from the hand, Backspace returns a tile, Enter/Space peels) is passed `enabled: !isConceded`. Every board mutation writes the board only — the hand re-derives.
- **`PlayArea`** (the v3 chrome + terminal + feedback): builds the info-column readouts `infoTop` and the bottom action row `infoActions`. **Info-column order is a DOCUMENTED EXCEPTION** to the canonical v3 order (state → opponent → actions → help → setup → log): because the hand + peel live in the info column (the other exception), the order is **state → opponents (`PeersStrip`) → help → setup → the hand card → the action row at the very bottom**. While playing, the action row is **Peel + Concede** side by side (`ConcedeGameButton`; confirm → `db.rpc('concede')`) — there is NO separate Dump button (the in-hand dump zone is the only dump affordance); at terminal / locally-terminal it becomes the outcome line + back-to-club. The state line shows held tiles + the bunch count (the old bottom "N in bunch" is gone) plus **"N in the box"** when the game isn't on a full bag. The below-board **local feedback pill** carries own-move feedback (draw announcement / RPC error), the terminal fill verdict, and the locally-terminal "You conceded — you're out". The **draw announcement** watches its own `tiles` length grow → a timed local pill ("🍌 Peel!" for a draw; a "Dumped 1, drew N" pill led by the lucide `arrow-left-right` glyph — matching the dump zone — when a `dumpPending` ref flags the caller's own dump; `FeedbackMsg.text` is a `ReactNode` so the pill can hold that inline icon). A player who has conceded but whose game is still live is **locally terminal**: `ctx.players[self].conceded && !isTerminal` (the flag now rides the common roster, not `progress`) → the terminal LOOK (frozen board, "You're out" action row + back-to-club, disabled Peel). The terminal verdict checks the two no-winner outcomes **first** — `status.outcome === 'timeout'` → "⏰ Time's up — nobody went out."; `=== 'conceded'` → "🏳️ Everyone conceded — no winner." — before the win/loss computation (neither carries a `winner_username`). The `labelFor` (manifest) maps terminal `play_state` → club-list label: `'won'` → "won — \<name\> finished first", `'lost'` → "everyone conceded" or "time's up — nobody finished" (by `status.outcome`).
- **`PeersStrip`**: opponents' tiles-left counts sorted by closest-to-done (a **conceded** peer shows "out" and sinks to the bottom), rendered in the info column above the hand. Renders nothing in a solo game. Deliberately kept over the shared horizontal `OpponentStrip` — the vertical, race-ordered shape is a better fit for this game (and the narrow column).
- **SetupForm**: `hand_size` (15 / 21, default 21) + `bag_size` (number, 1–144, default 144 — fewer tiles = a shorter game) + **dump_to_box** ("Return dumped tiles to the box" checkbox, default off — on sends dumped tiles to the out-of-play box reserve so the bunch depletes; a short-bunch dump can still draw from the box) + **check_words** ("Require real words to win" checkbox) **plus two always-shown shared `DifficultyField` pickers** — **2-letter words** [2–6] and **longer words 3+** [1–6], since 2-letter words are a thin separate vocabulary, both default 4. The bands define what counts as a real word both for the win check (when required) and for a planned opt-in "check board" helper, so they show regardless of the checkbox; connectivity is always required so it's not a knob) + the shared `TimerField` (none / count-up / countdown MM:SS, default none). A countdown that runs out ends the race as a collective loss (`submit_timeout`). The bag must hold a starter hand per player: the form shows the live "deals N" figure, and `bagSizeError` (shared with the gate) feeds the manifest's `setupForm.validate` so the dialog **disables Start with a reason** until `bag_size ≥ playerCount × hand_size`. Manifest compete-only; solo is N = 1.

### Printing the board (PDF)

bananagrams joins the printable games (see [docs/pdf.md](../pdf.md)) — a "Print board
(PDF)" GamePage menu item that hands you a paper record of your crossword. It's the
word-list body family (board top-left, Setup to its right, words below), with two
bananagrams-specific pieces:

- **Board sizing.** Unlike boggle's fixed-size grid, the crossword is an arbitrary shape
  in the 25×25 arena, so the print crops to the used tiles (`lib/board.ts`'s
  `boardToGrid`) and derives a tile size that fills ~75% of the page width — the board is
  the star of the page. Gaps between words render white, so the interlocking shape reads.
- **The word list.** `lib/words.ts`'s `boardWords` enumerates every 2+ run (across +
  down) — the FE twin of the server's win-time spell check in `_win_blockers`, lifted to
  `lib/` so the print (and a future opt-in "check my board" helper) can list the same
  words without a round-trip. They're de-duped + alphabetised and printed **unscored,
  unattributed** — a Bananagrams grid is one player's, not "found" by anyone.

The board lives in the `usePlayerBoard` engine, but the menu lives in `PlayArea` (where
`ctx.menu` is), so PlayArea hands the engine a `reportBoardRef` it keeps pointed at the
live board; the print's onClick snapshots it at click time (works mid-game or at the end).

### Build order

1. **Schema + `create_game` + manifest + PlayArea load gate** — game starts, tiles deal, the board loads from `player_boards`. **✓ DONE** (migration `20260623000000_bananagrams.sql`, `src/bananagrams/`, pgTAP `tests/bananagrams/create_game_test.sql`).
2. **`PlayerBoard`** (fixed 25×25 arena) + `save_player_board` + snapshot lifecycle. **✓ DONE** (`components/PlayerBoard.tsx` + `lib/board.ts`; migration `20260623000000_bananagrams.sql`; pgTAP `save_player_board_test.sql`; e2e `e2e/bananagrams.e2e.ts`).
3. **`progress` realtime + PeersStrip** — watch a peer's count drop. **✓ DONE** (`hooks/useGame.ts` → `useProgress` subscribes to `bananagrams.progress`; `components/PeersStrip.tsx` renders opponents' tiles-left; e2e covers the live update).
4. **Terminal + result modal** — the hand-empty win, surfaced by the `peel` step below (the win is detected inside `peel`). **✓ DONE**

**v2 build order:**
1. **Standard ⟲ ShuffleButton** (common; adopted in spellingbee + connections). **✓ DONE** (`common/components/ShuffleButton`).
2. **Re-platform the hand as derived** (`board` + `tiles` + `pool`; live `tiles` subscription). **✓ DONE** (baseline + `save_player_board` migrations; `lib/board.ts` helpers; `useGame`/`PlayerBoard`).
3. **`peel`** — draw a round / go out (Bananas!); Peel button + bunch count + announcement. **✓ DONE** (migration `20260623000000_bananagrams.sql`; pgTAP `peel_test.sql`; e2e win + draw paths).
4. **`dump`** — swap one tile for three (drag-to-dump-slot). **✓ DONE** (migration `20260623000000_bananagrams.sql`; pgTAP `dump_test.sql`; e2e drag-to-dump).
5. **Polish / future** — hand sort/group, optional elapsed timer. (Board validation shipped: connectivity always enforced on a winning peel, plus an opt-in "Require real words to win" dictionary check — see `_win_blockers` + peel.)

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

## The UX prototype (`bananagrams-ui/`)

A standalone, **pure-FE** Vite + React app at top-level `bananagrams-ui/`
(gitignored, intentionally *not* wired to Supabase or the real app). Its job was
to let Joel *feel* the board before building it for real — and it earned its
keep: we tried a growing/recentering board there, found it complex and fiddly,
and settled on the **fixed 25×25 arena + zoom/scroll** that shipped. No sharing,
persistence, peers, bank, or validation — just a board and a hand.

Run it:

```
cd bananagrams-ui
npm install
npm run dev
```
