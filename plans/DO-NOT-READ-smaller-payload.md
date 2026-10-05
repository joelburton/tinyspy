# DO NOT READ — a smaller payload per move (ideas only)

**DO NOT READ THIS FILE unless Joel names it.** It records an exploration, not
a plan: nothing here is approved, decided or scheduled. No session builds from
it, folds it into an area or a plan, or cites it as precedent.

Opened 2026-10-05.

## The problem

### What a move costs

`useCommonGame` subscribes to `postgres_changes` on `common.games` (filtered
to the game) and treats each message as "something changed": it ignores the
payload and re-reads `shell_data, game_data`. A converted game's page
subscribes to nothing else.

Realtime sends one message per row write, not per transaction: every `UPDATE`
makes a new row version, and each is its own record in the write-ahead log
that Realtime reads. So every separate `update common.games` inside a move's
RPC is its own message, and its own re-read. `common.games` is
`replica identity full`, so each message also carries the whole old row and
the whole new row.

What writes `common.games` during a move:

| writer | when |
|---|---|
| `<game>._rebuild_data_cols` (converted games) / `<game>._write_statuses` (the rest) | every move, at the end |
| `common._advance_turn` | turn-taking games only; a no-op otherwise |
| `common._end_game` | the move that ends the game |
| `wordle._sync_title`, `waffle._sync_title`, scrabble's title update | every move, changed or not |

| writes in the move | rows in the messages | re-reads | copies of `game_data` per player |
|---|---|---|---|
| 1 (psychicnum, connections, no turns) | 2 | 1 | 3 |
| 2 (wordle; psychicnum, connections taking turns) | 4 | 2 | 6 |
| 3 (wordle taking turns; scrabble) | 6 | 3 | 9 |

Every club member on the club page receives the same messages through
`useClubGames`.

### How big `game_data` is

Six letterboxed boards built locally by `letterboxed-build-board` (default
setup: band 5, coop):

| board | playable words | `puzzle.words` | all of `game_data` | stored on disk |
|---|---|---|---|---|
| ISG-RMK-YNF-WLT | 457 | 4.3 KB | 5.7 KB | 2.8 KB |
| VHE-SAC-UOD-IFW | 587 | 5.2 KB | 6.7 KB | 3.3 KB |
| RMO-BNP-IYZ-DEA | 1,097 | 10.1 KB | 11.8 KB | 5.8 KB |
| IES-UAC-MFL-GZT | 1,177 | 10.9 KB | 12.6 KB | 5.9 KB |
| NRV-MWT-DUH-OGE | 1,243 | 12.3 KB | 14.2 KB | 6.2 KB |
| RAK-MCH-FSP-IUE | 1,813 | 17.7 KB | 20.3 KB | 8.5 KB |

About 12 KB of JSON on average, 75–90% of it the word list, which never
changes. The local fixture games are much smaller and are not a fair sample.

## Part 1 — a Broadcast nudge instead of row changes

The clearer win, and it can ship first, on its own.

The function that writes a game's statuses — `_rebuild_data_cols`, or
`_write_statuses` in the five unconverted games (bananagrams, crosswords,
scrabble, setgame, strands) — runs once at the end of every move. It also
sends one Broadcast message:

```sql
perform realtime.send('{}'::jsonb, 'changed', 'game:' || p_game_id, false);
```

`useCommonGame` already joins the `game:<id>` room for manual pause and
suspend. It adds a `changed` handler that re-reads, and drops its
`postgres_changes` subscription and the `onPostgresAttached` re-read that
went with it; the re-read on joining stays. Games don't change: they are
handed `game_data` as before.

One message and one re-read per move, however many times the RPC wrote the
row, and the message carries only what we put in it.

**Verified locally (2026-10-05).** `realtime.send` is an `INSERT` into
`realtime.messages`, which Realtime reads through logical replication: a
rolled-back transaction's send is never delivered, and a committed one
arrives at the commit, not at the call. It catches its own errors as a
`WARNING`, so a failed send never fails the move — the page just stays stale
until its next re-read.

A public room is fine: anyone who knows a game id could hear "changed", which
under the trust model is nothing.

### Open

- **Common functions that change the page without a game's status writer
  after them.** `common.delete_game` — today the page hears the DELETE; it
  needs its own nudge, or a player on a deleted game is never told.
  `set_current_view` / `unset_current_view` — check whether the game page
  shows anything they write. The rest (`_end_game`, `_advance_turn`,
  `_reset_game`, `_assign_turn_order`, `_create_game`) run inside a game RPC
  that ends with its status writer.
- **Writes outside `common.games` the page shows** — joining a game,
  `common.timers` — check each ends in a status write.
- **The club page.** `useClubGames` keeps its `postgres_changes` subscription
  until it gets its own nudge (a `club:<handle>` room, sent from the same
  place). It works either way, so it can come later.

## Part 2 — split what never changes out of `game_data`

After Part 1, each move costs one re-read of the whole `game_data`. This
shrinks that re-read.

### Two columns

- **`static_game_data`** — what a reader needs only once: letterboxed's whole
  `puzzle`, a crossword's grid and clues.
- **`game_data`** — what it is today, minus the static part.

The status writer writes both. A field that can change goes in `game_data`.

### Read through an RPC

The page reads both through a `security definer` RPC whose first line checks
that the caller may see the game (`common._require_club_member`, or a seated
check, since there is no spectating). It takes an argument, which a view
can't, and it states its check.

The reader sends a fingerprint of the static it holds (null when it holds
none — for example `md5(static_game_data::text)` as a generated column). The
RPC sends `static_game_data` only when the fingerprint differs, and always
returns the current one. Proposed, not yet agreed; it covers:

- overlapping loads — each asks for static until static has actually arrived;
- a status writer that rewrites static — one re-fetch, never a stale board;
- a game whose static is genuinely null — "not sent" and "null" stay apart.

Part 1's nudge could carry the fingerprint, so a reader can tell whether to
ask for static before it asks.

The FE caches static in `useCommonGame`'s state. A different game id needs no
handling: `GamePageGate` unmounts everything below it when the id changes.

### `gd` keeps its shape

Each game's `makeGameData` reads each field from where it lives and puts it in
its place in `gd`, so `gd`, the components and the fixtures do not change.

### Per game

- **letterboxed** — the whole `puzzle` goes static, `solution` included: we
  don't hide answers from friends. "Null until the game ends" moves from the
  status writer to `makeGameData`, which sets `gd.puzzle.solution` only once
  `ended`. `docs/games/letterboxed.md`'s `game_data` row changes with it.
- **crosswords** — not on the page blobs yet, and already shaped for this: the
  template's `puzzle_content` (grid, clues, givens, about 15 KB) never changes,
  Restart included; a keystroke is one `crosswords.cells` row over its own
  subscription; the solution is read on demand.
- **scrabble** — not on the page blobs yet. Its size is the move history
  (about 400 bytes a move, about 12 KB by the end), not anything static, so it
  gains from Part 1, not Part 2. Today each move re-reads the board, every
  player and the whole history 2–3 times through its own subscriptions to
  `scrabble.games`, `scrabble.players` and `scrabble.events`; on the page blobs
  that becomes one re-read.
- **bananagrams** — left out: its board is always different by design.
- **the rest** — each game's blob is checked for what is static.

### Open

- `makeGameData` re-derives the static parts (`tilesById`, the word flags) on
  every move, as it does today; memoizing on the fingerprint becomes easy.
- `docs/supabase.md → Reading data` is already out of date for the converted
  games (root `todo.md`); this would change that section again.

## Column grants — optional now

Revoking table-level `select` on `common.games` and granting only the small
columns (`id`, `club_handle`, …) shrinks `postgres_changes` messages:
`realtime.apply_rls` checks `has_column_privilege` per column on both the new
and the old row, and requires the primary key to stay granted. After Part 1
the game page receives no row changes, so this only matters for the club page
(until it has its own nudge) and for forcing reads through Part 2's RPC.
Before any grant changes, every reader of `common.games` needs a census:
`useCommonGame`, `GamePageGate` (`shell_data`), `useClubGames`, and any
non-definer SQL function.
