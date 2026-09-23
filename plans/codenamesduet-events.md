# codenamesduet: one `events` table

**Status: BUILDING on branch `codenamesduet-events` — Steps 1–2 done (see
Progress, at the end); the six questions answered.**
Joel, 2026-09-23: *"make a plan for this in plans/. once i've read that plan,
we do this."* Worked inside the
`codenamesduet` area, which pauses at its restructure's Step 5 until this is
done. The design was reached in conversation the same day; this file is what
was agreed, plus what building it has to settle.

## Why

codenamesduet keeps its log in two tables, `clues` (one row per turn) and
`guesses` (one row per guess), and the event log reads them as a table of
TURNS. Every other game with a log keeps one `<game>.events` table in the
shape [docs/supabase.md → Every game's log is
`<game>.events`](../docs/supabase.md#every-games-log-is-gameevents)
describes, and that section carries a paragraph excusing this game.

Two of the four things a player does are recorded nowhere:

- **A pass.** `pass_turn` calls `_end_turn`, which moves the turn pointer on
  `codenamesduet.games` and writes no row. Coming back to a shelved game, the
  board is right — `current_clue_giver` and the absence of a clue for the new
  turn say who clues next — but WHY the last turn ended is inferred: a turn
  can only end on an agent by a pass. The log does not even draw that
  inference; it says "passed" only for a turn with no guesses.
- **A hint.** Asking the AI for a clue is this game's hint, and it is the one
  hint in the roster that no log shows.

And one thing follows from fixing that: **this game gets a `lib/answer.ts`.**
A logged hint is a response to an action, so it needs `hint` / `hint_peer`
answers; and the header's four peer phrases — `writing clue`, `guessing`,
`waiting for clue`, `waiting for you` — are each the result of the latest
event (a clue landed, a pass or a bystander moved the turn), so they are peer
answers too and move out of `PlayArea`'s `useTurnStatus`. `docs/outcomes.md`'s
*"two games deliberately have no answer file"* loses this one.

## The table

The skeleton, plus this game's payload. **Payload columns are named for the
kind that owns them**, so no column can quietly take a second meaning — the
failure of the hint rows elsewhere that put hint text in `word` — and a
reader of the table sees its shape.

```sql
create table codenamesduet.events (
  -- the skeleton
  id              bigint generated always as identity primary key,
  game_id         uuid not null references codenamesduet.games(id) on delete cascade,
  user_id         uuid not null references common.profiles(user_id) on delete cascade,
  kind            text not null check (kind in ('clue', 'guess', 'pass', 'hint')),
  took_turn       boolean not null default false,
  created_at      timestamptz not null default now(),

  -- this game's payload
  turn_number     int  not null,
  seat            text not null check (seat in ('A', 'B')),
  clue_word       text,
  clue_count      int  check (clue_count >= 0),
  guess_position  int  check (guess_position between 0 and 24),
  guess_result    text check (guess_result in ('G', 'N', 'A')),

  -- each kind carries exactly its own payload
  constraint events_payload_by_kind check (
    case kind
      when 'clue'  then clue_word is not null and clue_count is not null
                        and guess_position is null and guess_result is null
      when 'guess' then guess_position is not null and guess_result is not null
                        and clue_word is null and clue_count is null
      else              clue_word is null and clue_count is null
                        and guess_position is null and guess_result is null
    end
  )
);

create index codenamesduet_events_game_id_id_idx on codenamesduet.events (game_id, id);

-- One clue per turn: what `clues`' unique constraint says today.
create unique index codenamesduet_events_one_clue_per_turn
  on codenamesduet.events (game_id, turn_number) where kind = 'clue';
```

Plus: RLS enabled with the club-member select the other child tables have, a
`grant select` to `authenticated`, and the table added to `supabase_realtime`.
Nothing writes to it but the RPCs.

**What was weighed and not chosen:**

- **A `payload jsonb`** — loses the CHECK and the typing both.
- **A spine with a detail table per kind**, the `common.games` /
  `wordle.games` shape. That earns its keep where a shell reads the shared half
  across sixteen gametypes; here it is two payload kinds, one schema and one
  reader that always wants both halves, so it would cost a join and buy
  nothing.
- **One `word` column for both the clue and the guessed word, dropping the
  position.** A clue's word is free text off the board; a guessed word is a
  reference to one of 25 tiles. Everything else — the key cards, `words`,
  `submit_guess`, the history rings, the PDF — addresses a tile by position,
  and a stored word would be a copy of `words.word` that could drift.

### Each column

- **`seat` beside `user_id`.** Derivable from `user_id` through the game row's
  `user_a_id` / `user_b_id`, but the key a guess is judged against,
  `turnOutcome`, the history fold and the PDF all think in seats, and a seat
  never changes after `create_game`. Kept to spare every reader the join.
- **`took_turn` is true exactly when `_end_turn` runs** — a bystander guess in
  ordinary play, and a pass. So `count(*) where took_turn` is the turns spent,
  which is today's `setup.turns − turns_remaining`. A clue, an agent, a hint,
  a sudden-death guess and a game-ending guess are all `false`: none spends
  the budget.
- **A `hint` row carries no payload.** The suggestion is the clue-giver's
  private help and its reasoning names the agents it targets; stored where the
  partner's client can read it, it would spoil their guessing. The row records
  only that the giver asked.
- **A guess stores no word.** It is joined from `words` by position, as
  `useBoard` does today.

## What does NOT move

**Whose turn it is stays on `codenamesduet.games`.** `current_clue_giver`,
`turn_number` and `turns_remaining` are the turn STATE, and the finished-player
rule decides the next giver — after a pass the clue usually crosses, but not
always — so it cannot be read off the last event. The events say what
happened; the game row says where the turn stands. **The board state stays on
`words`** (`revealed_as`, `neutral_a`, `neutral_b`), denormalized as now.

## The writers

| RPC | writes |
|---|---|
| `submit_clue` | a `clue` row, `took_turn` false |
| `submit_guess` | a `guess` row; `took_turn` true on a bystander in ordinary play, false otherwise |
| `pass_turn` | a `pass` row, `took_turn` true |
| `log_hint`, new — called by the edge function after the model returns a suggestion | a `hint` row, `took_turn` false. Its gate is `get_clue_context`'s, so the two cannot disagree about who may ask — including that one admits sudden death, the area's pass-2 finding |
| `replay_board` | deletes the game's events instead of its clues and guesses |

Every "is there a clue this turn" check — `submit_clue`'s, `submit_guess`'s,
`pass_turn`'s — becomes `exists (… where kind = 'clue' and turn_number = …)`.
`get_clue_context`'s `previous_clues` reads the `clue` rows. `kind` is known
before every call, as the convention requires.

## The readers

- `hooks/useClues.ts` and `useBoard`'s guess read become one events read
  (subscribed to `events`), with **one mapper** from the generated row — every
  payload column nullable — to a discriminated union on `kind`, so nothing
  past the hook sees a nullable `guess_position`.
- `lib/history.ts`, `lib/turnOutcome.ts`, `components/GameEventLog.tsx`,
  `pdf/model.ts`, `InfoCol.tsx`, `BoardCol.tsx` and `PlayArea.tsx` read the
  mapped events. `ClueRow` / `GuessRow` go.
- `common/realtime/useRealtimeRefetch.test.ts` uses `codenamesduet.clues` as a
  fixture name in two places; it names a table, not a behavior, and changes
  with it.

## The log looks the same

A fold groups the events by `turn_number` into the shape the log reads today —
a turn is its clue and the guesses under it — so `GameEventLog`, the history
viewer and the PDF keep reading turns, the `#N` still counts turns, and
`turnOutcome` still colors each turn's bar from its guesses. The history
viewer keeps keying a turn on `turn_number` — a sudden-death turn has guesses
and no clue, so no row id names every turn. A hint is a mark on its turn's
clue row; a pass is drawn as today, "(no guesses)" only for a turn that ended
empty.

## `lib/answer.ts`

The psychicnum shape: an `Answer` union, `answerMessage()`, and a
`peerAnswerMessage()` for the header. Proposed members, every text the one on
screen today:

- **the peer phrases**, chosen from the latest event AND the phase
  `derivePhase` computes (the event alone cannot say who clues next):
  `writing_clue_peer` · `guessing_peer` · `waiting_for_clue_peer` ·
  `waiting_for_you_peer`. Sudden death answers with empty text, as today.
- **`hint` / `hint_peer`** — mine empty (the dialog is the feedback); the
  partner's a header line, as psychicnum's `got hint` is — the one new line a
  player sees.
- **my own `agent` / `bystander`** — empty text, since the tile says it; they
  exist so the union is the whole roster of what the game says.

The peer phrases stay a `peerStatus` message — a standing line its owner holds
until the next event replaces it, there on mount with no fresh event. Only its
words and outcome come from `answer.ts`, and the outcome becomes the game's to
choose (`FeedbackMessage.peerStatus(peer, text, { outcome })`). The terminal
verdicts stay `buildOver`'s, a shared shape across games (Joel).

## The migration

One forward migration, `supabase/migrations/<ts>_codenamesduet_events.sql`:

1. **Create** the table, its indexes, RLS, grant and publication entry.
2. **Backfill**, inserting in time order so `order by id` is the true order:
   - `clues` → `clue` rows, `created_at` from `submitted_at`;
   - `guesses` → `guess` rows, `created_at` from `guessed_at`, `took_turn` true
     where `result = 'N'` and the guess was not in sudden death;
   - **passes, inferred** — the one row the backfill makes up. A turn below
     the game's current `turn_number` that has a clue and ended on anything
     but a bystander (no guesses, or the last guess an agent) was passed.
     The game's current turn is excluded because the move that ended the game
     — the 15th agent, an assassin, a timeout, End — closes it. The pass's
     author is the guesser, the seat opposite the clue's; its time was never
     recorded, so it takes the turn's last event time, and sorts after it.
   - **the seats' user ids** come from `codenamesduet.games`.
3. **Drop** `clues` and `guesses`, in this same migration.

`supabase/sql/codenamesduet.sql` drops the two tables' policies and grants in
the same change; a policy on a dropped table is an error on the next deploy.

**Proved with `gmake db-rehearse`** ([docs/supabase.md → Schema vs
code](../docs/supabase.md#schema-vs-code) — a migration that moves data first
meets a real row on production unless it is rehearsed against a copy): the
rehearsal's counts are clue rows = `clues` rows, guess
rows = `guesses` rows, and every game's `count(*) where took_turn` equal to
its `setup.turns − turns_remaining`. That last check is what catches a wrong
pass inference.

## Tests

- **pgTAP:** each writer's row, `kind` and `took_turn`; the one-clue index; the
  payload CHECK refusing a clue with a position and a guess with a word; RLS;
  `replay_board` clearing events. Every existing file that reads `clues` or
  `guesses` changes with the table.
- **The backfill is NOT a pgTAP test** — the plan first said it would be, and
  it cannot be: the migration drops `clues` and `guesses`, so after it there is
  nothing to seed. Proved instead by running the migration's OWN backfill and
  checks, extracted from the file, inside a transaction that rolls back: three
  local games, the two old tables recreated, seeded with a pass after agents,
  a bystander-ended turn, an empty pass, the current turn, nine bystanders
  into sudden death with an agent and a losing bystander there, and a game
  ended on its first turn. Then planted wrong (the current turn counted) —
  the migration's own check raised. The script is in Step 1's record below.
- **Unit:** the mapper, the turn fold, `answer.ts` walked by its union, and the
  existing history / log / PDF / turnOutcome specs on the new rows.
- **e2e:** the five specs, before and after — they are the check that the log
  looks the same. None plays to an ending or passes after a guess, which is
  why the backfill test carries those cases.

## Order of work

1. The migration and the writers, local; pgTAP green, the backfill test
   included.
2. The readers and the mapper; the log unchanged on screen.
3. `lib/answer.ts` and the peer phrases.
4. The hint: its writer, its log mark, its peer line.
5. Docs: `docs/supabase.md`'s exception paragraph shrinks to the one
   remaining difference — the log groups by turn and keys on `turn_number` —
   `docs/outcomes.md` loses this game from "no answer file", the game's
   `doc.md` RPCs and FE submissions say the new state.
6. `gmake db-rehearse`, then the deploy playbook.

Each a commit Joel reads, as the area's steps are.

## Joel's answers — 2026-09-23

| # | question | answer |
|---|---|---|
| 1 | who writes the hint row | **a new `log_hint` RPC**, called by the edge function after the model returns a suggestion — only a delivered hint is logged. (Rejected: writing it in `get_clue_context`, which would log a hint the model then declined.) |
| 2 | where a hint shows in the grouped log | **a mark on its turn's clue row** — the turn stays one clue row and one guesses row. (Rejected: a `Hint:` row of its own.) |
| 3 | whether a pass is shown | **leave it as today** — "(no guesses)" only for a turn that ended empty. (Rejected: "— passed" on a turn that had guesses.) |
| 4 | whether a partner's hint is narrated | **yes, like psychicnum** — a `hint_peer` line in the header. (Rejected: log only.) |
| 5 | drop `clues` and `guesses` when | **in the same migration** — `db-rehearse` proves the backfill first. (Rejected: a release later.) |
| 6 | what the history viewer keys on | **`turn_number`, as now.** Found while asking: a sudden-death turn has guesses but no clue row, so a clue's `id` cannot name every turn. (Rejected: the clue row's `id`.) |

## Out of scope

- The spectator's "no such game" page (a seatless viewer has no key card) —
  `plans/spectating.md`.
- `submit_clue` judging nothing about the clue, and `get_clue_context`
  admitting sudden death — pass 2 findings of the area, recorded there.

## Progress

### Step 1 — the migration and the writers — DONE 2026-09-23

`supabase/migrations/20260923000001_codenamesduet_events.sql` creates the table
as specified, backfills it, checks itself (clue and guess counts unchanged;
every game's turn-taking events equal to its `turn_number - 1`; ids in time
order) and drops `clues` and `guesses`. `supabase/sql/codenamesduet.sql`:

- `submit_clue`, `submit_guess` and `pass_turn` write their event; their "is
  there a clue this turn" checks read `kind = 'clue'`. `submit_clue`'s
  parameters share their names with the new columns and keep them — they are
  the API the frontend calls — so its body reads them qualified.
- **`_require_clue_giver`, new** — the gate `get_clue_context` had inline,
  moved out so `log_hint` asks the same one. Same codes (PN387–389), same
  sentences.
- **`log_hint`, new** — the hint writer; answers `ok` / `logged`.
- `replay_board` deletes the game's events; `get_clue_context` reads its
  `previous_clues` from them; the policies and grants name `events`.

**Applied locally over real rows** (`supabase migration up --local`): ten
games, six clues and five guesses became twelve events, one of them an
inferred pass — `PAGE-CHAIN-EGG` turn 3, B, after an agent.

**The backfill proof** (see Tests): the scratch script recreates the two old
tables inside `begin … rollback`, seeds three games, and `\i`s the
migration's backfill and its `do` block verbatim. All three games came out as
expected; planting `<=` for `<` on the current-turn exclusion made the
migration raise *"game … has 4 turn-taking events for 3 ended turns"*.

**Tests:** `events_test.sql`, new, 14 — each writer's row, the hint gate, the
order, the turn count, the one-clue index and the payload CHECK three ways,
sudden death. `cross_direction`, `rls` (the two table checks became one) and
`replay` read `events`. The two shared guards moved with the table:
`events_skeleton_test.sql` rosters codenamesduet, and
`realtime_publication_test.sql` expects `events` where it expected `clues`
and `guesses`. The whole suite green, 182 files, 2597 tests.

**The frontend is broken at runtime until Step 2** — `useClues` and `useBoard`
still read the dropped tables. `tsc` is clean only because the generated types
have not been regenerated yet; that is Step 2's first move.

### Step 2 — the readers — DONE 2026-09-23

- **`lib/events.ts`, new:** `DuetEvent`, the union on `kind` with the table's
  own column names; `toDuetEvent`, the one mapper from the generated row (it
  throws on a row the CHECK would have refused); `cluesOf` and `guessesOf`,
  the latter joining each guess to the word on its tile (`WordedGuess`).
- **`useBoard` reads the events** in place of the guesses, `order by id`,
  subscribed to `events`. **`useClues` is deleted** — the game has two data
  hooks now, not three. `PlayArea` derives the clues and the worded guesses
  from the events it is handed.
- Every reader — `history.ts`, `turnOutcome.ts`, `GameEventLog`, `InfoCol`,
  `BoardCol`, `CluePanel`, `pdf/model.ts` — reads the event types. **Two sorts
  changed meaning:** the log and the PDF ordered a turn's guesses by
  `guessed_at`; they order by `id` now, the convention's rule.
- `src/types/db.ts` regenerated (stamp restored). The docs that named the
  deleted hook — the old game doc, `code-conventions.md`, `supabase.md`'s
  divergence register, the publication guard's comments — say two hooks.
- **Tests:** `lib/events.test.ts`, new (6); `useBoard.test.ts` gains a case
  for the typed events; the log, history, turnOutcome, PDF and PlayArea specs
  build events. 363 unit tests green. **All five e2e specs green** (7 tests),
  once the tab-ring fix below was in.

**Found by the e2e, and fixed in its own commit (`keyboard: rings are
ordered by render`):** the clue form's Tab ring had regressed at the area's
Step 2 — the loader/loaded split made the clue form mount in the same commit
as the page's empty ring, and `useTabRing` picked the innermost by mount order,
which a child's effect running first gets backwards. The keyboard todo had
predicted it. Joel chose the class fix: rings are ordered by first render.

**Noticed, not changed:** the log returns nothing for a turn without a clue, so
sudden-death guesses have never appeared in it.
