# events — one shape for every game's log table

**Status: phase 4 done (wordiply awaiting review); stackdown and scrabble are left.** Agreed with Joel
2026-09-17, in the conversation that began as `history-always-available` and
turned out to be sitting on top of a schema question.

**Nothing deploys until all three plans are finished** (Joel: *"we're going to
do them all, though, and we'll never deploy before we complete all"*). That is
what lets the three be sequenced freely, with no compatibility shims and no
dual-running code paths.

| plan | what |
|---|---|
| **events.md** (this file) | the schema: one `events` table per game, a `bigint identity` key, `kind`, `created_at`, `took_turn`, and the end of `seq` |
| [scrabble-ai-players.md](scrabble-ai-players.md) | the three bots become real users, which is what lets scrabble's `user_id` be `not null` |
| [event-log.md](event-log.md) | the frontend: the `turn-log` → `event-log` vocabulary, then compete turn history |

Order: **events → scrabble-ai-players → event-log.**

> **Review notes at the end of this file (§14) — read them before starting any
> phase.** They are feedback from a second reader, not rulings, and several of
> them correct what this plan says about the code.

## 1. Why — we are finishing a convention, not inventing one

Ten games keep a chronological log of what happened, under four different table
names, with four different keys and five different timestamp columns. But look
at the three newest ones (all August 2026):

| game.table | kinds | timestamp | key |
|---|---|---|---|
| `letterboxed.events` | played · undone · cleared · hint · **spoiler** | **created_at** | **bigint identity** |
| `setgame.events` | claim · hint | **created_at** | **bigint identity** |
| `strands.events` | guess · hint | **created_at** | uuid |

The shape this plan asks for is the shape those three already converged on. The
sweep brings the older seven up to it, and the three newest need almost nothing.

The immediate reason to do it now: the turn-history viewer needs a **stable row
identity** to address a past turn by, and three tables have none (their key is
`(game_id, user_id, seq)`, which forces the frontend to build `${user_id}:${seq}`
handles). See [event-log.md](event-log.md) §2.

## 2. The shape

Every game's log table is `<game>.events`, and carries these five columns
whatever else it holds:

```sql
create table <game>.events (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references <game>.games(id) on delete cascade,
  user_id    uuid not null references common.profiles(user_id) on delete cascade,
  kind       text not null check (kind in (…this game's kinds…)),
  took_turn  boolean not null default false,
  created_at timestamptz not null default now(),
  -- …the game's own payload columns, unchanged…
);

create index <game>_events_game_id_id_idx on <game>.events (game_id, id);
```

That index is the one an `order by id` read within a single game wants.
letterboxed and setgame already carry it; the older seven have `(game_id)` or
nothing, and pick it up in their phase (§14.9).

Read `order by id`, never by the timestamp: two rows written in one transaction
tie on `created_at`, and the log's whole meaning is its order.

**`kind` is what the player DID; the payload says how it went.** A refused
wordiply guess is `kind = 'guess'` with `valid = false`; strands' six `result`
values all sit under `kind = 'guess'`. No game gets a kind meaning "a bad move".

### Two invariants, ruled 2026-09-17

**1 — `kind` is always knowable before the request.** The player knew which kind
of event they were asking for, so the frontend knows it before the call and the
RPC never picks a different kind based on what it finds. One RPC may serve two
kinds — letterboxed's `log_hint_or_spoiler` takes the kind as an argument and
only validates it (PN415) — and an RPC may well choose the WORD or compute how
it went: psychicnum's hint picks which clue, strands decides
theme/spangram/invalid, wordle computes the colors. None of that moves the kind.

Checked against every insert site, and it holds without exception: each writes a
literal, one per RPC branch. No `case`, no variable, anywhere. (Two edges worth
knowing. **Three tables declare a `default` on `kind`** — stackdown `'word'`,
psychicnum `'guess'`, strands `'guess'` — and stackdown's word insert relies on
its default rather than naming the literal. The skeleton above has no default:
drop all three and write the literal at every insert, since a kind that is
mandatory everywhere should not arrive by default anywhere. letterboxed and
setgame are the model. And scrabble's `leftovers` is the one row no player asks
for: `end_game` decides whether it exists at all. Even there the kind is not in
question, only whether there is a row.)

This is what lets `kind` be a check-constrained literal at every insert, and it
is why a game can show its pill before the round trip.

**2 — `took_turn` may NOT be knowable up front, and that is fine.** It is the
server's judgment about what just happened, so it is written by the RPC and read
back, never predicted by the client. wordiply is the case: one submit, one
`kind = 'guess'`, and whether it cost the player their go depends on the
`reason` the server computes — `too_short` and `missing_base` do, `not_a_word`
does not.

The two together are why `kind` is a constraint and `took_turn` is a column the
RPC fills in.

**Payload columns are not part of this sweep.** `connections.events.mode`,
`strands.events.path`, `setgame.events.board_after` and the rest stay exactly as
they are. This plan changes the skeleton, not the game.

`connections.events.mode` looks like a denormalization worth trimming and is
not: its two partial unique indexes filter on it
(`where result = 'correct' and mode = 'coop'` / `'compete'`), and **a partial
index predicate cannot contain a subquery**, so the mode has to be on the row
for those indexes to exist at all. They are the race-idempotency enforcers —
two players matching one category at the same instant, the second INSERT
raising `unique_violation` for `submit_guess` to catch as a no-op — and they
are why connections needs no matched-categories table. (Its other stated
reason, avoiding a join in RLS, is softer: the policy already joins
`connections.games` for `club_handle`, so `g.mode` is in scope, which is what
psychicnum's equivalent policy reads.) Both index names move with the rename.

## 3. The rulings

All from Joel, 2026-09-17.

- **`bigint identity`, everywhere.** *"definitely bigints; 'be consistent where
  at all possible' is one of our goals here."* Three tables keep the key they
  have; three uuid keys are replaced; four composite keys are replaced. Nothing
  anywhere references a log row's id — the log tables are leaves — so replacing
  a key is structurally free.
- **`created_at`.** *"'guessed_at' read well but asking for a hint isn't a
  guess. 'created_at' feels like that's a good generic name."*
- **All five `seq` columns are dropped** — see §5.
- **`spoiler`, never `reveal`**, for handing over the answer to one move.
  *"'spoiler' is a better name; we current use 'reveal' to mean 'Revealing the
  solution at terminal', not 'show me the answer for a move'."* So psychicnum and
  stackdown rename their `reveal` kind; letterboxed already says `spoiler`.
- **A one-value `kind` still gets a check constraint.** *"definitely a check."*
- **codenamesduet is OUT.** *"out; it has a different shape and if we want to
  change that, we'll do it separately. all we'll need is that i can make its
  current turn-log."* It keeps `clues` + `guesses` and its `turn_number`; the
  frontend work must keep its log working unchanged.
- **The turn number is derived, never stored** — see §4.
- **Derive and backfill `took_turn` for existing rows.** *"yes, derive and
  backfill. that way, people can continue shelved games."*
- **Rename, don't recreate** (§7).

## 4. Three numbers, and only one of them is a column

This is the distinction the whole design rests on, and it took a conversation to
find:

1. **The ordinal** — "this is the 3rd row of what you are looking at". Pure
   presentation, computed in the frontend from the displayed list, filter
   dependent, never stored. It is what the log shows as `#N`.
2. **The metered number** — "your 3rd of 6 guesses", "cleared in 14 turns".
   Derived, never stored. Where the meter counts GOES it is simply
   `count(*) where took_turn` — wordle's six guesses, waffle's swap budget,
   psychicnum's budget. Where it counts something else it keeps its own
   predicate: wordiply's five SLOTS (only an accepted word fills one, though a
   `too_short` reject still costs a go), connections' four MISTAKES (a `result`
   test), letterboxed's chain length (a fold, since an undo removes a word).
   Correct in every mode by construction, and — this is why it is safe — it
   counts only the caller's own rows, which are the rows RLS always shows them.
3. **`took_turn`** — stored, because it is a decision the RPC made that no
   predicate over the row can recover. wordiply is the proof: `too_short` and
   `missing_base` rejects cost the player their turn, a `not_a_word` reject does
   not, and all three are `kind='guess'` rows with `valid=false`. The only way to
   know is to re-implement `reason in (…)` at every read site, or to write it
   down once.

The per-player counters (`wordle.players.guesses_used`,
`waffle.players.swaps_used`, psychicnum's `guesses_remaining`) stay as they are
and remain the authority for what was actually spent. Joel: *"given that all
writes go through an RPC, i'm less worried about drift here, and i think these
play a useful role in club listings and such."*

## 5. The five `seq` columns all go

One column name doing four jobs, and every job is now done by something else.

| column | what it did | why it goes |
|---|---|---|
| `scrabble.plays.seq` | the game-wide move number, and the history handle | `id` is the same fact |
| `wordle.guesses.seq` | *looks* like the board row; actually the key, the read order, the peer-dedup key — **and the club-list subtitle**, which picks the latest guess with `order by gx.seq desc limit 1` twice in `_sync_title` | all of them become `id`. Nothing places a tile by it — `lib/history.ts` says the board replay indexes by list position |
| `waffle.swaps.seq` | a per-player count, displayed as `#N` | the ordinal supplies the display; `players.swaps_used` holds the live count |
| `wordiply.guesses.seq` | the five-slot index, null on rejects | exactly the metered number under the predicate `valid = true`; the nullability *is* that predicate written as a constraint |
| `stackdown.submissions.seq` | nothing but the key | `id` |

wordiply's `guesses_valid_shape` check loses its `seq` clauses and reduces to
`(valid and reason is null) or (not valid and reason in (…))`.

**`seq` has SQL readers, not just frontend ones** (§14.5). wordle's club-list
subtitle orders by it twice; scrabble's status view builds its move string with
`string_agg(… order by p.seq)`. When a game's `seq` goes, grep that game's
`supabase/sql/` file for it as well as its `src/` folder — both become
`order by id`.

## 6. Per game

**`took_turn`, read from the code** — every `common._advance_turn` call site,
plus scrabble's own `_advance_seat`. Those branches are the evidence, not the
definition (§8): they are each game saying "that was a go", and the backfill
applies that judgment in every mode.

**The terminal move is a turn.** §8 rules it, and the table above says so row by
row — an implementer reading "non-terminal" out of the rotation branches would
write the wrong CASE. It also decides HOW the column is written: wordle and
waffle insert the log row BEFORE they compute `out_terminal` (`wordle.sql`
inserts at the guess, decides terminal forty lines later; waffle the same), so a
"non-terminal" definition would force a post-insert UPDATE in every move RPC.
Under §8 the value is knowable at insert time — rejects `raise` and write
nothing — so `took_turn` is a literal in the insert (§14.3).

**setgame's `record_hint` is gated by `_require_turn` and never advances**, its
comment calling a hint *"part of YOUR TURN"*. Only `claim` is a turn there; the
gate is not evidence of one, and a backfill reviewer should not read it as one.

**Each phase confirms its game's answers rather than assuming them.** The
rotation's answers were made for a different question — *"should the next player
act now?"* — and a game may reasonably decline to punish a misfire with a lost
turn while still counting it as an attempt. They agree today as far as the read
went (strands and wordiply both treat a kind miss as no turn, deliberately), but
that is a check, not a given. stackdown had no answer at all until Joel gave one.

| game | table → | key → | timestamp → | kinds → | seq | `took_turn` is true for |
|---|---|---|---|---|---|---|
| **psychicnum** | `guesses` → `events` | uuid → bigint | `guessed_at` | guess · hint · **spoiler** | — | an accepted `guess`, the terminal one included |
| **wordle** | `guesses` → `events` | **composite** → bigint | `guessed_at` | **guess** (new) | drop | an accepted `guess`, the terminal one included |
| **connections** | `guesses` → `events` | uuid → bigint | `guessed_at` | **guess** (new) | — | an accepted `guess` — both the correct and the wrong/oneAway branches, the fourth group and the fourth mistake included |
| **letterboxed** | — | — (bigint) | — | **word** · **undo** · **clear** · hint · spoiler | — | a played `word` (the twelfth-letter one included), an `undo` (costing your turn is what stops it being a free reroll), **and a `clear`** — Joel, 2026-09-17: *"yes, it uses a turn and it can't be played in turn-by-turn coop."* The two facts sit together: a clear is a turn wherever it can happen, and turn-by-turn coop is where it cannot (PN411) |
| **setgame** | — | — (bigint) | — | claim · hint | — | an accepted `claim`, the last one included |
| **strands** | — | uuid → bigint | — | guess · hint | — | a `guess` whose result is `theme`, `spangram` or `hint_word` (the solving trace included) — a rejected trace is "a misfire, not a turn" |
| **stackdown** | `submissions` → `events` | **composite** → bigint | `submitted_at` | word · hint · **spoiler** | drop | **`word` (accepted or refused) and `spoiler`** — Joel, 2026-09-17: *"stackdown uses a turn on word and spoiler. a good or bad word still uses a turn."* Not derivable from code: stackdown has no rotation (see below), so nothing ever had to rule on it |
| **scrabble** | `plays` → `events` | **composite** → bigint | `played_at` | word · exchange · pass · **leftovers** | drop | coop: a `word` (the going-out one included), and an `exchange`. compete: `word`, `exchange` and **`pass`** — via its own `_advance_seat` (§8). Joel, 2026-09-17: *"a pass in scrabble is took_turn (it advances to next player)."* `leftovers` is not a turn — `end_game` writes it, no player did it |
| **waffle** | `swaps` → `events` | **composite** → bigint | `swapped_at` | **swap** (new) | drop | an accepted `swap`, the solving or last one included |
| **wordiply** | `guesses` → `events` | — (bigint) | `guessed_at` | **guess** (new) | drop | an accepted `guess` (the fifth included), **and** a reject whose reason is `too_short` or `missing_base` — but not `not_a_word` |

Renamed kinds, in one place so nothing is missed: psychicnum and stackdown
`reveal` → `spoiler`; scrabble `forfeit` → `leftovers`; letterboxed `played` →
`word`, `undone` → `undo`, `cleared` → `clear`.

**stackdown is the one shared-board game with no rotation, and it is deliberate.**
Zero `_require_turn` / `_advance_turn` references, and `docs/features.md`'s
"Opt-in turn-by-turn coop" tag lists nine games — exactly the nine that call
`_assign_turn_order` — with stackdown absent and the condition stated as
*"Discrete-move coop games only."* Its own doc says why: *"each player builds
words independently: in-progress selections are private, not broadcast, so
teammates try words in parallel instead of taking turns on one shared word."*
Turn-by-turn there would mean watching a teammate assemble a word you cannot
see. So `took_turn` is `false` on every stackdown row — and stays a useful
column, because it starts being true the day stackdown opts in. Whether it
should is a game-design question, not this sweep's.

**`leftovers`** is the coop row `end_game` writes when the table stops with tiles
still in the shared rack, carrying their value as a negative score. Named for the
arithmetic, not for a judgment: its outcome is `neutral`, and both "forfeit" and
"penalty" imply a punishment the row deliberately does not make. That it is
logged on one ending out of five is a separate bug, filed in
`src/scrabble/todo.md`.

## 7. Rename, don't recreate

`alter table <game>.<old> rename to events` keeps every row, every index, and —
the load-bearing part — **membership in the `supabase_realtime` publication**,
because Postgres tracks the table by OID. A recreate-and-copy would drop out of
the publication and give us the deaf window in
[docs/realtime-lost-events.md](../docs/realtime-lost-events.md): the game goes
quiet and nothing fails loudly.

The publication lines live in frozen migrations and are not edited. Their text
becomes historical, which is what a frozen migration is for.

**Constraints, indexes and policies are renamed with the table.** A table called
`events` whose key is `guesses_pkey` and whose policy is `guesses_select` reads
wrong forever, and the repeatable half's `drop policy if exists guesses_select`
would leave the old policy alive under a new one. Joel: *"rename."*

**The publication IS guarded, and more strictly than a rename needs.**
`supabase/tests/common/realtime_publication_test.sql` is a bidirectional
`set_eq` over `pg_publication_tables` naming every log table by schema and
name, so an extra or missing table both fail it. Each phase edits that file's
expected pair for its game, and the test going red at the rename until the edit
lands is the check. Do not write a second guard (§14.1).

## 8. `took_turn` — every game has turns

**THE RULE, ruled 2026-09-17** (Joel):

> *"all games have a 'turn'; this may not always be important except in compete
> ('claude won because he used fewer turns') or turn-by-turn-coop, but we still
> track the 'turn'."*

So `took_turn` answers **did this event use up one of the actor's goes?** — in
every game and every mode, whether or not a rotation is running. In turn-by-turn
coop it is also what moves the pointer; in free-for-all and compete nothing
moves, and the fact is recorded just the same, because the game still wants to
count it.

That is why it is stored and not derived: it is the game's own judgment about one
event, made at write time, and it is what a compete comparison ("fewer turns")
and a coop report ("cleared the board in 14 turns") both count.

**Whether a kind is a turn is a per-game rule, not a principle.** Joel: *"we may
change a game so that getting a hint is a player's turn."* Today's answers are
in §6 and no global shortcut produces them — stackdown spends a turn on a
spoiler where psychicnum does not.

**It is deliberately NOT the mechanism.** Naming it `advanced_turn` — "it called
`common._advance_turn`" — would have made the column lie in three places:

- **stackdown has no rotation at all**, so a mechanism-shaped column is false on
  every row of that game forever.
- **scrabble compete rotates by its own pointer** (`scrabble._advance_seat`, four
  call sites), not `common._advance_turn`. A word in scrabble compete absolutely
  is the actor's turn; it just doesn't touch the common pointer. (And the reason
  it has its own is the AI seats — see
  [scrabble-ai-players.md](scrabble-ai-players.md) §6, where retiring that
  pointer becomes possible.)
- **the terminal move advances nothing** — every game leaves the pointer as it is
  at terminal — so a mechanism-shaped column says `false` on the winning move,
  and a reader cannot tell "this wasn't a turn" from "this was the last one".

Under the rule, the terminal move is `true`, scrabble compete's moves are
`true`, and stackdown's word and spoiler rows are `true` even though stackdown
has no rotation at all.

**So the backfill is not "the branches that call `_advance_turn`."** Those
branches are EVIDENCE — each one is the game saying "that was a go" — but the
judgment they encode is applied in every mode, plus the terminal branch of the
same move kind, plus scrabble compete's `_advance_seat` branches, plus the games
and kinds no rotation ever had to rule on.

## 9. The backfill, and how it is tested

The risk: `supabase db reset` produces an empty database, so at the moment a new
migration runs there are no old-shape rows. The normal loop never executes the
backfill, and prod is the only place with real data.

**Phase 0 — a rehearsal harness, mostly assembled already** (§14.7). Two of its
three parts are in the Makefile: `db-backup` (a `-Fc` dump of auth plus every
app schema, data only) and `db-restore` (data-only, FK-ordered, single
transaction). What phase 0 adds is the sequencing, and it has one non-obvious
step: **the local database must be at the OLD shape when the dump is restored**,
so the pending migration file has to be absent while `db-schema-sql ENV=local`
runs, then put back and applied alone with `supabase migration up`. Then
`npm run test:db` and the row counts. Do NOT run `db-seed` or `db-data` after
the restore — `db-data`'s stackdown reload deletes restored boards. The dump
holds real accounts and chat, so confirm `backups/` is gitignored before the
first run.

**Every backfill migration self-checks and aborts.** The migration is the only
code that will ever see prod's old rows:

- row-count conservation across the rename;
- no `null` left in a column about to become `not null`;
- the per-game invariant — `took_turn` true exactly where §6 says.

**Statement order, so no half-done state can commit:** add the column nullable →
backfill → verify → `set not null`, all in one migration.

**An identity column backfills in SCAN order, not by time** (§14.6, verified on
the local database in a rolled-back transaction). `add column … generated always
as identity` numbered three rows whose timestamps were out of order `1, 2, 3` by
insertion, ignoring the timestamp. For an insert-only table that usually matches
the old order, and "usually" is not a self-check. So the seven tables that
change key do it explicitly:

```sql
alter table g.t add column new_id bigint;
update g.t t set new_id = r.rn
  from (select id, row_number() over (order by <old timestamp>, id) rn from g.t) r
 where r.id = t.id;
alter table g.t alter column new_id set not null;
alter table g.t drop constraint <old pkey>;
alter table g.t drop column id;
alter table g.t rename column new_id to id;
alter table g.t alter column id add generated always as identity;
alter table g.t add primary key (id);
select setval(pg_get_serial_sequence('g.t', 'id'), (select max(id) from g.t));
```

For the four composite-key tables the ordering is `(<old timestamp>, seq)`. The
three uuid tables have no `seq` to break a timestamp tie, so `, id` tie-breaks
on the uuid — arbitrary but stable, and the migration should say it is
arbitrary. **Add to the self-check above: the new `id` order equals the old
order, asserted before the `set not null`.**

**An identity sequence does not rename with its table.** wordiply's would stay
`wordiply.guesses_id_seq` after the rename; rename it to `events_id_seq` so all
ten match letterboxed's and setgame's, which already do.

**No fixture migrations.** A dev-only seeding migration runs in prod too.

**The derivation trap, and it runs the other way from what you would guess.**
`took_turn` is NOT conditional on a rotation having existed. A backfill that
joined out to the game's mode and wrote `false` wherever the pointer was null —
which is the obvious defensive move — would erase the turn count of every
free-for-all and compete game ever played, which is most of them. The judgment
is mode-independent (§8); only the pointer is not. So the statement is a
per-kind CASE with no mode in it, and that is the one to review hardest.

What lowers the stakes: **nothing reads `took_turn` to decide anything** — the
rotation pointer lives in `common.games.current_turn_user_id`. A wrong backfill
misreports history; it cannot break a live game. The risks that bite are in the
rename half: row loss, ordering, and a table quietly leaving the publication.

## 10. Phases

**Phase 0** — the rehearsal harness (§9) and the skeleton guard (§11). The
publication assertion already exists and needs only to be known about (§14.1);
the skeleton guard is the per-game column assertion nine games lack, so it is
written before the first rename, not after.

> **Built 2026-09-17.** `supabase/scripts/rehearse-migration.sh` +
> `gmake db-rehearse ENV=local DUMP=… SINCE=…` (the sequencing of §14.7, with
> the dictionary reload and the pgTAP run after it), and
> `supabase/tests/common/events_skeleton_test.sql` — a roster of the ten games
> and seven assertions over the ones marked converted, which today is none. Each
> game's phase flips its roster row, exactly as it edits the publication test's
> expected pair. The guard was verified by planting a conformant
> `psychicnum.events` (all seven green) and then breaking it one way at a time:
> each plant failed the assertion it was aimed at and no other. The harness has
> NOT yet been run end to end — that needs a fresh prod dump and a migration to
> replay, which is psychicnum's phase.
>
> Two things the build turned up, both recorded where they belong:
> `letterboxed.seeds` is excluded from `db-backup` like the dictionary bulk, but
> `db-restore`'s closing message named only `all-words all-pangrams` — so a
> restored database had no letterboxed board pool and nothing said so. Fixed in
> the Makefile, and `g-letterboxed-seeds` is part of what `db-rehearse` reloads.

**Phase 1 — psychicnum.** Joel: *"the first one we should do is psychicnum — it's
the game i best understand and can read the code/schema for, and its our normal
testbed for rolling things out."* It exercises five of the seven moves: the table
rename, uuid → bigint, `created_at`, the `reveal` → `spoiler` kind rename, and a
`took_turn` backfill with real turn-order to reason about.

> **Built 2026-09-17.** `supabase/migrations/20260917000000_psychicnum_events.sql`
> — the rename, uuid → bigint, `created_at`, `reveal` → `spoiler`, the dropped
> `kind` default, `took_turn`, and the `(game_id, id)` index — plus
> `supabase/sql/psychicnum.sql`, its pgTAP, the publication test's pair, the
> skeleton roster's first converted row, the frontend's data access, and the
> game's doc. 86 local rows survived with `took_turn` true on all 81 guesses
> and neither the hint nor the spoiler. `gmake db-drift ENV=local` reports the
> local shape matches the baselines, so the migration builds the same table by
> mutation and from scratch.
>
> **One rule came out of it, and it applies to every later phase: a migration
> may only touch what MIGRATIONS own.** The first draft renamed the RLS policy
> with the table, which fails on any migrations-only build (a local `db reset`,
> the `db-drift` shadow) because a policy belongs to `supabase/sql/` — while
> succeeding on a deployed database, where the policy exists. The fix is
> `drop policy if exists <old name>` in the migration and let the repeatable
> half create the new one. Written up in
> [docs/supabase.md](../docs/supabase.md#schema-vs-code).
>
> **`request_reveal` → `request_spoiler` came with it** (Joel, 2026-09-17, on
> the condition it is really the per-move spoiler: it is — it hands over ONE
> unfound secret mid-game, and the whole-solution Reveal has had no RPC at all
> since `common.reveal_solution` was dropped, being local frontend state). The
> envelope's `result` moved with the name, and the old function's
> `drop function if exists` stays in `supabase/sql/psychicnum.sql` for good —
> that file is the entire definition, so nothing else would ever remove it from
> a deployed database.
>
> One thing deliberately not done: the frontend does not select `took_turn` —
> nothing reads it yet, and the budget counters remain what the screen shows.

**Phase 2 — wordle.** Covers the two psychicnum doesn't: adding a `kind` column
where none exists, and dropping a `seq` that is also half the primary key.

Those two are the whole pattern. The rest is repetition:

> **Built 2026-09-17.** `supabase/migrations/20260917000001_wordle_events.sql`
> and everything downstream. The two moves psychicnum did not have both landed:
> a `kind` column added, filled and pinned by a one-value check, and the end of
> a `seq` that was the key, the read order and the club-list subtitle's sort.
> `players.guesses_used` is what still holds the live count.
>
> Rehearsed on production's real rows (the local database was still the restored
> dump): **176 guesses over 41 games**, renumbered 1..176, monotonic against
> `created_at`, `took_turn` true on all of them. `db-drift` confirms the same
> shape builds from scratch.
>
> The frontend's `GuessRow` keys on `id` where it keyed on `seq`, and the
> fixture rows in `PlayArea.test.tsx` had to become DISTINCT ids rather than the
> `seq: 0` placeholder most of them used — the row id is the React key and the
> peer-feedback seen-set key, so two rows sharing one is two rows the feedback
> hook narrates once.
>
> **A flake in another game, found by running the suite here, NOT fixed:**
> `supabase/tests/setgame/create_game_test.sql` asserts the opening board holds
> exactly twelve cards, but `setgame._deal_to_playable` appends three more
> whenever the first twelve contain no set — which is a real shuffle outcome a
> few percent of the time. It failed once and passed on the next two runs.

**Phase 3** — the three that need no rename: letterboxed (three kind renames),
setgame (nothing but the skeleton), strands (uuid → bigint).

> **letterboxed built 2026-09-17.**
> `supabase/migrations/20260917000002_letterboxed_events.sql` — the smallest
> migration of the three so far, because letterboxed arrived in this shape:
> already `events`, already a bigint identity, already `created_at`, already
> carrying the read index. What was left was `took_turn` and the three kind
> renames (`played` → `word`, `undone` → `undo`, `cleared` → `clear`), which is
> the whole phase.
>
> Rehearsed on production's rows: **198 events — 160 words, 35 undos, 2 hints,
> 1 spoiler, 0 clears** — with `took_turn` true on the 195 moves and false on
> the 3 asks.
>
> **The envelopes were deliberately NOT moved**, and this is the difference from
> psychicnum: `undo_word` and `clear_chain` answer `{result: 'undone'}` /
> `{result: 'cleared'}`, but that is the envelope's own vocabulary, not the
> kind's — `submit_word` answers `accepted` or `solved`, never `played`, and the
> rest of the file says `created`, `ended`, `replayed`. Two of the seven
> happened to coincide with a kind. `ANSWER_OUTCOME` is only ever indexed by a
> row's `kind`, never by an envelope's `result`, so the two vocabularies do not
> meet.

> **setgame built 2026-09-17** —
> `supabase/migrations/20260917000003_setgame_events.sql`, one column and
> nothing else. A claim is a turn; a hint is not, and its `_require_turn` gate
> is not evidence to the contrary — `record_hint` never advances, because
> asking is part of the asker's own turn.
>
> Rehearsed on production's rows, the biggest log in the roster: **14,897
> events — 14,426 claims, 471 hints** — took_turn true on every claim and false
> on every hint. No frontend change at all: the table's name, key, timestamp
> and kinds were already what they are.
>
> **A flake in `create_game_test.sql` fixed on the way past**, since it is this
> game's and it was failing here: it asserted the opening board holds exactly
> twelve cards, but `create_game` deals to a PLAYABLE board, so the ~3.4% of
> shuffles whose first twelve hold no set open at fifteen. `hint_test.sql` had
> already been through this and says so in a comment; `create_game_test.sql`
> had not. It now asserts the contract — a multiple of three, at least twelve,
> and a set on the table.

> **strands built 2026-09-17** —
> `supabase/migrations/20260917000004_strands_events.sql`: uuid → bigint
> identity, `took_turn`, the `kind` default dropped, and the `(game_id)` read
> index replaced by `(game_id, id)`. The partial unique index that enforces
> found-once is untouched.
>
> Rehearsed on production's rows: **366 events** renumbered 1..366 — 168 theme,
> 28 spangram, 108 hint_word (all turns), against 7 duplicate, 21 invalid, 12
> too-short and 22 hints (none).
>
> **The migration's own statement order caught a real bug, which is what it is
> for.** `set took_turn = (result in ('theme','spangram','hint_word'))` leaves
> NULL on a hint row, because `result` is NULL there and `null in (…)` is NULL
> rather than false. The `set not null` refused it. Had the column been added
> `not null default false` — the shorter way — the 22 hint rows would have
> taken the default silently and the bug would have looked exactly like the
> right answer. §9's order is now load-bearing rather than merely careful.
>
> Two other things the phase turned up: `supabase/tests/strands/rls_test.sql`
> inserts into the log directly (to prove a player cannot) and relied on the
> `kind` default, so it names its kind now; and `docs/games/strands.md` called a
> spent hint "**Logged as a turn**" meaning it takes a numbered row in the log —
> which now reads as the opposite of its `took_turn`. It says "Logged as a row".

**Phase 4** — connections, waffle, wordiply: rename, add `kind`, drop `seq`.

> **connections built 2026-09-17** —
> `supabase/migrations/20260917000005_connections_events.sql`: the rename with
> its constraints and BOTH partial unique indexes, uuid → bigint, `created_at`,
> a one-value `kind`, and `took_turn` true on every row. 126 production rows
> renumbered 1..126 over 34 games.
>
> `mode` stays, exactly as §2 says: the two partial unique indexes filter on it
> and a partial index predicate cannot contain a subquery, so the column is what
> lets those indexes exist. They are the race-idempotency enforcers, and their
> names moved with the table.
>
> The frontend is the first one where the log's timestamp had a SECOND reader:
> `useGame` projects `guessed_at` into a matched category's `matched_at`, and
> `lib/history.ts` does the same in its fold. Both read `created_at` now.
> connections also hand-rolls its three `postgres_changes` handlers rather than
> using the shared factory, so its table name lives in a different place from
> every other game's.

> **waffle built 2026-09-17** —
> `supabase/migrations/20260917000006_waffle_events.sql`: the rename, the
> composite key `(game_id, user_id, seq)` → a bigint identity, `created_at`, a
> one-value `kind`, `took_turn` true on every row, and `seq` dropped. 759
> production rows over 64 games, renumbered 1..759.
>
> **The one VISIBLE change of the sweep so far, and it is the §F.2 mismatch
> closing.** waffle's log printed `n={s.seq}` — the swapper's own count — while
> its `#N` handle opened `onShowHistory(i)`, the row's position in the list
> being shown. In compete those two already disagreed. With `seq` gone the
> number is `i + 1`, so the printed number and the row the handle opens are the
> same thing by construction, which is what event-log.md §B.2 rules anyway. The
> history banner's label took the same number, passed in rather than read off
> the row.
>
> Two other readers `seq` had: `lib/history.ts`'s banner label (above), and the
> compete read order — `.order('seq')` interleaved two players' independent
> counts, where `.order('id')` is the order things actually happened. And the
> e2e fixture §11 warned about, `seedWaffleSwapLog`, named the table and the
> column; it writes `kind` and `took_turn` now.

> **wordiply built 2026-09-17** —
> `supabase/migrations/20260917000007_wordiply_events.sql`. The key was already
> a bigint identity, so nothing was renumbered; what moved is the name (with the
> unique constraint and the identity SEQUENCE, which is named at creation and
> does not follow its table), `created_at`, a one-value `kind`, `took_turn`, and
> `seq`.
>
> **This is the game `took_turn` exists for.** One submit, one `guess` row
> whatever happens, and whether it cost the player their go depends on the
> reason the server computed: `too_short` and `missing_base` spend it,
> `not_a_word` does not. No predicate over the row recovers that, which is why
> it is written down — and the RPC already had the rule, in the `_advance_turn`
> it calls for exactly those two reasons. 21 production rows: 14 accepted and
> one `missing_base` charged a turn, six `not_a_word` not.
>
> `seq` was the five-slot board index, null on a reject — the same fact as
> `valid` being false, which the valid-shape constraint said twice. It says it
> once now, and a board slot is a position among the accepted rows.
>
> The turn rule's two halves are asserted where each has a row to assert it on:
> `gameplay_test.sql` has the two rules-breaks, `turn_order_test.sql` has the
> dictionary miss beside the pointer assertions it mirrors.

**Phase 5** — stackdown and scrabble. Last because scrabble carries the
`leftovers` rename and is the game whose `user_id` cannot be `not null` until
[scrabble-ai-players.md](scrabble-ai-players.md) lands. Leave it nullable here;
that plan tightens it as its closing proof.

**Each phase STOPS for Joel's review before its commit** (Joel, 2026-09-17:
*"make sure you stop at end of each game, so i can review before i tell you to
commit"*). The work is left in the working tree, the app green, and nothing is
committed until he says so — phase 0 and the sibling plans' phases the same way,
a phase being the review unit wherever it is not a whole game.

**Each phase is one game, one commit, and contains:** the migration, the
rewritten `supabase/sql/<game>.sql`, that game's pgTAP, and that game's frontend
**data access** — `useGame`'s selects and row type, the realtime subscription's
table name, and the PDF model's field names. The app stays green at every phase.

What does **not** move with a phase: the component and vocabulary renames
(`GuessRow` → `EventRow`, the `turn-log` folder, the `#N` handle's type). Those
are [event-log.md](event-log.md), deliberately after all ten, so the diff that
renames everything is readable on its own.

## 11. What holds it

- **A skeleton guard** — every `<game>.events` table has the five common columns,
  with the right types, and `id` is its primary key. Without it the uniformity
  decays at the next game.
- **A publication assertion** — every `<game>.events` table is in
  `supabase_realtime`. This is the bug class with a doc and no guard.
- **Per-game pgTAP** — but NOT a schema test per game: only wordiply has a
  `schema_test.sql` (§14.2). What names log-table columns, and so moves with its
  game's phase, is the direct inserts in
  `supabase/tests/{wordiply,stackdown,connections,strands}/rls_test.sql`,
  wordiply's `schema_test.sql` and `gameplay_test.sql`, and every suite that
  asserts on a log row. **The skeleton guard is the per-game column assertion the
  other nine do not have — write it first.**
- **One e2e fixture inserts into a log table**: `seedWaffleSwapLog` in
  `e2e/helpers/fixtures.ts` names `waffle.swaps` and its `seq`. It is outside the
  "frontend data access" list in §10, and waffle's phase must carry it.
- `src/types/db.ts` is generated: `npm run types:gen` (or `gmake dev-types`)
  after each phase.

**What moves to `docs/` when this ships** (a plan's durable knowledge outlives
it — CLAUDE.md → Plans): the skeleton and the two invariants in §2, the three
numbers in §4, and the `took_turn` rule in §8. Their home is
[docs/supabase.md](../docs/supabase.md) beside the other table conventions, with
the turn rule cross-referenced from [docs/common.md](../docs/common.md) where the
rotation primitive is documented. They are NOT written there now: `docs/`
describes what is, and there is no `events` table yet.

## 12. Out of scope

- **codenamesduet** — Joel's ruling (§3).
- **The bee games' `found_words`** (spellingbee, boggle, wordwheel) — a *set*, not
  a log: alphabetical, rendered by `<WordList>` rather than the turn log. Joel:
  *"games without a turn log (the beegames and banangrams and crosswords) won't
  be part of this and are outside this naming."*
- **bananagrams and crosswords** — no log at all.
- **`common.messages`** — chat is not a game log.

## 13. Open — nothing

Every question this plan raised was ruled on 2026-09-17, the last being scrabble's
`pass` (§6). What is still open lives in the other two plans, and neither blocks
starting here:

- [scrabble-ai-players.md](scrabble-ai-players.md) §9 — the bots' dot colors, and
  what else reads presence once a bot holds a `game_players` row.
- [event-log.md](event-log.md) §E — `boardIsShown`'s new name and the history
  banner's wording for somebody else's board. (Its third item, the unresolvable
  `#N`, was ruled moot 2026-09-17.)

## 14. Review notes — 2026-09-17 (FEEDBACK, not rulings)

> **FOLDED IN 2026-09-17.** Every WRONG, TRAP and SUGGEST note below has been
> corrected or absorbed in the sections above, and 14.8 is ruled. The section
> stays as the record of what was wrong and how it was found — a second reader
> checking a plan against the code, before any of it was built.

**What this section is.** A second reader (Claude Fable) checked this plan
against the code on 2026-09-17, after Joel and Opus wrote it and before any
phase started. Every note below is feedback for the implementer:

- A note tagged **WRONG** says the plan's claim about the code is false. The
  file is named; the claim was verified there. Correct the plan text above
  before building from it, so the plan and the code agree.
- A note tagged **ASK JOEL** is a question this reader could not answer from the
  code or the plan. It is Joel's to rule on. Ask him; do not pick.
- A note tagged **TRAP** is something that will bite during a phase even though
  the plan is right.
- A note tagged **SUGGEST** is optional.

Line numbers here are as of 2026-09-17 and will rot; what is named is what to
look for.

### 14.1 WRONG — the publication guard already exists

§7 says *"There is no guard that a log table is published. Add one"* and §11
lists *"A publication assertion"* as new work. Both are wrong.
`supabase/tests/common/realtime_publication_test.sql` is a bidirectional
`set_eq` over `pg_publication_tables` for the whole `supabase_realtime`
publication, and its expected list names every one of the ten log tables by
schema and table name (`('psychicnum', 'guesses')` and so on).

What this changes: the assertion is already there, and it is stricter than the
one §11 asks for (an EXTRA published table fails it too). Each phase edits the
expected pair for its game, and the test going red at the rename until that
edit lands is exactly the check the plan wanted. Do not write a second guard.
Phase 0's "publication assertion" reduces to: know this file exists.

### 14.2 WRONG — "each game's schema test names its columns"

§11 says *"each game's schema test names its columns, so each phase updates
one."* Only wordiply has a `schema_test.sql`. What DOES name log-table columns,
and so must change with its game's phase:

- direct inserts in `supabase/tests/{wordiply,stackdown,connections,strands}/rls_test.sql`
  and `supabase/tests/wordiply/schema_test.sql` and `gameplay_test.sql`;
- one e2e fixture: `seedWaffleSwapLog` in `e2e/helpers/fixtures.ts` inserts
  into `waffle.swaps` naming `seq`. This is outside the "frontend data access"
  list in §10 and the waffle phase must carry it.

So the per-game column assertion the plan is counting on does not exist for
nine games; the skeleton guard in §11 is that assertion. Write it first.

### 14.3 WRONG — §6's `took_turn` column contradicts §8

Nine rows of the §6 table say `took_turn` is true for *"an accepted,
**non-terminal** guess"* (claim, swap, word). §8 says the opposite: *"Under the
rule, the terminal move is `true`"*, and the backfill is the rotation branches
*"plus the terminal branch of the same move kind."* An implementer building
from the table will write the wrong CASE.

Rewrite the §6 column to the rule: drop "non-terminal" from every row. Under
§8, strands' solving trace, wordiply's fifth valid word, letterboxed's
twelfth-letter word, scrabble's going-out word, scrabble's blocked-end `pass`
(the one that calls `_finish(…, 'blocked')`), connections' fourth group and
fourth mistake, wordle's winning or last guess, and waffle's solving or last
swap are all `true`.

This also matters for how the column is WRITTEN, not just backfilled: wordle and
waffle insert the log row BEFORE they compute `out_terminal`
(`supabase/sql/wordle.sql`, insert near line 632 and the terminal decision near
645; `supabase/sql/waffle.sql`, insert near 825 and terminal near 840). A
"non-terminal" definition would force a post-insert UPDATE in every move RPC.
Under the §8 rule the value is knowable at insert time (rejects `raise` and
write nothing), so `took_turn` is a literal in the insert. One more reason §8
is the definition and §6 is the evidence.

One sentence worth adding to §6 while there: setgame's `record_hint` is gated
by `_require_turn` but never advances (its comment: a hint is *"part of YOUR
TURN"*). §6 already says only `claim` is a turn; say why, so a backfill
reviewer does not read the gate as evidence of a turn.

### 14.4 WRONG — three `kind` defaults, not one

§2 says stackdown's word insert is the one that *"relies on the column's
`default 'word'`"*. That is true of the INSERT, but three tables declare a
default on `kind`: stackdown (`'word'`), psychicnum (`'guess'`) and strands
(`'guess'`). The skeleton in §2 has no default. The sweep should drop all three,
not just stackdown's; letterboxed and setgame are the model.

### 14.5 WRONG — wordle's `seq` has a SQL reader §5 misses

§5's wordle row says `seq` is *"the key + the read order + the peer-dedup key"*
and *"all three become `id`"*. There is a fourth: the club-list subtitle in
`supabase/sql/wordle.sql` picks the latest guess with `order by gx.seq desc
limit 1`, twice (the coop arm and the terminal-compete arm). Both become
`order by id desc`. scrabble has the same shape (`string_agg(… order by
p.seq)` in its status view). When a game's `seq` goes, grep that game's sql file
for it, not just the frontend.

Also in this family: every `useGame` hook orders its log fetch today, by five
different columns (`guessed_at` ×3, `seq` ×3, `submitted_at`, `created_at`,
`id` ×2). The `.order('id')` change is part of each phase's "data access"
(§10), and event-log.md §B.2 should not claim it.

### 14.6 TRAP — an identity column backfills in scan order, not by time

§2's rule is *"read `order by id`, never by the timestamp."* That is only true
of backfilled rows if the backfill MADE it true. Verified on the local database
2026-09-17, in a rolled-back transaction: `alter table t add column n bigint
generated always as identity` on three rows whose timestamps were inserted out
of order gave `n = 1, 2, 3` in INSERTION order, ignoring the timestamp. For an
insert-only table that usually matches the old order. "Usually" is not a
self-check, and wordiply's log is not insert-only (three no-op `update … set
user_id = user_id` realtime touches; it already has identity, so no id backfill
there, but it is why the scan cannot be trusted as a rule).

The recipe that worked, for the three uuid tables (psychicnum, connections,
strands):

```sql
alter table g.t add column new_id bigint;
update g.t t set new_id = r.rn
  from (select id, row_number() over (order by <old timestamp>, id) rn from g.t) r
 where r.id = t.id;
alter table g.t alter column new_id set not null;
alter table g.t drop constraint <old pkey>;
alter table g.t drop column id;
alter table g.t rename column new_id to id;
alter table g.t alter column id add generated always as identity;
alter table g.t add primary key (id);
select setval(pg_get_serial_sequence('g.t', 'id'), (select max(id) from g.t));
```

For the four composite-key tables the order is `(<old timestamp>, seq)`. Add to
§9's self-check: the `id` order equals the old order, asserted before the
`set not null`. The three uuid tables have no `seq` to break a timestamp tie;
the `, id` above tie-breaks on the uuid, which is arbitrary but stable. Say in
the migration that it is arbitrary.

Small cousin: an identity sequence is named at creation and does NOT rename
with its table. wordiply's stays `wordiply.guesses_id_seq` after the rename.
Rename it (`alter sequence … rename to events_id_seq`) or leave it and say so;
either way the choice should be the same for letterboxed and setgame, whose
sequences are already `events_id_seq`.

### 14.7 TRAP — the rehearsal harness mostly exists

§9's Phase 0 asks for *"one Make target: dump prod structure + data into a
scratch local database, apply the pending migration."* Two of its three parts
are already in the Makefile: `db-backup` (pg_dump `-Fc` of auth plus every app
schema, data only, dictionary bulk excluded) and `db-restore` (data-only
pg_restore with an FK-ordered TOC, single transaction). What Phase 0 adds is
the sequencing, and it has one non-obvious step: the local database must be at
the OLD shape when the dump is restored, which means the pending migration file
must be absent while `db-schema-sql ENV=local` runs, then restored to
`supabase/migrations/` and applied on its own with `supabase migration up`.
Then `npm run test:db` and the row counts. Do not run `db-seed` or `db-data`
after the restore (the restore target's own comment says why: `db-data`'s
stackdown reload deletes restored boards). The dump holds real accounts, so
confirm `backups/` is gitignored before the first run.

### 14.8 ASK JOEL — letterboxed `clear` has no `took_turn` value

§6's letterboxed row rules on `word`, `undo`, `hint` and `spoiler` and is silent
on `clear`. There is no rotation evidence to read: `clear_chain` is forbidden in
turn-by-turn coop (`PN411`, *"turn-by-turn coop offers undo, not clear"*), so
`cleared` rows exist only in free-for-all and compete, where nothing ever had
to rule. §8 says every row gets an answer anyway.

Two readings, both defensible:

- **a clear is a turn** — it changes the board, like the undo that "costs your
  go";
- **a clear is not a turn** — the game itself withholds it from turn coop
  because it is housekeeping, not a move.

This reader leans to *not a turn*, for the second reason.

**RULED 2026-09-17 — a clear IS a turn.** Joel: *"yes, it uses a turn and it
can't be played in turn-by-turn coop."* Recorded in §6's letterboxed row. The
two halves are not in tension: it takes a turn wherever it can be played, and
turn-by-turn coop is the one place it cannot.

### 14.9 SUGGEST — the skeleton could name the read index too

letterboxed and setgame both carry `create index … on <game>.events (game_id,
id)`, which is the index an `order by id` read within one game wants. The older
seven have `(game_id)` or nothing. If the skeleton guard in §11 names that
index, the seven get it in their phase and the shape stays uniform.

### 14.10 SUGGEST — a stale name in `common.sql`

The rotation header comment in `supabase/sql/common.sql` (the block that says
the two pointers *"coexist deliberately"*) calls scrabble's pointer function
`scrabble._advance_turn`. It is `scrabble._advance_seat`. Fix it in whichever
phase touches that block; scrabble-ai-players.md §6 may retire the function
anyway.
