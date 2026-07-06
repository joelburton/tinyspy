# crosswords

A collaborative / competitive **crossword** — fill a grid so every across and
down entry matches its clue. A port of Joel's Fastify + WebSocket + SQLite
crossplay app (`~/src/crossplay`); the source code there is the spec for *what
the game does*, and this doc is the Supabase + React fit.

> **Brand ≠ codename.** The user-facing brand is **CrossPlay** (it lives only in
> the manifest `BRAND` const — see [docs/naming.md](../naming.md) and
> [[feedback_codename_brand_naming]]). Everywhere in *code / DB / schema / tests*
> the codename is `crosswords`. The build plan (all decisions resolved) is
> [docs/crosswords-plan.md](../crosswords-plan.md).

## 1. The game

A *puzzle* is the immutable imported template (grid shape + numbers + clues +
decorations + the answer key); a *board* is one playthrough. Players type
letters into open cells; the grid model carries **rebus** (multi-char fills),
**circled** / **shaded** theme cells, author-prefilled **given** cells,
irregular **hidden** blocks, and **Schrödinger** cells (a solution array with
more than one accepted answer). The solution is **server-only** — check / reveal
run server-side; the client never sees the answers until terminal.

Desktop-only / keyboard-required (crossplay explicitly scopes out touch — there
is no on-screen keyboard). This is a **documented v3 layout exception** (see §7).

### Modes (sibling-manifest pair)

- **`crosswords_coop`** (`[1, 8]`) — one **shared** grid; everyone's keystrokes
  are visible live (free-for-all). Solved → the team `won`. A manual mutual
  give-up (`end_game`) ends as a neutral **`ended`** ("finished") — not a loss;
  putting an unfinished crossword down is normal.
- **`crosswords_compete`** (`[2, 8]`) — the same puzzle, each player fills a
  **private** grid. The **first fully-correct grid wins outright** (`won_compete`
  + `status.winner_username`). Per-player **concede** (`common.concede`);
  dropping out never ends the table for the others.

Both manifests share `PlayArea` / `SetupForm` / `Help` / schema with
`baseGametype: 'crosswords'`; the mode split is exactly like boggle/stackdown.

## 2. Data model

Two puzzle sources, ONE table for only one of them:

- **`crosswords.puzzles`** — the curated, **CLI-imported library** only
  (`crosswords:import`, `source = 'library'`). `meta` is the whole template
  (`PuzzleTemplate` = PuzzleMeta + the initial grid cells) in one jsonb column;
  `solution` is a **shielded** jsonb column (column grants: `authenticated` gets
  every column *except* `solution`; a pgTAP `throws_ok` pins that).
- **NYT games carry their puzzle inline** — an NYT import does **not** write a
  `puzzles` row (that's the curated library). It passes the fetched
  `{ meta, solution }` straight into `create_game`'s inline `board` arg (like
  boggle), producing a self-contained game with `puzzle_id` null.

`crosswords.games` (`id`, `club_handle`, `mode`, `puzzle_id` nullable,
`meta`, shielded `solution`) copies the template at create time so a game
survives puzzle retirement. `games_state` (a `security_invoker` view over a
definer `_solution_for`) exposes `solution` **only at terminal**.

`crosswords.cells` — the live per-cell fills. **Only fillable, NON-given cells
get a row** (blocks / numbering / decorations / givens are static in
`games.meta`); one shared grid for coop (`owner_id` null), one grid **per
player** for compete. Notable shapes (see the plan's pressure-test):

- **Surrogate `id uuid` PK** even though the logical key is
  `(game_id, owner_id, row, col)` — a realtime-published table with no valid
  replica identity makes Postgres reject every UPDATE, and the nullable
  `owner_id` disqualifies both a plain PK and a `USING INDEX` identity. The
  logical key is `unique nulls not distinct (…)` (the repo's first use).
- **`version`** bumped by trigger; the FE reconciles CDC "newer wins".
- **Mode-aware RLS** modeled on `wordle.guesses_select`: coop — any member reads
  the shared grid; compete — only your own rows until terminal. **This gates the
  RLS-filtered READ, not the Realtime payload** — the CDC event for an
  opponent's cell still arrives, so `useCells` drops non-self events in compete
  (this repo does not rely on Realtime to withhold rows; see `psychicnum.md`).

## 3. Match semantics (mirror `ws.ts`, not prose)

The fill-vs-solution comparison + the solve/check treatment of pencil, empty,
and given cells are mirrored **from crossplay's `ws.ts`** (`fillMatchesSolution`,
`isPuzzleSolved`, `applyCheck`) — the plan's prose was subtly off in two ways,
pinned in pgTAP:

- **First-letter acceptance is keyed on the candidate's length (a rebus), not
  on the number of candidates.** `_matches` accepts a bare first letter for any
  multi-*character* candidate answer (`length(s.ans) > 1`, e.g. `"HEART"` → `"H"`)
  — a long-standing NYT typing shortcut. This mirrors `fillMatchesSolution`'s
  per-candidate `sol.length > 1` check. So a single-candidate rebus DOES accept
  its first letter; a Schrödinger cell whose candidates are all single letters
  does not. (The plan's amendment #13 misread `sol.length` as the array length
  and framed this as "Schrödinger-only" — corrected here and in the migration.)
- **Solve does NOT skip pencil.** `_is_solved` counts a pencil cell whose letter
  is right (pencil is a confidence marker). Only *check* skips pencil. An empty
  cell blocks solve.

Given cells are correct by construction and aren't in the `cells` table, so the
solved-check reads `cells` + `solution` only (no `meta` join).

## 4. RPCs (all `security definer`, revoke-public / grant-authenticated)

Because definer functions read the shielded `solution`, check and reveal are
plain RPCs — no edge function needed.

| RPC | behavior |
|---|---|
| `create_game(target_club, setup, player_user_ids, mode, board default null)` | `board` null → library path (copy from `puzzles` by `setup.puzzle_id`); `board = {meta, solution}` → inline path (NYT). Pre-inserts `cells` (per player in compete). |
| `set_cell(target_game, row, col, fill, pencil)` | The hot path (one call per keystroke; FE echoes optimistically first). Guards: membership, `play_state`, not conceded, cell editable (given cells have no row; **revealed cells ARE editable** — mirror `applyFill`), `char_length ≤ 8`. Returns the bumped `version` + solved state. Solved → terminal per mode; compete first-correct-wins uses a locked `play_state` re-check so only the first solver sets the winner. |
| `check_cells(target_game, cells jsonb)` | FE resolves letter/word/puzzle scope via `cursor.ts` and sends coordinates; server sets/clears `wrong` (skipping empty/pencil). Both modes. |
| `reveal_cells(target_game, cells jsonb)` | Writes the canonical answer + `revealed`, clears wrong/pencil. **Coop only** (reveal-all would trivially win the compete race). |
| `end_game(target_game)` | Coop mutual give-up → neutral `ended` ("finished"), solution revealed in terminal. |
| `concede` / `submit_timeout` | Standard. Crosswords has **no timer** (timerMode none), so `submit_timeout` is never invoked in practice. |

## 5. Puzzle sourcing

- **`crosswords:import`** (`supabase/scripts/crosswords/`) — ports crossplay's
  `.puz` (via `puzjs`) + `.ipuz` parsers + the `content_hash` dedup into a Node
  CLI. Reads a **git-ignored** `supabase/data/crosswords/` folder (Joel keeps his
  own puzzle files; nothing committed). After `db:reset` the library is empty
  until re-run — same posture as the other library games.
- **`crosswords-import-nyt`** edge function — fetches an NYT daily by date
  (list-by-date → first `Normal` puzzle → v6 JSON; browser User-Agent +
  `NYT_COOKIE_JAR` cookie secret **mandatory**), converts via the pure
  `src/crosswords/lib/nyt.ts` (unit-tested), then `create_game(board=…)` as the
  caller. Overlay-PNG analysis (circles-on-shaded + bars on a minority of themed
  puzzles) is **deferred** — normal dailies convert fully. Local cookie setup:
  put `NYT_COOKIE_JAR=<raw JSON or base64>` in `supabase/functions/.env` and
  `supabase functions serve crosswords-import-nyt --env-file …`.

## 6. Server surface + parsers (the shared-code seam)

The parsers + content-hash are Node CLI code; the NYT conversion is **pure TS in
`src/crosswords/lib/`** so the SAME code backs the FE, the Deno edge function
(imported with `.ts` specifiers, like boggle), and the vitest tests.
`contentHashPayload` builds the dedup string, and the **CLI import** hashes it
with `node:crypto` to dedup re-imports into `crosswords.puzzles`. The NYT edge
function does **not** hash — it creates a self-contained inline game (no
`puzzles` row), so `content_hash` never comes up on that path.

## 7. Frontend (`src/crosswords/`)

The play surface ports crossplay's `PuzzleView` layout — **a documented v3
layout exception** (see [docs/design-decisions.md → Info column](../design-decisions.md)):
a CSS grid with the board on the left spanning full height, the **Across | Down**
clue columns top-right (scrolling internally), a **3-line active-clue bar** that
doubles as the local-feedback slot, and a slim chrome strip (the action row).
`.wrap` is bound to `calc(100vh - var(--game-chrome-height))` so the
`min-height: 0` chain engages — the board fills, the clue lists scroll, the page
never scrolls. Board sized in `em` off a computed cell font-size, `100dvh`.

- **`lib/cursor.ts`** — the pure navigation module, ported **verbatim** (36
  tests). Reads only `kind`/`number`, so it runs on the static template grid.
- **`useCells`** — the documented deviation from `useRealtimeRefetch`: applies
  CDC row payloads **directly** (per-cell `version` "newer wins") with optimistic
  `set_cell` echo + compete owner-drop, refetch only on `SUBSCRIBED`.
- **`useGridKeyboard`** — letters (fill + advance), Backspace (two-step),
  Space, arrows / Shift+arrows, Tab / Shift+Tab (jump clue), Shift+Enter (rebus
  overlay). Bails inside inputs (`isNonGameField`) + on Ctrl/Meta.
- **Controls** — pen/pencil toggle + Check and (coop-only) Reveal at
  letter/word/grid scope (scope resolved client-side via `cursor.ts`).
- **Peer cursors** (coop) — `usePeerCursors` broadcasts the local cursor on a
  stable-name channel (Pattern B) + Presence for disconnect cleanup; the Grid
  draws a thin frame in each teammate's color. Compete has private grids, so it's
  disabled there.
- **Scratchpad** — the shared `common/` feature (opt-in via the manifest
  `scratchpad` field): shared pad in coop (Broadcast takeover lock), private pad
  per player in compete. See [docs/deferred.md](../deferred.md) → scratchpad.
- **Terminal** — on coop give-up the blank cells fill with the greyed revealed
  answers (`games_state.solution`, fetched at terminal).

### Printing the board (PDF) — a deliberate whole-cloth exception

`src/crosswords/pdf/` is a **verbatim port** of crossplay's own jsPDF printer
(its 12-unit layout grid, clue pagination, cell renderer), NOT the shared
`common/pdf` frame — it keeps crossplay's title block and adds no Setup section
(plan decision 7). The answer-key generator (`generateSolutionPdf`) is dropped
(the FE has no solution). Exposed as the standard "Print board (PDF)"
`menu.setGameItems` item; the grid is snapshotted at click-time. See
[docs/pdf.md](../pdf.md) → the grid-plus-clue-columns body family.

## 8. Tests

- pgTAP `supabase/tests/crosswords/` — create (library + inline board) / gameplay
  (set_cell, check, reveal, `_matches`) / win (solve, pencil-counts,
  first-correct-wins) / rls (compete privacy) / concede + give-up. Plus
  `common/scratchpad_test.sql`.
- Vitest — `lib/cursor.test.ts`, the parser tests (`supabase/scripts/crosswords/`),
  `lib/nyt.test.ts`, `pdf/*.test.ts`.
- e2e `e2e/crosswords.e2e.ts` (solve, check+reveal+give-up-reveal, compete win,
  no-scroll on a full-size puzzle, print-PDF download, peer cursors) +
  `e2e/scratchpad.e2e.ts`.

## 9. Deferred / future

- **NYT overlay-PNG analysis** — circles-on-shaded + word-break bars on a
  minority of themed puzzles; needs a Deno PNG decoder. Normal dailies unaffected.
- **NYT dedup** — inline NYT games aren't stored, so re-fetching a date makes a
  new game (fine; NYT was always kept out of the library).
- **Rebus "collapse" toggle, cryptic edge marks, AI "Explain"** — cryptic
  apparatus from crossplay, dropped for v1.
