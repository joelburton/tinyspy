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
  Note the compete RLS *opens* opponents' rows at terminal, but the **FE never
  renders them** — `useCells` stays filtered to the caller's own owner and
  PlayArea draws one grid (decision C5, `design-decisions.md`). The terminal
  opening is deliberately-unused surface, not a delivered feature.

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
| `set_cell(target_game, row, col, fill, pencil)` | The hot path (one call per keystroke; FE echoes optimistically first). Guards: membership, `play_state`, not conceded, cell editable (given cells have no row; **revealed cells ARE editable** — mirror `applyFill`), fill = letters only, 1–8 chars (`^[A-Z]{1,8}$`, mirroring crossplay's ws.ts). Returns the bumped `version` + solved state. Solved → terminal per mode; compete first-correct-wins uses a locked `play_state` re-check so only the first solver sets the winner. |
| `set_mark(target_game, row, col, side, mark)` | Set/clear a cryptic word-break / hyphen mark on the cell's `right` / `bottom` edge (`mark` = `break` / `hyphen` / null). Same guards as `set_cell`; display-only (no solve). Marks live in `cells.mark_right` / `mark_bottom` and sync via the same CDC path. **Fillable cells only** (a mark rides on the *left/upper* cell of a boundary, and givens have no cell row — so a break on a given's own right/bottom edge isn't representable; a rare cryptic-with-givens case, deliberately not supported). Ported from crossplay's edge marks. |
| `reveal_solved_word(target_game, cells jsonb)` | **Leak-safe** answer read for the AI "Explain clue" feature: returns the canonical answer for `cells` **only if the caller has already filled them all correctly** (`_matches`, honoring givens) — else `solved = false`, no letters. So it can only surface a word you've already solved (safe in compete too). Also returns the puzzle note (not secret). Consumed by the `crosswords-explain-clue` edge function. |
| `check_cells(target_game, cells jsonb)` | FE resolves letter/word/puzzle scope via `cursor.ts` and sends coordinates; server sets/clears `wrong` (skipping empty/pencil). Both modes. |
| `reveal_cells(target_game, cells jsonb)` | Writes the canonical answer + `revealed`, clears wrong/pencil. **Coop only** (reveal-all would trivially win the compete race). On success the FE broadcasts the revealed coords on the peer channel so teammates flash them in the actor's color (the CDC arrives colorless). |
| `clear_board(target_game)` | Destructive "start over" (crossplay parity): blanks every fillable cell on the caller's grid (the shared grid in coop, own in compete) and drops its `pencil` / `wrong` / `revealed` flags + cryptic edge marks. Givens live on the template, so they're preserved; the answer is untouched. Guards: membership, `play_state = playing`, not conceded. No solve check (clearing only removes fills). FE surfaces it as a **confirmed** game-menu item. |
| `end_game(target_game)` | Coop mutual give-up → neutral `ended` ("finished"). Terminal unshields the solution (`games_state`), but the FE only shows it on demand — the "Reveal board" menu item (§7 → Terminal). |
| `concede` / `submit_timeout` | Standard. Crosswords has **no timer** (timerMode none), so `submit_timeout` is never invoked in practice. |

## 5. Puzzle sourcing

Three sources, exposed as three tabs in the setup form (Library / NYT by date /
Upload file):

- **`crosswords:import`** (CLI, `supabase/scripts/`) — bulk-imports crossplay's
  `.puz` / `.ipuz` files + the `content_hash` dedup into the curated
  `crosswords.puzzles` library. Reads a **git-ignored** `supabase/data/crosswords/`
  folder (Joel keeps his own puzzle files; nothing committed). After `db:reset`
  the library is empty until re-run — same posture as the other library games.
  The parsers themselves live in **`src/crosswords/lib/parse/`** (see §6).
  Author-side companions (ported from crossplay): **`crosswords:puz-to-ipuz`**
  (convert a `.puz` → `.ipuz` via `parsePuzBuffer` + `writeIpuz`) and
  **`crosswords:set-note`** (patch a `note` into a note-less `.puz` — relevant
  because the cryptic gating keys off "puzzle has a note").
- **Saved-fill restore** — a partially-solved `.ipuz` (whether imported or
  uploaded) carries the solver's in-progress fills as its ipuz `saved` grid; the
  parser applies them onto the non-given template cells, and `create_game` seeds
  `crosswords.cells.fill` from them (uppercased). So a half-finished puzzle
  imports where you left off — crossplay's `saved` round-trip, the counterpart to
  **Download as .ipuz** (§9). Blank library/NYT templates carry no fills, so this
  is a no-op there.
- **In-app upload** — the setup form's "Upload file" tab parses a dropped /
  chosen `.puz` / `.ipuz` **entirely client-side** (`lib/importFile.ts` →
  `lib/parse/`; puzjs is a dependency-free `Uint8Array` reader, so it bundles in
  the browser) into the inline board, then `create_game(board=…)` directly — a
  self-contained game, no `puzzles` row (like NYT). The parsed board rides in the
  FE-only `setup.board` and is **stripped** before create_game stores the setup,
  so the solution never lands in the unshielded status / saved-default. The strip
  is **belt-and-braces** across three layers, because a parsed board can linger
  in `setup` after a source tab-switch (the SetupForm segment buttons spread the
  prior setup): `startGameInClub` deletes `board`/`filename` *unconditionally*
  (not just on the upload tab), the tab buttons clear them when leaving Upload,
  and `create_game` itself runs `setup := setup - 'board' - 'filename'` as a
  server backstop — the real inline puzzle always rides as the separate `board`
  arg, so it's never wanted in the persisted setup regardless of what the FE sends.
- **`crosswords-import-nyt`** edge function — fetches an NYT daily by date
  (list-by-date → first `Normal` puzzle → v6 JSON; browser User-Agent +
  `NYT_COOKIE_JAR` cookie secret **mandatory**), converts via the pure
  `src/crosswords/lib/nyt.ts` (unit-tested), then `create_game(board=…)` as the
  caller. Overlay-PNG analysis (circles-on-shaded + bars on a minority of themed
  puzzles) is **deferred** — normal dailies convert fully. Local cookie setup:
  put `NYT_COOKIE_JAR=<raw JSON or base64>` in `supabase/functions/.env` and
  `supabase functions serve crosswords-import-nyt --env-file …`.

## 6. Server surface + parsers (the shared-code seam)

The `.puz` / `.ipuz` parsers live in **`src/crosswords/lib/parse/`** (`puz.ts`,
`ipuz.ts`, `format.ts`) as **dual-runtime** modules taking a `Uint8Array`: the
Node import CLI (`supabase/scripts/crosswords/convert.ts`) and the browser upload
(`lib/importFile.ts`) both consume them. The NYT conversion is likewise **pure TS
in `src/crosswords/lib/`** so the SAME code backs the FE, the Deno edge function
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
- **`useGridKeyboard`** — the full grid key set (ported from crossplay's
  PuzzleView): letters (fill + advance), Backspace (two-step) / Shift+Backspace
  (clear word), Space (advance) / Shift+Space (read-only zoom-peek of a squeezed
  rebus), arrows / Shift+arrows (word edge), Tab / Shift+Tab (jump clue),
  Shift+Enter (rebus overlay), `#` (jump-to-number popup), `|` / `_` (cycle the
  right / bottom cryptic edge mark → `set_mark`). Bails inside inputs
  (`isNonGameField`), when a modal is `suspended`-ing the board, + on Ctrl/Meta.
  - **⌥-letter shortcuts** (crossplay parity — the port's identity is
    keyboard-first): **⌥P** pen/pencil, **⌥C** / **⌥⇧C** check letter / word,
    **⌥R** / **⌥⇧R** reveal letter / word (coop only), **⌥N** show note, **⌥X**
    explain cryptic clue, **⌥S** scratchpad. Handled before the Ctrl/Meta/Alt
    bail and keyed on `e.code` (physical key) so Mac ⌥ dead-keys (⌥C = ç,
    ⌥N = ˜) don't matter; the write actions are inert once the board is
    read-only (terminal). They dispatch through a stable `actionsRef` so the
    keyboard hook needn't list the (later-declared) Controls/menu handlers in
    its deps. **⌥M menu is NOT wired** (the shell exposes no programmatic menu
    open); note the check/reveal *puzzle* scope has no shortcut (menu-only),
    matching crossplay. Two more shortcuts are shell-global (any game): **⌥⌫**
    End/Concede, **⇧<** Back to club — see [ui.md → GamePage menu](../ui.md#gamepage-menu).
- **Controls** — pen/pencil toggle + Check and (coop-only) Reveal at
  letter/word/grid scope (scope resolved client-side via `cursor.ts`). The
  **same actions are ALSO listed in the game menu** with their ⌥-shortcut hints
  (`MenuItem.shortcut`) — crossplay advertised them there, and the menu is where
  a mouse user discovers the shortcut. Both surfaces dispatch through the shared
  `actionsRef`, so there's one binding, two entry points.
- **Rebus / peek overlay** — the `Grid` renders a 3-cell-wide box centered +
  clamped over the cursor cell: an editable `RebusInput` (Enter commits +
  advances, Tab / Shift+Tab commits + jumps clue, Esc/blur cancels) or, for
  Shift+Space, a read-only peek of the current fill.
- **Peer cursors + fills** (coop) — `usePeerCursors` broadcasts the local cursor
  AND each fill on a stable-name channel (Pattern B) + Presence for disconnect
  cleanup; the Grid draws a thin frame in each teammate's cursor color and
  briefly flashes a cell a teammate just filled in their color (the cells CDC
  carries no writer color, so the flash needs its own tiny signal). A **coop
  reveal** flashes too — the FE batch-broadcasts the revealed coords (`fills`
  event) after a successful `reveal_cells`, since that RPC's CDC is also
  colorless. The channel additionally carries a **`showNotes`** event: "Show
  note" opens the setter's note locally AND asks teammates to open it too
  ("read it together", crossplay parity). Compete has private grids, so all of
  it is disabled there.
- **Scratchpad** — the shared `common/` feature (opt-in via the manifest
  `scratchpad` field): shared pad in coop (Broadcast takeover lock), private pad
  per player in compete. See [docs/common.md](../common.md) → "The shared
  scratchpad" for the architecture.
- **Terminal** — the board is **not** auto-revealed at game end: the blanks
  stay blank until someone picks the **"Reveal board"** game-menu item, which
  fetches `games_state.solution` and fills the blank cells with the greyed
  answers. The item is disabled mid-game (the server only unshields the
  solution at terminal) and disables itself once revealed.

### Printing the board (PDF) — a deliberate whole-cloth exception

`src/crosswords/pdf/` is a **verbatim port** of crossplay's own jsPDF printer
(its 12-unit layout grid, clue pagination, cell renderer), NOT the shared
`common/pdf` frame — it keeps crossplay's title block and adds no Setup section
(plan decision 7). The answer-key generator (`generateSolutionPdf`) is dropped
(the FE has no solution). Exposed as the "Print / Save as PDF" game-menu item
(one of the `setGameSections` items); the grid is snapshotted at click-time. See
[docs/pdf.md](../pdf.md) → the grid-plus-clue-columns body family.

**The game menu** is the fullest in the app — crosswords builds its whole menu
via `ctx.menu.setGameSections` + the shared `buildGameMenu` helper (see
[ui.md → GamePage menu](../ui.md#gamepage-menu)), reproducing crossplay's
single-column layout in order: **Help** · pencil (⌥P) / Enter rebus (⇧↵) /
Collapse rebuses · Show note (⌥N) / Explain cryptic clue (⌥X) / Scratchpad (⌥S)
/ Print (⌥ none) / Download as .ipuz · Check letter (⌥C) / word (⌥⇧C) / puzzle ·
Reveal letter (⌥R) / word (⌥⇧R) / puzzle *(whole section coop-only)* · Clear
board / Reveal board · **End game / Concede game** (⌥⌫) · **Back to club** (⇧<).
The play actions dispatch through the stable `actionsRef`. Notables: **Collapse
rebuses** is a display-only toggle (persisted per browser) that shows multi-char
rebus fills as just their first letter; **Download as .ipuz** emits the current
board — template + fills + the answer grid (fetched via the `solution_for` RPC,
which relaxes the shielding on demand) — via the ported `writeIpuz`, re-uploadable
to continue; **Show note** (`NoteDialog`) also
broadcasts a `showNotes` event in coop so teammates open it together;
**Clear board** is the destructive `clear_board` "start over" (`window.confirm`
-gated); **Reveal board** is the terminal-only answer key (see *Terminal*
above). The menu is long, so the popover scrolls — the page never does.

Because the board reads `window` keydowns for cursor movement, the shared
`Menu` is given **`returnFocusOnClose={false}`** by GamePage: on close the
trigger blurs (focus falls to `<body>`) instead of retaining focus, so arrows
resume moving the cursor rather than reopening the menu; and `Menu` now
`stopPropagation`s keydowns on its trigger + popover so arrowing through the
menu never doubles as a board move. (See `Menu.tsx` — the behavior is opt-in so
non-game menus keep standard Esc-restores-focus a11y.)

## 8. Tests

- pgTAP `supabase/tests/crosswords/` — create (library + inline board) / gameplay
  (set_cell, check, reveal, set_mark, `_matches`) / win (solve, pencil-counts,
  first-correct-wins) / rls (compete privacy) / concede + give-up. Plus
  `common/scratchpad_test.sql`.
- Vitest — `lib/` (`cursor`, `nyt`, `importFile`, `marks`, `enumeration`),
  `hooks/useCells.test.ts`, `pdf/*.test.ts`, and the parser + content-hash tests
  next to the CLI (`supabase/scripts/crosswords/`).
- e2e `e2e/crosswords.e2e.ts` — solve; check/reveal + the terminal "Reveal
  board" menu flow (disabled mid-game, blanks stay blank until clicked);
  compete win; compete privacy (opponent never sees your letters); coop peer
  cursors + shared-fill sync; keyboard (rebus, pencil, Backspace two-step, `#`
  jump); cryptic `|`/`_` marks; menu gating (Show note / Explain cryptic clue);
  upload via the setup form; print-PDF download; no-scroll on a full-size
  puzzle. Plus `e2e/scratchpad.e2e.ts`.

## 9. Deferred / future

- **NYT overlay-PNG analysis** — circles-on-shaded + word-break bars on a
  minority of themed puzzles; needs a Deno PNG decoder. Normal dailies unaffected.
- **NYT dedup** — inline NYT games aren't stored, so re-fetching a date makes a
  new game (fine; NYT was always kept out of the library).
- **`fetch-nyt-range` bulk CLI** (review M5) — a Node script to download a date
  range of NYT dailies into the library; still deferred (blocked on the
  `NYT_COOKIE_JAR` secret, same as the live NYT fetch). Workaround: run
  crossplay's script, then `crosswords:import`. Crossplay's other author tools
  **did** ship — see §11.
- **`generateSolutionPdf` (answer-key PDF)** — not ported. Now cheap given the
  `solution_for` RPC (M4) hands the FE the answer grid on demand; do it if wanted.

The crossplay apparatus is otherwise **fully ported**: cryptic edge marks
(`|`/`_`, `set_mark`), the AI **"Explain cryptic clue"** (§10), the **rebus
collapse** toggle (§9 menu), **Download as .ipuz** (M4), the **saved-fill
restore** on import (§6), and chat **URL linkify** (a common feature now).

## 10. AI "Explain cryptic clue"

A game-menu item that asks Claude to **explain** (not solve) how the current
cryptic clue yields its answer — ported from crossplay's clue-explainer +
Anthropic prompt, modernized to this repo's edge-function pattern (mirrors
`codenamesduet-suggest-clue`: `npm:@anthropic-ai/sdk`, native adaptive thinking,
`[explain-clue] anthropic response:` log kept).

- **Menu gating.** The item is disabled when the puzzle has no note (crossplay's
  cryptic proxy — a stable-per-game flag, so the menu isn't rebuilt per
  keystroke). At click time it snapshots the clue under the cursor (cells, text,
  enumeration) via a ref.
- **Never a spoiler.** The answer is the shielded solution, so the FE sends the
  clue's cells and the `reveal_solved_word` RPC hands back the canonical answer
  **only if the caller has already filled that word correctly** (else the edge
  function returns 409 → "Solve this clue correctly first"). Safe in compete too.
- **Flow.** FE → `crosswords-explain-clue` edge fn → `reveal_solved_word`
  (answer + note) → Claude (system prompt + `{clue, enumeration, answer, note}`)
  → `{ explanation }` → `ExplainDialog` (on `FloatingPanel`, renders the
  `**bold**` Definition/Wordplay/Indicators prose).
- **Enumeration** (`lib/enumeration.ts`) is derived on the FE from the word's
  cryptic edge marks — `(7)`, `(4,3)`, `(3-2)` — mirroring crossplay.
- **Needs `ANTHROPIC_API_KEY`** on the edge function (like the NYT path needs
  `NYT_COOKIE_JAR`); without it the call returns 500, but the whole
  gate/plumbing (incl. the 409 leak-safety path) works without it.
