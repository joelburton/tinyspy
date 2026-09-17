# events — one shape for every game's log table

**Status: NOT STARTED.** Agreed with Joel 2026-09-17, in the conversation that
began as `history-always-available` and turned out to be sitting on top of a
schema question.

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
```

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
knowing. stackdown's word insert relies on the column's `default 'word'` rather
than naming it — same outcome, but the sweep should write the literal, since a
kind that is mandatory everywhere should not arrive by default in one game. And
scrabble's `leftovers` is the one row no player asks for: `end_game` decides
whether it exists at all. Even there the kind is not in question, only whether
there is a row.)

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
| `wordle.guesses.seq` | *looks* like the board row; actually just the key + the read order + the peer-dedup key | all three become `id`. Nothing places a tile by it — `lib/history.ts` says the board replay indexes by list position |
| `waffle.swaps.seq` | a per-player count, displayed as `#N` | the ordinal supplies the display; `players.swaps_used` holds the live count |
| `wordiply.guesses.seq` | the five-slot index, null on rejects | exactly the metered number under the predicate `valid = true`; the nullability *is* that predicate written as a constraint |
| `stackdown.submissions.seq` | nothing but the key | `id` |

wordiply's `guesses_valid_shape` check loses its `seq` clauses and reduces to
`(valid and reason is null) or (not valid and reason in (…))`.

## 6. Per game

**`took_turn`, read from the code** — every `common._advance_turn` call site,
plus scrabble's own `_advance_seat`. Those branches are the evidence, not the
definition (§8): they are each game saying "that was a go", and the backfill
applies that judgment in every mode.

**Each phase confirms its game's answers rather than assuming them.** The
rotation's answers were made for a different question — *"should the next player
act now?"* — and a game may reasonably decline to punish a misfire with a lost
turn while still counting it as an attempt. They agree today as far as the read
went (strands and wordiply both treat a kind miss as no turn, deliberately), but
that is a check, not a given. stackdown had no answer at all until Joel gave one.

| game | table → | key → | timestamp → | kinds → | seq | `took_turn` is true for |
|---|---|---|---|---|---|---|
| **psychicnum** | `guesses` → `events` | uuid → bigint | `guessed_at` | guess · hint · **spoiler** | — | an accepted, non-terminal `guess` |
| **wordle** | `guesses` → `events` | **composite** → bigint | `guessed_at` | **guess** (new) | drop | an accepted, non-terminal `guess` |
| **connections** | `guesses` → `events` | uuid → bigint | `guessed_at` | **guess** (new) | — | an accepted, non-terminal `guess` (both the correct-not-final and the wrong-not-4th branches) |
| **letterboxed** | — | — (bigint) | — | **word** · **undo** · **clear** · hint · spoiler | — | a played `word` (non-terminal) **and an `undo`** — the undo costing your turn is what stops it being a free reroll |
| **setgame** | — | — (bigint) | — | claim · hint | — | an accepted, non-terminal `claim` |
| **strands** | — | uuid → bigint | — | guess · hint | — | a `guess` whose result is `theme`, `spangram` or `hint_word` — a rejected trace is "a misfire, not a turn" |
| **stackdown** | `submissions` → `events` | **composite** → bigint | `submitted_at` | word · hint · **spoiler** | drop | **`word` (accepted or refused) and `spoiler`** — Joel, 2026-09-17: *"stackdown uses a turn on word and spoiler. a good or bad word still uses a turn."* Not derivable from code: stackdown has no rotation (see below), so nothing ever had to rule on it |
| **scrabble** | `plays` → `events` | **composite** → bigint | `played_at` | word · exchange · pass · **leftovers** | drop | coop: a non-terminal `word`, and an `exchange`. compete: `word`, `exchange` and **`pass`** — via its own `_advance_seat` (§8). Joel, 2026-09-17: *"a pass in scrabble is took_turn (it advances to next player)."* `leftovers` is not a turn — `end_game` writes it, no player did it |
| **waffle** | `swaps` → `events` | **composite** → bigint | `swapped_at` | **swap** (new) | drop | an accepted, non-terminal `swap` |
| **wordiply** | `guesses` → `events` | — (bigint) | `guessed_at` | **guess** (new) | drop | an accepted, non-terminal `guess`, **and** a reject whose reason is `too_short` or `missing_base` — but not `not_a_word` |

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

**There is no guard that a log table is published.** Add one (§9).

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

**Phase 0 — a rehearsal harness.** One Make target: dump prod structure + data
into a scratch local database, apply the pending migration, run that game's
pgTAP suite against it, print row counts before and after. Repeatable for all
ten games. The dump holds real accounts and chat, so it stays local and out of
git.

**Every backfill migration self-checks and aborts.** The migration is the only
code that will ever see prod's old rows:

- row-count conservation across the rename;
- no `null` left in a column about to become `not null`;
- the per-game invariant — `took_turn` true exactly where §6 says.

**Statement order, so no half-done state can commit:** add the column nullable →
backfill → verify → `set not null`, all in one migration.

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

**Phase 0** — the rehearsal harness (§9), and the skeleton guard + publication
assertion (§11). Nothing else can be verified without them.

**Phase 1 — psychicnum.** Joel: *"the first one we should do is psychicnum — it's
the game i best understand and can read the code/schema for, and its our normal
testbed for rolling things out."* It exercises five of the seven moves: the table
rename, uuid → bigint, `created_at`, the `reveal` → `spoiler` kind rename, and a
`took_turn` backfill with real turn-order to reason about.

**Phase 2 — wordle.** Covers the two psychicnum doesn't: adding a `kind` column
where none exists, and dropping a `seq` that is also half the primary key.

Those two are the whole pattern. The rest is repetition:

**Phase 3** — the three that need no rename: letterboxed (three kind renames),
setgame (nothing but the skeleton), strands (uuid → bigint).

**Phase 4** — connections, waffle, wordiply: rename, add `kind`, drop `seq`.

**Phase 5** — stackdown and scrabble. Last because scrabble carries the
`leftovers` rename and is the game whose `user_id` cannot be `not null` until
[scrabble-ai-players.md](scrabble-ai-players.md) lands. Leave it nullable here;
that plan tightens it as its closing proof.

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
- **Per-game pgTAP** — each game's schema test names its columns, so each phase
  updates one.
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
- [event-log.md](event-log.md) §D — `boardIsShown`'s new name, whether a compete
  log offers `#N` on a row it cannot resolve, and the history banner's wording
  for somebody else's board.
