# waffle

**Status: live** — coop + compete, server + frontend, shipping. Implemented in
migration `20260624000000_waffle.sql`, the `src/waffle/` frontend, and the pgTAP
(`supabase/tests/waffle/`) + Vitest (`src/waffle/lib/*.test.ts`) suites.

**Brand name vs codename.** The user-facing brand is **SyrupSwap** — it's the
manifest `title` and the wording in any end-user copy (game listing, help,
messages). Everywhere in *code* the codename is **`waffle`**: the SQL schema,
the `src/waffle/` folder, component names, table/column names, variables, test
files, gametype strings (`waffle_coop` / `waffle_compete`). "waffle" keeps the
link to the original game (wafflegame.net) obvious in the source, while
SyrupSwap is the playful public name — so brand and codename deliberately
diverge here.

## The game

A daily-style deduction puzzle (after wafflegame.net). A 5×5 "waffle" lattice
holds **6 interlocking 5-letter words** (3 across, 3 down). Every correct
letter is already on the board, but **scrambled** — you **swap pairs of tiles**
to put them all in place, within a limited swap budget. Each tile shows
Wordle-style feedback (green / yellow / gray) that updates as you swap.

- **Green** — right letter, right cell.
- **Yellow** — the letter belongs in that word, but a different cell.
- **Gray** — the letter isn't in that word.

It's pure deduction: deterministic, turn-based, finite moves, no randomness in
play. That makes it an unusually clean fit for our server-authoritative,
presence-pause, friends-on-a-Zoom-call model.

### Rules

- **Board.** 5×5 grid, 21 filled cells + 4 holes. The 6 words: rows 0/2/4
  (across) and columns 0/2/4 (down), all five letters long, sharing 9
  intersection cells.
- **Swaps.** A move swaps the letters of two filled cells. Holes can't be
  touched. Each swap costs 1 from the budget.
- **Budget.** `max_swaps = par_swaps + extra`, where `par` is the puzzle's
  minimum solving swaps (stored per puzzle) and `extra` defaults to **5**
  (Waffle's effective 10 → 15) but is **configurable in `SetupForm`** — a
  difficulty knob (fewer extra swaps = harder). Validated + bounded server-side.
- **Win** = all 6 words correct (whole board green). **Lose** = budget
  exhausted before solving.
- **Star rating** (FE flourish): swaps left at solve → stars, like Waffle.

## Modes (sibling-manifest pair)

Ships as `waffle_coop` + `waffle_compete`, the same sibling-manifest pattern the
other multiplayer games follow (a `mode` column on `waffle.games`, a `mode` arg on
`create_game`, mode-aware RLS):

- **Coop** — one shared board, one shared swap budget; **either player can
  swap** and everyone sees it. "Like connections coop" — players' working rows
  move in lock-step.
- **Compete** — both players get the **same** puzzle on their **own** board;
  **winner = fewest swaps** to solve. Tie-break: fewer swaps, then less time
  (earliest `solved_at`). The finite budget guarantees the game terminates
  even with no timer.

## Geometry

Row-major positions 0–24; holes at **6, 8, 16, 18**.

```
 0  1  2  3  4      across: a0 = 0 1 2 3 4
 5  ·  7  ·  9              a2 = 10 11 12 13 14
10 11 12 13 14              a4 = 20 21 22 23 24
15  · 17  · 19      down:   d0 = 0 5 10 15 20
20 21 22 23 24              d2 = 2 7 12 17 22
                           d4 = 4 9 14 19 24
```

- **21 filled cells**, **4 holes**.
- **9 intersections** (in two words each): 0 2 4 10 12 14 20 22 24.
- **12 single-word cells**: 1 3 (a0) · 5 15 (d0) · 7 17 (d2) · 9 19 (d4) ·
  11 13 (a2) · 21 23 (a4).

Boards are a **25-char string**, holes = `.`. One helper module
(`src/waffle/lib/waffle.ts`) owns the filled-position list and each cell's word
membership; the SQL side mirrors the same constants. This geometry is shared by
the generator, the server swap/color logic, and the FE.

## Color feedback — the tricky bit

Per-tile green/yellow/gray is a **pure function of `(board, solution)`**,
computed **per word** like a Wordle row:

1. **Green pass** — mark cells where `board[cell] == solution[cell]`.
2. **Yellow pass** — for each non-green cell, mark yellow if the letter is still
   available among that word's solution letters not already consumed by a green
   or an earlier yellow (Wordle-style duplicate accounting). Else gray.
3. **Intersections** belong to two words; the displayed color is the strongest
   of the two (`green > yellow > gray`).

Because the FE never holds the solution (see hidden-state below), this is
computed **server-side** and surfaced two ways: returned in the `submit_swap`
response (instant feedback for the swapper) and exposed in the read view (so the
peer / a refetch sees it).

Waffle's exact duplicate rule is subtle (which direction a yellow "points,"
double-counting across the two words of an intersection) — the
highest-correctness-risk piece in the game, so it's covered test-first against
known Waffle states (`src/waffle/lib/*.test.ts`).

## Schema: `waffle.*`

The puzzle is shared + immutable on `waffle.games`; the **solution is
grant-hidden** (column-grant revoked from `authenticated`; the only read path is
the `_solution_for` SECURITY DEFINER helper behind `games_state`). That helper is
**mode-aware**: **compete** hides the solution until terminal (players race on
independent boards); **coop** exposes it *during* play, because the turn-history
viewer recomputes each past board's colors on the FE (a pure function of
board+solution) and coop is a collaborative solve — per the trust model
(server-authoritative for cleanliness, not anti-cheat) a friend peeking at the
shared answer only spoils their own puzzle.

Working state lives in `waffle.players`, **one table for both modes**. Compete
forces a per-player row (each player solves their own copy, with their own
`board` + `swaps_used`). Coop *could* instead keep a single shared board as
columns on `waffle.games`, but we reuse the same per-player table and keep every
coop player's row **identical**, updating them all on each swap ("lock-step").
That gives one storage shape, one read path, and one view for both modes —
exactly how `connections` handles its coop counters. The only cost is storing the
25-char board redundantly across a handful of rows; trivial.

| table | purpose |
|---|---|
| `waffle.games` → `common.games(id)` | `club_handle`, `mode` (`coop`/`compete`), `scramble` (exposed), `par_swaps`, `max_swaps`, and **`solution` (grant-hidden** — column-grant revoked; read only via
`_solution_for`, which exposes it in coop always / compete post-terminal). The board (solution/scramble/par) is built on demand by the `waffle-build-board` edge function and stored here, so the game is self-contained. There is **no** `waffle.puzzles` table — boards aren't pre-generated. |
| `waffle.players` PK `(game_id, user_id)` | Per-player working state: `board` (25-char, starts = `scramble`), `swaps_used`, `solved`, `solved_at`. **Coop:** every row updates in lock-step. **Compete:** rows are independent. |
| `waffle.swaps` PK `(game_id, seq)` | The coop move log: one row per swap — `user_id`, `seq` (1-based, the shared coop count), `pos_a`/`pos_b`, `letter_a`/`letter_b` (the letters on those cells *before* the swap, stored so the entry is self-contained), and a `swapped_at` timestamp. **Coop only** — compete writes none (a swap sequence would leak an opponent's hidden board). Read directly (no gated columns); RLS is club-member-wide. |

### Views (`security_invoker`)

- **`waffle.games_state`** — `mode`, `scramble`, `par_swaps`, `max_swaps`; `solution`
  via the `SECURITY DEFINER` `_solution_for` helper — exposed in **coop** always
  (the turn-history viewer needs it) and in **compete** only once
  `common.games.is_terminal`.
- **`waffle.players_state`** — `board`, `swaps_used`, `solved`, `solved_at`, **+
  computed `colors`** (a `SECURITY DEFINER` helper
  `_player_colors_for(g_id, row_user)` that reads the hidden `games.solution`
  and wraps the pure `board_colors(board, solution)`). Colors are visible
  during play (they *are* the gameplay); the full solution is not.

### RLS (mode-aware)

Read gating on club membership (`common.is_club_member`), like every game. The
mode-aware twist (spellingbee precedent): in **compete**, an opponent's
`board`/`colors` are hidden mid-game — expose only their `swaps_used` + `solved`
(a lean opponent-progress projection, like spellingbee's rank-only visibility) — and
everything reveals post-terminal. **Coop** shows the shared board to all members.

## RPCs

- **`create_game(target_club, setup, player_user_ids, mode, board)`** —
  sibling-manifest signature plus a `board` jsonb (`{solution, scramble,
  par_swaps}`) built by the `waffle-build-board` edge function. Validates
  `require_club_member`, `require_player_count_max`, `require_valid_timer`; validates
  `setup.extra_swaps` (0..15, default 5) and `setup.difficulty` (band **1–6**,
  default 2 — the dialog's `DifficultyField` offers the same full 1–6 range);
  sanity-checks the board structure (25-char strings, holes at the four
  interior cells, scramble is a rearrangement of the solution); stores it on
  `waffle.games`; sets `max_swaps = par_swaps + setup.extra_swaps`; seeds the
  title placeholder (see [Title formula](#title-formula)); seeds one
  `waffle.players` row per player with `board = scramble`. Two common-layer
  details: the saved per-club setup default is `setup - 'first_turn_user_id'`
  ("who goes first" is a per-game pick, not a club preference; `coop_style`
  rides along), and when `setup.coop_style = 'turns'` (coop only) it seats the
  common turn rotation via `common._assign_turn_order` — after validating that
  `setup.first_turn_user_id` is one of the players — so `submit_swap` can gate
  each swap.
- **`submit_swap(game, pos_a, pos_b) → jsonb`** — the core move. Guards: playing
  state, `require_game_player`, both positions filled (non-hole) and distinct,
  swaps remaining. Then:
  - **coop:** apply the swap to **all** players' rows (lock-step), `swaps_used++`,
    and append a `waffle.swaps` log row (swapper, ordinal, positions, pre-swap
    letters).
  - **compete:** apply to the caller's row only (no log row).
  - Returns `{ colors, swaps_used, solved, terminal }`.
  - **Opt-in turn-by-turn coop** (setup `coop_style = 'turns'`): after the
    lock + caller, `submit_swap` gates on `common._require_turn`, and calls
    `common._advance_turn` only on an accepted, non-terminal swap — never on a
    guard reject (bad position, hole, out of swaps) or the swap that solves /
    exhausts the board. See
    [common.md → Turn-order](../common.md#turn-order--opt-in-turn-by-turn-for-coop-games).
- **`submit_timeout(game)`** — only when a countdown timer is set; reuse the
  spellingbee "realtime touch" pattern so the FE wakes up on expiry.
- **`concede(game)`** — the compete "Concede" action-row button: a per-player
  "I quit, the others keep racing". waffle is an **elimination** game (a player
  is done when solved or out of swaps without the table ending), so concede calls
  `common._set_conceded` then re-runs `waffle._maybe_finish_compete`, which counts
  a conceder as done and **forfeits their win** (fewest-swaps winner is picked
  among solved, non-conceded players). The FE shows Concede in compete / End in
  coop, marks a conceder "out" in the OpponentStrip, and folds them into the
  existing solved/out-of-swaps locally-terminal look. Full mechanism:
  [common.md → Concede](../common.md#concede--per-player-drop-out). pgTAP:
  `concede_test.sql`.
- **`replay_board(game)`** — the **"Restart"** game-menu item (both modes,
  any state). Restarts the SAME board from scratch for everyone: resets every
  `waffle.players` row to the scramble (`swaps_used=0`, unsolved), clears the
  coop `waffle.swaps` log, and hands the common-layer reset to the new
  `common.reset_game` helper (the inverse of `end_game` — `play_state='playing'`,
  `is_terminal=false`, `ended_at=null`, fresh initial `status`, clears every
  `game_players.{result, conceded, conceded_at}`, and **zeroes the shared
  clock** — a timed game restarts from the full countdown; the FE's tick-merge
  accepts the big backward jump as a deliberate reset, and the timeout fires
  on the expired *edge* so a stale flag can't re-end the fresh game). The
  frozen puzzle/setup (solution/scramble/par/max_swaps/mode) is untouched. Any game player may call
  it. No realtime touch needed — the `players` update + `swaps` delete wake
  `useGame`, and `reset_game`'s `common.games` write wakes `useCommonGame`, so
  the board, turn log, and terminal state reset **live for every player**. Two
  FE entry points, one handler: the game-menu item (any state) and the terminal
  action row's **`RestartButton`** (`SkipBack` glyph, `info` tone, left of
  Back-to-Club). Mid-game it confirms first (it wipes the whole group's
  progress); at terminal it fires unconfirmed — the game is over, there's
  nothing left to lose. pgTAP: `replay_test.sql`.
- **`end_game(game)`** — the manual "End" action-row button in the info column
  (**coop**; compete shows Concede instead). A
  *neutral* terminal: writes the uniform `play_state='ended'` (not waffle's
  intrinsic `won`/`lost`/`*_compete`), every player `{"won": false}`, and
  `status = {outcome:'manual', mode}`. Any game player can call it; idempotent
  (a second call raises `P0001 'game is not in progress'`, swallowed by the FE).
  Same "realtime touch" tail as `submit_timeout` so the FE refetches and reveals
  the solution. The FE renders a plain "Game ended" outcome line
  (`tone:'neutral'` — no win green, no loss red; the copy says there's no
  winner). `buildOver` / `labelFor` both branch on `'ended'` before their
  win/lose branches. Modeled exactly on `spellingbee.end_game`.
- **"New game"** (game-menu item, FE-only — no waffle RPC): start a **fresh
  game** — new id, new randomly-built board — with THIS game's setup + roster +
  mode, in the same club. Calls the same `waffle-build-board` edge function the
  manifest's `startGameInClub` uses (via `invokeStartGameEdgeFn`), then jumps
  the creator in via the new `ctx.goToGame`; peers arrive via the game-invitation
  toast, and this game un-currents into the club's games list (resumable), so
  there's no confirm. `clubHandle` + `goToGame` are new `GamePageCtx` fields
  (see [common.md](../common.md)) so any game can adopt the same "same again!"
  item later.
- **`reveal_answer(game)`** — the **"Reveal answer"** game-menu item: give up,
  **show the solution, end the game**. Where `end_game` leaves each board as-is,
  this overwrites every `waffle.players.board` with `games.solution` and *then*
  ends the game — so the board the players are looking at literally becomes the
  answer (`games_state` colors it all-green for free), with no FE overlay. A
  give-up, so like `end_game` it's a neutral `play_state='ended'` with every player
  `{"won": false}`, but tagged `status.outcome='revealed'`. Same `play_state`
  guard + `P0001` idempotency as `end_game`; any game player may call it. **No
  realtime touch needed** (unlike `end_game`): the `waffle.players` board rewrite
  already wakes `useGame`, and `common.end_game`'s `common.games` write wakes
  `useCommonGame`. Mid-game the FE only offers it while the **solution is on
  the client** — compete shields it during play, so in practice it's a coop
  action; you can't reveal what the server never sent. **At terminal the same
  action is FE-local instead** (the wordle pattern): no RPC, no confirm — the
  solution unshields post-terminal in both modes, so `revealedLocally` just
  swaps the DISPLAYED board for it (colored all-green by the FE `lib/colors`
  port; `waffle.players` untouched) and fills the answer list. Disabled once
  the answer is already showing (a win's board IS the solution / the give-up
  tagged `outcome='revealed'` / already clicked); replay clears it (the new
  run starts blind). Offered from the game menu AND the terminal action row's
  `RevealButton`. pgTAP: `reveal_test.sql`.

### Terminal logic

| | Coop | Compete |
|---|---|---|
| **Win** | shared board == solution → `won` (all win) | ends when **all players are done** (solved or out of swaps); winner = solved with **fewest swaps**, tie-break **earliest `solved_at`** → winner `won_compete`, others `lost_compete` |
| **Lose** | `swaps_used == max_swaps` & unsolved → `lost` | nobody solved → all `lost_compete` |

A solved player is locked (can't keep swapping). The finite swap budget bounds
the game even without a timer. Per-player outcome → `common.game_players.result`;
game-level terminal → `play_state` (the `_compete` suffix convention from
[`states.md`](../states.md)). All terminal transitions go through
`common.end_game`.

Timer is optional (`none` / `countup` / `countdown`, via `common.require_valid_timer`).
A countdown is a pace/cap: on expiry, coop → `lost`; compete simply ends the
race where it stands — `submit_timeout` picks the fewest-swaps winner (then
earliest `solved_at`) among players who had already **solved** and not conceded,
→ `won_compete`, or `lost_compete` if nobody had. Unfinished boards are left
as-is; being mid-solve at the buzzer just means you're not in the running.

## Board generation: `waffle-build-board` (edge function)

**No external corpus** (unlike connections's found Connections collection) and **no
pre-generated library** — a board is built fresh at game-start by the
`waffle-build-board` edge function, the same on-demand pattern as
`spellingbee-build-board`.

**Why on demand, not pre-generated.** A pre-generated library bakes the word
filters into each puzzle (you can't filter a board after the fact, only reject
it), so every filter axis — band, dialect, slang, … — multiplies the library
combinatorially. Generating on demand applies whatever filters the player chose
for free, and is fast (a board builds in a few ms; the bottleneck is the one
word-list fetch). It also means no committed artifact to regenerate when the
word list changes, and no `waffle.puzzles` table or import step.

**Why an edge function, not the FE or plpgsql.** Building server-side keeps the
solution off the creating client — for a solve-the-board puzzle, a creator who
knew the answer would have no game. (plpgsql is a poor host for the fill +
cycle-decomposition par; same reason spellingbee uses an edge function.)

The pure generation logic lives in
[`supabase/functions/waffle-build-board/gen.ts`](../../supabase/functions/waffle-build-board/gen.ts)
— geometry, the board fill, the anchored scramble, and `minSwaps`. It's the
single home of that code now; the FE keeps its own copy of the *geometry*
constants in `lib/waffle.ts` for rendering (invariant, so the small duplication
can't drift). `minSwaps` is covered by `gen_test.ts` (`deno test`).

**The flow** (`index.ts`, running as the caller):

1. Fetch the candidate 5-letter words from `common.words` for the band:
   `len = 5 AND difficulty ≤ N AND american AND slur = 0 AND crude = 0 AND NOT slang` (paged
   to defeat PostgREST's `max_rows`). Returns `(word, difficulty)`.
2. **Fill** (the trick that makes it fast): fixing the 3 *across* words fixes the
   3 *down* words' intersection letters. Build an index
   `(char@0, char@2, char@4) → [words]`; sample `a0,a2,a4`, then the down words
   are three O(1) bucket lookups. All three non-empty + 6 distinct words + the
   hardest word **exactly** band N → a valid waffle of that tier.
3. **Scramble + par.** Permute the solution into a mostly-wrong arrangement, then
   compute `par_swaps` = min transpositions to solve. With duplicate letters this
   is "min swaps to sort with dupes" — pick the same-letter→position assignment
   that **maximizes cycles** (`swaps = positions − cycles`); a left-to-right
   greedy over-counts here, so `minSwaps` does the exact max-cycle decomposition.
   Two real-Waffle conventions shape the scramble (per the arXiv analysis of
   1000+ archived boards): the **four corners + center are always left green**
   (cells `0,4,20,24,12` — `ANCHORS`; we only ever swap the other 16), and the
   board shows **5–8 total greens** (the 5 anchors plus ≤3 incidental). Keep only
   scrambles whose par lands in a band (≈ 9–11).
4. Call `waffle.create_game(target_club, setup, players, mode, board)` with
   `board = { solution, scramble, par_swaps }`. The RPC sanity-checks structure
   (25-char strings, holes at the four interior cells, scramble is a
   rearrangement of the solution) but takes `par_swaps` at face value — it never
   re-derives par in SQL (that's the whole reason for the edge function).

## Title formula

A **readout**, not a fixed name. `create_game` seeds a placeholder and
`waffle._sync_title` recomputes `common.games.title` from state:

| mode / state | title |
|---|---|
| coop | **the correct words so far** — first three, alphabetical, dash-joined (`ARENA-EAGER-TOTEM`) |
| coop, before any swap | `'New game'` |
| compete, mid-race | `'New compete'` |
| compete, terminal | **the puzzle's words** (its first three, alphabetical) |

A word counts as correct once all five of its cells match the solution, which
happens well before the puzzle falls — so in coop the title is a live progress
readout. Coop can afford that because the board is shared: those words are
already on every screen. **Compete can't** — the words ARE the solution, each
racer has their own board, and `common.games.title` is club-wide readable, so a
leader's progress would hand the trailing player the answer. Compete therefore
holds its placeholder for the whole race (and says `'New compete'` rather than
`'New game'`, since that's the label a club list will actually sit on) and fills
in at the terminal reveal.

Two details the formula is careful about:

- The coop readout is gated on `swaps_used > 0`: a scramble can hand the players
  a whole correct word for free, and a **replayed** board is in identical state
  to a fresh one — they must read identically. A terminal game is exempt from the
  gate, since `reveal_answer` writes the solution onto every board without a
  single swap.
- Every transition calls the helper rather than assigning its own string —
  `submit_swap`, `concede`, `submit_timeout`, `end_game`, `reveal_answer`, and
  `replay_board` (which must un-tell the words). pgTAP: `gameplay_test.sql`
  (coop readout), `compete_test.sql` (a solved leader doesn't leak), and
  `replay_test.sql` (both modes reset).

## Frontend (`src/waffle/`)

The FE follows the v3 conventions (see [ui.md](../ui.md)): local own-move feedback,
the locally-terminal "waiting" message, and the terminal verdict are all the shared
`<FeedbackPill>` in the `.belowBoard` slot (transient outline error / sticky neutral
waiting / permanent fill verdict); the action row uses the semantic `EndGameButton`
(coop) / `ConcedeGameButton` (compete); a **locally-terminal** state (compete: solved
or out of swaps while others race on) reuses the terminal look (a bold status line +
Concede) and disables the grid; the `.infoCol` follows the canonical **state →
opponent strip → action row → help → setup → log** order; the `OpponentStrip` carries
a `metricLabel="Swaps"`; and the turn log renders its own `<tr>` rows. An opponent
solving reads as `success` (green), the same green a found word always reads as (tone
follows the event, not the viewer's stake).

Mirrors the other game folders:

- `manifest.ts` — the `waffle_coop` + `waffle_compete` sibling pair (gametype
  strings stay codenamed; the manifest `title` is the brand **SyrupSwap**).
- `db.ts` — `supabase.schema('waffle')`.
- `hooks/useGame.ts` — projects `games_state` + `players_state` + the `swaps`
  log; three-table realtime subscription on `waffle.{games, players, swaps}`.
- `lib/waffle.ts` — geometry (shared), incl. `coord(pos)` → `A1`..`E5`. Color
  rendering is the shared `common/lib/color/tileColor.ts` (server code → class key);
  the server is authoritative for the actual colors.
- `lib/colors.ts` — a TS port of `waffle.board_colors` / `common.wordle_colors`, pinned
  against the pgTAP oracle by `colors.test.ts`. The server stays authoritative for
  LIVE colors; this exists only so the turn-history viewer can color a *historical*
  board on the FE (see below).
- `lib/history.ts` — the coop turn-history replay (pure + unit-tested): given the
  `scramble` + the swap log, `turnSnapshot(index)` reconstructs the board *after*
  that swap (each swap is a reversible transposition), colors it via `lib/colors`,
  and rings the two moved cells. **Coop only** — compete writes no swap log.
  Clicking a `GameTurnLog` row opens that swap on the board (the yellow "viewing"
  frame + banner from the shared `common/components/game/lists/historyViewer.module.css`, input
  frozen; a keystroke / board click / the ✕ returns to live), mirroring
  scrabble/stackdown's history viewer.

The PlayArea sits on the **shared two-column scaffold**
(`common/components/game/PlayArea.module.css` — the same one psychicnum / connections /
codenamesduet use; see [docs/ui.md → PlayArea layout](../playarea.md#playarea-layout)):

- **Board column** — `Board` (the 5×5 lattice, tap-A-then-tap-B or
  drag-to-swap) in a no-chrome `.board` wrapper. Unlike the other games' boards,
  which fill the column rectangularly, waffle stays a **top-aligned square** (it's
  a waffle, with holes), sized via container-query units. Tiles use the shared
  `.tile` chrome, painted with the shared **Wordle colors** (`--wordle-*` in
  `common/theme.css`, shared with wordle); a picked-up tile gets waffle's own
  ring (the shared dark `.selected` fill would bury the color). Below it the
  **`.belowBoard` local-feedback slot** holds a centered `<FeedbackPill>` — a
  transient own-action error during play, the sticky "waiting" pill when the
  player is locally terminal, or the permanent fill verdict at game-over. (The
  `SolutionReveal` answer list is NOT here — it lives in the info column's status
  section.) There's no special "reveal" board mode: the **"Reveal answer"** menu
  action ENDS the game and overwrites every board with the solution server-side
  (see `reveal_answer` below), so the caller's own board simply *becomes* the
  answer — the grid renders it all-green for free, with zero FE branching.
- **Info column** — the shared readouts in canonical order (`.infoState` swap
  tally + par → `SolutionReveal` answer list → `OpponentStrip` (compete) → action
  row → `.infoHelp` → `.infoSetup` disclosure), over the coop `GameTurnLog`.
  The swap tally is the shared **`StateLine`** ("Swaps 3/12 (9 left) · Par 10"),
  which `BoardCol` also renders above the board in the shared `<MobileStatusBar>`
  below `--mobile`, where the info column is off-canvas
  ([mobile.md → The mobile status bar](../mobile.md#the-mobile-status-bar--core-state-above-the-board)).
  **`SolutionReveal`** is the **progressive answer reveal**: the six words (3
  across, 3 down), each shown once the caller has turned it fully green (every tile
  correct) on their own board, else an em dash. It's shown *throughout* the game,
  not just at terminal, and it's **leak-safe without the shielded solution** — a
  fully-green word is already on the caller's board, so `lib/waffle.ts`'s
  `solvedWords(board, colors)` reads the revealed letters off the caller's OWN
  board + `colors` (identical, and safe, in compete where the solution isn't sent
  during play). The six slots (word or em dash) are always present, so it's a fixed
  height — no info-column reflow as words come in. Revealed words are click-to-define. The action row is **ICON-ONLY** (waffle's
  experiment — the styled tooltips carry the labels; see
  [ui.md → Button iconography](../ui.md#button-iconography)): during play the
  semantic `EndGameButton` / `ConcedeGameButton` plus an icon-only
  `BackToClubButton` (routed through the shell's **suspend-confirm** flow,
  `menu.requestBackToClub` — leaving a live game shelves it, unlike terminal's
  direct `goToClub`); at terminal the bold outcome line +
  `RestartButton` / `RevealButton` (the terminal-local reveal) /
  `NewGameButton` / primary back-to-club, via `TerminalActionRow`'s children
  slot + its `iconOnly` prop. Stay-here options sit left of the leave option.
  `GameTurnLog` renders its own `<tr>` rows on the shared `<TurnLog>` table — the
  outcome bar (`neutral`) + "#N" + "A (A1) ↔ B (C2)" (letters prominent,
  coordinates small/light) + the swapper's `<ActorTag>`; coop only. Compete shows
  the shared `common/components/game/OpponentStrip` instead, with `metricLabel="Swaps"`
  and a `metricFor` returning swaps-used + a ✓/✗ mark.
- **Feedback split** — own errors (rejected swap / failed End) flash **locally**
  below the board; the header pill carries **peer** news (compete: an opponent
  solved or ran out of swaps; coop needs none — the swap log shows every move).
- `SetupForm` and `Help` round it out. The form (shared by both modes) offers
  four knobs: the `CoopStyleField` first (the opt-in turn-by-turn coop pacing +
  its first-turn picker — self-gates to nothing for compete / solo), a
  word-difficulty `DifficultyField` (which vocabulary band the six words come
  from, 1–6), the extra-swaps `RadioRow` (the budget knob — fewer is harder),
  and the shared `TimerField`. The two disclosure sections carry their current
  values in their summaries ("Dictionary: Familiar", "Swap budget: Tight +3")
  so the form reads without opening anything.

**Terminal flow — the prototype for the app-wide treatment**
(see [ui.md → Terminal results](../ui.md#terminal-results--the-moment-vs-the-record)).
No modal carries the verdict: it's in-page (the below-board terminal pill + the
action-row outcome line), and the terminal action row offers Restart right
there. Instead, a **coop solve** pops the shared **`CelebrationDialog`**
(confetti + jingle) via the `useCelebration` hook — **only at the moment of the
win** (the `playState → 'won'` flip lands on every connected client via the
realtime refetch, so the group celebrates together); opening an already-won
game shows nothing, and a replay-board → second solve celebrates again. Gated
on `playState === 'won'`, not `over.outcome` (manual-end reuses
`outcome:'won'` for styling), and coop-only — a compete win is one player's,
carried by the pill/action row. The coop win's in-page verdict (pill + outcome
line) is **golf-style against par** — "Par +2", or "Par!" for matching it (par
is the generator's minimum, so under-par can't happen) — rather than a generic
"Solved!": the celebration dialog carries the solved moment; the lasting
verdict carries the score.

Presence-pause is inherited free via `<GamePage>` + `useCommonGame`. Live
drag-preview via Broadcast (connections's peer-selection trick) is a deferred
nice-to-have, not shipped.

## Testing

- **pgTAP:** `colors_test` (the duplicate-letter algorithm — *the* priority),
  `create_game_test`, `validation_test` (create_game's reject paths — one broken
  field per case, the board-integrity guards being the point),
  `gameplay_test` (coop lock-step + compete independence),
  `compete_test` (fewest-swaps winner + `solved_at` tie-break + all-fail),
  `timeout_test`, `end_game_test` (manual neutral end → `'ended'`, both modes:
  `is_terminal`, `status.outcome='manual'`, all players `{"won":false}`,
  idempotency, non-player rejected), `concede_test` (elimination-game concede: a
  drop-out keeps the race going but forfeits any win; everyone conceding is a
  collective loss; coop rejected), `replay_test` (replay_board resets both modes
  to the scramble on the same game row, any state, non-player rejected),
  `reveal_test` (reveal_answer fills every board with the solution and ends as a
  neutral give-up), `solution_hide_test` (the answer key's per-mode visibility:
  column-grant excluded everywhere; coop exposed during play, compete only once
  terminal), `turn_order_test` (the opt-in turn-by-turn coop wiring: seating,
  out-of-turn reject, advance only on an accepted non-terminal swap).
- **Vitest:** `waffle.ts` geometry, `manifest` (color rendering is the shared
  `common/lib/color/tileColor.ts`, covered by its own test). The
  generator's `minSwaps` par lives in the edge function, covered by
  `deno test supabase/functions/waffle-build-board/gen_test.ts`.

## Design notes — two choices worth remembering

- **Coop working-state uses one uniform `waffle.players` table** for both modes,
  coop rows kept in lock-step (matches connections). The rejected alternative — a
  single shared board on `waffle.games` for coop — is described in the schema note
  above; flip to it only if the per-row redundancy ever bites.
- **Puzzles are generated on demand** by the `waffle-build-board` edge function
  (see [Board generation](#board-generation-waffle-build-board-edge-function)),
  not vendored from a pre-built library: once player-selectable word filters made a
  pre-generated set multiply combinatorially, on-demand generation became the only
  tractable shape.
