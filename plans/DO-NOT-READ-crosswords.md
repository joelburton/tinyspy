# DO NOT READ — crosswords on the page blobs (ideas only)

**DO NOT READ THIS FILE unless Joel names it.** It records an exploration, not
a plan: nothing here is approved, decided or scheduled. No session builds from
it, folds it into an area or a plan, or cites it as precedent.

Opened 2026-10-05. Builds on
[plans/DO-NOT-READ-smaller-payload.md](DO-NOT-READ-smaller-payload.md): the
Broadcast nudge and the static split.

## Today

Crosswords is not on the page blobs. Its SQL is on the new names
(`p_game_id`); its FE still sends `target_game`.

A typed letter:

- shows at once on the typist's screen (`useCells.setCell`), and is rolled
  back if the RPC fails, unless a newer write has landed on that cell;
- calls `set_cell` with one cell, about 100 bytes — every keystroke, not
  batched. It updates one `crosswords.cells` row and bumps its `version`;
  `common.games` is untouched unless the letter solves the grid;
- reaches a teammate twice: the `crosswords.cells` row change, which
  `useCells` merges by version without a re-read, and a Broadcast `fill`
  message (`usePeerCursors`) so the letter flashes in the typist's color — the
  row does not say who wrote it. A reveal sends `fills` for the same reason.

Cursors and `showNotes` travel on Broadcast. The grid is re-read only on
joining and on reconnecting.

What that costs. A Realtime event that never arrives leaves a stale cell until
someone reconnects; no later keystroke heals it. The letter and its flash
travel on two channels, so one can arrive without the other. And the rollback
in `useCells.setCell` exists because a failed write left at the server's
version could never be repaired by any later merge; its comment is the longest
in the hook.

The grid is one `Map` in state; every change builds a new Map. `Grid` walks
every template cell on each render, and each `Cell` is wrapped in `memo` with
plain-value props, so only the changed cell touches the DOM.

## The idea

Crosswords moves onto the page blobs like every other game: each move rewrites
`game_data`, the page hears the nudge and re-reads, and `makeGameData` hands
the play surface a fresh `gd`. The per-cell subscription and the version
merging in `useCells` go.

What it buys: any later keystroke brings the whole grid, so a lost nudge is
healed by the next one; and the flash is read off the same grid as the letter,
so the two cannot disagree. Crosswords takes the shape the converted games
have — `makeGameData` over the blob, the fixture, `game_data_test` — instead of
being the one game whose live state bypasses `useCommonGame`.

### What is static

The template's `puzzle_content` — the grid's shape, blocks, numbers, givens
and clues, about 15 KB — never changes, Restart included, and goes in
`static_game_data`, read once. The solution stays out of both blobs, read on
demand as today.

### A compact grid in `game_data`

Moves come at typing speed, so the grid's encoding matters more than in any
other game. One object per cell with readable keys is about 90 bytes a cell —
about 40 KB for a Sunday 21×21. Instead, the grid is a few parallel arrays:

- **fills** — one array per row, one string per cell (`["A", "", "REBUS", …]`),
  about 4 bytes a cell;
- **the flags** — pencil, wrong, revealed and the edge marks, each a short
  list of the cells that have it (`[[row, col], …]`); most cells have none;
- **writers (coop only)** — who last filled each cell, one string of digits
  per row (`"0120…"`): 0 is nobody, otherwise the 1-based position in
  `gd.players`, which is fixed for the game. A cell's writer is set by
  `set_cell` and `reveal_cells` and cleared by `replay_board`. In compete a
  grid is filled only by its owner, so it is left out.

About 2–3 KB a grid, and a few hundred bytes more for the writers. Key names
stay readable: with the cells no longer objects, the grid has only a dozen
keys. `makeGameData` reshapes the arrays into the grid the components draw.

### Compete

Wordle's pattern: the blob carries every seat's grid, each on its player
entry, and the page draws `gd.me`'s. An opponent's grid is in the blob and
could be read through devtools, which is the case the trust model tolerates
(CLAUDE.md → Trust model). Coop carries one grid, on `team`.

### My own letters

A letter still shows before the server confirms it. The page keeps an overlay
of my unconfirmed letters, drawn over `gd`. It replaces today's per-cell
version merge, and it is what stops a re-read that started before my
keystroke from briefly undoing it.

**When a letter leaves the overlay.** Not when `gd` shows the same letter: a
teammate who overwrites or clears my cell after my write would then be hidden
behind my letter forever. A letter leaves the overlay when a read that
*started after my write was answered* has landed — when `gd` is known to be at
least as new as my write, whatever it shows for that cell. So each overlay
entry remembers when its RPC answered, each read remembers when it started,
and when a read lands:

- an entry whose RPC has not answered stays;
- an entry whose RPC answered before the read started drops;
- an entry whose RPC answered after the read started stays, for the next read.

A failed RPC drops its entry at once: today's rollback, with nothing to
compare.

### What the page does per read

The grid's render cost is today's: `Grid` walks every cell and `memo` keeps
the DOM work to the cells that changed. What is new is the decode in
`makeGameData` and that the whole play surface receives a fresh `gd`, so
everything derived from it recomputes, where today only what is keyed on
`cells` does. The converted games pay the same per move, at a far lower move
rate. Measure it on a 21×21 with two tabs typing; if it bites, memoize the
decode.

### The flash

No Broadcast. On each new `gd`, the page compares fills with the previous one;
every cell whose fill changed to something non-empty flashes in the color of
its writer. A reveal flashes the same way. A Restart blanks cells, which does
not flash. A letter typed over the same letter does not change the fill, so it
does not flash.

The `fill` and `fills` Broadcast events go; cursors and `showNotes` stay on
Broadcast.

### One read at a time

Two people typing make 5–10 moves a second. `useCommonGame` keeps at most one
read in flight: a nudge that arrives during a read marks one more read for
when it finishes. Reads then run at the speed of a round trip, whatever the
typing speed, and each brings the page fully up to date. This is a change to
`useCommonGame`, so every game gets it.

Today the hook already drops a stale answer — a generation counter lets only
the newest read commit — but it fires one read per nudge, and each read is two
PostgREST calls, `common.games` and `common.timers`. Under this idea a
teammate sees a letter after one Realtime hop plus one read round trip, and
while typing is fast, up to one more round trip waiting for the read in
flight. Two to three times today's one hop; the typist's own letter is still
immediate.

### On the server

Each `set_cell` rebuilds `game_data` from the grid and rewrites the
`common.games` row: a few milliseconds, fine for a handful of players. An
unchanged `static_game_data` is not rewritten with the row — Postgres keeps
the stored value when the column is not modified.

Every keystroke rewrites that one row, so two teammates typing already
serialize on it. The per-cell `version` column and its trigger go with the
per-cell subscription whatever the grid is stored as.

### Where the grid is stored

Two shapes. **Rows**, as today: one `crosswords.cells` row per fillable cell,
the fill and five flags as columns, the owner as a column, two indexes. **One
jsonb per grid**: a sparse object keyed by cell, `{"3:7": {fill, pencil, …}}`,
holding only cells that have something, so a blank grid is `{}`. In coop that
is one value; in compete one per racer.

| | rows | one jsonb per grid |
|---|---|---|
| at rest, a Sunday coop game | about 80 KB: 441 rows, each with three uuids, the flags, a version and two index entries | about 3–10 KB |
| per keystroke | one small dead row version | the whole value rewritten; roughly doubles the `common.games` rewrite already being paid |
| the builder | aggregates 441 rows into the arrays on every move | compacts a sparse object into the arrays, near one-to-one |
| `set_cell` | one indexed row update | one `jsonb_set` on one row |
| `create_game`, `replay_board` | insert 441 rows per grid; update the whole table | the grid is `{}` |
| `_is_solved` | join cells to the solution | walk the template's fillable cells, look each up |
| `check_cells`, `reveal_cells` | one `update … where exists` over the asked cells | a loop or a `jsonb_object_agg` rebuild; a few lines longer |
| a new per-cell attribute | a migration with `alter table add column` and a check constraint, regenerated types, the RPC, the builder — the path the edge marks took | the RPC writes a key, the builder emits it, `makeGameData` reads it; old games lack the key; validation lives in the RPC, where the fill's letters-only check already is |
| contention | different cells are different rows | one row per grid, which the `common.games` rewrite already imposes |

Two shape choices inside the jsonb option:

- **Per-cell objects, not the compact arrays.** Setting one cell is one
  `jsonb_set`; removing a pair from a list of flagged cells is not. The
  builder compacts, once, where it is tested as data. The cell object's keys
  can be the blob's keys.
- **One row per grid** — a `crosswords.grids` table keyed by game and owner —
  rather than compete's grids nested in one value on the game row. Both modes
  then address a grid the same way, and the migration is a one-to-one
  aggregation of today's rows.

Two rules the jsonb option carries:

- **A cell write is one statement**, `set grid = jsonb_set(grid, …)`, which
  Postgres applies to the current row version after waiting out a lock. A read
  into a variable followed by a write loses updates.
- **The migration keeps every letter.** Prod has live games with cells rows.
  A new migration builds each grid's jsonb from its rows with
  `jsonb_object_agg`, then drops the table — inline SQL, since a migration
  cannot call anything in `supabase/sql/`.

Leaning: the jsonb, for the last two rows of the table. The move path is no
harder, the lifecycle RPCs get simpler, and a per-cell feature stops being a
schema change in a game whose per-cell vocabulary has grown once and grows
again with the writers. The space saving is minor; the extra write volume is
a doubling of something small.

## Open

- Rows or one jsonb per grid, above.
- Whether `common.timers` needs re-reading on every nudge, or once; at typing
  speed it is half the reads.
