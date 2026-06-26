# waffle

**Status: BUILT** — coop + compete, server + frontend. This began as the
scoping doc and the design below still holds; it's now implemented in migration
`20260624000000_waffle.sql`, the `src/waffle/` frontend, and the pgTAP
(`supabase/tests/waffle/`) + Vitest (`src/waffle/lib/*.test.ts`) suites.
Remaining polish is minor (recently-swapped tile flash).

**Brand name vs codename.** The user-facing brand is **waffle** — it's the
manifest `title` and the wording in any end-user copy (game listing, help,
messages). Everywhere in *code* the codename is **`waffle`**: the SQL schema,
the `src/waffle/` folder, component names, table/column names, variables, test
files, gametype strings (`waffle_coop` / `waffle_compete`). waffle is a
mouthful to type, and "waffle" keeps the link to the original game obvious in
the source — so brand and codename deliberately diverge here (the other games
happen to share one word for both).

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

Ships as `waffle_coop` + `waffle_compete`, the same pattern psychicnum /
connections / spellingbee follow (a `mode` column on `waffle.games`, a `mode` arg on
`create_game`, mode-aware RLS). Per [Joel, 2026-06-20]:

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
the generator, the server swap/color logic, and the FE — build it first.

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
double-counting across the two words of an intersection). **Build this
test-first** against known Waffle states — it's the highest-correctness-risk
piece in the game.

## Schema: `waffle.*`

The puzzle is shared + immutable on `waffle.games`; the **solution is hidden**
(column-grant revoked from `authenticated`, revealed only post-terminal via the
view — the spellingbee / psychicnum hidden-answer pattern).

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
| `waffle.games` → `common.games(id)` | `club_handle`, `mode` (`coop`/`compete`), `scramble` (exposed), `par_swaps`, `max_swaps`, and **`solution` (HIDDEN** — column-grant revoked; revealed post-terminal). The board (solution/scramble/par) is built on demand by the `waffle-build-board` edge function and stored here, so the game is self-contained. There is **no** `waffle.puzzles` table — boards aren't pre-generated. |
| `waffle.players` PK `(game_id, user_id)` | Per-player working state: `board` (25-char, starts = `scramble`), `swaps_used`, `solved`, `solved_at`. **Coop:** every row updates in lock-step. **Compete:** rows are independent. |
| `waffle.swaps` PK `(game_id, swap_index)` | The coop move log: one row per swap — `user_id`, `swap_index` (1-based, the shared coop count), `pos_a`/`pos_b`, and `letter_a`/`letter_b` (the letters on those cells *before* the swap, stored so the entry is self-contained). **Coop only** — compete writes none (a swap sequence would leak an opponent's hidden board). Read directly (no gated columns); RLS is club-member-wide. |

### Views (`security_invoker`)

- **`waffle.games_state`** — `mode`, `scramble`, `par_swaps`, `max_swaps`; `solution` only
  when `common.games.is_terminal` (via a `SECURITY DEFINER` helper, exactly the
  spellingbee `_required_words_for` shape).
- **`waffle.players_state`** — `board`, `swaps_used`, `solved`, `solved_at`, **+
  computed `colors`** (a `SECURITY DEFINER` helper
  `_player_colors_for(g_id, row_user)` that reads the hidden `games.solution`
  and wraps the pure `compute_colors(board, solution)`). Colors are visible
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
  `require_club_member`, `require_player_count_max`, `validate_timer`; validates
  `setup.extra_swaps` (0..15, default 5) and `setup.difficulty` (band **1–6**,
  default 2 — server accepts the full range; the dialog offers 1–5, a FE/UI
  choice); sanity-checks the board structure (25-char strings, holes at the four
  interior cells, scramble is a rearrangement of the solution); stores it on
  `waffle.games`; sets `max_swaps = par_swaps + setup.extra_swaps`; titles the
  game from the band; seeds one `waffle.players` row per player with
  `board = scramble`.
- **`submit_swap(game, pos_a, pos_b) → jsonb`** — the core move. Guards: playing
  state, `require_game_player`, both positions filled (non-hole) and distinct,
  swaps remaining. Then:
  - **coop:** apply the swap to **all** players' rows (lock-step), `swaps_used++`,
    and append a `waffle.swaps` log row (swapper, ordinal, positions, pre-swap
    letters).
  - **compete:** apply to the caller's row only (no log row).
  - Returns `{ colors, swaps_used, solved, terminal }`.
- **`submit_timeout(game)`** — only when a countdown timer is set; reuse the
  spellingbee "realtime touch" pattern so the FE wakes up on expiry.
- **`end_game(game)`** — the manual "End game" menu item (both modes). A
  *neutral* terminal: writes the uniform `play_state='ended'` (not waffle's
  intrinsic `won`/`lost`/`*_compete`), every player `{"won": false}`, and
  `status = {outcome:'manual', mode}`. Any game player can call it; idempotent
  (a second call raises `P0001 'game is not in progress'`, swallowed by the FE).
  Same "realtime touch" tail as `submit_timeout` so the FE refetches and reveals
  the solution. The FE renders a neutral green "Game ended" card (it reuses
  `GameOverModal` `outcome:'won'` purely for the green styling — the verdict copy
  says there's no winner). `buildOver` / `labelFor` both branch on `'ended'`
  before their win/lose branches. Modeled exactly on `spellingbee.end_game`.

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

Timer is optional (`none` / `countup` / `countdown`, via `common.validate_timer`).
A countdown is a pace/cap: on expiry, coop → `lost`; compete forces any
not-yet-done player to "done" (failed) and computes the winner among solvers.

### Title formula

The difficulty **band name**: `create_game` maps `setup.difficulty` (1–6) to
one of Universal / Common / Familiar / Uncommon / Obscure / Expert. Same in
both modes — the band is the one player-facing knob, so it's what names the
game in the club list.

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
   re-derives par in SQL (that's the whole reason for the edge function). The
   game title is the band's label, derived from `setup.difficulty`.

## Frontend (`src/waffle/`)

Mirrors the other game folders:

- `manifest.ts` — the `waffle_coop` + `waffle_compete` sibling pair (gametype
  strings stay codenamed; the manifest `title` is the brand **waffle**).
- `db.ts` — `supabase.schema('waffle')`.
- `hooks/useGame.ts` — projects `games_state` + `players_state` + the `swaps`
  log; three-table realtime subscription on `waffle.{games, players, swaps}`.
- `lib/waffle.ts` — geometry (shared), incl. `coord(pos)` → `A1`..`E5`;
  `lib/colors.ts` — render only (server is authoritative for the actual colors).
- `components/` — `WaffleGrid` (the 5×5 lattice, tap-A-then-tap-B or
  drag-to-swap, colored tiles — reuse the codenamesduet keycard color tokens),
  `SwapLog` (the coop move log, "Swap #N — name · A (A1) ↔ B (C2)", letters
  prominent + coordinates small/light; coop only, shown during and after the
  game), `SetupForm` (timer + the extra-swaps difficulty knob), `Help`, and the
  shared `common/components/OpponentStrip` for compete (a `metricFor` returning
  swaps-used + a ✓/✗ mark — the same strip spellingbee/connections/psychicnum use,
  differing only in the metric cell).

Presence-pause is inherited free via `<GamePage>` + `useCommonGame`. Live
drag-preview via Broadcast (connections's peer-selection trick) is a nice-to-have —
defer.

## Testing

- **pgTAP:** `colors_test` (the duplicate-letter algorithm — *the* priority),
  `create_game_test`, `gameplay_test` (coop lock-step + compete independence),
  `compete_test` (fewest-swaps winner + `solved_at` tie-break + all-fail),
  `timeout_test`, `end_game_test` (manual neutral end → `'ended'`, both modes:
  `is_terminal`, `status.outcome='manual'`, all players `{"won":false}`,
  idempotency, non-player rejected).
- **Vitest:** `waffle.ts` geometry, `colors.ts` render, `manifest`. The
  generator's `minSwaps` par lives in the edge function, covered by
  `deno test supabase/functions/waffle-build-board/gen_test.ts`.

## Phased build order

1. **Geometry + colors** (`lib/` + pgTAP `colors_test`) — pure logic first;
   everything depends on it.
2. **Generator** → a starter puzzle library (eyeball word quality before building
   the game around it).
3. **Schema + hidden-solution view + `create_game` + `submit_swap` (coop)** —
   playable coop end-to-end.
4. **Compete** — per-player rows, fewest-swaps terminal, opponent strip + RLS.
5. **FE polish** — drag-to-swap, swap counter, star rating, post-game reveal.

## Decisions (settled 2026-06-21)

- **Name:** brand **waffle**, codename **`waffle`** (see the header).
- **Coop working-state:** **(A)** one uniform `waffle.players` table for both
  modes, coop rows kept in lock-step (matches connections). The rejected
  alternative — a single shared board on `waffle.games` for coop — is described
  in the schema note above; flip to it only if the per-row redundancy ever bites.
- **`max_swaps`:** default `par + 5`, **configurable in `SetupForm`** (`extra_swaps`).
- **Compete tie-break:** equal swap counts → earliest `solved_at` (least time)
  wins. The finite budget means the game always terminates, timer or not.
- **Puzzles:** **generated on demand** by the `waffle-build-board` edge function
  (see [Board generation](#board-generation-waffle-build-board-edge-function)).
  This superseded the original vendored-library approach once player-selectable
  word filters made a pre-generated set multiply combinatorially.
