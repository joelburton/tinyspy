# crosswords

A collaborative / competitive **crossword** — fill a grid so every across and
down entry matches its clue. A port of Joel's Fastify + WebSocket + SQLite
crossplay app (`~/src/crossplay`); the source code there is the spec for *what
the game does*, and this doc is the Supabase + React fit.

> **Brand ≠ codename.** The user-facing brand is **CrossPlay** (it lives only in
> the manifest `BRAND` const — see [docs/naming.md](../naming.md) and
> [[feedback_codename_brand_naming]]). Everywhere in *code / DB / schema / tests*
> the codename is `crosswords`. **This doc is the canonical reference** — the
> build plan + the 2026-07-05 / -07-06 code-review docs it was built from have
> been retired into this file (see §9 for the deferred register they left behind).

## 1. The game

A *puzzle* is the immutable imported template (grid shape + numbers + clues +
decorations + the answer key); a *board* is one playthrough. Players type
letters into open cells; the grid model carries **rebus** (multi-char fills),
**circled** / **shaded** theme cells, author-prefilled **given** cells,
irregular **hidden** blocks, and **Schrödinger** cells (a solution array with
more than one accepted answer). The solution is **server-only** — check / reveal
run server-side; the page sees the answers only once the game has ended.

**Keyboard-required** (crossplay explicitly scopes out touch — there is no
on-screen keyboard, so it wants a hardware keyboard). Not desktop-only: it has
the phone layout — below the breakpoint the grid and the active-clue bar under
it are the main view, and the clue lists move to the info sheet — for a device
with a keyboard attached; a bare phone can't enter letters ([docs/mobile.md →
Input is the primary axis](../mobile.md#input-is-the-primary-axis)).

### Modes (sibling-manifest pair)

- **`crosswords_coop`** (`[1, 8]`) — one **shared** grid; everyone's keystrokes
  are visible live (free-for-all). Solved → the team wins (`reached_goal` /
  `solved`, everyone ranked 1). A manual mutual give-up (`stop_game`) ends as a
  neutral `stopped` — not a loss; putting an unfinished crossword down is
  normal.
- **`crosswords_compete`** (`[2, 8]`) — the same puzzle, each player fills a
  **private** grid. The **first fully-correct grid wins outright**: the solver
  alone is ranked 1, and the race ends when decided. Per-player **concede**
  (`common._concede`); dropping out never ends the table for the others, until
  the last racer's concession ends it as a loss. `stop_game` is offered in this
  mode too — the table agreeing the crossword beat them, neutral like coop's —
  though no board control reaches it yet (§7).

Both manifests share `PlayArea` / `SetupForm` / `Help` / schema with
`baseGametype: 'crosswords'`; the mode split is exactly like boggle/stackdown.

## 2. Data model

Two puzzle sources, ONE table for only one of them:

- **`crosswords.puzzles`** — the curated, **CLI-imported library** only (`gmake
  g-crosswords-puzzles`, `source = 'library'`). `puzzle_content` is the whole template
  (`PuzzleTemplate` = PuzzleMeta + the initial grid cells) in one jsonb column;
  `solution` is a **shielded** jsonb column (column grants: `authenticated` gets
  only `(id, source, puzzle_content, created_at)` — `solution` *and* `content_hash` are
  both withheld; a pgTAP `throws_ok` pins the `solution` shield).
- **NYT games carry their puzzle inline** — an NYT import does **not** write a
  `puzzles` row (that's the curated library). It passes the fetched
  `{ meta, solution }` straight into `create_game`'s inline `board` arg (like
  boggle), producing a self-contained game with `puzzle_id` null.

`crosswords.games` (`game_id`, `puzzle_id` nullable, `puzzle_date`,
`puzzle_content`, shielded `solution`, `revision`) copies the template at
create time so a game survives puzzle retirement; the mode and the club are
`common.games`'. `revision` is raised by every rebuild of the page blobs
(below).

**`crosswords.grids`** — what the players have written. One row per grid: one
shared grid for coop (`owner_id` null), one **per player** for compete,
`unique nulls not distinct (game_id, owner_id)`. A grid's `cells` is one sparse
jsonb keyed by place (`"row,col"`, `_make_cell_id`), holding only the cells
with something in them, so a blank grid is `{}`. A cell is an object of the
keys it has: `fill` (uppercase), `pencil`, `wrong`, `revealed`, `markRight`,
`markBottom` (`break` / `hyphen`), and in coop `writer`, who last filled it. A
false flag or a null is left out (`_merge_cell`). **Only open, non-given cells
have a place** (`_fillable_cells`, `_is_fillable`): blocks, numbers,
decorations and givens are the template's. A grid starts — at create and again
at Restart — with what the template already holds (`_make_starting_cells`: an
upload's saved letters, an NYT overlay's author bars).

**A write is one statement.** Every grid write is `update … set cells =
_merge_cell(cells, …)` (or a `||` of the cells it rebuilt), never a read into a
variable and a write back, and **every write locks the game row first**
(`_lock_game`), so the rebuilds serialize and none misses another's letter.

**No client reads a grid.** `crosswords.grids` has no grant: the page reads the
blobs, and a racer's view of a rival's grid is the seat rule's (below).

### The page blobs

`crosswords._rebuild_data_cols` writes them at create, at Restart and at the end
of every move, each assigned whole, and raises `revision` first:
`shell_data` through `common._make_json_shell_data`, and on top of the common
part of `game_data` and `summary_data` this game's own.
`crosswords._rebuild_data_cols_for_all()` rebuilds every crosswords game without
re-dating it. `static_game_data`, what nothing after create changes, is
written once by `_write_static_game_data`, from `create_game` and that
rebuild, never by a move ([common-schema.md → Title, page blobs and the two
dates](../common-schema.md#title-page-blobs-and-the-two-dates)); the hook merges
it into `game_data`, each key in its place.

| blob | crosswords' part |
|---|---|
| `static_game_data` | `puzzle`: the template as the parsers write it (id, title, author, copyright, note, width, height, clues, cells) |
| `game_data` | `puzzle: {solution}`, null until the game ends. `revision`. `team: {board}` in coop, null in compete; on each racer `board` in compete, null in coop |
| `summary_data` | `nCells`, the cells a player fills, and `team: {nFilledCells}` in coop, null in compete — the club card's "60% filled" |

crosswords' one fact (`GFacts`) is `board`. `useGame` unpacks it onto every
player twice — spread on, the side's (coop's one grid, the same object on
every player; a racer's own in compete); under `own`, their own, which in coop
is the team's grid ([common-schema.md → A player's facts](../common-schema.md#a-players-facts--the-sides-and-their-own)). `gd`
has no `team`.

**A board is packed**, since it is rebuilt on every keystroke
(`_make_json_board`). A cell's **index** is its place counted row by row, `row
× width + col`:

| key | what it holds |
|---|---|
| `fills` | one string per cell, by index: `""` when empty, a given or a block; a letter (or rebus) uppercase in pen, **lowercase in pencil** |
| `wrong`, `revealed` | the indices of the cells with the flag |
| `breaksRight`, `hyphensRight`, `breaksBottom`, `hyphensBottom` | the indices of the cells with that edge mark |
| `writers` | coop: one digit per cell — 0 nobody, else the writer's 1-based place in `players`; null in compete |

The template is not packed: it is in `static_game_data`, which the page reads
once, not per keystroke.

**`gd`** (`makeGameData`): each board unpacked into `GCell`s (`{id, row, col,
fill, pencil, wrong, revealed, markRight, markBottom, writer}`, a writer a
player), with `cellsById`; coop's one board put on every seat as the same
object; and **the seat rule**, a rival's board null until the game ends. The
page draws one grid — mine — even then.

### How a game ends

| when | reason / detail | ranked |
|---|---|---|
| a correct grid in coop (typed or revealed) | `reached_goal` / `solved` | everyone 1, everyone's `solved_at` |
| a correct grid in compete | `reached_goal` / `solved` | the solver alone, 1 |
| the countdown ran out | `timeout` | nobody — a loss for everyone |
| the last racer conceded | `conceded` | nobody — a loss for everyone |
| somebody pressed Stop | `stopped` | nobody — neutral |

## 3. Match semantics (mirror `ws.ts`, not prose)

The fill-vs-solution comparison + the solve/check treatment of pencil, empty,
and given cells are mirrored **from crossplay's `ws.ts`**
(`fillMatchesSolution`, `isPuzzleSolved`, `applyCheck`) — with two subtleties
worth pinning in pgTAP:

- **First-letter acceptance is keyed on the candidate's length (a rebus), not on
  the number of candidates.** `_matches` accepts a bare first letter for any
  multi-*character* candidate answer (`length(s.ans) > 1`, e.g. `"HEART"` →
  `"H"`) — a long-standing NYT typing shortcut. This mirrors
  `fillMatchesSolution`'s per-candidate `sol.length > 1` check. So a
  single-candidate rebus DOES accept its first letter; a Schrödinger cell whose
  candidates are all single letters does not.
- **Solve does NOT skip pencil.** `_is_solved` counts a pencil cell whose letter
  is right (pencil is a confidence marker). Only *check* skips pencil. An empty
  cell blocks solve.

Given cells are correct by construction and have no place in a grid, so the
solved-check walks the template's open, non-given cells (`_fillable_cells`) and
looks each up in the grid against the solution.

## 4. RPCs (`security definer` unless noted, revoke-public / grant-authenticated)

Because definer functions read the shielded `solution`, check and reveal are
plain RPCs — no edge function needed. The one exception is
`library_for_club`, which is deliberately **invoker** (see its row).

| RPC | behavior |
|---|---|
| `create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board default null)` | `board` null → library path (copy from `puzzles` by `setup.puzzle_id`); `board = {meta, solution}` → inline path (NYT, Guardian, upload). Inserts one grid per owner (one in coop, one per player in compete), each holding what the template starts it with (`_make_starting_cells`: an upload's saved letters, an NYT overlay's author bars). |
| `set_cell(p_game_id, p_row, p_col, p_fill, p_pencil)` | The hot path (one call per keystroke; the page draws the letter first, `usePendingWrites`). Locks the game row, then guards: membership, the game not ended, not conceded, an open non-given cell (**revealed cells ARE editable** — mirror `applyFill`), fill = letters only, 1–8 chars (`^[A-Z]{1,8}$`, mirroring crossplay's ws.ts). In coop the caller becomes the cell's writer. Runs the solve check — a correct grid ends the game (§2 → How a game ends), and the lock lets only the first solver win — then rebuilds the blobs and answers the `revision` that rebuild wrote. |
| `set_mark(p_game_id, p_row, p_col, p_side, p_mark)` | Set/clear a cryptic word-break / hyphen mark on the cell's `right` / `bottom` edge (`mark` = `break` / `hyphen` / null). Same lock and guards as `set_cell`; display-only (no solve); answers its `revision`. **Fillable cells only** (a mark rides on the *left/upper* cell of a boundary, and givens have no place in a grid — so a break on a given's own right/bottom edge isn't representable; a rare cryptic-with-givens case, deliberately not supported). Ported from crossplay's edge marks. |
| `reveal_solved_word(p_game_id, p_cells jsonb)` | **Leak-safe** answer read for the AI "Explain clue" feature: returns the canonical answer for `cells` **only if the caller has already filled them all correctly** (`_matches`, honoring givens) — else `unsolved`, no letters. So it can only surface a word you've already solved (safe in compete too). Also returns the puzzle note (not secret). Consumed by the `crosswords-explain-clue` edge function. |
| `export_solution(p_game_id)` | **Member-gated full-solution read** (definer; `_require_game_player`), available at **any** time — unlike the page blobs, which carry the solution only once the game has ended. Feeds the "Download as .ipuz" export and the answer-key PDF (§7, §9), both of which need real answers before the game ends. Handing the solution to the client on demand relaxes the shielding, which the friends-only trust model tolerates (see [CLAUDE.md → trust model](../../CLAUDE.md)); a deliberate, member-gated exception, not the solving path. |
| `check_cells(p_game_id, p_cells jsonb)` | The page resolves letter/word/puzzle scope via `lib/cursor.ts` (`listScopeCells`) and sends coordinates; the server sets/clears `wrong` (skipping empty/pencil). Both modes — free in compete because it is self-informative: it says a letter is wrong and hands over nothing ([win-lose.md → The invariants](../win-lose.md#the-invariants)). |
| `reveal_cells(p_game_id, p_cells jsonb)` | Writes the canonical answer + `revealed`, clears wrong/pencil, and names the revealer the cell's writer, so teammates see it flash in the revealer's color. **Coop only** (reveal-all would trivially win the compete race). Runs the solve check afterwards, since a reveal can complete the grid — including "Reveal puzzle", which ends the game as a normal solve (deliberate; §9). |
| `replay_board(p_game_id)` | The "Restart" game-menu item and the ended row's Restart: puts **every** grid back exactly as the game started it (`_make_starting_cells` — everything the players did goes, the template's saved letters and bars come back), clears `solved_at`, then `common._reset_game` clears the ending and each player's, and zeroes the timer. The answer is untouched, and it is covered again because the blobs carry it only once the game has ended. Guards: membership only — no ended check, so it runs mid-game or finished (the page confirms mid-game). |
| `stop_game(p_game_id)` | Mutual give-up in EITHER mode, through `common._stop` → neutral `stopped`; a racer who had already conceded stays conceded. Not a loss, which is the timer or the last racer conceding. The end puts the solution in the blobs, but the page only shows it on demand — the "Reveal solution" menu item (§7). |
| `library_for_club(p_club_handle)` — **`security invoker`** | Backs the setup form's Library picker: every library puzzle (id, title, author, width, height) plus a per-club **`status`** — `solved` / `playing` / `lost` / `unplayed` — so each row can carry a club-history color bar. Sorted **alphabetically by title** (case-insensitive, `created_at desc` breaking ties) — the picker is a list you scan by name, where import order was an accident of how the files landed. Invoker is load-bearing twice over: the `puzzles` **column grant** is what hides `solution`, and `common.games`'s club-member RLS is what stops one club's history showing in another's picker (a non-member just sees an all-`unplayed` library). Status **precedence** is solved → playing → lost, so one win makes a puzzle permanently green and a game stopped with no result shares the yellow bucket with `playing`. **Mode-agnostic** by design — a coop solve colors the compete dialog too. Why a function and not a view: the join to a game's ending is cross-schema *and* has to be OUTER, and the club is an input to it — a view filtered by club is inner by construction and would drop exactly the unplayed rows the picker exists to show. |
| `concede` / `submit_timeout` | Standard: concede locks the row and `common._concede` decides it (compete only). The setup form offers the shared `<SetupTimerSection>` like every other game; a countdown expiring takes the whole table down as a `timeout` loss for everyone, in either mode, nobody ranked. |

**Every one of these answers in [an envelope](../envelopes.md)**, and one line
of reasoning classifies almost all of it: the grid and the game's ending are
drawn from the blobs, which every move rebuilds, so a refusal is either
**someone else moving under you** or **something the grid could not have
produced**. An `ok` carries what a caller reads and no more: `set_cell` and
`set_mark` their `revision`, the rest their `result` (`set` · `marked` ·
`checked` · `revealed` · `exported` · `solved` / `unsolved` · `created` ·
`replayed` · `conceded` · `ended`).

| | | |
|---|---|---|
| `PN486` "Game over" | `race` | a teammate finished the grid, or the timer ran out, mid-keystroke — the shared race (`common._raise_game_over`) |
| `PN483` "Already conceded" | `race` | your own concede landed first — the shared race (`common._raise_already_conceded`) |
| `PN466` `BUG: a fill that is not letters` | `fault` | the FE mirrors `^[A-Z]{1,8}$` first |
| `PN467` / `PN472` `BUG: a write/mark on a block or a given` | `fault` | the grid renders those non-focusable |
| `PN470` / `PN471` `BUG: a mark on an unknown edge / of an unknown kind` | `fault` | both values come from the FE's own typed union |
| `PN475` `BUG: a reveal in a compete game` | `fault` | mode is fixed at `create_game`; the FE hides the items |
| `PN485` "That game was already deleted" | `race` | every grid write (through `_lock_game`), `export_solution`, `reveal_solved_word` and the ending RPCs: a friend deleted the game from the club list; `common._raise_game_deleted`, asked before the membership gate |
| `PN478` "You've played every one of those" | `form-validation` on `source` | see below |

`reveal_solved_word`'s `unsolved` is an `ok`, not a refusal: the menu item is
live on any clue because the page cannot see which are solved.

**`next_nyt_date_for_club`'s empty answer moved into the RPC.** Running out of
unplayed dates for a weekday is `PN478`, a `form-validation` naming `source` —
the control that picks the weekday, and the one a group told "you have done
every Monday back to 2015" will change. The sentence lives in the RPC because
**two callers ask the same question** — `crosswords-import-nyt` and the setup
form's weekday field — and both deserve the same answer.

**`library_for_club`'s empty answer did NOT.** An empty library is an ordinary
`ok` with an empty list: nothing is blocked and there is no input to fix, so the
picker draws its own "No puzzles found." That is the whole difference between
the two — whether the empty answer stops anything.

## 5. Puzzle sourcing

Four sources (Library / NYT / Guardian / Upload), exposed in the setup form as
**one field with four buttons**, each opening its own blocking picker —
`PuzzleSourceField`. How that field behaves:

- **Nothing is chosen until a picker answers.** A fresh form names no source at
  all, so none of the four is drawn as chosen and Start is blocked. A club that
  has played arrives with its saved default over that, which carries the source
  — but not `puzzle_id` or `date`, so a returning library club names `library`
  with no puzzle in hand and is still blocked.
- **The named source is the primary button.** The one piece of state the row
  carries, and the only place it says so.
- **Backing out of a picker clears the choice** — Cancel, the ✕ or Escape
  leaves no source, not the one held before the press. Pressing a source button
  is the start of choosing, so leaving without an answer ends with nothing
  chosen, rather than with a filled button and a caption describing a puzzle
  you walked away from.
- **A picker's answer replaces the WHOLE value** — `source`, `puzzle_id`,
  `date`, `weekday`, `series`, `board`, `filename` — so every key the chosen
  source did not set lands absent. That is the first of the three guards on the
  uploaded board below.

The sources themselves:

- **`gmake g-crosswords-puzzles`** (CLI, `supabase/scripts/`) — bulk-imports
  crossplay's `.puz` / `.ipuz` files + the `content_hash` dedup into the curated
  `crosswords.puzzles` library. Reads a **git-ignored**
  `supabase/data/crosswords/` folder (Joel keeps his own puzzle files; nothing
  committed). After a reset the library is empty until re-run (`gmake db-reset`
  chains it via `db-data`) — same posture as the other library games. The picker
  reads the library through **`library_for_club`** (§4), not a plain table
  select, so every row arrives tagged with whether *this club* has already
  solved / started / lost that puzzle — a 4px color bar down the row's leading
  edge, in the shared `--gamelist-*` vocabulary the club page uses. The bar is
  painted on every row (unplayed gets the near-white neutral) so it can never
  reflow the list. One round trip, so the list is never drawn and then
  recolored. The parsers themselves live in **`src/crosswords/lib/parse/`** (see
  §6). Author-side companions (ported from crossplay):
  **`crosswords:puz-to-ipuz`** (convert a `.puz` → `.ipuz` via
  `parsePuzBuffer` + `writeIpuz`) and **`crosswords:set-note`** (patch a `note`
  into a note-less `.puz` — relevant because the cryptic gating keys off "puzzle
  has a note").
- **Saved-fill restore** — a partially-solved `.ipuz` (whether imported or
  uploaded) carries the solver's in-progress fills as its ipuz `saved` grid; the
  parser applies them onto the non-given template cells, and the grid starts
  with them (`_make_starting_cells`, uppercased; Restart starts it there again).
  So a half-finished puzzle imports where you left off — crossplay's `saved` round-trip, the counterpart
  to **Download as .ipuz** (§9). Blank library/NYT templates carry no fills, so
  this is a no-op there.
- **In-app upload** — the setup form's Upload picker parses a dropped / chosen
  `.puz` / `.ipuz` **entirely client-side** (`lib/importFile.ts` → `lib/parse/`;
  puzjs is a dependency-free `Uint8Array` reader, so it bundles in the browser)
  into the inline board, then `create_game(board=…)` directly — a self-contained
  game, no `puzzles` row (like NYT). The parsed board rides in the FE-only
  `setup.board` and is **stripped** before create_game stores the setup, so the
  solution never lands in the unshielded status / saved-default. The strip is
  **belt-and-braces** across three layers, because a parsed board lingering in
  `setup` under a source that is no longer Upload would leak the answers:
  `PuzzleSourceField` replaces the whole value on every pick and clears it on
  every cancel, `startGameInClub` deletes `board`/`filename` *unconditionally*
  (not just for an upload), and `create_game` itself runs `setup := setup -
  'board' - 'filename'` as a server backstop — the real inline puzzle always
  rides as the separate `board` arg, so it's never wanted in the persisted setup
  regardless of what the FE sends.
- **The NYT picker picks a WEEKDAY** (2026-08-13), not a date — a list of
  Monday…Sunday, each labeled with what it means (`Monday — easiest`,
  `Saturday — hardest`, `Sunday — big (21×21), medium`). An NYT crossword's day
  IS its difficulty, so that is the choice a solver actually wants to make, and
  it's the one thing here that's a standing club preference: `setup.weekday`
  rides in the saved default while `setup.date` is stripped from it.

  `crosswords.next_nyt_date_for_club(p_seen_by, p_dow)` turns it into a date: the
  **most recent** puzzle of that weekday none of the selected players has
  played, in any club. Two deliberate differences from connections' and
  strands' `next_puzzle_for_club`:

  - **Most recent, not earliest.** Their archives are finite and recent, so
    walking forward through a queue works. NYT's is effectively infinite — a
    club starting at the 2015 floor and playing weekly would reach the present
    in ~575 games and never once play a puzzle anyone was talking about.
  - **It generates rather than scans.** NYT dailies are fetched on demand and
    never stored (`crosswords.puzzles` is the curated CLI library only), so
    there is no archive to scan: candidates are computed every seventh day
    back from the most recent occurrence, and only `crosswords.games` is
    consulted. The exclusion is per-player across clubs, matching the other
    two, which is why it's `security definer`.

  Because the fetch needs a concrete date, **the derivation lives in the edge
  function**, not in `create_game` — the opposite of the other two games. The
  edge fn resolves the weekday, fetches, and passes the RESOLVED date back into
  `setup` so `crosswords.games.puzzle_date` records what was actually played.
  (Until 2026-08-13 it passed `{ timer }` alone, so `date` never reached the
  row and every NYT game looked unplayed to the walk; `next_nyt_date_test.sql`
  pins the stamp for that reason.)

  `crosswords.games.puzzle_date` (forward migration `20260813000002`,
  backfilled from `meta ->> 'id'`) is what all of this excludes on. It exists
  because NYT and Guardian games ride **inline** — no `crosswords.puzzles` row,
  so `puzzle_id` is null for exactly the games that matter — and `meta.id` is a
  field with two other meanings (a library puzzle's source id; the literal
  `'nyt'` when a response carries no publication date). It is deliberately NOT
  in the table's column grant: nothing client-side reads it.

  Alongside the dropdown sits the same plain **date override** connections and
  strands carry: it filters nothing, so an already-played date starts a second
  game, and picking a weekday clears it rather than leaving a dead control. Its
  floor is 2015 — NYT's archive runs to 1993, but the series has to stop
  somewhere and nobody here is working back that far.

  Running out (~600 games of one weekday) raises `no-unplayed-weekday|`.
- **`crosswords-import-nyt`** edge function — fetches an NYT daily by date
  (list-by-date → first `Normal` puzzle → v6 JSON; browser User-Agent +
  `NYT_COOKIE_JAR` cookie secret **mandatory**), converts via the pure
  `src/crosswords/lib/nyt.ts` (unit-tested), then `create_game(board=…)` as the
  caller. **Overlay-PNG analysis** (circles-on-shaded + word-break bars on a
  minority of themed puzzles) is applied after conversion: the pure detector is
  `src/crosswords/lib/nytOverlay.ts` (`detectOverlayMarkings` +
  `applyOverlayMarkings`, unit-tested against real NYT overlay fixtures), and
  the edge fn fetches + decodes the overlay PNG (`npm:pngjs`) — a missing/broken
  overlay is non-fatal. `applyOverlayMarkings` writes circles onto `meta.cells`
  (a template-read field, so they render directly) and bars as
  `markRight`/`markBottom`; because marks are a *grid* concept here
  (the board and the PDFs read them from the grid, not the template), **the grid
  starts with the template's marks** (`_make_starting_cells`) so the overlay bars
  render like any player-drawn mark. Local cookie setup: put
  `NYT_COOKIE_JAR=<raw JSON or base64>` in `supabase/functions/.env` and
  `supabase functions serve crosswords-import-nyt --env-file …`.
- **`crosswords-import-guardian`** edge function — fetches **today's** Guardian
  crossword in a chosen `series`. Every series shares one entry-based JSON
  shape, so adding one is a one-line allowlist + dropdown entry (quick-cryptic
  clues carry `<span>`/`<i>` tags, which the shared `htmlToText` already
  strips). The edge fn's `SERIES` allowlist accepts eight (Quick, Cryptic, Quick
  cryptic, Everyman, Speedy, Quiptic, Prize, Weekend); the FE picker
  (`GUARDIAN_SERIES` in `lib/setup.ts`) currently shows **six** — Prize and
  Weekend are **omitted from the dropdown** (their answers are withheld until a
  reveal date, so a same-day start would 422) but stay in the server allowlist
  as a one-line re-add. Each visible series carries a one-line character hint
  shown under the picker (Quick/Speedy are plain-definition; the rest are
  cryptics of graded difficulty). It converts via the pure
  `src/crosswords/lib/guardian.ts` (unit-tested), then `create_game(board=…)` as
  the caller — the same self-contained shape as NYT. **No auth** (Guardian
  crosswords are public — no secret to configure), and the conversion is simpler
  than NYT's: the Guardian data is *entry*-based (each clue carries its start
  position, direction, length, number, and answer), so the grid + numbering +
  split clue lists fall out directly, with none of NYT's cell-type enum or
  overlay-PNG step. The one wrinkle is the fetch: the puzzle JSON is embedded in
  the solver page inside a `<gu-island name="CrosswordComponent" props="…escaped
  JSON…">` web-component tag, which the edge fn scrapes + entity-un-escapes
  (mirroring the Python xword-dl downloader this was ported from). `find latest`
  reads the series index page for the first `/crosswords/<type>/<id>` link.
  **Caveats:** a *Prize* or *Weekend* puzzle withholds its answers until a
  reveal date, so a same-day start of those may 422 (`convertGuardianPuzzle`
  throws when `solutionAvailable` is false rather than seed an unsolvable board
  — our check/reveal/end-of-game flow needs the answer key); and the cryptic
  **enumeration bars** (`separatorLocations` → grid word-break marks) are *not*
  ported in v1 (the enumeration is already in each clue's text, e.g. "(6,5)").
  The clue-HTML→text helper is now shared (`src/crosswords/lib/clueHtml.ts`,
  used by both `nyt.ts` and `guardian.ts`).

## 6. Server surface + parsers (the shared-code seam)

The `.puz` / `.ipuz` parsers live in **`src/crosswords/lib/parse/`** (`puz.ts`,
`ipuz.ts`, `format.ts`) as **dual-runtime** modules taking a `Uint8Array`: the
Node import CLI (`supabase/scripts/crosswords/convert.ts`) and the browser
upload (`lib/importFile.ts`) both consume them. The NYT conversion is likewise
**pure TS in `src/crosswords/lib/`** so the SAME code backs the FE, the Deno
edge function (imported with `.ts` specifiers, like boggle), and the vitest
tests. `contentHashPayload` builds the dedup string, and the **CLI import**
hashes it with `node:crypto` to dedup re-imports into `crosswords.puzzles`. The
NYT edge function does **not** hash — it creates a self-contained inline game
(no `puzzles` row), so `content_hash` never comes up on that path.

## 7. Frontend (`src/crosswords/`)

The play surface ports crossplay's `PuzzleView` layout — **a documented v3
layout exception** (see [playarea.md → Info-column
readouts](../playarea.md#info-column-readouts)): a CSS grid with the board on
the left spanning full height, the **Across | Down** clue columns top-right
(scrolling internally), a **3-line active-clue bar** that doubles as the
local-feedback slot, and a slim chrome strip (the action row). `.wrap` is bound
to `calc(100vh - var(--game-chrome-height))` so the `min-height: 0` chain
engages — the board fills, the clue lists scroll, the page never scrolls. Board
sized in `em` off a computed cell font-size, `100dvh`.

**Mobile** (below `--mobile`; [mobile.md](../mobile.md)): the grid + the
active-clue bar ARE the main view — the grid takes the full viewport width
(`--cw-cell-mobile`, the second inline cell-size formula picked by the
breakpoint in `Grid.module.css`), with the bar hugging its bottom edge (2
reserved/clamped lines on a tablet, 3 on a phone — narrower wraps more); the
clue lists + the Controls strip move into the **wide** off-canvas info
sheet (the shared `useInfoSheet` / `<InfoSheet>` recipe; `.sheetContent`
is `display: contents` on desktop so `.clues`/`.strip` stay grid items,
byte-identical). **Keyboard-required still holds** — this is the layout for a
tablet (or phone) *with* a keyboard, not a touch-entry mode. Guarded by
`e2e/crosswords-mobile.e2e.ts` on a generated full-size board
(`createCrosswordsGameSized` — the 2×2 fixture can't exercise width-bound
sizing).

- **`lib/cursor.ts`** — the pure navigation module, ported from crossplay with
  its functions renamed to verb-first names (36
  tests). Reads only `kind`/`number`, so it runs on the static template grid.
- **The board as drawn** — `gd.me.board` with my writes the blob does not
  carry yet laid over it (`usePendingWrites`), so a letter or a mark shows the
  moment it is made and a read that started before the keystroke cannot undo
  it. A write leaves once the blob is known to be at least as new as it — the
  blob's `revision` reaching the one its RPC answered — whatever the blob shows
  for the cell, so a teammate's overwrite right after mine is never hidden. A
  refused write leaves at once.
- **`useGridKeyboard`** — the full grid key set (ported from crossplay's
  PuzzleView) as **actions** (`common/actions`): letters (fill +
  advance), Backspace (two-step) / Shift+Backspace (clear word), Space (advance)
  / Shift+Space (read-only zoom-peek of a squeezed rebus), arrows /
  Shift+arrows (word edge), Tab / Shift+Tab (jump clue), Shift+Enter (rebus
  overlay), `#` (jump-to-number popup), `|` / `_` (cycle the right / bottom
  cryptic edge mark → `set_mark`). Nothing here reads the window: the app's one
  dispatcher stands down inside a text field and inside any floating panel, so
  the hook's own modifier / field / panel guards are gone. What stayed is
  `suspended`, which disables every grid key while the rebus box or the
  number-jump popup is up — those are focused inputs that stop their own
  keydowns before the dispatcher sees them, so the gate is belt-and-braces.
  Navigation stays live once the game has ended (walking a solved grid is part
  of the post-game) while every writing key describes itself disabled.
  - **⌥-letter shortcuts** (crossplay parity — the port's identity is
    keyboard-first): **⌥P** pen/pencil, **⌥C** / **⌥⇧C** check letter / word,
    **⌥R** / **⌥⇧R** reveal letter / word (coop only), **⌥N** show note, **⌥X**
    explain cryptic clue, **⌥S** scratchpad (the header mark's own action, so
    it works in every game that has one). Each chord is matched on `e.code`
    (physical key) so Mac ⌥ dead-keys (⌥C = ç, ⌥N = ˜) don't matter, and each is
    the SAME action as its menu row and its square in the tool bar. **⌥M menu is
    NOT wired** (the shell exposes no programmatic menu open); the check/reveal
    *grid* scope has no shortcut, matching crossplay. Two more are shell-global
    (any game): **⌥⌫** Stop/Concede, **`<`** Back to club — see
    [ui.md → GamePage menu](../ui.md#gamepage-menu).
- **Controls** — pen/pencil toggle + Check and (coop-only) Reveal at
  letter/word/grid scope (scope resolved on the page, `listScopeCells`). Every
  square IS its action, so the bar decides nothing: Reveal's three hide
  themselves in a race and take their group's label and rule with them, and a
  frozen board grays the rest. The pen/pencil pair is two destinations for ONE
  toggle — clicking the one you're already on is nothing to do.
  **Reveal at GRID scope is confirmed**, by the registry's own question rather
  than by this game: it's the one scope that ends the puzzle rather than helping
  with it, `reveal_cells` writes the answers onto *everyone's* board and stamps
  them `revealed` (so the post-game Reveal/Hide toggle can't take it back — those
  letters are the players' fill now), and the row sits one mis-click below
  "Word". Letter and word go straight through: they're the ordinary hint ladder.
- **Puzzle-info menu header** — the game menu opens with the loaded puzzle's
  **title + credits** (`title`, `by {author}`, `copyright`), a non-clickable
  block pinned above Help — crossplay's menu shows the same. It rides the shared
  menu's new `MenuSection.header` / `buildGameMenu({ header })` (empty credit
  fields drop out). The puzzle title is *also* the game's `common.games.title`
  now: `create_game` names the game after the puzzle (`v_meta ->> 'title'`, e.g.
  "NYT Sat 1/1/22: …" or a library puzzle's embedded title) rather than a
  generic "New crossword", the way crossplay names a game after its puzzle.
- **Rebus / peek overlay** (`RebusBox`) — a 3-cell-wide box centered + clamped
  over the cursor cell: the rebus entry (Enter submits + advances, Tab /
  Shift+Tab submits + jumps clue, Esc/blur cancels) or, for Shift+Space, a
  read-only peek of the current fill.
- **Teammates** (coop) — `usePeerCursors` broadcasts the local cursor on a
  stable-name channel + Presence for disconnect cleanup, and the Grid draws a
  thin frame in each teammate's cursor color. The channel also carries a
  **`showNotes`** event: "Show note" opens the setter's note locally AND asks
  teammates to open it too ("read it together", crossplay parity). **A
  teammate's letter flashes** in their color for five seconds, found by
  comparing each board the blob brings with the one before it
  (`useTeammateFills`): a cell whose fill changed to a letter and whose writer
  is not me. A coop reveal names the revealer the writer, so it flashes the
  same way. Compete has private grids, so none of this applies there.
- **Scratchpad** — the shared `common/` feature (opt-in via the manifest
  `scratchpad` field): shared pad in coop (Broadcast takeover lock), private pad
  per player in compete. See
  [common/scratchpad/doc.md](../../src/common/scratchpad/doc.md) → Intro to area
  for the architecture.
- **Once the game has ended** — no modal carries the verdict ([ui.md →
  Endings](../ui.md#endings--the-moment-vs-the-record)): the ending's
  words come from my ending label (`lib/endingLabel.ts`, on every `gd`
  player) and land as the filled verdict in the active-clue bar (the local
  slot's `<FeedbackPill>`): "Solved" for a coop win, "Won" for my compete
  solve, a bare "Lost" when someone else solved it first (the club line names
  them), "Lost: out of time" when the countdown expires, "Conceded" for the
  last racer out. While the others race on, a racer who conceded reads
  "Conceded: game continues". The grid wears the ending frame in my outcome,
  with no space reserved for it. My win — the team's coop solve, or my solve
  first in a race — pops the shared `<CelebrationBlockingModal>`
  (`useCelebration(gd.me.outcome === 'won')`), at the moment of the flip,
  never on opening an already-solved game. The board is **not** auto-revealed at game end: the
  blanks stay blank until THIS viewer picks the **"Reveal solution"** game-menu
  item, which draws `gd.puzzle.solution` — the author's grid **exactly as
  shipped** —
  blanks fill in, and a wrong letter is *corrected* rather than left standing
  beside them (a half-corrected grid isn't the solution, and what the answer was
  is the whole reason to look). The player's own verdict marks go with it: a
  cell showing the author's letter drops its red wrong-triangle, since that
  verdict was about a letter no longer on screen. Gray means "this letter is the
  author's, not yours", so it marks the blanks AND the corrections and leaves
  anything they had right looking like theirs — the answer key doubles as a
  diff, for free. It's a **local, reversible** reveal (`useSolutionReveal` —
  [ui.md → Endings](../ui.md#endings--the-moment-vs-the-record)): my looking
  doesn't fill a partner's grid while they're still working out what they got
  wrong, and **"Hide solution"** puts the answers away again, leaving exactly
  the fill the solvers left — wrong letters and their marks included.
  Overwriting what's on screen is only safe *because* that comes back. That
  reversibility matters more here than in any other game — a crossword grid can
  legitimately differ from the author's (rebuses, quantum clues), so a permanent
  overwrite would destroy the only record of what the solvers actually wrote.
  The item is disabled mid-game: the blobs carry the solution only once the game
  has ended.

  **Layout is unaffected, and measured**: revealing and hiding move nothing.
  Both faces of the control are the same icon-only fixed box, and the answers
  paint into cells that already exist — grid box, active-clue bar and button box
  are byte-identical across playing / hidden / revealed / hidden-again at both
  desktop (1400×950) and tablet (1024×768) widths.

  **The strip has three states** (`ToolStrip`), swapping in place: the control
  bar while playing; an `<InfoActionsRow>` "Conceded (game continues)" line for a conceded
  compete player, with an inert Reveal (the solution waits for the end of the
  game) and Stop in Concede's place; and once the game has ended an action row
  of **Reveal solution / Hide solution** (the same toggle as the menu item) ·
  **Restart** · **New game** · **Back to club** (primary), with the fill /
  check / reveal controls gone — penciling a finished grid is meaningless.

  Two documented departures from the sweep here. **No outcome message in the
  ended row** — unlike every other game's `<InfoActionsRow>`, whose shape is
  message-plus-actions: the verdict is already a permanent pill in the
  active-clue bar directly above (the one readout a phone shows without
  opening the info sheet), so a second copy a line below would be noise. That's
  why that row is a plain row of buttons rather than the shared component. And
  the strip's **height changing** between the three states is fine, not a
  no-reflow violation: the board column is `min-content` and spans all three
  rows of a viewport-height grid, so it can't move — only the `1fr` clue list
  above absorbs the difference.

  **New game opens the SETUP dialog** rather than creating a game directly. A
  crossword has no randomness to re-roll: `setup` names a *puzzle*, so replaying
  it re-serves the grid just solved (library / nyt / guardian alike), and an
  uploaded board is stripped before it's persisted (see Puzzle sourcing),
  leaving nothing to re-send. Picking the next puzzle is the only sane "another
  one". Mechanically it navigates to `/c/<handle>?new=<gametype>`; ClubPage
  reads that param once at mount and opens `SetupGameModal` on it **after** its
  fetch settles (the dialog seeds its form from `savedDefault` + `members` with
  a lazy initializer and never re-seeds, so opening early would lose the club's
  last-played setup), then strips the param on cancel/start. Also a **game-menu
  item**, which is the phone route to it — the strip lives in the off-canvas
  info sheet there.

### The component tree

Folder [`src/crosswords/`](../../src/crosswords/), on the page blobs: `useGame`
is `makeGameData(game_data, me)` — no read, no subscription — and every type the
folder exports is in [`types.ts`](../../src/crosswords/types.ts) (the `gd`
sketch near its end) and, for the ones that reach React,
[`reactTypes.ts`](../../src/crosswords/reactTypes.ts).

```
<PlayAreaLoader {...PlayAreaLoaderProps}>   useGame: gd
  └── PlayArea                 the coordinator: the board as drawn, typing, the trips, the slot, the endings
        ├── Grid               every square, and the box over the cursor cell
        │     ├── Cell         one square and everything on it
        │     └── RebusBox     the rebus entry, or the peek
        ├── ActiveClueBar      the slot's pill, else the clue under the cursor
        ├── InfoSheet ←        on a phone, the lists and the strip
        │     ├── ClueLists    Across | Down
        │     └── ToolStrip    the three states: Controls · my concession · the ended row
        ├── CrosswordsNumberJumpBlockingModal · CrosswordsNoteCompanion · CrosswordsExplainCompanion
        └── CelebrationBlockingModal ←

  ← belongs to common/ ; everything else is this folder's
```

**No `BoardCol` or `InfoCol`**: the layout is crossplay's, and the move — typing
on one grid — has nothing to split between two columns. `PlayArea`'s hooks:

- the board as drawn (`usePendingWrites`) and the two writes that feed it
  (`useSetCell`, `useSetMark`);
- typing on the grid (`useGridEntry`: the cursor, pen or pencil, the rebus box,
  the peek, the number jump, over `useGridKeyboard`);
- one per trip to the server: `useCheckCells`, `useRevealCells`,
  `useExportSolution`, `useExplainClue`;
- the teammates: `usePeerCursors` and `useTeammateFills`;
- the ending: `useGetEndingMessage`, my ending label's message, shown by the
  shared `useShowEndingFeedback`;
- `useActionsAndMenu`: every command, bound once, and the menu. A run reads the
  board and the cursor when it is pressed, so the prints, the download and the
  explainer take what is on screen.

**The answers** (`lib/answer.ts`): a check says only that it skipped penciled
cells ("Check skips pencil marks", `noted`); a reveal says nothing. The grid
carries both answers.

### Printing the board (PDF) — a deliberate whole-cloth exception

`src/crosswords/pdf/` is a **verbatim port** of crossplay's own jsPDF printer
(its 12-unit layout grid, clue pagination, cell renderer), NOT the shared
`common/pdf` frame — it keeps crossplay's title block and adds no Setup section.
The **answer-key generator (`generateSolutionPdf`)** is also ported
(`pdf/solution.ts`): a solved-grid PDF (every open cell filled with the
canonical answer, the note flowed through the clue regions), driven by a "Print
answer key (PDF)" menu item that fetches the grid via `export_solution` — coop
any time, compete only once the game has ended (a UI gate; `export_solution`
itself answers any time, same as Download-as-.ipuz).

**Coop's any-time answer key is deliberate — don't "fix" it** (confirmed
2026-08-03). It looks like it contradicts the reveal gate that the other
solution-hiding games got, and it doesn't: the use case is printing the puzzle
*and* its key together to solve on paper, where you simply don't look at the
second sheet until you're done. Withholding it until the end would break that
without protecting anything — the person printing it is the person choosing not
to read it. Compete keeps its gate, since there an answer key mid-race is a
giveaway to someone else's disadvantage. Both PDFs are exposed as
`setGameSections` menu items; the grid is snapshotted at click-time. See
[common/pdf/doc.md → The body
families](../../src/common/pdf/doc.md#the-body-families), where crosswords is
the stated exception.

**The game menu** is the fullest in the app — crosswords builds its whole menu
via `ctx.menu.setGameSections` + the shared `buildGameMenu` helper (see [ui.md →
GamePage menu](../ui.md#gamepage-menu)), reproducing crossplay's single-column
layout in order: **Help** / Open chat (`/`) · Switch to pencil (⌥P) / Enter
rebus (⇧↵) / Collapse rebuses · Show note (⌥N) / Explain cryptic clue (⌥X) /
Scratchpad (⌥S) / Print board (PDF) / Download as .ipuz / Print answer key (PDF)
· **Check ▸** Letter (⌥C) / Word (⌥⇧C) / Grid · **Reveal ▸** Letter (⌥R) / Word
(⌥⇧R) / Grid *(the whole submenu drops out in compete, since all three children
hide themselves)* · Restart / Reveal solution / New game (`+`) · **Concede game
/ Stop game** (⌥⌫) · **Back to club** (`<`). Every row is an action, so its
words, glyph, key hint and availability come from the action rather than being
typed here a second time — which is what makes a row and the square beside it in
the tool bar the same thing. Notables: **Collapse rebuses** is a display-only
toggle (persisted per browser) that shows multi-char rebus fills as just their
first letter; **Download as .ipuz** emits the current board — template + fills +
the answer grid (fetched via the `export_solution` RPC, which relaxes the
shielding on demand) — via the ported `writeIpuz`, re-uploadable to continue;
**Show note** (`CrosswordsNoteCompanion`) also broadcasts a `showNotes` event in
coop so teammates open it together; **Restart** is the destructive "start over"
— `replay_board` through the shared `useStandardGameActions`, confirmed mid-game
and straight through once the game has ended. It replaced **Clear board** on 2026-08-03: the
same wipe under the name every other game uses, plus two powers the old one
lacked — it clears EVERY grid (a restart is for the table, so a compete restart
re-opens the race) and it un-ends a finished puzzle, which is what let
crosswords join the rest of the roster in having a replay at all
([common/game-page/doc.md](../../src/common/game-page/doc.md)). **Reveal
solution** is the post-game answer key (see *Once the game has ended* above). The menu is
long, so the popover scrolls — the page never does.

The board reads no `window` keydowns — its keys are actions — but the
shared `Menu` is still given **`returnFocusOnClose={false}`** by
`GameHeaderMenu.tsx`: while the trigger has focus its own `onTriggerKeyDown`
stops propagation, so a trigger that kept focus after close would swallow the
arrows meant for the cursor (or reopen the menu). With it, focus falls to
`<body>` on close and the grid's keys resume. (See `Menu.tsx` — the behavior is
opt-in so non-game menus keep standard Esc-restores-focus a11y.)

## 8. Tests

- pgTAP `supabase/tests/crosswords/` — `game_data_test.sql` pins the blobs: a
  fresh game in each mode, coop moves one at a time (pen, pencil, the writers,
  the revision each answer names, the edge marks, a check, a reveal, a clear),
  compete grids, the ending, Restart and the rebuild of every game. The rest:
  create (library + inline board, the starting cells) / gameplay (set_cell,
  check, reveal, set_mark, `_matches`, the explainer's read, and every grid
  write and the export on a deleted game) / win (solve, pencil counts,
  first-correct-wins, the rebus both ways) / replay (every grid back as the
  game started it) / rls (no client reads a grid; the games and puzzles row
  policies) / concede + give-up / timeout (countdown expiry → a `timeout` loss
  for everyone in either mode; a second call is the game-over race) /
  `library_for_club` (the four statuses, a stopped game folding into the yellow
  bucket, solved-beats-playing-beats-lost precedence when one puzzle has several
  games, one row per puzzle despite the fan-out join, club scoping in **both**
  directions, and the RLS property that makes a non-member see an
  all-`unplayed` library — the test that would catch a `security definer`
  rewrite). Plus `common/scratchpad_test.sql`.
- Vitest — `hooks/useGame.test.ts` (`makeGameData` on the fixture,
  `lib/gameData.fixture.ts`: the links as players, the unpacked board, coop's
  grid on every seat, the seat rule), `hooks/usePendingWrites.test.ts` (a stale
  read never undoes my letter, a teammate's later write is never hidden, a
  failed write leaves), `hooks/useTeammateFills.test.ts` (a teammate's letter
  flashes in their color, mine never does), `components/Grid.test.tsx` (what
  each cell shows), `components/PlayArea.test.tsx` (the wiring on the fixture:
  the affordances per mode and per ending, the keys reaching their RPCs, the
  menu); `lib/` (`cursor`, `nyt`, `importFile`, `marks`, `enumeration`,
  `guardian` — the entry-based Guardian conversion incl. the answers-withheld
  `GuardianConvertError` throw, `nytOverlay` — the overlay-PNG circle/bar
  detector pinned against real NYT fixtures, byte-for-byte with crossplay's,
  `clueRuns` — the PDF clue-text italic-run parse/wrap arithmetic under a fake
  text measure), `hooks/useGridKeyboard.test.ts`, `pdf/*.test.ts`, and the
  parser + content-hash tests next to the CLI (`supabase/scripts/crosswords/`).
- e2e `e2e/crosswords.e2e.ts` — solve; check/reveal + the post-game "Reveal
  solution" menu flow (disabled mid-game, blanks stay blank until clicked);
  compete win; compete privacy (opponent never sees your letters); coop peer
  cursors + shared-fill sync; keyboard (rebus, pencil, Backspace two-step, `#`
  jump); cryptic `|`/`_` marks; menu gating (Show note / Explain cryptic clue);
  upload via the setup form; print-PDF download; no-scroll on a full-size
  puzzle. Plus `e2e/scratchpad.e2e.ts`.

## 9. Deferred

This is the **canonical deferred register** for crosswords — distilled from the
(now-retired) build plan + the 2026-07-05 / -07-06 review docs.

### Deferred features
- **The setup form opts out of the shared field vocabulary.** Every other game's
  `SetupForm` builds from `common/fields/`; crosswords hand-rolls its controls,
  and they have drifted on every axis. Moved here from the CSS sprint's `forms`
  area on 2026-08-25 (it was F37, `crosswords-rolls-its-own-field`) — the
  DECISION is the shared vocabulary's, but every edit lands in this game.
  - **Two raw `<select>`s** (`SetupForm.tsx:326`, `:378`) — the only ones left
    in the app outside `common/fields/`. Both wear a local `.search` class
    instead of `<SelectField>`.
  - **`.search` re-declares the field chrome and disagrees with it four ways**:
    `border-radius: 6px` (a literal — `--radius-md` IS `6px`, `base.css:85`),
    `border: 1px solid var(--page-surface-border-color)` where every other field
    uses `--field-edge-color`, `padding: 0.4rem 0.6rem` against
    `<SelectField>`'s `0.6rem 0.9rem`, and `font-size: 0.95rem` against
    inherited.
  - **`.nextDate` is `<SetupNextPuzzleSection>`'s `.next` re-typed** — same
    `--page-text-color`, same `min-height: 1.4em`, same stated reason (don't let
    the timer below jump when the RPC lands). The date-override input beside it
    is hand-rolled too, and this file's own comment says it is *"the same shape
    connections and strands carry"*.
  - **`.dropzone` carries `border-radius: 8px`**, a second unconverted literal.

  **What is NOT drift, and must survive any fix:** crosswords has a real reason
  not to use `<SetupNextPuzzleSection>` — its archive is a catalog, not a queue
  (a Monday puzzle and a Saturday one are different animals), so it picks a
  WEEKDAY where connections and strands ask for "the next one nobody has
  played". The fixed-height preview line and the date override are the same
  mechanism; the thing above them is not.

- **`Controls.module.css .btn` paints a button out of a form field.** The
  pencil/pen toggles and the clear-scope control (3 uses) are drawn with
  `background: var(--field-fill-color)`, `border: 1px solid
  var(--field-edge-color)` and `border-radius: 6px` — a form FIELD's edge and
  fill on a control that is a button, plus the same unconverted literal as
  `.search` above (`--radius-md` IS `6px`, `base.css:85`). It also sizes itself
  with `--iconButton-size`, so it is literally the standard button's icon-only
  box wearing a field's paint.

  Moved here from the forms audit on 2026-08-25. What made it a finding: the
  scratchpad's "Take over" control — written by a different hand, sharing no
  code — had reached the SAME four decisions, which says the shared button was
  not reachable rather than that either author wanted something else. That
  control is now `<StandardButton small>` in the quiet tone, so this is the
  one hand-rolled small button left.

  The two vocabularies sit close in light mode, which is why this survived: they
  are separate names because they answer different questions and are free to
  diverge. Decide whether this wants `<StandardButton small>` or a look of its
  own — `<StandardButton>` can now express a label, an icon, or both, which it
  could not when the drift happened.
- **First-visit help auto-open** — crossplay opened Help on first board load
  (dismissal remembered per browser); the rebus chords (⇧Enter / ⇧Space) are
  otherwise undiscoverable. Not ported — `?` / the menu open Help on demand.
  Could become a common-shell feature.
- **`fetch-nyt-range` bulk CLI** — a Node script to download a date range of NYT
  dailies into the library; blocked on the `NYT_COOKIE_JAR` secret (same as the
  live NYT fetch). Workaround: run crossplay's script, then `gmake
  g-crosswords-puzzles`. **Data, not schema:** it writes rows into the existing
  `crosswords.puzzles`, so it needs no migration however large it gets — the
  cost it carries is the picker bound below, not a shape change.
- **NYT dedup** — inline NYT games aren't stored, so re-fetching a date makes a
  new game (fine; NYT was always kept out of the library).
- **Library picker bound before the bulk import** (from the 2026-07-12 supabase
  review) — the picker query is unbounded: it's now `library_for_club` (§4),
  which orders by title but has no `LIMIT`. It answers one `jsonb` value, so
  `max_rows` can't truncate it; the cost is payload size, which returning four
  scalars per puzzle rather than its whole `meta` keeps small — but that is not
  a bound. Deliberately **not** fixed pre-emptively: >10k puzzles needs a real
  picker UI (search/filter, not a flat list) anyway, so do the bound **with**
  that import, not before. Minimum safe change if the import lands first: a
  `LIMIT` in the RPC + a truncation note in the UI.

### Deliberate leaves / standing flags
Recorded decisions, not bugs — surfaced in the reviews and left as-is for a
possible future cleanup pass:
- **The clue-list grays deliberately diverge from crossplay — don't "correct"
  them.** `--crosswords-row-hover` / `-row-rule` / `-clue-num` (and the
  `-clue-label`, `-rebus-bg` pair) are a cool **slate** family that exists in
  neither `~/src/crossplay` nor this app's neutral grays. Two of them replaced a
  source value outright: the clue-row hover was crossplay's `#eef3fa`, and the
  clue number was its `#444`. That divergence almost certainly arrived by
  substitution during the port rather than by design — but Joel likes the result
  and **ratified it (2026-08-01)**, which is the concrete evidence the
  port-parity rule asks for before accepting a deviation. They were bare
  literals scattered across three modules; they're now named in `theme.css` at
  **unchanged values**, so the palette is findable and `cssTokens.test.ts`
  covers them. Anyone diffing against crossplay will find this and think it's a
  bug: it isn't. (`#333` on the `.circle` decoration IS byte-identical to
  crossplay's `Cell.module.css`, and the grid's `#fff` / `#000` / `#111` are
  structural black-and-white, so all of those stay literal.)
- **A revealed grid still ends as `won`** (ratified 2026-08-01). `reveal_cells`
  runs the ordinary solve check, so "Reveal puzzle" fills the grid and ends
  the game `reached_goal` / `solved`, everyone ranked 1 and won, and a green
  "Won" on the club list. waffle and wordle offer Reveal
  only once the game is over, so it ends nothing there — don't "align"
  crosswords with them. Those are guess-economy games where the hidden answer
  is the whole contest; a crossword isn't competitive in that way. Reveal here
  is a scoped solving aid (letter / word / puzzle) with no
  honest boundary between using it once and giving up, so a completed grid
  counts as completed however it got there.
- **Nothing of crosswords is in the Realtime publication.** The page reads the
  blobs on `common.games` and subscribes to nothing of this schema;
  `supabase/tests/common/realtime_publication_test.sql` pins the absence.
- **Compete never shows opponents' grids** (decision C5). The blob carries
  every racer's grid and the seat rule shows a rival's once the game has ended,
  but the page draws one grid — mine — even then: deliberately-unused surface,
  not a delivered feature (see §2).
- **Answer-key PDF gate is UI-only** (§7) — `export_solution` hands any member
  the grid at any time (like Download-as-.ipuz), so the compete "only once the
  game has ended" gate on the menu item is a UI gate, not server-enforced.
  Acceptable under the friends-only trust model.
- **`content_hash` is unique across BOTH sources** — an NYT fetch that
  content-collides with a `library` row would reuse it (then listable), mildly
  contradicting "NYT stays out of the listing." Very low probability, and
  largely moot now that NYT games are inline. Left as a known edge case.

### Known limits & unpinned tests
- **No keystroke debounce** — every fill rebuilds the page blobs, which nudges
  every page on the game and every club page in the club, and each page re-reads
  `game_data` — not the template, which is in `static_game_data` (the
  debounce was correctly dropped; a teammate needs each keystroke live). Fine
  at friend scale; 4 people speed-solving is the case to watch. One read in
  flight and the Broadcast nudge are the fixes, after the last game converts
  (plans/seat-view.md → When every game has converted).
- **Unpinned tests** (low-value / deferred from the reviews): a Schrödinger
  solve end-to-end in pgTAP (a multi-candidate solution driving `set_cell →
  _is_solved → win`); inline-board missing-meta/solution rejection;
  fill-clear-resets-pencil; the player-max guard; `importFile` error paths +
  `meta.id` slugification; and the concede-flow / ending-copy e2e.

The crossplay apparatus is otherwise **fully ported**: cryptic edge marks
(`|`/`_`, `set_mark`), the AI **"Explain cryptic clue"** (§10), the **rebus
collapse** toggle (§9 menu), **Download as .ipuz**, the **answer-key PDF**
(`generateSolutionPdf`, §7), the **NYT overlay-PNG analysis** (circles + bars,
`nytOverlay.ts`, §5), the **saved-fill restore** on import (§6), and chat
**URL linkify** (a common feature now). The **`make-sunday-fixture`** generator
is also ported (`npm run crosswords:make-fixture` — emits the .puz + .ipuz
feature-sampler fixtures).

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
  function returns 409 → "Solve this clue correctly first"). Safe in compete
  too.
- **Flow.** FE → `crosswords-explain-clue` edge fn → `reveal_solved_word`
  (answer + note) → Claude (system prompt + `{clue, enumeration, answer, note}`)
  → `{ explanation }` → `CrosswordsExplainCompanion` (on `FloatingPanel`,
  renders the `**bold**` Definition/Wordplay/Indicators prose).
- **Enumeration** (`lib/enumeration.ts`) is derived on the FE from the word's
  cryptic edge marks — `(7)`, `(4,3)`, `(3-2)` — mirroring crossplay.
- **Needs `ANTHROPIC_API_KEY`** on the edge function (like the NYT path needs
  `NYT_COOKIE_JAR`); without it the call returns 500, but the whole
  gate/plumbing (incl. the 409 leak-safety path) works without it.
