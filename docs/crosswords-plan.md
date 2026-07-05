# Crosswords port plan

Plan for the 11th game: **crosswords** (brand **CrossPlay**),
a port of **crossplay** (`~/src/crossplay`), Joel's existing Fastify + WebSocket + SQLite
collaborative crossword app. Crossplay is the spec for *what the game does*; this plan covers
fitting it into the Supabase + React shell, per the porting rules in `CLAUDE.md`.

Three source documents matter:

- `~/src/crossplay/packages/shared/src/index.ts` — the canonical wire/data shapes (`Cell`,
  `PuzzleMeta`, `GridSnapshot`). We adopt these nearly verbatim.
- `~/src/crossplay/supabase-idea/crossplay-on-supabase.md` — crossplay's own sketch of itself
  on Supabase (per-cell rows + CDC, Broadcast cursors, column-grant solution shielding). Much
  of it transfers; the parts that don't are noted below.
- `docs/deferred.md` → "Per-game scratchpad with takeover-lock" — the scratchpad is already
  spec'd as a **common** feature with crosswords named as a target consumer. This game builds it.

### Reading list for the build

Crossplay files to read before (or during) each area of work — treat the **source code as
the spec** wherever this plan's prose and the code disagree (per the verify-port-deviations
rule; this plan was written from an exploration summary, not a line-by-line read):

| file | why |
|---|---|
| `packages/shared/src/index.ts` | the canonical types this plan adopts |
| `packages/client/src/cursor.ts` (+ tests) | the navigation module, ported verbatim |
| `packages/client/src/components/PuzzleView.tsx` + `.module.css` | the layout + the full keyboard map |
| `packages/client/src/components/Board.tsx` | em-based grid sizing, borders bitmask, cell rendering |
| `packages/server/src/ws.ts` | the mutators: fill/check/reveal/clear semantics, `fillMatchesSolution`, `isPuzzleSolved` |
| `packages/server/src/ipuz.ts` + `importer.ts` | the parsers, ported into the import CLI |
| `packages/server/src/nyt.ts` | the NYT fetch/convert logic, ported into the edge function |
| `packages/client/src/print/*` | the PDF printer, ported verbatim |
| `supabase-idea/crossplay-on-supabase.md` | crossplay's own Supabase mapping |

## Requirements (from Joel)

1. Puzzles come from a **curated puzzle library**; **NYT puzzles importable by date** (as in
   crossplay today).
2. **Coop** (free-for-all: everyone types into one shared grid) and **compete** (each opponent
   works privately on their own copy of the same puzzle) sibling pair.
3. A **scratchpad specific to the puzzle**.
4. **Printable via jsPDF** (crossplay already has a full jsPDF printer to port).
5. **Uses the crossplay layout**, not the BoardCol/InfoCol decomposition — a documented layout
   exception like bananagrams'.

## What crossplay is (spec summary)

- A *puzzle* is the immutable imported template; a *board* is one playthrough. (Maps cleanly:
  puzzle → library row, board → a `common.games` game.)
- Grid is a 2D `Cell[][]`; each cell carries `number`, `fill` (≤8 chars — **rebus**),
  `revealed`, `wrong`, `pencil`, `circled`, `shaded`, `given` (author-prefilled, immutable),
  plus cryptic edge marks. Blocks may be `hidden` (irregular grids).
- The **solution is server-only** — `(string[] | null)[][]`, where a multi-entry array is a
  Schrödinger cell (multiple valid answers). Check/reveal are server-side; the client never
  sees answers.
- Input formats: `.puz` (via the `puzjs` lib) and `.ipuz` (strict whitelist parser that throws
  on unsupported features rather than degrading). Both pivot through `{state, solution}`.
- NYT import: cookie-jar auth against NYT's v3 list + v6 puzzle JSON endpoints; a converter
  maps NYT cell `type` codes to blocks/circles/shading and runs connected-component analysis
  on overlay PNGs for markings the JSON can't express.
- Play: pure cursor module (`cursor.ts` — the deepest-tested file), optimistic typing,
  rich keyboard map, check/reveal at letter/word/puzzle scope, pen/pencil mode, solved
  detection with a celebration modal, shared scratchpad with a one-writer takeover lock,
  chat, presence + remote cursors.
- Print: pure client-side jsPDF in `packages/client/src/print/` — a 12-unit layout grid,
  clue pagination with continuation pages, grid renderer preserving circles/shading/givens/
  pencil, already greyscale.
- **No timer** (explicitly deferred there too), no touch support (keyboard-only, deliberate).

## Feature scope — keep / adapt / drop

| crossplay feature | disposition |
|---|---|
| Grid model incl. rebus, circles, shading, givens, hidden blocks, Schrödinger solutions | **Keep.** All needed for real NYT puzzles; the parsers already handle them. |
| Cryptic edge marks (`markRight`/`markBottom`), collapse-rebus toggle, AI "Explain" for cryptics | **Drop for v1.** Cryptic-crossword apparatus; NYT dailies don't need it. Explain could return later as an edge function (`codenamesduet-suggest-clue` is the precedent). Note in `deferred.md`. |
| `cursor.ts` pure navigation module + its tests | **Port verbatim** to `src/crosswords/lib/cursor.ts`. Pure TS, framework-free, well-tested — the single highest-value reuse. |
| Keyboard map (letters, Backspace, Space, arrows, Tab, rebus entry, `#` jump) | **Port**, minus the ⌥-shortcuts for chat/menu/settings (PupGames chrome owns those surfaces). Grid key capture follows the bananagrams keyboard-cursor precedent: window keydown, bail inside inputs, gate via `useAppShortcuts`' editable-field logic. |
| Pen/pencil mode | **Keep.** Cheap (one boolean per cell, one toggle), and check/solve semantics depend on it (pencil cells are skipped by check, excluded from solve). |
| Check / reveal (letter/word/puzzle scope) | **Keep**, as security-definer **RPCs** (not edge functions — see below). |
| Solved detection + celebration | **Keep**, server-side in the fill RPC; terminal flow goes through `common.end_game` instead of a bespoke modal message. |
| Shared scratchpad + takeover lock | **Keep — but build it as the deferred `common/` feature**, not crosswords-local. See [Scratchpad](#scratchpad--the-common-feature). |
| Chat, presence roster, auth, sessions, home page, "Your games" | **Drop** — the club shell already provides all of this (`FloatingChat`, presence, magic links, club game cards). |
| Remote peer cursors (Broadcast) | **Keep — required, lands in stage 7.** Coop free-for-all doesn't really work without seeing where teammates are. Pure Realtime Broadcast (connections' peer-selection is the in-repo precedent); zero schema impact, so it can land last without rework. |
| Posture A (anyone-with-URL access) | **Drop.** Club membership + RLS is the trust model here. |
| 15s debounced snapshot flush | **Drop.** Every fill is an RPC write (crossplay's own Supabase sketch reaches the same conclusion). Bonus: pause-on-disconnect's unmount needs no snapshot-on-unmount — state is already in Postgres. |
| Upload-your-own `.puz`/`.ipuz` in the FE | **Drop for v1.** Curation is CLI-side (`crosswords:import`), matching how the library works in crossplay anyway. Note in `deferred.md`. |
| Timer | **Skip**, matching crossplay. If wanted later, the common tick clock (`common.timers` + manifest `timerMode`) is ready-made. |
| jsPDF print | **Port verbatim** — the PDF output stays exactly as crossplay produces it today; only the trigger changes (menu item). See [PDF printing](#pdf-printing). |

## Data model & schema

New schema `crosswords`, migration `supabase/migrations/20260706000000_crosswords.sql`
(timestamped after boggle's). Shapes below are the plan, not final SQL.

### `crosswords.puzzles` — the curated library

Follows the stackdown `boards` pre-generated-library pattern, with the column-grant
spoiler-shielding from crossplay's Supabase sketch:

```sql
create table crosswords.puzzles (
  id            uuid primary key default gen_random_uuid(),
  content_hash  text not null unique,   -- SHA-256 dedup (crossplay's rule: solution grid + given mask + clues)
  source        text not null check (source in ('library', 'nyt')),
  meta          jsonb not null,         -- the whole template in ONE column (decided; matches crossplay's
                                        -- own supabase sketch): PuzzleMeta (title, author, copyright,
                                        -- note, dims, clues) + the initial grid cells (numbers, blocks,
                                        -- circles, shading, givens)
  solution      jsonb not null,         -- (string[] | null)[][]  — SHIELDED
  created_at    timestamptz not null default now()
);

-- Library browsing needs meta but never the answer:
revoke select on crosswords.puzzles from anon, authenticated;
grant select (id, source, meta, created_at) on crosswords.puzzles to authenticated;
```

Unlike stackdown (whole table hidden), the setup form needs to *list* library puzzles
(title/author/size), so this uses the waffle/stackdown column-grant style on just `solution` —
nothing in `meta` (clues, blocks, decorations) is a spoiler. A pgTAP test must pin
"authenticated cannot select `solution`" so a future migration can't silently regress it —
model it on **stackdown's** negative test (`supabase/tests/stackdown/create_game_test.sql:87–91`
throws on `select solution …`; waffle's suite lacks the equivalent).

`source` keeps NYT-fetched puzzles **out of the library listing** (crossplay's rule: NYT and
uploads go straight to "your game", never the shared library). `content_hash` dedup means
re-fetching the same NYT date reuses the stored puzzle. **Edge case to decide at build:**
`content_hash` is `unique` across *both* sources, so an NYT fetch that content-collides with an
existing `library` row would reuse that row — which is then `source = 'library'` and thus
listable, mildly contradicting "NYT stays out of the listing." Very low probability; either
make the dedup source-aware or accept it and note it.

### `crosswords.games` + `crosswords.cells`

```sql
create table crosswords.games (
  id          uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle),
  mode        text not null check (mode in ('coop', 'compete')),
  puzzle_id   uuid references crosswords.puzzles(id) on delete set null,
  meta        jsonb not null,   -- the whole template, copied from the puzzle (game survives
                                -- puzzle retirement, per stackdown)
  solution    jsonb not null    -- copied; SHIELDED by the same column-grant trick
);

create table crosswords.cells (
  id       uuid primary key default gen_random_uuid(),  -- surrogate PK — see "why a PK" below
  game_id  uuid not null references crosswords.games(id) on delete cascade,
  owner_id uuid,                -- null = the shared coop grid; a user id = that player's compete grid
  row      smallint not null,
  col      smallint not null,
  fill     text,                -- null = empty; up to 8 chars (rebus)
  pencil   boolean not null default false,
  revealed boolean not null default false,
  wrong    boolean not null default false,
  version  bigint  not null default 0,   -- bumped by trigger; FE reconciles CDC events "newer wins"
  -- The logical key. owner_id is nullable (null = the shared coop grid), so it can't be part
  -- of a normal PK; NULLS NOT DISTINCT (Postgres 15+; PG 17 locally) gives the one-row-per-cell
  -- guarantee treating null as a single value. This is the repo's FIRST use of the feature.
  unique nulls not distinct (game_id, owner_id, row, col)
);

-- Realtime publication (see the registration checklist). The publication replicates UPDATEs,
-- so crosswords.cells MUST have a usable replica identity or every set_cell UPDATE errors with
-- "cannot update table … because it does not have a replica identity". The surrogate PK above
-- supplies it (default replica identity = the PK) — which is WHY the table has a PK at all,
-- even though (game_id, owner_id, row, col) is the "real" key. We can't REPLICA IDENTITY USING
-- INDEX the unique index (its owner_id column is nullable), and we'd rather not reach for
-- REPLICA IDENTITY FULL (only common.games does that today) when a plain PK does the job:
-- postgres_changes always delivers the full NEW row on UPDATE, and we never DELETE a cell, so
-- the OLD image (all a non-FULL identity would omit) is never needed.
alter publication supabase_realtime add table crosswords.cells;
```

Notes:

- **Only fillable cells get rows.** Blocks, numbering, circles/shading, and `given` fills are
  static — they live in `games.meta` and never change, so the live table stays
  small (a 15×15 has ~190 fillable cells) and every write is a pure UPDATE. `create_game`
  pre-inserts the rows (one set for coop; one set **per player** for compete).
- **Why a surrogate PK** (decided during the plan pressure-test): a realtime-published table
  with no valid replica identity makes Postgres reject every UPDATE. No other published table
  in the repo is keyless, and the logical key can't be a PK (nullable `owner_id`) nor a
  `USING INDEX` identity (same reason). A throwaway `id uuid` PK is the cheapest fix, keeps us
  on the repo's "published table has a PK → default replica identity" convention, and costs
  nothing at read time. The FE keys cells by `(game_id, owner_id, row, col)` off the CDC NEW
  payload and never touches `id`.
- **`version` + trigger** ports crossplay's optimistic-typing reconciliation, but note the
  *shape* is redesigned, not ported verbatim: crossplay uses ONE global snapshot counter
  (`if (version <= prev.version) return prev`, `PuzzleView.tsx`); we use a **per-cell** version
  bumped by trigger, which fits Supabase's per-row CDC far better. The FE writes locally first,
  `set_cell` **returns** the authoritative new version, and the FE applies incoming CDC cell
  events only when `event.version > local.version`. That rule is robust to RPC-vs-CDC arrival
  order and eliminates self-echo flicker (the echo arrives at the version we already stored →
  `>` is false → dropped). `useCells` is therefore new, separately-tested code — the verbatim
  port is `cursor.ts`, not the reconciliation layer.
- **Mode-aware RLS on `cells` — the SELECT path, not Realtime, is what hides opponents.**
  Model the policy exactly on `wordle.guesses` (`wordle.sql:153–172`): coop — any club member
  reads the shared grid; compete — you can only select rows where `owner_id = auth.uid()` until
  the game is terminal, when opponents' grids become visible. **Crucial correction from the
  pressure-test:** this repo does NOT rely on Realtime filtering rows by RLS — postgres_changes
  is only a "something changed" signal and the *RLS-filtered read* is what withholds data
  (documented at `psychicnum.md:334`; there's no `realtime.authorization` config). So the raw
  CDC payload for an opponent's cell WILL arrive on the wire. Two consequences the build must
  honor: (1) `useCells` in compete must **ignore any incoming event where `owner_id !=
  auth.uid()`** and never render it (the psychicnum "payload arrives but is dropped" pattern);
  (2) initial load + the terminal reveal go through the RLS-guarded SELECT, which is what makes
  "you see nothing about the other grids until the game ends" true. Opponent letters being
  technically on the wire (devtools-visible) is fine under CLAUDE.md's trust model — we don't
  contort to defeat peeking among friends. No definer plumbing needed.

### Scratchpad table — in `common`, not `crosswords`

See [Scratchpad](#scratchpad--the-common-feature).

## Puzzle sourcing

### Curated library: `crosswords:import`

Port crossplay's parsers to repo scripts (they're plain TS):

- `supabase/scripts/import-crosswords-puzzles.ts` — reads `.puz`/`.ipuz` files from a local
  folder, converts via the ported `ipuz.ts`/`importer.ts` logic into `{meta, solution}`,
  computes `content_hash`, upserts. The `.puz` path keeps crossplay's `puzjs` dependency
  (unmaintained but fine — it runs only in this Node CLI script, never ships to the FE).
  Wire into `package.json` as `crosswords:import` and into
  the aggregate `"import"` script (so `db:reset` recovery and `import-to-hosted.sh` both cover
  it, like stackdown/connections/spellingbee).
- **Nothing is committed to the repo** (decided): Joel has his own puzzle files and runs the
  import script against them. The script reads from a git-ignored `supabase/data/crosswords/`
  folder (or a path argument). This also sidesteps the copyright question NYT-derived files
  would raise. Consequence: after `db:reset`, the library is empty until Joel re-runs
  `crosswords:import` — same posture as the `db-reset-needs-import` rule for the other
  library games, just with a local-only data source.

### NYT import by date: `crosswords-import-nyt` edge function

The fetch must be server-side (cookies + CORS), so this is an edge function following the
`boggle-build-board` shape — it does the whole start-game flow in one shot via
`_shared/startGame.ts` (`callerClient` + `invokeCreateGame`):

1. `POST { date, club, mode, players }` from the manifest's `startGameInClub` (via
   `invokeStartGameEdgeFn`, which owns the error-unwrap subtleties).
2. Fetch NYT: list endpoint for the date → pick `formatType === "Normal"` → v6 puzzle JSON.
   Port `nyt.ts` conversion: cell `type` codes, `moreAnswers.valid` → Schrödinger, clue
   HTML-to-text, and the overlay-PNG connected-component analysis (`pngjs` works under Deno
   via npm specifiers; if it fights, ship without overlay support first — it only affects
   puzzles with combined circle+shade or bars).
   The browser User-Agent header is **mandatory** (NYT bot challenge otherwise) — port the
   typed error handling (`NytAuthError` etc.) so setup-form failures are legible.
3. Upsert into `crosswords.puzzles` with `source = 'nyt'` (service role; `content_hash`
   dedup makes repeat fetches free).
4. `invokeCreateGame(callerClient(auth), 'crosswords', { …, puzzle_id })`.

**Cookie storage** (decided): a single edge-function secret (`NYT_COOKIE_JAR`, Joel's
subscription, refreshed with crossplay's `dump-nyt-cookies` tool) serves all users. One
subscription serving the friends matches the curated-library ethos, and it avoids building
a settings surface. Per-user storage remains the upgrade path if that ever feels wrong.

### Setup form

Two ways to start, in one `SetupForm`:

- **Library picker**: PostgREST select of `puzzles` where `source = 'library'` (meta columns
  only), rendered as a filterable list (title/author/size — crossplay's `matchesQuery`
  substring filter). Chosen `puzzle_id` → direct `crosswords.create_game` RPC.
- **NYT by date**: date input (defaults to today) → the edge function above.

`startGameInClub` branches on which the user picked. Setup recap rows: "Puzzle: NYT Sat
7/4/26: …" / "Puzzle: <library title>", "Mode: Co-op".

## Modes & terminal flow

- **Coop** (`crosswords_coop`, `numberOfPlayers [1, N]` — solo solving is a real use case):
  one shared grid, free-for-all typing, everyone's keystrokes visible live. Solved → team
  `won`. Manual mutual give-up via manifest `endGame` → `crosswords.end_game` (spellingbee's
  manual coop end flow is the reference), which ends as a neutral **"finished"** outcome
  (decided — not a loss; putting down an unfinished crossword is normal, not defeat) and
  reveals the solution in the terminal view. If "finished" isn't already in the
  play-state/outcome vocabulary (`docs/states.md`, `labelFor`/`outcomeVerb`), add it rather
  than borrowing `lost`.
- **Compete** (`crosswords_compete`, `[2, N]`): same puzzle, each player fills a private
  grid. **First player whose grid is fully correct wins outright** (boggle's
  first-across-the-line precedent) → `won_compete`/`lost_compete` + `status.winner_username`.
  Per-player **concede** via `common.concede` (non-elimination compete: dropping out never
  ends the table for the others; last-active-conceder → collective loss). No whole-table
  `endGame` in the compete manifest.
- **Check/reveal in compete** (decided): reveal is disabled — reveal-all would trivially win
  the race. Check stays available in both modes; it marks cells `wrong`, which is
  self-informative, not answer-leaking.
- Both manifests share `PlayArea`/`SetupForm`/`Help`/`schema` with `baseGametype: 'crosswords'`,
  mode split exactly like boggle/stackdown. Register `('crosswords_coop', 1)` and
  `('crosswords_compete', 2)` in `common.gametypes`.
- Pause-on-disconnect is inherited via `useCommonGame`; nothing special needed (per-cell
  persistence means `PauseBoundary`'s unmount loses nothing).

## Server surface (RPCs)

All security-definer, `revoke from public / grant to authenticated`, per convention. Because
definer functions read the shielded `solution` column, **check and reveal are plain RPCs** —
no edge function needed (simpler than crossplay's Supabase sketch, which assumed service-role
edge functions; our schema-per-game + definer-RPC convention already provides the privilege
boundary).

| RPC | behavior |
|---|---|
| `create_game(target_club, setup, player_user_ids, mode)` | `common.create_game` header → copy `meta`/`solution` from the puzzle → pre-insert `cells` rows (per player in compete). Guard player count against the manifest range. |
| `set_cell(target_game, row, col, fill, pencil)` | The hot path (one call per keystroke; FE echoes optimistically first). Guards: membership, `play_state`, not conceded, cell not `given`, not `revealed`, `char_length(fill) <= 8`. Writes fill, clears `wrong`; the version trigger bumps `version`; the RPC **returns the new version** (the FE adopts it so its own CDC echo is a no-op). In compete, targets the caller's grid. Then runs solved-check (compare grid vs `solution`, honoring Schrödinger alternates + the first-letter rule below, skipping pencil cells); on solved → terminal flow per mode. Returns the new version + solved state. In compete, first-correct-wins is a **race**: the solved→`end_game` transition must be atomic and guarded on `play_state = 'playing'` so only the first solver sets `winner_username` (pin in pgTAP). |
| `check_cells(target_game, cells jsonb)` | FE computes the letter/word/puzzle scope client-side (via `cursor.ts`) and sends the target coordinates; server compares against solution and sets/clears `wrong` (skipping empty/pencil/given, per crossplay semantics). |
| `reveal_cells(target_game, cells jsonb)` | Same scoping; writes canonical answer + `revealed = true`, clears `wrong`/`pencil`. Coop only. |
| `end_game(target_game)` | Coop mutual stop → `common.end_game` with the neutral "finished" outcome (not a loss) and the solution revealed in terminal state. |
| `submit_timeout(target_game)` | Standard manifest requirement. |

Scope resolution living in the FE (`check_cells` receives coordinates, not a direction enum)
keeps the word-geometry logic in one place — the ported, well-tested `cursor.ts` — rather than
reimplementing word-walking in plpgsql. The server still never trusts the FE about
*correctness*; it only trusts it about *which cells you asked about*, which is harmless.

**Match-semantics fidelity**: the fill-vs-solution comparison and the solved/check treatment
of pencil, empty, and given cells must be mirrored in plpgsql **from crossplay's `ws.ts` code
(`fillMatchesSolution`, `isPuzzleSolved`, `applyCheck`), not from this plan's prose** — the
prose is an exploration summary and was already subtly off, as the two corrections below show:

- **First-letter acceptance is Schrödinger-only, not general rebus** (`ws.ts:513`
  `fillMatchesSolution`): a bare first letter is accepted only when the cell has *multiple*
  candidate answers (`sol.length > 1`). A *normal* rebus cell requires the exact full string.
  Earlier drafts of this plan said "rebus-first-letter" as a blanket rule — wrong; mirror the
  code and pin both cases (normal rebus needs full string; Schrödinger accepts first letter).
- **The plpgsql solved-check needs only `cells` + `solution`, not `meta`.** `given` cells are
  correct by construction and are excluded from the `cells` table entirely, so don't join
  `meta` to re-check them; iterate the `cells` rows, and treat pencil/empty as unsolved.

pgTAP pins each case: normal-rebus full-string required, Schrödinger first letter accepted,
alternate answer accepted, pencil cell skipped by check, given untouched by reveal, etc.

## Frontend

### Layout — the crossplay layout, as a documented exception

Like bananagrams, crosswords gets a documented v3 layout exception in
`docs/design-decisions.md` (and is **desktop-only / keyboard-required**, same justification —
crossplay explicitly scopes out touch). The play surface ports `PuzzleView.module.css`:

```
+----------+----------------+
|          | Across | Down  |   CSS grid: min-content 1fr / 1fr auto
|  board   +----------------+
|          | active-clue bar |  board spans both rows; clue lists scroll
+----------+----------------+  internally; the page itself never scrolls
```

Load-bearing details to port: board sized in `em` off a computed cell font-size
(`min(horizontal budget, (100dvh − reserve)/height, 60px)`), `dvh` not `vh`, the
`min-height: 0` chain, and the active-clue bar's reserved 3-line `min-height` (which also
happens to satisfy the no-reflow-on-state-change rule for free).

**Local feedback lives in the active-clue bar slot** (decided): the reserved 3-line strip
does double duty — normally the active clue, temporarily the `<GenericFeedbackPill>` when
feedback fires, then back. This mirrors crossplay's own `FeedbackBar` (which takes over the
header middle) and gives feedback a truly fixed-height home with zero extra layout.

**What stays mandatory regardless of layout** (the bananagrams checklist): state line,
global feedback via `StatusSlot`, the shared `<GenericFeedbackPill>` local feedback (in the
active-clue slot, above), `PeersStrip`, setup recap disclosure, Help modal, semantic buttons,
Concede (compete) / End game (coop), terminal + locally-terminal states. Plan: a slim strip
in the right column beneath the active-clue bar (state · peers · recap · actions). Exact
arrangement to be settled against real proportions during the build — but every element on
that list must land somewhere, and the exception writeup in design-decisions.md must record
where.

No turn log and no word list — the bananagrams "nothing to log" category: fills are
continuous shared state, not discrete moves.

### Components & hooks (sketch)

```
src/crosswords/
  manifest.ts            two entries: crosswords_coop / crosswords_compete; BRAND = 'CrossPlay'
  db.ts, theme.css
  logo.svg               copied from crossplay's site icon (~/src/crossplay/packages/client/public/icon.svg)
  lib/
    types.ts             Cell / PuzzleMeta / GridSnapshot (from crossplay shared/)
    cursor.ts (+tests)   ported verbatim; the navigation brain
    grid.ts              snapshot helpers: setCellFill, borders bitmask, solved-locally hints
  hooks/
    useGame.ts           game row + meta + status (standard shape, useRealtimeRefetch)
    useCells.ts          cells load + CDC subscription + version reconciliation + optimistic set
    useGridKeyboard.ts   window keydown → cursor.ts ops + set_cell (bananagrams-cursor precedent)
  components/
    PlayArea.tsx          coordinator: data, RPCs, feedback, menu (print), terminal
    Grid.tsx              the board (port of Board.tsx: em sizing, numbers, circles/shading,
                          givens, pencil styling, wrong/revealed marks, cursor + word highlight)
    ClueLists.tsx         Across/Down columns, click-to-jump, active highlight
    ActiveClueBar.tsx     3-line reserved strip
    RebusOverlay.tsx      Shift+Enter multi-char entry
    SetupForm.tsx         library picker + NYT date
    Help.tsx              rules + full keyboard map
  pdf/
    printCrosswordsPdf.ts
```

### Realtime: `useCells` is a documented deviation from `useRealtimeRefetch`

The repo's canonical per-game realtime pattern is `useRealtimeRefetch` — *refetch the whole
picture on any event* — and its docstring says new games should default to it. **`useGame`
does** (game row + status). **`useCells` deliberately does not**: with several people typing
simultaneously, refetch-per-keystroke is the wrong shape; it applies each CDC event's row
payload directly, guarded by the per-cell `version` ("newer wins" — apply only when
`event.version > local.version`, so an event older than the local optimistic write is
dropped), with a full refetch only on `SUBSCRIBED` (initial load + reconnect catch-up, same
gap-coverage the factory does). This is a third carve-out alongside the two the factory's
docstring already names (chat's append-on-INSERT, connections' broadcast-coupling) — **add it
to that "when NOT to use" list** when the hook lands, so the factory doc stays the honest map.

**Direct-apply interacts with compete privacy — handle it explicitly.** Because this repo's
privacy comes from the RLS-filtered *read*, not from Realtime withholding rows (see the
`cells` RLS note above; `psychicnum.md:334`), the raw CDC payload for an opponent's cell still
arrives. `useRealtimeRefetch` games get away with this for free — the event just triggers a
read that returns nothing. `useCells` applies payloads directly, so it must do the filtering
itself: **in compete, drop any incoming cell event whose `owner_id != auth.uid()`** before
touching state. Coop has no such concern (the shared grid is `owner_id null` and everyone sees
it). This is the one place the direct-apply optimization has to re-implement what RLS-on-read
would otherwise have done.

### Registration checklist (mechanical, for the build sessions)

`src/games.ts` import + two entries · `supabase/config.toml` schemas list (+ `supabase stop
&& start`, guarded by `schemaExposure.e2e.test.ts`) · **realtime publication** — every game
migration does `alter publication supabase_realtime add table …`; crosswords needs
`crosswords.games` + `crosswords.cells` (and the scratchpad table gets its line in the
common scratchpad migration); missing it fails silently (no error, no events) ·
`npm run types:gen` · `package.json` scripts (`crosswords:import`, aggregate `import`,
`deploy` for the edge function) · pgTAP suite under `supabase/tests/crosswords/` ·
`e2e/crosswords.e2e.ts` · `docs/games/crosswords.md` + CLAUDE.md table row when done.

## Scratchpad — the common feature

Build the `docs/deferred.md` spec, with crosswords as the first consumer ("land when one of
the games would benefit visibly" — this is that moment). Crossplay's implementation is the
working model; the old connections repo has another. **Note the scope stretch:** the deferred
spec describes only a *shared* pad; the per-player-private-in-compete variant below is a
net-new extension beyond it, so the common feature has to support both modes (shared + lock;
private + no-lock) from day one.

- **`common.game_scratchpads`**: `(id uuid primary key default gen_random_uuid(), game_id,
  owner_id nullable, body text default '' check (char_length(body) <= 10000), version bigint,
  unique nulls not distinct (game_id, owner_id))`. Surrogate PK for the same reason as
  `crosswords.cells` — this table is realtime-published and its logical key has a nullable
  `owner_id`, so a plain PK is what gives it a valid replica identity for the CDC UPDATEs.
  `owner_id null` = the shared pad (coop); in crosswords-compete each player gets a private pad
  (`owner_id = auth.uid()`, RLS-scoped) — a shared pad would leak solving progress between
  opponents. Games opt in via a manifest field (`scratchpad?: { enabled: true,
  perPlayerInCompete?: true }` — final shape at build time).
- **Takeover lock via Realtime Broadcast** (ephemeral, no DB rows): one editor at a time;
  others see read-only + "Take over" (honored after crossplay's 1s edit-grace window).
  Auto-release on disconnect falls out of Broadcast/Presence. Writes: optimistic local,
  debounced ~200ms flush of the *full text* (not diffs) via a `set_scratchpad` RPC guarded
  on membership + play state; CDC on the table syncs readers.
- **UI**: `common/components/panels/ScratchpadPanel.tsx` on `FloatingPanel` +
  `useDraggablePanel` — both already name "the future scratchpad" as their planned second
  consumer, and `useAppShortcuts` already gates keyboard capture for it. Rect persisted to
  localStorage like `FloatingChat`'s pattern.
- DB-backed body means it survives pause-unmount (the deferred spec's requirement) and
  appears in the terminal view.

This lands as its own commit(s) in `common/` + a `deferred.md` strike-through, so connections
can adopt it later without crosswords entanglement.

## PDF printing

Port `packages/client/src/print/` into `src/crosswords/pdf/` behind the standard entry point
`printCrosswordsPdf(m: CrosswordsPrintModel): void`, exposed as the standard
`menu.setGameItems` "Print board (PDF)" item (no separate print route — crossplay's
`/b/:id/print` page is replaced by the menu-item convention).

**"Verbatim" means the puzzle printer, not the answer-key printer.** `print/index.ts` exports
two entry points: `generateCrosswordPdf(state)` (puzzle + current fills — no solution needed,
this is what `printCrosswordsPdf` wraps) and `generateSolutionPdf(state, solution)` (the answer
key, which needs the shielded `solution` the FE never holds mid-game). **Drop
`generateSolutionPdf` for v1.** If an answer-key print is wanted later, gate it to the terminal
view only — coop give-up/solve reveals the solution there, so at terminal the FE actually has
it. (jspdf is `^4.2.1` in both repos, so no print-API drift to fight.)

**The PDF output itself is kept exactly as crossplay produces it today** (decided). No
restyling to the `common/pdf` conventions: crossplay's own title block stays (title left,
author/copyright stacked right — NOT `frame.ts`'s `Brand: title` + date header), no Setup
section is added, and the whole print module ports as-is — the 12-unit layout grid with
small-vs-large-puzzle clue arrangements, clue pagination onto continuation pages, and the
cell renderer (blocks, circles at 8% inset, shading, given underlines, pencil-as-italic-grey,
current fills; `revealed`/`wrong` ignored — "print shows the puzzle, not grading"). It
already went through its own design process (`crossplay/docs/print-design.md`) and is
already greyscale, so it lands within the spirit of `docs/pdf.md` without adopting its
letterforms. The only touchpoints with `common/pdf` are incidental (e.g. `savePrint`-style
filename download, if convenient).

Document this in `docs/pdf.md` when it lands as a **deliberate whole-cloth exception**: a
third body family (grid-plus-clue-columns) that also keeps its own header, so a future
consistency pass doesn't "fix" it (per the ui-consistency rule: surface deliberate
differences before reversing them).

## Implementation stages

Each stage is a committable unit with green gates (tsc -b, eslint, vitest, pgTAP, e2e where
relevant). Roughly a session each, following the boggle/stackdown build rhythm.

1. **Types + parsers (pure TS, no schema).** `lib/types.ts`, `cursor.ts` + tests ported;
   `.puz`/`.ipuz` import conversion ported into `supabase/scripts/`; content-hash util.
2. **Schema + pgTAP.** The migration: `puzzles` (column grants + the "can't read solution"
   test), `games`, `cells` (+ version trigger, mode-aware RLS), all RPCs, gametype
   self-registration, `config.toml`, `types:gen`. Tests for create/fill/check/reveal/solve/
   concede/end/RLS per suite conventions.
3. **Import + setup + coop play.** `crosswords:import` CLI; manifest pair + `games.ts` +
   logo/theme; SetupForm (library picker); Grid/ClueLists/ActiveClueBar/keyboard; `useCells`
   CDC + optimistic typing; coop solve-to-win. First playable build; layout exception
   written into design-decisions.md.
4. **Check/reveal + compete.** Check/reveal UI + RPC wiring; rebus overlay; pen/pencil;
   compete grids + private RLS + first-correct-wins + concede; terminal views (solution
   reveal on coop give-up).
5. **NYT edge function.** `crosswords-import-nyt` + SetupForm date path + cookie secret +
   `deploy` script.
6. **Common scratchpad.** The `common/` feature per its deferred spec; crosswords opts in
   (shared in coop, private in compete); `deferred.md` updated.
7. **Print + peer cursors + docs.** `printCrosswordsPdf` (verbatim port); peer cursors via
   Broadcast (required — coop doesn't really work without them); e2e suite;
   `docs/games/crosswords.md`; CLAUDE.md table row; `docs/pdf.md` exception writeup.

Stages 5–7 are order-independent after 4; reorder freely.

## Decisions (resolved with Joel, 2026-07-05)

Recorded here so the build sessions don't relitigate them; each is also folded into the
relevant section above.

1. **Brand is "CrossPlay"**, logo is the original site's svg
   (`~/src/crossplay/packages/client/public/icon.svg`).
2. **NYT cookie**: one shared edge-function secret (Joel's subscription serves everyone).
3. **Compete reveal: disabled** (check remains available).
4. **No mid-game opponent visibility in compete** — nothing, not even fill %.
5. **Library puzzles are never committed**: Joel keeps his own puzzle files and imports
   them with `crosswords:import`.
6. **Peer cursors are in stage 7 scope and required** — coop doesn't really work without them.
7. **The PDF print is a verbatim port** — crossplay's header/layout kept exactly; no
   `common/pdf` header, no Setup section.
8. **Local feedback shares the active-clue bar slot** rather than getting its own strip
   under the board.
9. **The puzzle template is ONE `meta` jsonb column** (PuzzleMeta + initial grid cells,
   matching crossplay's own supabase sketch); only `solution` is a separate, shielded column.
10. **Coop give-up ends as a neutral "finished"**, not a loss — solved is `won`, putting the
    puzzle down is just done.

### Amendments from the plan pressure-test (2026-07-05)

Corrections found by reading the crossplay source + verifying repo conventions; each is folded
into the relevant section above.

11. **`crosswords.cells` (and `common.game_scratchpads`) get a surrogate `id uuid` PK.** A
    realtime-published table with no valid replica identity makes Postgres *reject every
    UPDATE*; the logical key can't be a PK (nullable `owner_id`) nor a `USING INDEX` identity
    (same reason), and only `common.games` uses `REPLICA IDENTITY FULL` today. A throwaway PK
    is the cheapest repo-consistent fix. Replaces the plan's original "no PK" note.
12. **Compete privacy is enforced on the RLS-filtered *read*, not by Realtime.** This repo does
    NOT rely on Realtime withholding rows by RLS (`psychicnum.md:334`; no `realtime.authorization`
    config) — the CDC payload for an opponent's cell arrives on the wire regardless. So: `cells`
    RLS SELECT modeled on `wordle.guesses` (own-rows-until-terminal) covers load + terminal
    reveal, and `useCells` in compete must **drop any incoming event where `owner_id !=
    auth.uid()`**. Opponent letters being technically on the wire is fine under the trust model.
13. **First-letter answer acceptance is Schrödinger-only** (`ws.ts:513`), not general rebus;
    normal rebus needs the exact full string. Mirror `ws.ts`, not this plan's earlier prose.
14. **Print ports the puzzle generator only** — `generateSolutionPdf` (answer key) needs the
    shielded solution and is dropped for v1 (or terminal-gated later).
15. **`useCells` reconciliation is new code, not a port** — per-cell `version` (not crossplay's
    global counter); `set_cell` returns the version, FE applies CDC only when
    `event.version > local.version`. The verbatim port is `cursor.ts`.

**Watch-item (not a blocker):** every keystroke is an UPDATE + CDC fanout to all peers (no
debounce — correctly dropped). Fine at friend-scale, but crossplay's own sketch flags "4 people
speed-solving → watch row update rates"; it also brushes Supabase Realtime message quotas.
