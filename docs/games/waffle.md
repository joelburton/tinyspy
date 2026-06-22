# SyrupSwap (codename `waffle`)

**Status: BUILT** — coop + compete, server + frontend. This began as the
scoping doc and the design below still holds; it's now implemented in migration
`20260624000000_waffle.sql`, the `src/waffle/` frontend, and the pgTAP
(`supabase/tests/waffle/`) + Vitest (`src/waffle/lib/*.test.ts`) suites.
Remaining polish is minor (recently-swapped tile flash; a "real" non-difficulty
puzzle library when we're past tier-trialling).

**Brand name vs codename.** The user-facing brand is **SyrupSwap** — it's the
manifest `title` and the wording in any end-user copy (game listing, help,
messages). Everywhere in *code* the codename is **`waffle`**: the SQL schema,
the `src/waffle/` folder, component names, table/column names, variables, test
files, gametype strings (`waffle_coop` / `waffle_compete`). SyrupSwap is a
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
wordknit / freebee follow (a `mode` column on `waffle.games`, a `mode` arg on
`create_game`, mode-aware RLS). Per [Joel, 2026-06-20]:

- **Coop** — one shared board, one shared swap budget; **either player can
  swap** and everyone sees it. "Like wordknit coop" — players' working rows
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
view — the freebee / psychicnum hidden-answer pattern).

Working state lives in `waffle.players`, **one table for both modes**. Compete
forces a per-player row (each player solves their own copy, with their own
`board` + `swaps_used`). Coop *could* instead keep a single shared board as
columns on `waffle.games`, but we reuse the same per-player table and keep every
coop player's row **identical**, updating them all on each swap ("lock-step").
That gives one storage shape, one read path, and one view for both modes —
exactly how `wordknit` handles its coop counters. The only cost is storing the
25-char board redundantly across a handful of rows; trivial.

| table | purpose |
|---|---|
| `waffle.puzzles` | The generated library (see below). `id`, `solution` (25-char), `scramble` (25-char), `par_swaps`, `difficulty` (35/50/60 — the vocab tier; `create_game` picks by it), `title` ("Difficulty N", the game-listing label). The 6 words derive from `solution` via geometry. |
| `waffle.games` → `common.games(id)` | `club_handle`, `mode` (`coop`/`compete`), `puzzle_id`, `scramble` (exposed), `max_swaps`, and **`solution` (HIDDEN** — column-grant revoked; revealed post-terminal). Solution/scramble are copied from the puzzle so the game is self-contained (same reasoning as `wordknit.games.board`). |
| `waffle.players` PK `(game_id, user_id)` | Per-player working state: `board` (25-char, starts = `scramble`), `swaps_used`, `solved`, `solved_at`. **Coop:** every row updates in lock-step. **Compete:** rows are independent. |

### Views (`security_invoker`)

- **`waffle.games_state`** — `mode`, `scramble`, `max_swaps`; `solution` only
  when `common.games.is_terminal` (via a `SECURITY DEFINER` helper, exactly the
  freebee `_scoring_words_for` shape).
- **`waffle.players_state`** — `board`, `swaps_used`, `solved`, `solved_at`, **+
  computed `colors`** (a `SECURITY DEFINER` helper
  `_player_colors_for(g_id, row_user)` that reads the hidden `games.solution`
  and wraps the pure `compute_colors(board, solution)`). Colors are visible
  during play (they *are* the gameplay); the full solution is not.

### RLS (mode-aware)

Read gating on club membership (`common.is_club_member`), like every game. The
mode-aware twist (freebee precedent): in **compete**, an opponent's
`board`/`colors` are hidden mid-game — expose only their `swaps_used` + `solved`
(a lean opponent-progress projection, like freebee's rank-only visibility) — and
everything reveals post-terminal. **Coop** shows the shared board to all members.

## RPCs

- **`create_game(target_club, setup, player_user_ids, mode)`** — sibling-manifest
  signature. Validates `require_club_member`, `require_player_count_max`,
  `validate_timer`; validates `setup.extra_swaps` (0..15, default 5) and
  `setup.difficulty` (35/50/60); picks a `waffle.puzzles` row of that difficulty
  the club hasn't played (subquery against `waffle.games`, fallback to any of
  that tier); copies solution/scramble onto `waffle.games`; sets
  `max_swaps = par_swaps + setup.extra_swaps`; seeds one `waffle.players` row per
  player with `board = scramble`.
- **`submit_swap(game, pos_a, pos_b) → jsonb`** — the core move. Guards: playing
  state, `require_game_player`, both positions filled (non-hole) and distinct,
  swaps remaining. Then:
  - **coop:** apply the swap to **all** players' rows (lock-step), `swaps_used++`.
  - **compete:** apply to the caller's row only.
  - Returns `{ colors, swaps_used, solved, terminal }`.
- **`submit_timeout(game)`** — only when a countdown timer is set; reuse the
  freebee "realtime touch" pattern so the FE wakes up on expiry.
- **`end_game(game)`** — the manual "End game" menu item (both modes). A
  *neutral* terminal: writes the uniform `play_state='ended'` (not waffle's
  intrinsic `won`/`lost`/`*_compete`), every player `{"won": false}`, and
  `status = {outcome:'manual', mode}`. Any game player can call it; idempotent
  (a second call raises `P0001 'game is not in progress'`, swallowed by the FE).
  Same "realtime touch" tail as `submit_timeout` so the FE refetches and reveals
  the solution. The FE renders a neutral green "Game ended" card (it reuses
  `GameOverModal` `outcome:'won'` purely for the green styling — the verdict copy
  says there's no winner). `buildOver` / `labelFor` both branch on `'ended'`
  before their win/lose branches. Modeled exactly on `freebee.end_game`.

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

## Puzzle generation

**No external corpus** (unlike wordknit's found Connections collection) — we
generate our own offline and ship them as a committed artifact. The pipeline
mirrors `common.words`:

> **generate (dev tool, no DB) → commit `waffle-puzzles.tsv.gz` → `waffle:import`
> (psql COPY) → `waffle.puzzles`**

Deploys stay fast (a COPY, no constraint-solving in the hot path) and the puzzle
set is reviewable + stable in git. ~5k puzzles ≈ 300 KB raw / ~100 KB gzipped.

### `scripts/generate-waffle-puzzles.ts` (dev tool)

1. Read `supabase/data/words.tsv.gz` directly (gunzip + filter — no DB). For each
   tier N, the candidate set = `len == 5 AND difficulty ≤ N AND (american OR
   british) AND NOT slur` (no `s`-exclusion — that's freebee-only), and a puzzle
   is kept only if its hardest word is **exactly** N (so the tier is meaningful).
   ~thousands of words per tier.
2. **Fill** (the trick that makes it fast): fixing the 3 *across* words fixes the
   3 *down* words' intersection letters. Precompute an index
   `(char@0, char@2, char@4) → [words]`; loop/sample `a0,a2,a4`, then the down
   words are three O(1) bucket lookups against patterns `a0[0]_a2[0]_a4[0]`,
   `a0[2]_a2[2]_a4[2]`, `a0[4]_a2[4]_a4[4]`. All three non-empty → a valid waffle.
   Dedupe by solution; require all 6 words distinct.
3. **Scramble + par.** Permute the 21 solution letters into a mostly-wrong
   arrangement; compute `par_swaps` = min transpositions to solve. With duplicate
   letters this is "min swaps to sort with dupes" — pick the same-letter→position
   assignment that **maximizes cycles** (`swaps = positions − cycles`). Keep only
   scrambles whose par lands in a band (≈ 9–11).
4. **Quality filters** (light): reject a down word equal to an across word; cap
   total letter repetition so colors stay informative.
5. Emit `solution, scramble, par_swaps, difficulty, title` rows →
   `supabase/data/waffle-puzzles.tsv.gz` (committed). `npm run waffle:generate [N]`
   makes N puzzles per tier (default 100) at 35/50/60. **A tier-N puzzle's hardest
   word is exactly N** (`tierGenerator` requires `max(word difficulties) === N`),
   so a tier-50 puzzle genuinely *uses* a 50-level word, not merely allows one.

Two pieces to build test-first: the **par computation** (cycle-maximizing
assignment with duplicates — if it's off by 1 it only nudges the star rating, not
solvability, since the budget is generous) and the quality filters.

### `scripts/import-waffle-puzzles.ts`

`npm run waffle:import` — psql `\copy` (TRUNCATE + reseed) of
`waffle-puzzles.tsv.gz` into `waffle.puzzles`, same transport as `words:import`.
Wired into `import-to-hosted.sh` (step 8d, after wordknit).

## Frontend (`src/waffle/`)

Mirrors the other game folders:

- `manifest.ts` — the `waffle_coop` + `waffle_compete` sibling pair (gametype
  strings stay codenamed; the manifest `title` is the brand **SyrupSwap**).
- `db.ts` — `supabase.schema('waffle')`.
- `hooks/useGame.ts` — projects `games_state` + `players_state`; two-table
  realtime subscription on `waffle.{games, players}`.
- `lib/waffle.ts` — geometry (shared); `lib/colors.ts` — render only (server is
  authoritative for the actual colors).
- `components/` — `WaffleGrid` (the 5×5 lattice, tap-A-then-tap-B or
  drag-to-swap, colored tiles — reuse the TinySpy keycard color tokens),
  `SwapCounter`, `SetupForm` (timer + the extra-swaps difficulty knob), `Help`,
  and the shared `common/components/OpponentStrip` for compete (a `metricFor`
  returning swaps-used + a ✓/✗ mark — the same strip freebee/wordknit/psychicnum
  use, differing only in the metric cell).

Presence-pause is inherited free via `<GamePage>` + `useCommonGame`. Live
drag-preview via Broadcast (wordknit's peer-selection trick) is a nice-to-have —
defer.

## Testing

- **pgTAP:** `colors_test` (the duplicate-letter algorithm — *the* priority),
  `create_game_test`, `gameplay_test` (coop lock-step + compete independence),
  `compete_test` (fewest-swaps winner + `solved_at` tie-break + all-fail),
  `timeout_test`, `end_game_test` (manual neutral end → `'ended'`, both modes:
  `is_terminal`, `status.outcome='manual'`, all players `{"won":false}`,
  idempotency, non-player rejected).
- **Vitest:** `waffle.ts` geometry, `colors.ts` render, `manifest`, and the
  generator's par computation.

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

- **Name:** brand **SyrupSwap**, codename **`waffle`** (see the header).
- **Coop working-state:** **(A)** one uniform `waffle.players` table for both
  modes, coop rows kept in lock-step (matches wordknit). The rejected
  alternative — a single shared board on `waffle.games` for coop — is described
  in the schema note above; flip to it only if the per-row redundancy ever bites.
- **`max_swaps`:** default `par + 5`, **configurable in `SetupForm`** (`extra_swaps`).
- **Compete tie-break:** equal swap counts → earliest `solved_at` (least time)
  wins. The finite budget means the game always terminates, timer or not.
- **Puzzles:** **vendored only** — we pre-generate a library and ship it; **no**
  daily/live edge-function generator (we don't need fresh-per-day puzzles).
