# codenamesduet: one `events` table

**Status: BUILDING on branch `codenamesduet-events` — Steps 1–6 done, then
three rounds on top (the AI's clue, the audit, sudden death — see the end).
**The design has moved since the top of this file was written**: the passages
it superseded are struck through with a pointer. The rehearsal was rerun on the
final migration and is green (see the end); commit, deploy and merge are Joel's.**
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
- ~~**`took_turn` is true exactly when `_end_turn` runs** — a bystander guess in
  ordinary play, and a pass. So `count(*) where took_turn` is the turns spent,
  which is today's `setup.turns − turns_remaining`. A clue, an agent, a hint,
  a sudden-death guess and a game-ending guess are all `false`: none spends
  the budget.~~ **Superseded by "Sudden death, one turn per guess" below:**
  `took_turn` is true exactly when the turn number moves on — a bystander in
  ordinary play, a pass, and a sudden-death agent that does not win — so
  `count(*) where took_turn` is `turn_number − 1`.
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
| `submit_guess` | a `guess` row; `took_turn` true on a bystander in ordinary play, ~~false otherwise~~ and on a sudden-death agent that does not win (see "Sudden death, one turn per guess") |
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
`turnOutcome` still colors each turn's bar from its guesses. ~~The history
viewer keeps keying a turn on `turn_number` — a sudden-death turn has guesses
and no clue, so no row id names every turn. A hint is a mark on its turn's
clue row;~~ **Superseded:** the history viewer is linked by an event id (a
turn's clue, or a sudden-death guess), and the log's mark sits on a clue given
exactly as the AI suggested it — see the two sections at the end. A pass is
drawn as today, "(no guesses)" only for a turn that ended empty.

## `lib/answer.ts`

The psychicnum shape: an `Answer` union, `answerMessage()`, and a
`peerAnswerMessage()` for the header. Proposed members, every text the one on
screen today:

- **the peer phrases**, chosen from the latest event AND the phase
  `derivePhase` computes (the event alone cannot say who clues next):
  `writing_clue_peer` · `guessing_peer` · `waiting_for_clue_peer` ·
  `waiting_for_you_peer`. Sudden death answers with empty text, as today.
- ~~**`hint` / `hint_peer`** — mine empty (the dialog is the feedback);~~ the
  partner's `hint_peer`, a header line, as psychicnum's `got hint` is — the one
  new line a player sees. **Superseded in part:** my own `hint` went when the
  mark moved to `clue_ai` (see "the AI's clue is marked").
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
| 2 | where a hint shows in the grouped log | **a mark on its turn's clue row** — the turn stays one clue row and one guesses row. (Rejected: a `Hint:` row of its own.) **Superseded:** the mark moved to a clue given exactly as the AI suggested it (Joel, later the same day). |
| 3 | whether a pass is shown | **leave it as today** — "(no guesses)" only for a turn that ended empty. (Rejected: "— passed" on a turn that had guesses.) |
| 4 | whether a partner's hint is narrated | **yes, like psychicnum** — a `hint_peer` line in the header. (Rejected: log only.) |
| 5 | drop `clues` and `guesses` when | **in the same migration** — `db-rehearse` proves the backfill first. (Rejected: a release later.) |
| 6 | what the history viewer keys on | **`turn_number`, as now.** Found while asking: a sudden-death turn has guesses but no clue row, so a clue's `id` cannot name every turn. (Rejected: the clue row's `id`.) **Reversed:** once every sudden-death guess became a turn of its own, an event id names every turn — a turn's clue, or a sudden-death guess — so the link is the id, like every other game (Joel, later the same day). |

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

### Step 3 — `lib/answer.ts` and the peer phrases — DONE 2026-09-23

`lib/answer.ts`, new: the four turn answers (`writing_clue_peer` ·
`guessing_peer` · `waiting_for_clue_peer` · `waiting_for_you_peer`),
`answerMessage()` with their words and outcome, and `turnAnswer(phase)`, which
picks the one that holds from `derivePhase`'s phase and answers `null` in
sudden death or once the game is over. `PlayArea`'s `useTurnStatus` keeps the
`peerStatus` message and its owner effect — the lifetime is the kind's — and
takes the words and the outcome from the file, passed as `{ outcome }`. The
phone-width note moved to the words it governs. Every text and outcome is the
one on screen before (`neutral`, the kind's default until now).

**Deviation from the plan, stated at the step:** my own `agent` / `bystander`
answers were to be in the union with empty text "so the union is the whole
roster". Nothing would read them — the pill is silent on a guess and the log
colors turns — so they are not written; the file's docstring says a guess of
mine has no answer and why. `hint` / `hint_peer` arrive with Step 4.

`lib/answer.test.ts`, new (7): the union walked for words and outcome, and
`turnAnswer` over the four phases, sudden death and game over. 370 unit tests
green.

### Step 4 — the hint — DONE 2026-09-23

- **The writer is called.** `codenamesduet-suggest-clue` calls `log_hint` as
  the caller once a suggestion has parsed, and relays a refusal untouched —
  the same race `get_clue_context` could lose, arriving late. Its header lists
  the new step, and loses the two stale claims pass 2 had recorded (the
  "BoardScreen's 'Need a clue?' button", and a refusal "forwarded as 403").
- **`lib/answer.ts` gains `hint` / `hint_peer`**, both `warning`: mine has no
  text (the dialog is the feedback), the partner's reads `got hint`, as
  psychicnum's does.
- ~~**The log's mark:** `hintedTurnsOf(events)` in `lib/events.ts`; a hinted
  turn's clue row carries the AI glyph (`IconAI`, `1em`) wearing
  `VERDICT_TONE[hint's outcome]`, with the tooltip `AI hint`.~~ **Superseded**
  by "the AI's clue is marked": the mark is on a clue given exactly as the AI
  suggested it.
- **The partner's line:** `usePeerFeedback` over the events — a partner's
  hint row, new since load, becomes a `peer` message in the header.

**Tests:** the answer union walk gains the two; the log spec marks one turn and
not the other; the PlayArea spec says what the partner is doing and narrates a
partner's hint that lands, not one already there on load — planted off, it
went red. 375 unit tests green; `deno check` clean.

**Not proven live:** the edge function's `log_hint` call. The e2e stubs the
function, and a real call spends an Anthropic request — Joel's to allow.

### Step 5 — the docs — DONE 2026-09-23

- `docs/supabase.md` → Every game's log: codenamesduet is in; the exception
  shrinks to how it SHOWS its events — grouped on `turn_number`, which is also
  its history handle.
- `docs/outcomes.md`: waffle is the one game with no answer file; codenamesduet
  has one, and a guess's outcome is still worn only by its turn.
- `src/codenamesduet/doc.md`: an intro paragraph on the log, the hint logged;
  `submit_clue`, `submit_guess` and `pass_turn` log their events; the edge
  function logs the hint last; `replay_board` wipes the events; FE submissions
  name `lib/answer.ts` for the header's words, and the hint's line and mark.
- `docs/games/codenamesduet.md` (absorbed into `doc.md` at pass 2, current
  until then): the schema table's `events` row replaces `clues` and `guesses`;
  the RPC sections say what each logs, `log_hint` and `_require_clue_giver`
  are added; the pgTAP table lists `events_test.sql`.
- `CLAUDE.md`'s plans row says built through Step 5.

Descriptions of the log's DISPLAY — "a table of turns", keyed by
`turn_number` (`docs/playarea.md`, `common/event-log/doc.md`) — are unchanged,
because the display is.

### Step 6 — the rehearsal — DONE 2026-09-23; the deploy waits on Joel

- **The cut:** `supabase migration list --linked` — prod lacks only
  `20260923000001_codenamesduet_events.sql`. Prod has both tables the migration
  drops: 19 games, 126 clues, 240 guesses.
- **`gmake db-rehearse`** over `backups/prod-20260923-122355.dump`
  (`SINCE=20260923000001`): the migration applied, its own checks passed, and
  the row diff was `-clues 126`, `-guesses 240`, `+events 434` — 126 clue
  rows, 240 guess rows (45 of them bystanders that took a turn) and **68
  inferred passes**. The whole pgTAP suite passed against prod's rows (182
  files, 2597 tests). The identity sequence stands past the highest id.
- **`gmake db-drift`** on the rehearsed database: none — the shape matches the
  baselines. Local then reset to the dev seed (`gmake db-reset ENV=local`).
- **The live AI call** (Joel allowed one): a local game, alice the clue-giver,
  one POST to `codenamesduet-suggest-clue` — `ok` / `suggested` (clue
  "Wildcard"), and exactly one `hint` event landed (seat A, turn 1, no payload,
  `took_turn` false).
- **The five e2e specs:** 7 tests green on the reset stack.

**Left:** the deploy — `gmake deploy ENV=prod` (migration, then the SQL, the
edge functions and the FE; a short read-side window while Netlify catches up,
so when nobody is mid-game) — then the post-deploy checks: row counts, the
sequence, `db-drift ENV=prod`, and one game opened in a browser. Whether to
merge into `app-audit` first is Joel's.

### Added after the rehearsal — the AI's clue is marked, not the hint (2026-09-23)

Joel: when the AI's suggestion is submitted **as suggested** — word and count
unedited — the log should mark that clue as the AI's; if the giver changed it,
nothing. He weighed a `clue_ai` kind against a field and chose the **field**
(`kind` is what the player did; where the words came from is how it went, and a
second clue kind would have to be remembered by every "is there a clue this
turn" check). The partner's `got hint` line stays at asking time.

- **The migration** (edited in place — prod has not applied it): `clue_from_ai
  boolean`, non-null on a clue and null on every other kind by the CHECK; the
  backfill sets `false` on every old clue.
- **`submit_clue`** takes `clue_from_ai boolean default false` and stores it —
  the client's word, since only the client saw the suggestion.
- **The clue form** remembers the suggestion it filled in and sends `true` only
  when the trimmed word and the count match it.
- **The log's mark** moves from "a hint happened this turn" to the clue's own
  flag (`.aiClueMark`, tooltip `AI clue`); `hintedTurnsOf` is gone. Hint rows
  are still written — they record that the AI was asked — and nothing draws
  them now.
- **`lib/answer.ts`:** `clue_ai` (no text, `warning`) is the mark's outcome;
  my own `hint` lost its only reader and is gone. `hint_peer` stays.
- **The mark's color** was invisible as first built — `--verdict-ink` is the
  white ink for a filled piece; it wears `--verdict-tone` now.

**Tests:** `events_test.sql` 16 (an AI clue; a clue without the flag refused);
the mapper, the log's mark, and four CluePanel cases — as suggested, word
edited, count edited, no suggestion — two of which went red with the rule
planted off. pgTAP 2599, unit 379. **The prod rehearsal above is now STALE**
(the migration changed) and has to be run again before the deploy.

## Audit of the branch — 2026-09-23

A read of the plan against the working tree (the six commits plus the
uncommitted AI-clue change), for correctness and for clarity. Nothing was
changed; this section is the record, and each item is Joel's to accept or
strike.

### What was verified

- `tsc -b`, `eslint` on the game folder and the edge function, and the unit
  tests for `src/codenamesduet`, `common/realtime` and `common/keyboard`: green
  on the working tree. The whole pgTAP suite: green, 182 files, 2599 tests.
- **The backfill, re-proved from scratch.** The plan's proof was a scratch
  script that is not in the repo, so a new one ran the migration's own backfill
  and `do` block (extracted verbatim) over three seeded games inside a
  rolled-back transaction: a game on turn 4 with a pass after two agents, a
  bystander-ended turn, an empty pass and a live current turn; a game nine
  bystanders into sudden death with an agent and a losing bystander there; and
  a game ended by the assassin on turn 1. Every row came out as the plan says —
  the two passes inferred where they belong and nowhere else, `took_turn` true
  on exactly the turn-enders, the pass sorted after its turn's last guess. With
  the current-turn exclusion planted off (`<=` for `<`), the migration's own
  check raised *"has 4 turn-taking events for 3 ended turns"*.
- `drop function if exists codenamesduet.submit_clue(uuid, text, int)` does
  what the signature change now needs: the local database holds only the
  four-parameter function. (Finding 1 is about its comment.)
- The e2e specs were **not** run for this audit.

### Findings — the code

1. **`supabase/sql/codenamesduet.sql` → `submit_clue`: the `drop function`'s
   comment gives the wrong reason.** It says the drop exists because "`create
   or replace` cannot change a function's return type", which was true when
   the function became `jsonb`. Now the drop is load-bearing for a different
   reason: the signature grew `clue_from_ai`, and without the drop the old
   three-parameter function would survive on prod as a second overload whose
   body still reads the dropped `clues` table. The comment should say that,
   and it is the one place a reader would learn why `(uuid, text, int)` is
   named while the grants below name `(uuid, text, int, boolean)`.

2. **`submit_clue`'s answer says it echoes the stored row, and it does not.**
   The comment on the `ok` reads "echoed back from the row that now exists
   rather than from the request", and the doc tables repeat it ("what the
   partner will see, not what this form sent"), but the values are
   `submit_clue.clue_word` and `submit_clue.clue_count` — the parameters. The
   wording predates this branch, but the insert was rewritten here and the
   claim sits on it. Either `returning … into` and echo the row, or say it is
   the request. (The answer also does not carry `clue_from_ai`; nothing reads
   it, so that is fine, but "the clue as it was recorded" is now short a
   column.)

3. **`log_hint` reads the game row a second time to find a user id the gate
   already had.** `_require_clue_giver` calls `common.require_game_player`,
   which returns the caller's id, and then returns only the seat; `log_hint`
   re-selects the row and maps the seat back to `user_a_id` / `user_b_id`.
   Correct, but roundabout — three reads of `codenamesduet.games` across the
   gate and the two callers. The gate could return `(caller_id, seat)`, or
   `log_hint` could take the id from `auth.uid()` as `require_game_player`
   does. Low.

4. **Three readers re-sort by `id` what the mapper promises is already in
   order.** `cluesOf` and `guessesOf` document "in the order given / made",
   and `useBoard` reads `order by id`; yet `GameEventLog` (`sortedGuesses`),
   `lib/history.ts`'s `describe` and `pdf/model.ts` (twice) each sort by `id`
   again. Either the promise is trusted and the sorts go, or one reader keeps
   its sort and says why (the log's unit test does feed guesses out of order
   — `sorts guesses within a turn by … their id` — so that test would go with
   them). Joel's call; a clarity question, not a bug.

5. **Test gap: nothing pins that my OWN hint is not narrated.** `PlayArea`'s
   `messageFor` returns null for `e.user_id === session.user.id`; the spec
   narrates a partner's hint landing and not one already there on load, but
   never a hint of mine. Planting that condition off goes green.

### Findings — stale prose left behind by the move

Each of these still describes the two-table world, or the hint mark the
addendum replaced. Found by grepping for the dropped names and the retired
design; the list is what the grep found, not a roster.

6. `src/codenamesduet/lib/turnOutcome.ts`, docstring: *"This is the whole of
   the game's outcome decision, which is why there is no `lib/answer.ts` here
   as there is in the other games."* There is one now. The sentence after it
   (the pill stays silent on a guess) is still true and is the part worth
   keeping.
7. `src/codenamesduet/hooks/useGame.ts`, docstring: *"Hook split (useGame here
   + useBoard + useClues, three hooks) … three SUBSCRIBED refetches on
   reconnect"* — two hooks, two refetches.
8. `src/codenamesduet/components/GameEventLog.test.tsx`, header: *"Guess sort
   order: within a turn, guesses list by guessed_at"* — the test below it
   already says `id`.
9. `docs/code-conventions.md` → the `Row`-suffix table names `ClueRow` among
   the generated aliases; it is gone (`ClueEvent` is not a `Row`).
10. `docs/naming.md` → the `created_at` row: *"every game with a log except
    codenamesduet: psychicnum, wordle, …"* and *"`guessed_at` (codenamesduet)"*.
    codenamesduet's log has `created_at` and no `guessed_at`. While it is
    open: the row lists the games with a log by name, which is a roster that
    rots; "every log table named `events`" says it.
11. `src/codenamesduet/lib/history.ts`, docstring: *"under a game-wide
    `unique (game_id, turn_number)`"* — it is a partial unique index on
    `kind = 'clue'` now; a sudden-death turn has guesses under that
    `turn_number` and no clue. Small, but the docstring is making a claim
    about the schema.
12. `src/codenamesduet/components/GameEventLog.tsx`, docstring: the row-1
    anatomy `[bar] | # | count WORD | clue-giver` does not mention the AI
    mark that now sits after the word.
13. `docs/games/codenamesduet.md` → the rules table: *"Every move replayable in
    the Game Log — one `codenamesduet.events` row per clue, guess, pass and
    hint"*. The rows exist; the log draws neither a pass (beyond "(no
    guesses)" on an empty turn) nor a hint. "Every move is logged" is the true
    half.
14. **This plan file reads top-down as the superseded design.** "The writers"
    table, "The log looks the same" (*"A hint is a mark on its turn's clue
    row"*), "`lib/answer.ts`" (`hint` / `hint_peer`) and Step 4's record
    (`hintedTurnsOf`, the mark on a hinted turn) all describe what the
    addendum replaced, and the status line still says "rehearsed" while the
    addendum says the rehearsal is stale. A reader who stops before the
    addendum builds the wrong picture. Suggest the status line point at the
    addendum, and the superseded lines be struck or footnoted to it.

### Questions the audit raises — Joel's

15. **`clue_from_ai = false` means two things.** On a new clue it means "the
    giver's own"; on the 126 prod clues the backfill sets it to `false` meaning
    "nobody recorded it", and the CHECK makes the column non-null on a clue,
    so there is no unknown state. The migration's comment says as much
    (*"Nothing recorded whether an old clue was the AI's, so none is"*). If
    the distinction matters — a stat, a "how often is the AI's clue taken as
    given" read — it is lost at the migration; if it does not, nothing to do.
16. **A failed `log_hint` costs the suggestion.** The edge function relays a
    `log_hint` not-ok and returns nothing else, so a suggestion the model
    already produced (an Anthropic request spent) is discarded if the logging
    write fails — right for the race (the game ended; the suggestion is
    moot), arguable for a fault (a transient database error). The alternative
    is to return the suggestion and report the logging failure separately.
    Design choice; recorded so it is a decision rather than an accident.

### Seen in passing — pre-existing, in files this branch touched

Not this branch's, and not fixed here; listed because the audit read past
them and they sit beside the rewritten code.

- `submit_clue`'s docstring: *"Three of its four rejections are RACES"* — it
  has five raises now (PN369 and PN384 faults, PN370–PN372 races).
- `_end_turn`'s docstring: *"pass_turn (after a clue was given but no guesses
  taken)"* — a pass can follow guesses, which is the very case the backfill
  infers (a pass after an agent).
- `GameEventLog` returns nothing for a turn with guesses and no clue, so
  sudden-death guesses have never appeared in the log (Step 2 noted it). The
  turn still counts toward `shown`, so such a game shows neither rows nor the
  empty placeholder for those guesses.
- `docs/games/codenamesduet.md` links `submit_guess` to the original
  migration file, where it no longer lives.

## Addressing the audit — the plan (2026-09-23)

Every item above was re-checked against the tree before this was written, and
each holds as stated. One refinement: in **3**, `log_hint` needs the game row
anyway, for `turn_number`, so the second read stays; only the seat → user-id
mapping is roundabout.

### A. Code — fixed without a decision

- **1** — rewrite the comment on `drop function if exists
  codenamesduet.submit_clue(uuid, text, int)`: the drop now exists because the
  signature grew `clue_from_ai`, and without it the three-parameter overload
  would survive on prod reading the dropped `clues` table.
- **3** — `log_hint` takes the caller's id from `auth.uid()` (what
  `require_game_player` checked inside the gate) instead of mapping the seat
  back through `user_a_id` / `user_b_id`. The row read stays, for
  `turn_number`.
- **5** — a PlayArea case: a hint of MINE landing after load is not narrated.
  Planted (the `user_id` condition removed), it must go red.

### B. Code — a choice, recommended

- **2** — `submit_clue`'s answer claims to echo the stored row and echoes the
  request. **Recommended: make the claim true** — `insert … returning
  clue_word, clue_count, clue_from_ai into …` and answer from those, adding
  `clue_from_ai` to the `ok` so "the clue as it was recorded" is whole. The
  alternative is to reword the comment and the two doc lines to "the request".
- **4** — the redundant `id` sorts. **Recommended: trust the order** — the
  events arrive `order by id` and `cluesOf` / `guessesOf` keep it — and drop
  the sorts in `GameEventLog`, `lib/history.ts` and `pdf/model.ts` (both),
  turning the log spec's "sorts … by their id" into "shows guesses in the
  order given". The alternative keeps one sort with a comment saying why.

### C. Prose — fixed without a decision

- **6** `turnOutcome.ts`: drop "which is why there is no `lib/answer.ts`";
  keep the pill-is-silent sentence.
- **7** `useGame.ts`: two hooks, two refetches.
- **8** `GameEventLog.test.tsx` header: `id`, not `guessed_at` (and "the order
  given" if 4 lands as recommended).
- **9** `docs/code-conventions.md`: `ClueRow` out of the `Row`-alias list.
- **10** `docs/naming.md` `created_at` row: codenamesduet is no longer the
  exception and has no `guessed_at`; the game roster becomes "every log table
  named `events`".
- **11** `history.ts`: the one-clue rule is a partial unique index on
  `kind = 'clue'`, and a sudden-death turn has guesses and no clue.
- **12** `GameEventLog.tsx`: row 1's anatomy names the AI mark after the word.
- **13** `docs/games/codenamesduet.md` rules table: "every move is logged" —
  not "replayable in the Game Log", which draws neither a pass nor a hint.
- **The seen-in-passing prose**, since these files are open and each is a
  one-line truth: `submit_clue`'s raise count (five: two faults, three races),
  `_end_turn`'s "no guesses taken" (a pass can follow guesses), and the old
  doc's link for `submit_guess` (to `supabase/sql/codenamesduet.sql`).

### D. This plan file — 14

The status line points at the addendum and says the rehearsal is stale. The
superseded passages — "The writers" `log_hint` row's mark, "The log looks the
same" (*a hint is a mark on its turn's clue row*), `lib/answer.ts` (`hint`),
Step 4's `hintedTurnsOf` and hinted-turn mark — are struck through with a
pointer to the addendum rather than rewritten, so the record of what was built
when stays readable.

### E. Questions — Joel's

- **15** — `clue_from_ai = false` on the 126 backfilled clues means "nobody
  recorded it". **Recommended: accept** — nothing reads a rate of AI clues, and
  a nullable-on-old-rows column would put an unknown state into every reader
  for the sake of a stat nobody has asked for.
- **16** — a failed `log_hint` discards a suggestion already paid for.
  **Recommended: split by severity** — a race (the game ended, the seat moved)
  is relayed as now, since the suggestion is moot; a fault returns the
  suggestion anyway and logs the failure in the function, so a transient
  database error does not cost the player the clue. The alternative is to
  leave it as it is.
- **The sudden-death log gap** (seen in passing) — not this branch's; it goes
  to `src/codenamesduet/todo.md` → Soon for the area, unless Joel wants it
  here.

### F. Then

1. Tests: pgTAP whole suite, unit + guards, `tsc`, lint, `deno check`.
2. **Commit — only on Joel's word.** Today's uncommitted work (the hint-mark
   color, the AI-clue flag) and this round would be one or two commits.
3. **Re-rehearse** — the migration changed after the last one: a prod backup
   (a read) and `db-rehearse`, then `db-reset ENV=local`. Joel's to allow.
4. **The e2e specs** — they have not run on the AI-clue change. Joel's to allow.
5. The deploy and the merge — Joel's, as before.

### Joel's answers to the audit's questions — 2026-09-23

| # | answer |
|---|---|
| 2 | asked for an explanation; open (the answer echoes the parameters, which today equal the stored row, since the insert stores them unchanged) |
| 4 | **drop the sorts** — `GameEventLog`, `lib/history.ts`, `pdf/model.ts`; the log spec becomes "shown in the order given" |
| 15 | **accept** — `false` on the backfilled clues stands |
| 16 | **split by severity** — a race from `log_hint` is relayed; a fault returns the suggestion and the function logs the failure |
| — | the sudden-death guesses ARE in `codenamesduet.events` (one `guess` row each, under the sudden-death turn number); only the log's drawing skips a turn with no clue. A display gap, for the area's `todo.md` |


### Sudden death, one turn per guess; the history link is an event id (2026-09-23)

Joel, on the audit's seen-in-passing item: sudden-death guesses were in
`codenamesduet.events` all along and the log never drew them. First built as
one grouped turn with a dot per guesser, then — his call, *"sudden death
guesses switch between guessers, and losing them under a player filter isn't
good"* — **every sudden-death guess is a turn of its own**:

- **`submit_guess`:** an agent in sudden death that does not win moves the turn
  number on, and takes a turn. The event is now written after the agent count
  is known, so `took_turn` can say so. The losing guess moves nothing.
- **The backfill** numbers prod's sudden-death guesses budget+1, budget+2, … in
  the order made, marks those agents as taking a turn, and moves each such
  game's `turn_number` (and its status blob's) to match. The migration's check
  still holds: turn-taking events = `turn_number − 1`. Re-proved in the
  rolled-back script, now making its own three games; planted with the games
  update off, it raised.
- **The log:** a sudden-death guess is ONE row — "Sudden death: WORD", the word
  in its key-card color, the guesser in the actor column, the bar `won` for an
  agent and `lost` otherwise (`turnOutcome`'s sudden-death rule) — filed under
  its guesser by the picker. The PDF prints the same, a row per guess.
- **The history link is an event id** (Joel: a turn-number key could never
  address a row that shares its turn, like a hint, should one ever be drawn).
  A turn's handle is its clue's id — the row that exists as soon as the turn
  does and never moves as guesses land — and a sudden-death row's its guess's.
  `turn_number` stays, for grouping. `#N` is the on-screen ordinal, as in every
  game, and the banner shows it back (`historySnapshot` takes `n`).
- **Kept from the grouped version:** `isSuddenDeathTurn`, `turnOutcome`'s
  sudden-death rule, the history label "Sudden death → WORD".

**The audit's items, as fixed:** 1 (the drop's reason), 2 (the answer is read
back with `returning` and carries `from_ai`), 3 (`log_hint` uses `auth.uid()`;
the row read stays, for the turn), 4 (the redundant sorts gone), 5 (a hint of
mine is not narrated — planted, red), 6–13 and the seen-in-passing prose, 14
(this file), 16 (a race from `log_hint` is relayed; anything else is logged and
the suggestion goes out). 15 accepted as is.

**Not asked for, decided in passing, and Joel's to overrule:** `took_turn`
counts a sudden-death agent as a turn; `docs/naming.md`'s `created_at` row lost
its roster of games along with codenamesduet's exception.

**Tests:** pgTAP 2601 (the sudden-death turns, the stored-row answer); unit 430
across the game, the guards and keyboard (sudden-death rows, the id link — the
old turn-number link planted back went red — the history number, the PDF
rows, `turnOutcome`'s sudden-death rule).

### The rehearsal, rerun on the final migration — 2026-09-23

- **The cut:** prod still lacks only `20260923000001`; it holds 19 games, 126
  clues and 240 guesses, 2 of those in sudden death.
- **`gmake db-rehearse`** over `backups/prod-20260923-134838.dump`: the
  migration applied and its own checks passed; `-clues 126`, `-guesses 240`,
  `+events 434` — 126 clues (`clue_from_ai` false on all), 240 guesses (45
  taking a turn), 68 inferred passes. **Prod's two sudden-death games each
  ended on their FIRST sudden-death guess**, a bystander, so nothing was
  renumbered: each sits at budget + 1, `took_turn` false, the game's turn
  number unchanged. The whole pgTAP suite passed against prod's rows (182
  files, 2601 tests); the id sequence stands past the highest id.
- **`gmake db-drift`:** none. Local reset to the dev seed afterwards.
- **e2e:** the nine codenamesduet tests green (the new `codenamesduet-events`
  spec among them), before the rehearsal.

**Left:** commit, then the deploy and the merge — all Joel's.

### Deployed to production — 2026-09-23

From branch `codenamesduet-events` at `fa99b43d`, pushed (Joel: *"commit, then
push and deploy (from this branch)"*). No duet game on prod had a move in play.

- `gmake deploy ENV=prod`: the migration and the repeatable SQL landed, then
  the edge-functions step failed on its LAST function, `wordwheel-build-board`,
  with Supabase's *"Function deploy failed due to an internal error"* (500) —
  `codenamesduet-suggest-clue` had already gone out. The frontend step never
  ran, so the old frontend was reading the dropped tables: `gmake deploy-fe`
  went straight after, then `gmake deploy-funcs` again, which deployed all
  thirteen cleanly. The 500 was transient.
- **Checked on prod:** `clues` and `guesses` gone; 434 events — 126 clues, 240
  guesses (45 taking a turn), 68 passes — as rehearsed; the id sequence at 434,
  `is_called`, so the next row is 435; one `submit_clue` overload; the
  migration recorded; `db-drift ENV=prod` none.
- **Owed:** one game opened in a browser on prod — the new table, the RPCs and
  the realtime subscription in one path, which no query checks.
