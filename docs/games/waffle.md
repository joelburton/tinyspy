# waffle

**Status: live** — coop + compete, server + frontend, shipping. The shape is
migration `20260624000000_waffle.sql` (with `20260922000000_waffle_event_colors`
and `20261005000000_waffle_players_own_counts`), the behavior
`supabase/sql/waffle.sql`; the frontend is `src/waffle/`, and the tests are the
pgTAP in `supabase/tests/waffle/` and the Vitest beside the code.

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
- **Par verdict** (FE): the coop win reads against par — "Won (par +2)", or
  "Won (par)" on par.

## Modes (sibling-manifest pair)

Ships as `waffle_coop` + `waffle_compete`, the same sibling-manifest pattern the
other multiplayer games follow (the mode is `common.games.mode`, and
`create_game` takes it as an argument):

- **Coop** — one shared board, one shared swap budget; **either player can
  swap** and everyone sees it. The board moves in lock-step on every seat; each
  player's swap count is their own, and the team's is their sum.
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

The database stores a board as a **25-char string**, holes = `.`. The page is
handed **tiles** instead (`GTile`, `{id, letter, color}`): the 21 filled cells,
each tile's id its position as text, the holes left out. `src/waffle/lib/waffle.ts`
owns the frontend's copy of the geometry (the word cells, `coord(pos)` →
`A1`..`E5`); the SQL side and the generator mirror the same constants.

## Color feedback — the tricky bit

Per-tile green/yellow/gray is a **pure function of `(board, solution)`**,
computed **per word** like a Wordle row:

1. **Green pass** — mark cells where `board[cell] == solution[cell]`.
2. **Yellow pass** — for each non-green cell, mark yellow if the letter is still
   available among that word's solution letters not already consumed by a green
   or an earlier yellow (Wordle-style duplicate accounting). Else gray.
3. **Intersections** belong to two words; the displayed color is the strongest
   of the two (`green > yellow > gray`).

The page never holds the solution while the game runs, so this is computed
**server-side** (`waffle._board_colors`) and reaches the page two ways: each
tile's color in `game_data`, and each swap row's `colors` — the whole board's
colors after that swap, stored when it was made, which the history replay
reads. The frontend recomputes none of it.

Waffle's exact duplicate rule is subtle (which direction a yellow "points,"
double-counting across the two words of an intersection) — the
highest-correctness-risk piece in the game, so it's pinned against known
Waffle states in `colors_test.sql`.

## Schema: `waffle.*`

The puzzle is shared + immutable on `waffle.games`; the **solution is
grant-hidden** (column-grant revoked from `authenticated`). The only path to it
is `game_data`, whose builder writes it once the game has ended, **in both
modes**. Coop used to hold it mid-game, for a history viewer that recolored past
boards in the browser; every swap stores its own colors now, so nothing on the
page needs it before the end (ruled 2026-10-05).

Working state lives in `waffle.players`, **one table for both modes**. Compete
forces a per-player row (each player solves their own copy). Coop keeps every
player's `board` **identical**, updating them all on each swap ("lock-step"),
so one storage shape and one read path serve both modes; the cost is the 25-char
board stored redundantly across a handful of rows. A player's `n_swaps_used` is
**their own** in both modes — a coop swap counts only for the player who made
it — and the team's count is the sum
([common-schema.md → A player's facts](../common-schema.md#a-players-facts--the-sides-and-their-own)).

| table | purpose |
|---|---|
| `waffle.games`, keyed `game_id` → `common.games(id)` | `board_at_setup` (the board as dealt), `par_swaps`, `max_swaps`, and **`solution`** (grant-hidden). The board (solution, dealt board, par) is built on demand by the `waffle-build-board` edge function and stored here, so the game is self-contained. There is **no** `waffle.puzzles` table — boards aren't pre-generated. |
| `waffle.players` PK `(game_id, user_id)` | `board` (25-char, starts as `board_at_setup`), `n_swaps_used` (this player's own). **Coop:** every row's board updates in lock-step. **Compete:** rows are independent. A solve is `common.game_players.solved_at`. Only `(game_id, user_id, n_swaps_used)` is granted: a board reaches the page through `game_data` alone. |
| `waffle.events` PK `(id)`, a `bigint identity` | The move log, **both modes**: one row per swap — `user_id`, `kind` ('swap' — the check allows no other value), `pos_a`/`pos_b`, `letter_a`/`letter_b` (the letters on those cells *before* the swap, so the entry is self-contained), `colors` (the board's 25 colors after the swap), `took_turn` (true on every row), `created_at`. Read `order by id` — one game-wide order, which in compete interleaves the racers' swaps by when they happened. |

### RLS

Every table needs only the membership gate (`games_select`, `players_select`,
`events_select`, through `common._is_club_member`), and the column grants hide
`solution` and `players.board`. What a racer may see of a rival mid-race is the
page's rule — `makeGameData`'s seat rule over `game_data`, below — and nothing
reads the tables from the client. None is in `supabase_realtime`: the page
hears a move through the `changed` Broadcast (src/common/realtime/doc.md).

### The page blobs

`waffle._rebuild_data_cols` writes them at create, at Restart and at the end of
every move, each assigned whole ([plans/seat-view.md](../../plans/seat-view.md)
→ The page is written, not assembled): `shell_data` through
`common._make_json_shell_data`, and on top of the common part of `game_data`
and `summary_data` this game's own. `waffle._rebuild_data_cols_for_all()`
rebuilds every waffle game without re-dating it. `static_game_data`, what
nothing after create changes, is written once by `_write_static_game_data`,
from `create_game` and that rebuild, never by a move ([common-schema.md →
Title, statuses and the two
dates](../common-schema.md#title-statuses-and-the-two-dates)); the hook merges
it into `game_data`, each key in its place.

| blob | waffle's part |
|---|---|
| `static_game_data` | `puzzle: {dealtTiles, parSwaps}` — the deal as `{id, letter}` tiles, and par |
| `game_data` | `puzzle: {solution}` — the solution as `{id, letter}` tiles, null until the game ends; `team`, the team's facts sent once — the sum of the players' own counts and the one board, read off any row since they are in lock-step — null in compete; `events`, every swap `{id, userId, swaps: [{id, letter}, {id, letter}], colors, at}` — each of the two cells with the letter it held before; on each player their own facts: `maxSwaps`, `nSwapsUsed`, and a racer's `board: {tiles}` as `GTile`s, null on a coop player |
| `summary_data` | `team: {nSwapsUsed}`, the team's count, null in compete; `maxSwaps`; `band` (`setup.difficulty`); `parSwaps`, the deal's par; `nWinnerSwaps`, compete's once the race is won, null in coop; `nSwapsUsedById`, each racer's swaps, null in coop |

**The builder writes every board and every swap.** What a racer may not see yet
— a rival's swaps and board mid-race — is withheld by `useGame` (below), not by
the builder or RLS.

### The compete swap log, and why it is withheld

Every compete player solves the **same puzzle from the same deal**, and a swap
row carries both positions and both letters. So replaying a rival's log forward
from the deal reconstructs their board exactly, and their green tiles are
correct letter positions. Shown mid-race, the log wouldn't be so much a
cheating opportunity as a **spoiler handed to an honest player** who just reads
it.

So `makeGameData`'s seat rule withholds a rival's rows AND their board together
— the two must agree, or the weaker one decides what's actually secret:

    coop                 →  shared, like the board
    compete during play  →  your own rows only, and a rival's board null
    compete once ended   →  everyone's, boards included

Two consequences worth knowing:

- **The history replay never applies a mixed list.** `lib/history.ts` rebuilds a
  past board by applying swaps to the deal; applying two players' swaps to one
  board produces a state nobody ever saw, so in compete it applies the viewed
  row's author's rows only. The log's `#N` counts the rows on show and its
  handle carries the row's own id.
- **The log carries the shared "whose swaps?" picker** in compete — "All", plus
  each player — with an honest *"Hidden until game ends"* for a rival mid-game
  rather than a misleading "no swaps yet".

## RPCs

- **`create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)`** —
  sibling-manifest signature plus a `p_board` jsonb (`{solution, dealt,
  par_swaps}`) built by the `waffle-build-board` edge function. Validates
  `_require_club_member`, `_require_player_count_max`, `_require_valid_timer`;
  validates `setup.extra_swaps` (0..15, default 5) and `setup.difficulty` (band
  **1–6**, default 2 — the dialog's `DictBandField` offers the same full 1–6
  range); sanity-checks the board structure (25-char strings, holes at the four
  interior cells, the dealt board a rearrangement of the solution); stores it on
  `waffle.games`; sets `max_swaps = par_swaps + setup.extra_swaps`; seeds the
  title placeholder (see [Title formula](#title-formula)); seeds one
  `waffle.players` row per player on the dealt board; writes the page blobs.
  Two common-layer details: the saved per-club setup default is
  `setup - 'first_turn_user_id'` ("who goes first" is a per-game pick, not a
  club preference; `coop_style` rides along), and when `setup.coop_style =
  'turns'` (coop only) it seats the common turn rotation via
  `common._assign_turn_order` — after validating that
  `setup.first_turn_user_id` is one of the players — so `submit_swap` can gate
  each swap.
- **`submit_swap(p_game_id, p_pos_a, p_pos_b) → jsonb`** — the core move. Guards: the
  game still exists, `_require_game_player`, the game not ended, both positions filled
  (non-hole) and distinct, swaps remaining (the team's sum in coop, the
  caller's own in compete). Then it appends a `waffle.events` row (swapper,
  positions, pre-swap letters, the colors after), and:
  - **coop:** applies the swap to **every** player's board (lock-step), and adds
    one to the **caller's** `n_swaps_used`.
  - **compete:** applies it to the caller's row only; a racer who solves or
    spends their last swap has ended (`_set_player_ended`).
  - Then the page blobs, and [an envelope](../envelopes.md) carrying `{ result:
    'swapped', colors, n_swaps_used, solved, game_ended }` in `data`, with **no
    outcome and no message**: an accepted swap shows the swapper nothing until
    the colors reach everyone together in the next blob, which is why the page
    reads `result` alone (see `useSubmitSwap`). The rest travels anyway — the
    fact is structural.
  - Every refusal is a raise, and only three are races: `PN485` "That game was
    already deleted" (a friend deleted it from the club list; asked before the
    membership gate), `PN486` "Game over" (a teammate ended it, or the clock ran
    out) and `PN483` "Already conceded". The rest are faults, because the board
    cannot produce them: `PN263` a square swapped with itself, `PN264` an empty
    square, `PN265` already solved and `PN266` no swaps left. The last two look
    like shared-budget races and are not — spending the last coop swap, or
    solving, ENDS the game, so a later swap meets the ended check instead;
    only compete keeps playing with a finished player at the table.
  - **Opt-in turn-by-turn coop** (setup `coop_style = 'turns'`): after the
    lock + caller, `submit_swap` gates on `common._require_turn`, and calls
    `common._advance_turn` only on an accepted swap that doesn't end the game —
    never on a guard reject (bad position, hole, out of swaps) or the swap that
    solves / exhausts the board. See [common-schema.md →
    Turn-order](../common-schema.md#turn-order--opt-in-turn-by-turn-for-coop-games).
- **`submit_timeout(p_game_id)`** — only when a countdown timer is set; see
  [The endings](#the-endings).
- **`concede(p_game_id)`** — the compete "Concede": a per-player "I quit, the
  others keep racing". waffle is an **elimination** game (a player is done when
  solved or out of swaps without the table ending), so concede locks the game
  row, calls `common._concede` (which ends the game if everyone has conceded),
  then runs `waffle._maybe_finish_compete`, which ends the race if every other
  racer has already ended, with the concession as the act that ended it. A
  conceder is never ranked. Full mechanism: [common-schema.md →
  Concede](../common-schema.md#concede--per-player-drop-out). pgTAP:
  `concede_test.sql`.
- **`replay_board(p_game_id)`** — **Restart** (both modes, any state). Restarts
  the SAME board from scratch for everyone: resets every `waffle.players` row to
  the dealt board with `n_swaps_used = 0`, clears the `waffle.events` log, and
  hands the common-layer reset to `common._reset_game` (the inverse of
  `_end_game` — the ending cleared, each player's ending, solve and result
  cleared, and **the shared clock zeroed**), then rewrites the blobs. The frozen
  puzzle (solution, dealt board, par, max_swaps) is untouched. Mid-game it
  confirms first (it wipes the whole group's progress); once the game has ended
  it goes straight through. pgTAP: `replay_test.sql`.
- **`stop_game(p_game_id)`** — the Stop. Any player may Stop, in either mode: in
  compete, Concede's question offers it, and Stop shows once the player is out
  of the race. It locks the game row and calls `common._stop`: reason
  `stopped`, nobody ranked, so the game and every player are `neutral`
  ([common-schema.md → Stop](../common-schema.md#stop--every-gametypes-stop_game)).
  A second call answers the shared game-over race.
- **"New game"** (FE-only — no waffle RPC): start a **fresh game** — new id, new
  randomly-built board — with THIS game's setup, players and mode, in the same
  club, through the same `waffle-build-board` edge function the manifest's start
  uses, then jump the creator in via `goToFollowUpGame`; peers arrive via the
  game-invitation toast. Nothing is destroyed — this game moves into the club's
  games list, resumable — so the question it asks mid-game is only "Start a new
  game?", and once the game has ended it asks nothing.
- **Reveal** is not an RPC: it's a local, per-player display toggle ([ui.md →
  Endings](../ui.md#endings--the-moment-vs-the-record)),
  available once the game has ended, because only then does `game_data` carry
  the solution. The page draws the solution's tiles, all green, in place of the
  board, and changes no one's saved board — so the history replay still replays
  real swaps, and **Hide brings the board the players finished with straight
  back**. Nothing reveals on its own but my own solve, which puts the solved
  board on screen anyway (`impliedBy`). pgTAP: `boards_untouched_test.sql`.

### The endings

| the ending | reason / detail | ranked |
|---|---|---|
| coop: shared board == solution | `reached_goal` / `solved` | every teammate 1 (`won`) |
| coop: the team's swaps reach `max_swaps`, unsolved | `resource_exhausted` / `exhausted` | nobody (`lost`) |
| compete: the last racer ends (solved, out of swaps, or conceded) | that racer's act | every solver, by **fewest swaps**, tie-break **earliest `solved_at`** — the first `won`, the rest `near`; the others unranked |
| the countdown | `timeout` / `timeout` | coop nobody; compete every solver, as above |
| a Stop | `stopped` / `stopped` | nobody (`neutral`) |

A solved player is locked (can't keep swapping). The finite swap budget bounds
the game even without a timer. Every ending goes through `common._end_game`,
which records the reason pair, who ended it, and each player's
`final_ranking` and `outcome`. A racer who ends before the race does gets their
outcome then: `neutral` for a solve (fewer swaps may yet beat it), `lost` for a
spent budget or a concede.

Timer is optional (`none` / `countup` / `countdown`, via
`common._require_valid_timer`). A countdown is a pace/cap: on expiry, coop
loses; compete simply ends the race where it stands, ranking the players who
had already **solved**.

### The club card

`summaryFor` (manifest) reads `summary_data` for the club-page row, in the
shared status-label vocabulary ([docs/game-summary.md](../game-summary.md)),
with the dictionary band on every line (a waffle at "Universal" and one at
"Expert" are barely the same game). Coop: `Playing · 8 swaps left · dict
"Common"`, then `Won · 3 swaps left · dict "Common"`, `Lost (out of swaps) ·
dict "Common"` or `Lost (out of time) · …`, and `Ended · …` for a Stop.
Compete shows no progress — each racer's count is their own, and the line is
club-wide: `Playing · dict "Common"`, then `Won by alice · 8 swaps · …`,
`Lost (all conceded)`, `Lost (out of swaps) · no winner` /
`Lost (out of time) · no winner`, and `Ended · …` for a Stop.

## Board generation: `waffle-build-board` (edge function)

**No external corpus** (unlike connections' found Connections collection) and
**no pre-generated library** — a board is built fresh at game-start by the
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
— geometry, the board fill, the anchored scramble that deals the board, and
`minSwaps`. The frontend keeps its own copy of the *geometry* constants in
`lib/waffle.ts` (invariant, so the small duplication can't drift). `minSwaps`
is covered by `gen_test.ts` (`deno test`).

**The flow** (`index.ts`, running as the caller):

1. Fetch the candidate 5-letter words from `common.words` for the band: `len = 5
   AND difficulty ≤ N AND american AND slur = 0 AND crude = 0 AND NOT slang`
   (paged to defeat PostgREST's `max_rows`). Returns `(word, difficulty)`.
2. **Fill** (the trick that makes it fast): fixing the 3 *across* words fixes
   the 3 *down* words' intersection letters. Build an index `(char@0, char@2,
   char@4) → [words]`; sample `a0,a2,a4`, then the down words are three O(1)
   bucket lookups. All three non-empty + 6 distinct words + the hardest word
   **exactly** band N → a valid waffle of that tier.
3. **The deal + par** (`makeDealt`). Scramble the solution into a mostly-wrong
   arrangement, then compute `par_swaps` = min transpositions to solve. With
   duplicate letters this is "min swaps to sort with dupes" — pick the
   same-letter→position assignment that **maximizes cycles** (`swaps = positions
   − cycles`); a left-to-right greedy over-counts here, so `minSwaps` does the
   exact max-cycle decomposition. Two real-Waffle conventions shape the deal
   (per the arXiv analysis of 1000+ archived boards): the **four corners +
   center are always left green** (cells `0,4,20,24,12` — `ANCHORS`; we only
   ever swap the other 16), and the board shows **5–8 total greens** (the 5
   anchors plus ≤3 incidental). Keep only deals whose par lands in a band (≈
   9–11).
4. Call `waffle.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)` with
   `p_board = { solution, dealt, par_swaps }`. The RPC sanity-checks structure
   but takes `par_swaps` at face value — it never re-derives par in SQL (that's
   the whole reason for the edge function). The key is shared with
   `supabase/sql/waffle.sql`, so the two ship together.

## Title formula

A **readout**, not a fixed name. `create_game` seeds a placeholder and
`waffle._sync_title` recomputes `common.games.title` from state:

| mode / state | title |
|---|---|
| coop | **the correct words so far** — first three, alphabetical, dash-joined (`ARENA-EAGER-TOTEM`) |
| coop, before any swap | `'New game'` |
| compete, mid-race | `'New compete'` |
| compete, once ended | **the correct words on the furthest board** (first three, alphabetical; a solved board's are the puzzle's words) |

A word counts as correct once all five of its cells match the solution, which
happens well before the puzzle falls — so in coop the title is a live progress
readout. Coop can afford that because the board is shared: those words are
already on every screen. **Compete can't** — the words ARE the solution, each
racer has their own board, and `common.games.title` is club-wide readable, so a
leader's progress would hand the trailing player the answer. Compete therefore
holds its placeholder for the whole race (and says `'New compete'` rather than
`'New game'`, since that's the label a club list will actually sit on) and fills
in once the race ends.

Two details the formula is careful about:

- The coop readout waits for the team's first swap (the players' `n_swaps_used`
  summing above 0): a deal can hand the players a whole correct word for free,
  and a **replayed** board is in identical state to a fresh one — they must read
  identically. A game that has ended is exempt from the wait (`todo.md` asks
  whether it still should be).
- Every transition calls the helper rather than assigning its own string —
  `submit_swap`, `concede`, `submit_timeout`, `stop_game`, and `replay_board`
  (which must un-tell the words). pgTAP: `gameplay_test.sql`
  (coop readout), `compete_test.sql` (a solved leader doesn't leak), and
  `replay_test.sql` (both modes reset).

## Frontend (`src/waffle/`)

### The answers (`lib/answer.ts`)

waffle's answers about a move are three (`GAnswer`), and `answerMessage(answer)`
says how each reads:

| answer | outcome | words |
|---|---|---|
| `swapped_peer` | neutral | none: a swap in the log — anyone's — counted, and nothing judges it |
| `solved_peer` | won | "solved it", a rival's, in the header (compete) |
| `out_of_swaps_peer` | warning | "out of swaps", likewise |

My own swap is not one: it says nothing, the board's tile colors being the news
— the g/y/x colors are the board's own vocabulary, not outcomes. `submit_swap`
carries no outcome and no message (the colors reach everyone together in the
next blob), pinned in `gameplay_test.sql`; `lib/answer.test.ts` pins the words
([outcomes.md → How a game does it](../outcomes.md#how-a-game-does-it)).

### The play surface

The shape [`docs/playarea.md`](../playarea.md) describes, on the page blobs
([plans/seat-view.md](../../plans/seat-view.md)):

```
<PlayAreaLoader {...PlayAreaLoaderProps}>   useGame: gd from the game_data blob
  └── PlayArea                      the coordinator: picks the board to show
        ├── BoardCol                the board and the slot under it; owns the swap
        │     ├── MobileStatusBar ← StateLine above the board, on a phone
        │     ├── Board             the 5×5 lattice; decides each tile's marks
        │     │     └── Tile        one tile — its letter on its color, and the marks
        │     ├── HistoryBanner ←   over the slot while a past swap is open
        │     └── FeedbackPill ←    the local slot, under the board
        ├── InfoSheet ←             off-canvas on a phone, a flex child on desktop
        │     └── InfoCol           the readouts and the action row
        │           ├── StateLine   "Swaps 3/12 (9 left) · Par 10"
        │           ├── TurnStatusLine ←   turn-by-turn coop only
        │           ├── SolutionReveal     the six words, each once it is green
        │           ├── OpponentStrip ←    compete only: each racer's swaps, then how they came out ("6 (solved)")
        │           ├── InfoActionsRow ←   one row, every action, in the menu's order
        │           ├── SetupDisclosure ←
        │           └── GameEventLog       every swap I may see
        └── CelebrationBlockingModal ←     my win, as it lands

  ← belongs to common/ or shared/ ; everything else is this folder's
```

- **`useGame`** builds `gd` through `makeGameData`, a pure function of the blob
  and who I am: the players with their links resolved, the seat rule (mid-race
  in compete a rival's rows leave `gd.events` and their `board` is null), the
  setup rows, and waffle's facts (`GFacts`: `nSwapsUsed`, `maxSwaps`, `board`)
  on every player twice — spread on, the side's (the team's in coop, their own
  in compete); under `own`, their own
  ([common-schema.md → A player's facts](../common-schema.md#a-players-facts--the-sides-and-their-own)). The state line reads
  `gd.me` beside `gd.puzzle`, whose par is the deal's. It reads nothing and
  subscribes to nothing.
- **`PlayArea` picks the board to show:** a past swap's while one is open
  (`useHistoryView`), else the revealed solution, else `gd.me.board`. It wires
  my ending's message (`useGetEndingMessage`, from my ending label:
  `lib/endingLabel.ts`, on every `gd` player), the waiting
  line, a rival's solve or spent budget in the header (`useShowOppsEndedMessages`
  — `peerMilestone`s, so a chat line can't bury them) and the commands
  (`useActionsAndMenu`, which also publishes the menu and builds the printout
  from `gd`). Coop narrates no peer moves: the swap log shows every one.
- **`BoardCol` owns the swap.** `useSubmitSwap` sends it with `p_` names and
  holds it on the board while it is out: the two letters trade places at once
  (a board that didn't move would read as a swap that didn't happen), and the
  pair goes unjudged gray under the shared in-flight dim until the swap's row
  lands in the blob — the colors land for everyone together. **The swap still
  out is the one in-flight guard**: a tap and a drag swap with no action behind
  them, and every way of making a swap — tap, drag, Space, Enter — is quiet
  until the row lands; without that, players read the silent gap as a missed
  click and tap the same two tiles again, queueing the REVERSE swap. Two gates:
  `isInteractive` — my move, on the live board — feeds the board, its cursor
  and whether the keys show; `canPick` adds "no swap out" and gates every way
  of making one. The picks are `usePickedTiles` (the tap, Space and drop
  rules), the two keys `useBoardColActions`. The key that dismisses the slot's
  message is bound here too.
- **`Board` decides, `Tile` draws.** `Board` takes the tiles, `marks` (the
  picks, the swap in flight, my ending's band, the waiting dim, the turn flash),
  `historyView`, `isInteractive` and the three gestures (`onTap`,
  `onTogglePick`, `onDrop`), and works out each tile's marks: picked,
  under the cursor, in flight, flashing, ringed by the history view. Held
  things are ids (the picks, the swap still out, a drag's source); passed
  things are tiles; `data-tile` is the id. The board is a **top-aligned
  square** (it's a waffle, with holes), and the four holes draw as gaps.
  - **Tap A, then tap B**, or drag one tile onto another (a mouse affordance,
    off on a touch device).
  - **The keyboard swaps too** (`useTileCursor`): arrows move a selection
    cursor over the tiles, jumping the holes (`lib/boardShape.ts`); Space picks
    up to two — a third is refused — and Enter (`act-submit`, called "Swap")
    swaps them. The second keyboard pick WAITS, where the second tap is the
    swap: an arrow can land a cell off, and a swap costs one from the budget. A
    tap with two keyboard picks starts over from the tapped tile. No cue
    teaches Enter; Help and the key list do (`todo.md`, Someday).
  - **The attention flash** marks a tile that changed under the player: its
    letter changed (a teammate's swap), or it was mine and in flight and its
    color just arrived. A move has to be what changed the board — a Restart
    re-deals and the reveal swaps the solution in, and neither is news — so the
    flash reads the cause, the swap count (`useMoveAttention`).
  - **The ending band**: once I have ended — with the game, or before it while
    the others race on — the board wears my outcome's frame.
  - The letters are stored lowercase, as the word list is; CSS draws the
    capitals.
- **`InfoCol`** — the shared readouts in canonical order. `StateLine` is also
  drawn above the board in the shared `<MobileStatusBar>` below `--mobile`, where
  the info column is off-canvas ([mobile.md → The mobile status
  bar](../mobile.md#the-mobile-status-bar--core-state-above-the-board)).
  **`SolutionReveal`** is the progressive answer: the six words (3 across, 3
  down), each shown once I have turned it fully green on my own board, else an
  em dash — leak-safe without the solution, because a fully-green word is
  already on my board (`lib/waffle.ts`'s `solvedWords`). While the solution is
  revealed, all six show. The six slots are always present, so it's a fixed
  height. Revealed words are click-to-define. The action row is **ICON-ONLY**
  (waffle's experiment — the styled tooltips carry the labels; see [ui.md →
  Button iconography](../ui.md#button-iconography)), ONE row with every action
  in the menu's order — Reveal, Restart, New game, Concede, Stop, Club — each
  answering whether it shows: while I play, the exit and Club; out of a race
  the others still run, Reveal inert, Stop and Club; once the game has ended,
  Reveal, Restart, New game and Club, filled. Help shows only on my move.
  `GameEventLog` draws its own `<tr>` rows on the shared `<EventLog>` table —
  the outcome bar (`neutral`) + "#N" + "A (A1) ↔ B (C2)" (letters prominent,
  coordinates small/light) + the swapper.
- **`manifest.ts`** — the `waffle_coop` + `waffle_compete` sibling pair, one
  `BRAND`, the shared lazy loaders, the start through
  `runEdgeFn('waffle-build-board', …)`, and each mode's `summaryFor` over
  `summary_data` (above → The club card).
- `SetupForm` and `Help` round it out. The form (shared by both modes) offers
  four knobs: the `SetupCoopStyleSection` first (the opt-in turn-by-turn coop
  pacing + its first-turn picker — self-gates to nothing for compete / solo), a
  word-difficulty `DictBandField` (which vocabulary band the six words come
  from, 1–6), the extra-swaps `RadioRow` (the budget knob — fewer is harder),
  and the shared `SetupTimerSection`. The two disclosure sections carry their
  current values in their summaries ("Dictionary: Familiar", "Swap budget: Tight
  +3") so the form reads without opening anything. The setup pair is
  `GSetupValues` / `GSetup` in `types.ts`.

**The end — the prototype for the app-wide treatment** (see [ui.md →
Endings](../ui.md#endings--the-moment-vs-the-record)). No modal
carries the verdict: it's in-page (the below-board pill + the action row's
line), and the action row offers Restart right there. The shared
**`CelebrationBlockingModal`** (confetti + jingle) pops for **my** win — every
teammate's on a coop solve, the winner's in a race — only at the moment it
lands (`useCelebration`); opening an already-won game shows nothing. The coop
win's verdict is measured **against par** — "Won (par +2)", or "Won (par)" for
matching it (par is the generator's minimum, so under par can't happen) —
rather than a generic "Solved!": the celebration carries the moment; the
lasting verdict carries the score. In a race a win is the word alone; a place
below first says what lost it — "2nd (more swaps)" when someone above used
fewer, "2nd (solved later)" when they used as many; a player with no place
says what ran out — "Lost (out of swaps)", "Lost (out of time)"; a solver
waiting on the rest reads "Solved (waiting on the rest)".

Presence-pause is inherited free via `<GamePage>` + `useCommonGame`. Live
drag-preview via Broadcast (connections' peer-selection trick) is a deferred
nice-to-have, not shipped.

## Printing the board (PDF)

`src/waffle/pdf/` — a **"Print board (PDF)"** GamePage menu item
(common/pdf/doc.md). The **track family**: one page column per BOARD, its 5×5
grid, then that board's swaps. The model reads `gd` — the players' boards and
counts, the team's count, `gd.events`, the solution — at click time.

The tiles use the shared 4-state encoding — **border and fill weight, not
color**. That's what makes waffle printable at all: its feedback is entirely
green/yellow/gray, which a mono printer flattens to a single gray, and waffle
without its feedback is a grid of unrelated letters. See [`common/pdf/doc.md` →
Backgrounds are white](../../src/common/pdf/doc.md#backgrounds-are-white) for
the rule this is the agreed exception to, and why grays rather than hues keep it
honest.

**Coop is one track** (a single shared board, the team's count). **Compete is
one per player once the race has ended**, and just yours during play — mid-race
`gd` holds nobody else's board OR swaps (see [The compete swap
log](#the-compete-swap-log-and-why-it-is-withheld)), so a rival column would be
an empty grid rather than information. Capped at three tracks per page; a
fourth player spills onto a second page at the same size.

The four **holes** print as nothing at all — not an empty box. They aren't
un-guessed cells, they're not part of the puzzle, and a box there would invite
someone to fill it in. The notches are how you recognize the waffle shape.

A coop track's log names each swapper (one board, many hands); a compete track
is one person's, so the rows don't repeat their name — the column heading says
whose it is.

The **six answer words print only once they are on screen** — solved or
revealed — twice over: `gd` carries no solution before the end, and the model
refuses it until the answer is shown regardless.

## Tests

**pgTAP** (`supabase/tests/waffle/`, against a fixture board in `setup.psql`:
the solution `abcdef.g.hijklmn.o.pqrstu`, 21 distinct letters, dealt one swap
from solved):

- `game_data_test` — the page blobs: a fresh game's puzzle (the deal as 21
  tiles, par, no solution), team, players and both modes' summaries; mid-game
  coop — the log's swap as two tiles with the letters from before it, each
  player's own count and the team's sum, one board on every seat; mid-game
  compete — each racer's own count and board, the log carrying every racer's
  rows (the page withholds, not the builder); the endings — the solution
  arriving, a coop solve stamping every teammate, a race's winner and their
  count on the summary, `shell_data` rewritten; a Restart; a rebuild of every
  game without re-dating it.
- `colors_test` — the duplicate-letter algorithm (*the* priority).
- `create_game_test` · `validation_test` — the happy paths and create_game's
  reject paths, one broken field per case, the board-integrity guards being
  the point.
- `gameplay_test` — coop lock-step boards with each player's own count, compete
  independence, the reply's keys, the coop title readout.
- `compete_test` — every solver ranked by fewest swaps, `solved_at` breaking a
  tie; the last racer recorded as who ended it; all-fail; the blob carrying a
  rival's board; a solved leader not leaking into the title.
- `timeout_test` · `stop_game_test` · `concede_test` · `replay_test` — the
  countdown, the Stop in both modes, the elimination-game concede, and Restart
  resetting both modes to the dealt board.
- `boards_untouched_test` — ending a game never rewrites `waffle.players.board`
  (what makes Hide able to bring the finished board back), and the solution
  arriving in `game_data` at the end.
- `solution_hide_test` — the answer key: column-grant excluded, and in
  `game_data` only once the game has ended, in both modes.
- `turn_order_test` — the opt-in turn-by-turn coop wiring: seating,
  out-of-turn reject, advance only on an accepted swap that doesn't end the
  game.

**Vitest**, beside the code:

| file | pins |
|---|---|
| `hooks/useGame.test` | `gd` from the blob — the links become players, the setup rows with par, each player's own count and the team's, the state line's pick, the solution at the end; the seat rule mid-race and at its end; the memo on the blob |
| `lib/endingLabel.test` | every ending's label and my outcome — the par verdict, coop's two losses, a race won, a place and what lost it, a race nobody won for each cause; a racer solved, spent or conceded |
| `lib/history.test` | the replay: the board after the viewed swap with that row's colors, its two tiles lit, the label's number as given, the author's own board in compete |
| `lib/waffle.test` · `lib/boardShape.test` | the geometry, the words read off tiles, the progressive reveal; the cursor's shape |
| `components/PlayArea.test` | the surface on the fixture: the tiles and `data-tile`; the par verdict; Concede and Stop; New game; Reveal and Hide; the action row in each state and the menu's order; the strip; help on my move; the celebration on my win; a rival's solve and spent budget in the header; the history view; the swap in flight; the keys and the selection cursor |
| `components/SetupForm.test` | the form's settings |
| `pdf/model.test` | the solution only once shown; holes as blanks; coop's one track, compete's tracks by player |

The generator's `minSwaps` par is covered by `deno test
supabase/functions/waffle-build-board/gen_test.ts`. Playwright, in `e2e/`:
`waffle`, `waffle-history`, `waffle-mobile` and `waffle-print`.

## Design notes — two choices worth remembering

- **Coop working-state uses one uniform `waffle.players` table** for both modes,
  coop boards kept in lock-step (matches connections) and each player's count
  their own. The rejected alternative — a single shared board on `waffle.games`
  for coop — is described in the schema note above; flip to it only if the
  per-row redundancy ever bites.
- **Puzzles are generated on demand** by the `waffle-build-board` edge function
  (see [Board generation](#board-generation-waffle-build-board-edge-function)),
  not vendored from a pre-built library: once player-selectable word filters
  made a pre-generated set multiply combinatorially, on-demand generation became
  the only tractable shape.
