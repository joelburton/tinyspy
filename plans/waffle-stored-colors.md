# waffle: store each swap's colors

**Status: THE SERVER SLICE IS BUILT** — the migration (column + backfill) and
the writer in `supabase/sql/waffle.sql`. The frontend half is not started.
Joel, 2026-09-22: *"we're definitely going to do the backfill. start the
plan."*

Originally raised as PROPOSED, nothing built. Raised by Joel 2026-09-22 while the
`wordle-style` area was reading the coloring algorithm: *"should we consider
whether waffle should return the board with the colors? then no replay needed,
but it does a fair amount of data to every swap"*.

Not a scheduled sprint. It is waffle's work, not `wordle-style`'s — the area
that found it stopped at making the frontend port honest.

## Why

`waffle.events` records a swap: two positions and the two letters that were on
them. It does not record what the board then looked like, and it does not record
the colors. So the turn-history viewer rebuilds both on the frontend —
`historyBoardAfter` replays the swaps to get the board, and `computeColors`
colors it.

Rebuilding the board is free and needs no secret. **Coloring it needs the
answer**, and that is the whole cost of this design: `waffle._solution_for` hands
the solution to the coop client *during play*, and its comment names this
feature as the reason.

> COOP exposes the solution during play: it's a collaborative solve, and the
> turn-history viewer recomputes each past board's colors on the FE, which needs
> the answer… Per the trust model (server-authoritative for cleanliness, NOT
> anti-cheat)…

Three things follow from storing the colors instead:

1. **The client stops needing the answer mid-game.** That is the real prize. It
   is not an anti-cheat argument — the trust model says friends don't cheat —
   but a secret the browser never receives is simpler than a secret it receives
   and is trusted with.
2. **The TypeScript port of the coloring algorithm can go.** `wordleColors` in
   `src/waffle/lib/colors.ts` is a second implementation of
   `common.wordle_colors`, held to it by test vectors copied by hand. That
   copying has already failed once (`plans/areas/wordle-style.md` → F-2).
3. **waffle stops being the odd one.** wordle stores `colors char(5)` on every
   guess row and no frontend recomputes anything. This makes the two games agree.

## What gets stored, and how big it is

**Joel's question:** *"just want to make sure we're choosing a small data
footprint for each event: could this a 25-char string of just letters like 'G'
and 'Y'?"*

**It already is exactly that, and that is what to store.** The format every part
of waffle speaks is a 25-character string, one character per cell:

| char | means |
|---|---|
| `g` | right letter, right spot |
| `y` | in the word, wrong spot |
| `x` | not in the word |
| `.` | a hole — never colored |

`waffle.board_colors(board, solution)` returns it, `players_state.colors` carries
it, the frontend's `computeColors` produces it, and `tileColor` maps one
character to one CSS class. So the column is `colors char(25)`, matching
`scramble` and `solution` on `waffle.games` and `wordle.events.colors char(5)`.

**Twenty-six bytes per row** — twenty-five characters plus Postgres's one-byte
length header for a short value. Against a swap row that already carries two
uuids, a bigint, two ints, two chars, a timestamp and a kind, this is roughly a
third again on a very small row. A game is `max_swaps = par + extra_swaps` rows,
so on the order of fifteen: **about 400 bytes per game.**

**Packing it smaller was considered and rejected.** Four states fit in two bits,
so twenty-five cells pack into seven bytes. That saves nineteen bytes on a row
whose per-tuple overhead alone is more than that, and it costs a decode on both
sides plus a second format that `_player_colors_for` and the frontend do not
speak. Not worth it.

## The board is NOT stored

Joel's framing was "return the board with the colors". The recommendation is
**colors only**, on the grounds that the two halves are not alike:

- The **board** after swap N is the scramble with N swaps applied. It is a pure
  string operation over rows the client already has, it needs no secret, and
  `historyBoardAfter` is nine lines. Storing it buys a little speed and nothing
  else.
- The **colors** are the only part that requires the answer, which is the only
  part that forces a design decision.

So the replay stays and the recompute goes. If the board is stored too, it is
for its own reasons, later.

## The code changes

- **`supabase/sql/waffle.sql`** — **DONE.** `submit_swap` writes
  `waffle.board_colors(new_board, g_row.solution)` onto the events row it
  inserts, computed from the same `new_board` the rest of the block uses rather
  than read back off `players`. Behavior, so an in-place edit of
  `supabase/sql/`, forever, not a migration. The whole pgTAP suite passes with
  the column `not null` (2545 tests).
- **`src/waffle/lib/history.ts`** — `historySnapshot` reads `colors` off the row
  instead of calling `computeColors`. `historyBoardAfter` stays.
- **`src/waffle/lib/colors.ts`** — `wordleColors` and the private `rank` go;
  `computeColors` goes with them once its three remaining call sites are handled
  (below). The file may end up empty and deleted.
- **The three `computeColors` call sites left in `PlayArea.tsx`** (421, 603, 616)
  are all `computeColors(x, x)` — the solution colored against itself, which is
  green on every filled cell and `.` on every hole. They want a constant, not an
  algorithm. Worth checking whether a helper on the solution string is clearer
  than the call they make today.
- **`waffle._solution_for`** — its coop-during-play branch loses its stated
  reason. **Do not change it in the same step.** Tightening it is a visible
  gameplay change (the reveal, `PlayArea.tsx:421`'s read of `game.solution`) and
  deserves its own decision with its own pgTAP.

## Visibility: nothing new leaks

Checked 2026-09-22, and this is settled rather than open. `events_select`
(`supabase/sql/waffle.sql:172`) already gates the row:

```sql
and (g.mode = 'coop' or events.user_id = (select auth.uid()) or cg.is_terminal)
```

Coop shares the log; in compete you see only your own rows until the game is
terminal. A colors column rides on a row a compete opponent cannot see mid-game,
and by the time they can see it the boards are revealed anyway. There are no
column grants to reason about — `grant select on waffle.events to authenticated`
is the whole grant and RLS is the only gate.

`compete_test.sql` pins it four ways: mid-game a player sees only their own
swaps, no opponent rows leak, at terminal both logs open, and the game-wide
numbering survives.

## The migration for old games

**This is the hard half, and it decides whether the change is worth making.**
Every waffle game on prod has swap rows with no colors. Without a backfill the
frontend must keep the port for pre-migration games, and none of the three
payoffs arrive.

Two files, per `docs/supabase.md` → Schema vs code:

- **`supabase/migrations/<ts>_waffle_event_colors.sql`** — shape: add the
  column, backfill it, then set it `not null`. A new timestamped file; never an
  edit to an applied one.
- **`supabase/sql/waffle.sql`** — behavior: `submit_swap` writes it. Re-applied
  in full on every deploy.

### The backfill

Everything it needs is already stored: `waffle.games.scramble`, `.solution`, and
the swap log. Per board, replay forward from the scramble and color each state.

**Whose board is "the" board depends on the mode**, and getting this wrong is
the way to write plausible, wrong colors into every compete game:

- **coop** — one shared board. The sequence is every event in the game, ordered
  by `id`.
- **compete** — a board per player. The sequence is that player's events only,
  ordered by `id`. (`history.ts` says the same thing in its own words: a
  snapshot is resolved against *"a single player's swap log — never a mixed
  list"*.)

The step itself, mirroring `historyBoardAfter` exactly — after a swap, `pos_a`
holds what was on `pos_b` and vice versa:

```
board := scramble
for each event e in the sequence, by id:
    board := overlay(board placing e.letter_b at e.pos_a + 1)
    board := overlay(board placing e.letter_a at e.pos_b + 1)
    e.colors := waffle.board_colors(board, g.solution)
```

**The stored letters are a free assertion.** `letter_a` is what was on `pos_a`
*before* the swap, so `substr(board, pos_a + 1, 1) = letter_a` must hold at every
step. If it ever doesn't, the log and the scramble disagree and the backfill
should raise rather than write a colored board nobody can trust.

### What building it found

**A migration may not call `supabase/sql/`.** The first version of the backfill
called `waffle.board_colors` and failed on the very first local apply:

```
ERROR: function waffle.board_colors(text, text) does not exist (SQLSTATE 42883)
```

That file is behavior and is applied AFTER every migration. It is not a local
quirk — it is worse in the place that matters. `db-rehearse` restores
production's rows with `pg_restore --data-only` (no functions) and replays the
held-back migrations BEFORE applying `supabase/sql/`, so the one database with
both real rows and a real need for the function would not have it either.

So the migration carries the coloring itself, in `pg_temp`: three functions
copied verbatim from `common.wordle_colors`, `waffle._color_rank` and
`waffle.board_colors`, alive for that session and no longer. **It is a third
copy of an algorithm this plan exists to stop duplicating**, and the defense is
that it is frozen: a migration runs once and is never re-applied, so it cannot
drift and cannot be called by anything. The proof below compares it against the
live function rather than trusting that.

### The local proof

`db-rehearse` is the shipping proof and still has to be run. But the backfill
was exercised against real rows locally first, because a `db reset` gives it
zero rows and it is possible to be wrong in a way rehearsal would only reveal
late.

The script builds two real games through the real RPCs — a coop game with four
swaps by two players on the shared board, and a compete game with five swaps by
two players INTERLEAVED in one log — then keeps what `submit_swap` wrote as the
oracle, nulls every `colors`, and runs the migration's own text (extracted from
the file, not retyped). Result:

| check | result |
|---|---|
| rows left uncolored | 0 of 9 |
| rows disagreeing with what the live writer stored | 0 of 9 |
| boards where the `pg_temp` copy differs from `waffle.board_colors` | 0 |

**And it has teeth.** Planting the mistake the plan warns about — replaying
compete as one shared board instead of one per player — produces **4
disagreements**, which are exactly the compete rows. The per-mode partition is
load-bearing and now demonstrated to be.

### Proving it on production's rows

- `supabase migration list --linked` for the real cut — never guess `SINCE`.
- `gmake db-backup ENV=prod`, then `gmake db-rehearse ENV=local DUMP=… SINCE=…`.
  **A `db reset` proves nothing here**: it builds an empty database, so the
  backfill runs over zero rows and reports success. The rehearsal is the only
  evidence.
- On the rehearsed database, check that no `colors` is null before the `not
  null` lands, and spot-check a finished coop game's last row against
  `players_state.colors` for that game — they must be the same string.
- `gmake db-drift` on the rehearsed database: "none — matches the baselines".
- `gmake db-reset ENV=local` afterwards to put the dev personas back.

### If the backfill is refused

Then the column is nullable forever and `history.ts` keeps a fallback path for
old games — which means keeping `wordleColors`, its vectors and its drift
problem. **That is the version of this change that is not worth doing**, and it
should be said out loud rather than discovered halfway.

## Open questions for Joel

1. ~~**Backfill, or not at all?**~~ **ANSWERED 2026-09-22: yes.** It is in the
   migration, so the column lands `not null` in one step.
2. **Does `_solution_for`'s coop branch get tightened afterwards**, in its own
   step, or does coop keep the solution during play for the reveal's sake?
3. **Does the board get stored too**, against the recommendation above, if the
   replay turns out to matter for something else?

## Out of scope

- wordle. It already stores its colors per guess and recomputes nothing.
- The shared `shared/wordle-style` folder. `tileColor` maps a stored code to a
  class key and is unaffected by where the code came from.
- Deleting the per-letter algorithm from SQL. `common.wordle_colors` stays; it
  is what computes the string this plan stores.
