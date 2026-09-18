# events — review of the BUILT work (2026-09-17)

**What this is.** A second reader (Claude Fable) checked the built work of the
three plans — [events.md](events.md), [scrabble-ai-players.md](scrabble-ai-players.md),
[event-log.md](event-log.md) — against the code, commits `0dc03df5..615737a4`.
This is the fix list for the implementer. Nothing here is committed; nothing
here is a ruling unless marked.

**What was verified green before reading:** `npm run test:db` (2511 tests),
`npx vitest run` (3270), `npx tsc -b`, `npx eslint .`, `src/types/db.ts`
matches `supabase gen types` against the local database, working tree clean.

**Tags.** **FIX** is a defect confirmed at the file named — fix it. **ASK JOEL**
is his to rule on; ask, do not pick. **NOTE** is recorded for the record and
needs no action unless he says so. Line numbers are as of 2026-09-17 and will
rot; what is named is what to look for.

**Rules that apply to every fix here:** a comment describes what IS, never
what used to be; durable files never cite `plans/`; `git commit` only when
Joel says so, and a phase stops for his review first.

---

## 1. FIX — behavior, schema, deploy

### 1.1 FIX — `scrabble.events` still carries `plays_user_id_fkey`

`supabase/migrations/20260917000009_scrabble_events.sql` renames
`plays_game_id_fkey` and `plays_kind_check` but not the user FK, which the
baseline (`20260627000000_scrabble.sql`, `user_id uuid references
common.profiles(user_id)`) auto-named `plays_user_id_fkey`. Confirmed on the
local database: `pg_constraint` for `scrabble.events` lists
`events_game_id_fkey, events_kind_check, events_pkey, plays_user_id_fkey`.
The other nine logs renamed both FKs.

Fix in place in migration 09 — prod has applied nothing from `20260917`, so it
is not an applied migration — with
`alter table scrabble.events rename constraint plays_user_id_fkey to events_user_id_fkey;`
beside the game FK rename. Then a local `db reset` and `gmake db-drift ENV=local`.

### 1.2 FIX — wordiply has no compete fold and no actor

event-log.md §B.4's built note says eight games fold the row author's rows
(seven plus wordiply from §C). The code is the seven. In
`src/wordiply/components/PlayArea.tsx`, `historySnapshot(myRows, historyId)`
folds `myRows`, which in compete is `guesses.filter((g) => g.user_id ===
session.user.id)` — the comment above it says *"which in compete is mine
alone"* — and `src/wordiply/components/BoardCol.tsx` renders
`<HistoryBanner label={historyLabel} onExit={onExitHistory} />` with no
`actor`. At a compete terminal, an opponent's `#N` resolves to an id not in
`myRows`, the builder's "replays nothing" branch fires, and the board shows
five empty slots named nobody.

Do what the other seven do (wordle's `PlayArea.tsx` near line 467 is the
model): resolve the row with `guesses.find((g) => g.id === historyId)`, fold
the rows of whoever wrote it (rejects included — §C's reason), and pass
`actor` only when `mode === 'compete'` and the row's `user_id` is not the
viewer's. Add the PlayArea test the seven have.

### 1.3 FIX + ASK JOEL — migration 12 refuses a prod with any pre-bot AI seat

`20260917000012_scrabble_players_user_id.sql`'s `set not null` refuses if any
`scrabble.players` row has a null `user_id` — an AI seat dealt before the bots
were accounts. Deliberate, and the file says so. Two things follow:

- **FIX — write the pre-deploy check down where deploys are described**
  (`docs/cheatsheet.md`'s deploy block, or wherever `db-bots ENV=prod` is
  already recorded as the manual step): run
  `select count(*) from scrabble.players where user_id is null` on prod
  before `db push`; if it is non-zero the deploy stops at migration 12 with 10
  and 11 already recorded as applied.
- **ASK JOEL — what happens if that count is non-zero.** This reader could
  not query prod. The plans record prod as holding no scrabble rows, which
  would make it zero. If it is not: delete those games, or backfill bots onto
  the seats in migration 12. Do not pick.
- **FIX — the "AI k" fallbacks are dead after migration 12, and their comments
  say the opposite.** `supabase/sql/scrabble.sql` `_finish` (near line 481,
  `select 'AI ' || count(*) into v_winner_name …`, commented *"for games dealt
  BEFORE the bots were accounts … it goes when nothing that old is left"*) and
  `src/scrabble/components/PlayArea.tsx` (near line 486, the `winnerSeat`
  branch and the *"synthetic 'AI n'"* comment). After migration 12,
  `v_winner_user` comes from a `not null` column, so neither branch can run.
  Either delete both with their comments, or keep them and say honestly why
  (there is no honest reason once the column is `not null`).

### 1.4 FIX — the pgTAP suite depends on bots that only `db-bots` creates

`supabase/tests/scrabble/ai_players_test.sql` (header: *"The bots are
environment, like the word list: `gmake db-bots` provisions them"*) and
`supabase/tests/scrabble/concede_test.sql` case 4 (`ai_count: 1`) seat a bot.
`supabase/tests/_shared/setup.psql` materializes the five personas and no bot.
So:

- a local database built with `gmake db ENV=local` + `db-seed` but not
  `db-bots` fails both files (create_game raises PN496);
- **`gmake db-rehearse`** — built in phase 0 to rehearse exactly these
  migrations — runs neither `db-seed` nor `db-bots` after the restore, so its
  `_db-rehearse-verify` step (`npm run test:db`) goes red on a prod dump for
  an environment reason, not a migration one.

Fix: a bot persona in `setup.psql`, which already *"manually materializes what
claim_username would have produced"* — one profile with `ai_member = true`,
or the three — so the suite carries its own environment like it does for the
personas. Then the tests stop naming `gmake db-bots` as a precondition.
(Alternative: `db-bots` inside the rehearse target. Weaker — a test that needs
a Make target run first is a test that fails on the next fresh checkout.)

### 1.5 NOTE — the renumbering tie-break is not total for three tables

wordle, waffle and stackdown renumber by `(created_at, seq)`, and their `seq`
was per-player, so two compete players writing in one instant with the same
`seq` are unordered; the self-check recomputes the window and could raise on
an exact tie. scrabble's `seq` was game-wide (total), and the three uuid
tables tie-break on the uuid (total). Prod's rows passed the rehearsal, so
this is recorded, not fixed.

---

## 2. ASK JOEL

### 2.1 ASK JOEL — what number does the banner show?

event-log.md §B.2 rules that the log's `#N` is the ordinal of the row in the
list on show. Four builders label the banner with a DIFFERENT number — the
row's index in the list they FOLD:

- `src/waffle/lib/history.ts` — `describe(swap, index + 1)` → `#N: A (A1) ↔ B (C2)`
- `src/strands/lib/history.ts` — `#${index + 1}`
- `src/wordle/lib/history.ts` — `Guess ${index + 1}`
- `src/setgame/lib/history.ts` — `Turn ${index + 1}`

In coop the folded list is the whole shared log while the log's `#N` counts
the picker-filtered rows. Pick one teammate in a coop waffle: their first swap
reads `#1` in the log and `#3: …` on the banner. At a compete terminal under
"All" it goes the other way. And `src/waffle/lib/history.ts`'s `describe`
docstring says *"`n` is the row's position in the list being shown, which is
the same number the log prints beside it: the caller passes the list and the
index, so the two cannot disagree"* — false now that the two lists differ.

Options, named:

- **same as the log** — the banner shows the `#N` the row printed; the log
  passes the displayed ordinal alongside the id (waffle did this before the
  re-key, with `seq`), and the builder stops counting;
- **no number on the banner** — the banner names the event (`A (A1) ↔ B (C2)`,
  `GUESS`, the set) and the actor when there is one; the number was only
  ever the link back to the log row, which is highlighted anyway;
- **the folded index, documented** — keep the code, rewrite the four
  docstrings to say the banner counts the board's own sequence, which is a
  third number beside the ordinal and the metered number.

Whichever it is, the waffle docstring is wrong today and is fixed by the answer.

### 2.2 ASK JOEL — stackdown's `reveal_next_word` / `reveal_next_hint`

Still open from events.md §10 phase 5. The RPCs write `kind = 'spoiler'`
(`supabase/sql/stackdown.sql` near line 544) and answer `{result: 'reveal'}`
(near line 559, with a comment saying the envelope *"borrows the `kind`
vocabulary the submissions row already uses"*, which is now false twice
over); `src/stackdown/components/PlayArea.tsx` matches on `'reveal'`;
`supabase/tests/stackdown/reveal_test.sql` asserts it. psychicnum's twin
became `request_spoiler` answering `spoiler` on exactly this argument.
`docs/naming.md` treats stackdown's `_next_` names as deliberate. Ask; do not
rename unasked. Whatever the answer, fix that comment.

### 2.3 ASK JOEL — `took_turn` written as an expression at two inserts

`supabase/sql/strands.sql` near line 1104 writes
`v_result in ('theme', 'spangram', 'hint_word')` and
`supabase/sql/wordiply.sql` near line 860 writes
`reject_reason in ('too_short', 'missing_base')`. Every other insert writes a
literal. Both are correct at every branch and both are pinned by tests, and
the plan's own invariant 2 says `took_turn` is the server's verdict, which is
what an expression over the verdict is. This reader would leave them. Ask
only because the skeleton's own text says "literal".

### 2.4 ASK JOEL — the realtime e2e claims more than it proves

`e2e/events-realtime.e2e.ts`'s header (and the matching sentence in
`docs/testing.md`) says the page did nothing after opening, so *"Only the
postgres-changes event can explain the row appearing."* Not quite:
`src/common/realtime/useRealtimeRefetch.ts` refetches on `SUBSCRIBED` and
again on the attach confirmation (`onPostgresAttached`), and connections
hand-rolls the same. The spec's ready signal is the log box, which appears
after the mount load, so a Node write landing before the attach is picked up
by a refetch, not an event. The spec still catches a wrong table name — a bad
binding fails the channel join, so neither the attach confirmation nor an
event arrives — which is the job it was written for.

Options: **tighten** (wait for the attach before writing the row — the
realtime diagnosis kit in `docs/realtime-lost-events.md` may already expose a
signal) or **soften** (the docstring says what it does prove: a live binding
on the right table).

---

## 3. FIX — prose that outlived its mechanism

None of this is seen by a compiler. Every site was read; the quoted text is
what is there. Rewrite from the answers in event-log.md §B.2/§B.3 and
scrabble-ai-players.md §2, not from the old text.

### 3.1 The shared hook and folder

- `src/common/event-log/useHistoryViewer.ts` — the `Id` docstring event-log.md
  §F.3 named to rewrite was not rewritten: *"`Id` is how that game names a turn
  (scrabble's game-wide `seq`, stackdown's log position)"*; and the
  `historyId` field comment: *"the events row's own id, or the game-wide
  ordinal scrabble and codenamesduet key by"*. scrabble keys by the row id
  (`src/scrabble/components/PlayArea.tsx` `showHistory({ kind: 'turn', id })`);
  only codenamesduet keys by `turn_number`.
- `src/common/event-log/EventLog.tsx` — the `n` prop comment: *"each game's
  own (scrabble's `seq`, codenamesduet's `turn_number`, stackdown/waffle's
  1-based log position)"*. Ten games pass `i + 1`. Same file, the module
  docstring: *"a event-log item"* → "an event-log item".
- `src/common/event-log/useEventLogPlayerPicker.tsx` — *"why all six results
  travel together"*: the hook returns five; the sixth was `boardIsShown`.
- `src/common/event-log/doc.md` — *"scrabble names one by its game-wide `seq`
  and codenamesduet by a turn number, everyone else by the events row's own
  id"* (stale for scrabble); the paragraph beginning *"Every handle is live,
  and that is new. The log used to carry a `boardIsShown` flag …"* is
  how-it-used-to-work and is the last `boardIsShown` outside `plans/` — keep
  one sentence (a filtered log renumbers what it shows and still opens the
  row beside the number); `## Intro to area` runs five paragraphs and its
  compete-history paragraph restates `## Details` — trim to one narrative; the
  British spelling of "de-emphasized" in the Details section (the spelling
  guard misses it because of the `de-` prefix — fix the word, and consider
  un-anchoring the guard).
- `src/common/event-log/todo.md` — the Soon item `history-always-available`
  is this sprint's phase B and cites *"plan §3 row 40"*. A shipped todo is
  deleted; a durable file never cites the plan.
- `src/common/event-log/useEventLogPlayerPicker.test.tsx` — the header's
  *"when `#N` may drive the board"* describes the deleted flag.

### 3.2 The ten `GameEventLog.tsx` files

Each still carries the position-keyed handle and/or the deleted gate in its
prop docstrings and comments. Per file:

- psychicnum — *"(by log position)"*, `onShowHistory: (index: number)`; and
  *"(guesses, hints, reveals)"* — the kind is `spoiler`.
- wordle — same prop text; *"the `#N`-handle gate … come from the shared hook"*
  (no gate); a paragraph ending *"their rows stay a plain, read-only `#N` (no
  replay)"* — the opposite of the code below it.
- connections — same prop text; *"live ONLY when the rows on show ARE the
  board's … the number stays a plain read-only marker"*.
- letterboxed — `(index: number)`; *"which is why the handle no longer has to
  be gated"* (archaeology); *"A live handle only when the rows on show ARE the
  board's rows"*.
- waffle — *"(by log position)"*, `(index: number)`; *"the gate is
  load-bearing"*; *"the number IS that position … which is what the handle
  addresses"* — contradicted four lines below.
- stackdown — *"Identified by log POSITION, not seq — stackdown's seq is
  per-user"*, `(index: number)`; *"a filtered list's row 3 isn't the board's
  turn 3; there it degrades to a plain number"*.
- strands — same prop text; *"`#N` keeps meaning 'position in this log' —
  which is precisely what the history viewer indexes by"*; *"offered when the
  visible rows are the viewer's own sequence"*; and a MANGLED edit near line
  119: a dangling fragment *"`#N` is a LIVE handle only when the rows on show
  ARE the board's own"* with no period, then the new sentence on the next line.
- setgame — *"Identified by log POSITION — see lib/history.ts"*;
  `onShowHistory: (index: number | null)` — nothing calls it with `null`, and
  `PlayArea.tsx` branches on `index === null` for a case that cannot happen.
  Drop the `null` arm and rename the parameter `id`.
- scrabble — *"which is exactly what a forfeit used to do"* (archaeology, and
  the retired kind); `src/scrabble/components/InfoCol.tsx` *"(by seq)"* and
  `onShowHistory: (seq: number)` — it is an id.
- wordiply — fine.

### 3.3 The history builders

Module headers contradicting their own function docstrings:

- `src/psychicnum/lib/history.ts` — *"the position of a turn within it"*,
  *"**Keyed by log position, not a stored id.**"*, *"the turn at `index`"*;
  and *"hint / reveal"* for what is a spoiler (also in its test).
- `src/wordle/lib/history.ts` — *"**Keyed by log position, not a stored id.**
  … the DISPLAYED board (0-based) … only ever replays the board the player is
  looking at"*, *"Equal to `index`"*.
- `src/connections/lib/history.ts` — *"**Keyed by log position** … The log
  renders "#N" = position"*, *"a compete viewer replays only their own
  board"*, *"for the turn at `index`"*.
- lesser, same vein: `src/waffle/lib/history.ts` (*"we index it directly"*,
  and *"See the `swaps_select` policy"* — it is `events_select`; the header is
  ~30 lines with a date, over the hover budget), `src/stackdown/lib/history.ts`
  (*"for the turn at `index` … the same chronological list the log shows"*),
  `src/letterboxed/lib/history.ts`.
- tests: `src/stackdown/lib/history.test.ts` *"chronological (submitted_at)
  order"*, *"share a per-user seq of 1"*; `src/waffle/lib/history.test.ts`
  *"each counts its OWN seq from 1"*, *"used to restart at 1"*;
  `src/scrabble/lib/play.test.ts` *"given seq"* / *"latest seq"*.
- `src/connections/lib/history.test.ts` has no missing-id case; the other
  eight builders pin one (`id: 99`). Add it.

### 3.4 PlayArea section comments

- psychicnum — *"Keyed by log position (guesses have no per-turn ordinal)"*.
- wordle, connections — *"Keyed by log position"*.
- letterboxed — *"keyed by POSITION in the rows the log is showing (the log
  hands them up, so both sides index the same list)"*, contradicted by the
  fold just below it.
- stackdown — *"Identified by the row's POSITION in the log, not its seq"*;
  *"`historyId` indexes `logWords`"*.
- waffle — *"Turn-history (coop only)"* and *"Only coop can reach it (compete
  renders no swap log)"* — compete history is the new feature.
- three `hooks/useGame.ts` `id` docstrings (scrabble, waffle, wordle) — *"It
  replaced a … `seq`"*: archaeology, drop the sentence.
- `src/scrabble/hooks/useGame.ts` `currentUserId` — *"also null when it's an AI
  seat's turn (an AI has no user)"* — false, and it is the field the poke
  predicate was moved off. Same file's realtime comment names `plays`.
- `src/common/realtime/useRealtimeRefetch.ts` docstring example —
  *"psychicnum/useGame: subscribes to `games` AND `guesses`"*;
  `src/connections/db.ts` — `.from('guesses')` in a comment.

### 3.5 Bots — comments in scrabble's SQL and tests

`supabase/sql/scrabble.sql`, each read:

- `create_game` — *"they're scrabble-local (never in common.game_players /
  profiles)"*, fifty lines above the block that seats them in both.
- *"the FE labels AI seats"*; `_rack_for` — *"an AI seat (null user_id) … an AI
  seat's null user never equals the caller"* (still true in effect, wrong
  mechanism); *"AI 1: 7 tiles"*; `_advance_seat`, `_finish`, `pass_turn` — *"an
  AI seat has no game_players row (LEFT JOIN → gp null)"*; *"v_user … (null for
  an AI seat)"*.
- `src/scrabble/components/GameEventLog.test.tsx` — header *"A bot's play
  carries `user_id: null`, so rows are keyed by a synthetic `ai:<seat>` id"*
  and the test title *"the `ai:<seat>` key, since user_id is null"* — the
  fixture uses a real `bot1` id.
- `supabase/tests/scrabble/ai_players_test.sql` — the Covers line *"`_finish`
  crowns an AI winner (winner_seat + "AI 1", no human uuid)"* — the assertions
  below it say the opposite.
- `src/scrabble/components/GameEventLog.tsx` — the hand-rolled compete filter
  is now byte-for-byte the picker's own `filter`; its reason (*"a bot's play
  has `user_id: null`"*) is gone. Use the picker's.

### 3.6 pgTAP comments naming old policies

`supabase/tests/wordiply/rls_test.sql` (*"The guesses_select policy"*),
`supabase/tests/stackdown/rls_test.sql` (*"submissions_select"*),
`supabase/tests/waffle/compete_test.sql` (*"swaps_select gates on it"*),
`supabase/tests/psychicnum/rls_test.sql` (*"guesses_select carries an `or
cg.is_terminal` arm"*). All are `events_select`.

### 3.7 Docs

- `docs/playarea.md` — *"Six things travel with the hook … whether `#N` may be
  a live history handle"* (five; no such flag); *"a event-log item"*;
  *"scrabble filters by hand (a bot's play has `user_id: null`)"*; *"AI seats
  pickable people, keyed by the synthetic `ai:<seat>` id"*; *"scrabble — keyed
  by the stable `seq` (game-wide ordinal, not log position)"*; *"like scrabble's
  `seq`"* (twice); *"a stable `seq` / `turn_number` in scrabble /
  codenamesduet"*; stackdown *"valid submissions with `seq < N`"*; *"turn
  identity (a game-wide ordinal vs a log position)"*; the viewer roster omits
  wordiply; *"hint / reveal turns"*; *"the one viewer that…"* / *"the only
  viewer whose…"* (name the condition).
- `docs/games/scrabble.md` — the `players` row (*"PK `(game_id, seat)` … a
  seat may be an AI player, which has no profile, so `user_id` is nullable …
  `players_human_xor_ai`"*); leaderboard *"an AI seat has a null `user_id`"*;
  `winner_user_id` *"null if an AI won"*, `winner_username` *"or "AI k""*; the
  paragraph *"AI seats are rows in `scrabble.players` with a null `user_id`
  … not in `common.game_players` / `common.profiles` … the terminal reads
  "AI 1""*; *"● AI 1 played COATS (+18)"*; *"`seq ≤ target`"*.
- `docs/games/wordle.md` — *"Keyed by **log position** (= the displayed board
  row, 0-based; the viewer only ever replays the board you're looking at…)"*.
- `docs/games/psychicnum.md` — *"Keyed by **log position** (the `#N` the log
  shows)"*; *"hint / reveal"*.
- `docs/games/letterboxed.md` — *"keyed by **log position**"*.
- `docs/games/codenamesduet.md` — *"(a game-wide turn ordinal, like scrabble's
  `seq` — not log position)"*.
- `docs/games/stackdown.md` — *"the stored `kind` stays `'reveal'` — renaming
  it would be a migration for a label"* (it was renamed).
- `docs/games/wordiply.md` — documents the viewer near line 124 and then, near
  line 606, *"There is deliberately **no `#N` history handle**: wordiply has no
  turn-history viewer and doesn't want one"*.
- `docs/outcomes.md` — the model `answer.ts` reads `'accepted' | 'invalid' |
  'hint' | 'reveal'` / `reveal: 'lost'`; the real file says `'spoiler'`.
- `docs/features.md` — the EventLog row omits WW, which sits under *"Neither:
  MG CP WW (WW's five guess rows on the board ARE the record)"*. wordiply's log
  is the record, rejects included, and it has a viewer now.
- `docs/naming.md` — *"whatever that game's `lib/history` indexes by: a log
  position, a `turn_number`, a `seq`"*.
- `docs/common.md` — names `scrabble._advance_turn` twice (it is
  `_advance_seat`; the sql header was fixed, the doc was not); and
  scrabble-ai-players.md §7's rule — *a gametype may seat a bot only where
  something pokes it to move* — was to be written *"beside the rotation"* here
  and was never written anywhere.
- `docs/cheatsheet.md` — `db-add-user` lists `EMAIL/HANDLE/COLOR/DRY` but not
  `AI=1`, which the Makefile help line advertises.
- `docs/games/wordle.md`, `connections.md`, `waffle.md` — *"the only one this
  game has"* about the one-value kind: name the condition (the check allows
  one value), not the count. `docs/pdf.md` *"the only printer with no board"*
  likewise.

### 3.8 Plan status lines (before the plans are deleted)

- `plans/event-log.md` line 3 says *"What is left is §D's verification"*; §D
  carries a BUILT note. `plans/events.md` line 3 repeats it, and `CLAUDE.md`'s
  plans table says *"§D's verification is what is left, and it includes an
  e2e, so ask first"*. What actually remains is `e2e/setgame-flash` red on a
  setgame bug, filed in `src/setgame/todo.md`.
- `plans/scrabble-ai-players.md` line 3 — *"DONE — all four phases built; 3
  and 4 awaiting review"*: one word.
- `plans/app-audit.md` row 40 links event-log.md and names
  `common/turn-log/useTurnLogPlayerPicker.tsx`, a path that no longer exists;
  row 3 names `<TurnLogOutcomeBar>`, row 46 says *"moved in from
  `turn-log`"*; `plans/areas/lists.md` names `useTurnLogPlayerPicker`. Open
  rows take the new names; closed rows may keep the old as a record.
- `plans/events.md` §13 still points at event-log.md §E for *"`boardIsShown`'s
  new name"*, which is struck as moot.

---

## 4. NOTE — recorded, no action unless Joel says

- **The skeleton guard** (`supabase/tests/common/events_skeleton_test.sql`)
  asserts the six columns, not-null, the identity key, the read index, the
  kind check and the absent kind default. It does not assert `took_turn`'s
  `default false` or the two FK targets. Every migration sets the default, so
  nothing is wrong today; a game that added the column without it would pass.
- **Index names differ on the two untouched tables.** letterboxed and setgame
  keep `<game>_events_game_id_idx` on `(game_id, id)`; the eight renamed
  tables create `<game>_events_game_id_id_idx`. Same columns; the guard checks
  columns, not names.
- **Five applied migrations were edited in place**, comment-only ("turn log" →
  "event log", and strands' pointer to scrabble's log). No DDL, so `db push`
  skipping them loses nothing. Recorded because CLAUDE.md says never to.
- **`supabase/scripts/add-user.ts`** marks the bot with its psql UPDATE after
  the `try/catch` whose `deleteUser` is the rollback. If the mark fails, the
  account exists unmarked and a re-run refuses at "already set up". The psql
  connection was proven earlier in the run, so the window is narrow.
- **scrabble's builder folds `id <= target`** rather than `findIndex`, so an
  id not in the list folds everything up to it rather than nothing. By design
  — the board is shared and every row visible — and outside the "eight
  builders" count. Not pinned, and need not be.
- **No guard enforces the event-log vocabulary.** `src/` and `docs/` are
  clean; `plans/tile-feedback.md` still says "turn log" in several places,
  which is a design reference outside the sweep.
- **`docs/supabase.md`'s events section** states three `took_turn` examples and
  says the literal lives in `supabase/sql/`; the per-game rule lives in each
  game's doc. The complete table is events.md §6, which goes when the plan
  goes — a pointer sentence from supabase.md to "each game's doc" would keep
  it findable.
