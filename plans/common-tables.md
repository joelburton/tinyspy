# Common tables — where a game's facts live

**Status: decided (Joel, 2026-09-27); the path is below, and no stage has
started.** It grew out of
[cross-game-consistency §3b](cross-game-consistency.md#3b-how-it-ended-for-me--won-lost-conceded-no-result-solved-not-started)
and now builds that plan's step 7. The facts it rests on — both common
tables' columns, each game's own table, who reads and writes what, every
`status` and `result` key, and prod's stored values — are in
[common-tables-survey.md](common-tables-survey.md).

## The model

Every fact has one home. A copy is allowed only where this section names it.

- **`common.games`** holds a fact when every game has that kind of fact and
  it means the same thing in each: the id, the club, the gametype, `mode`,
  the lifecycle (`started_at`, `ended_at`, the outcome, the reason pair), the
  current view, the turn. It is not "what the club page needs".
- **`common.games.setup`** is the setup form's record: every item on the form,
  under the form's name, written at create and never changed.
- **`common.games.clubpage_info`** is what the club page shows beyond
  `common.games`' columns. It replaces `status`.
  - It is a copy. The game writes it in the same RPC as the move that changes
    it, and never reads it; the truth is in the game's own tables.
  - It holds data, not text: each manifest's `labelFor` still words the club
    line.
  - A stale copy shows at once on the club page.
- **`common.games.leaderboard`** is the compete players' numbers: one array,
  an entry per player with `user_id` and the game's own numbers under the
  game's own names, `[]` in coop. A copy of the same kind as `clubpage_info`
  (written by `<game>._leaderboard()` in the move's RPC, never read by the
  game's rules) but its own column, because two readers use it: the strip
  and the club line. The end facts — `final_ranking`, `player_ended_reason`
  — stay on `common.game_players`, and the front end joins the two rows it
  already subscribes to. It is a column and not a front-end join because the
  bee pair, boggle and wordiply have no per-player table: their numbers are
  totals over rows a rival may not read until the end, and Realtime cannot
  subscribe to a definer view.
- **`common.game_players`** holds the per-player facts every game has, as
  typed columns, with no jsonb: joined, turn seat, when the player ended,
  outcome, `final_ranking`, `solved`, and the player's reason pair (a
  concession is one of its reasons). `result` goes.
- **`<game>.games`** holds the game's own facts and nothing `common.games`
  already has — no `mode`, no `club_handle`. Its jsonb has one shape in every
  row (crosswords' puzzle, a grid), never a bag of keys.
- **`<game>.players` and the child tables** (events, found words, cells,
  guesses) keep their roles. The leaderboard is worked out from each game's
  own per-player fields; how, and whether it is cached, is the game's own
  business.
- **The club page reads only `common.games`**: one query and one Realtime
  subscription. Never a game's own tables, and never `common.game_players`.

## Why this model

Four were weighed (Joel, 2026-09-27):

- **Fold `<game>.games` into jsonb on `common.games`.** Workable, but every
  gametype fact becomes jsonb, which is harder to validate and to read.
- **`common.games` holds only what the club page needs.** Turn order and
  conceding are shared machinery — `common._advance_turn`, `common.concede`,
  the turn bell, `whereIStand` — and it is shared because the facts sit in one
  table with one shape. Split across sixteen tables, that code is copied per
  game or names its table at run time.
- **The club page also reads `common.game_players`.** A second subscription
  for every club page, and the club line worked out far from the RPC that
  changed it.
- **This model**: a fact every game has is common, and the club page's needs
  are one labeled copy.

## What was found on the way

- **The security rules are not a blocker.** The client never writes a table
  directly: every write is an RPC. The rules do real work in one place, the
  compete filter on child tables (in psychicnum, stackdown, connections and
  the bee games, the FE shows only what the rule lets through), and child
  tables stay.
- **A secret takes its own column**, left out of the readers' grant, and a
  view or an RPC reveals it once play reaches that point. A grant covers a
  column, not a key inside jsonb. Tested on the local stack (2026-09-27): a
  change on a table with an ungranted column still reaches the subscriber,
  and the payload leaves that column out (`wordle.games.target`).
- **Realtime.** 12 of the 16 games write `common.games` on every move, and
  each write makes every open club page re-read its whole list. Every move
  that writes a `<game>.games` also writes `common.games`. Eleven games write
  their `<game>.games` during play only as a no-op poke (`set club_handle =
  club_handle`) at the end or a replay, so the game page refetches.
- **crosswords' cells stay a table**: one row per cell, written on every
  keystroke by several players at once, merged in the FE by a per-cell
  version.

## Decided

Agreed 2026-09-26:

- **`play_state` and `is_terminal` are dropped.** `ended_at` null means still
  playing. A new `game_ended_outcome` — `won` / `lost` / `near` / `neutral`,
  null exactly when `ended_at` is — is backfilled from `play_state` (`won` /
  `won_compete` → `won`, `lost` / `lost_compete` → `lost`, `ended` →
  `neutral` — except scrabble coop's and wordiply coop's `complete`, ruled
  wins, which the backfill records as `won` (Joel, 2026-09-27: rewrite
  history; those endings were poor choices, not worth retaining). In
  compete: `won`, someone won; `lost`, everyone lost; `neutral`, no result;
  `near` occurs in no game today but is a valid end outcome, so no check
  constraint excludes it.
- **Sudden death** is worked out in codenamesduet (`turns_remaining = 0`
  while the game hasn't ended), not stored as a state.
- **The game's reason pair and `mode`** are columns on `common.games`;
  `status.mode` goes.
- **`player_ended_at` replaces `locally_terminal`**: when the player stopped
  while the game went on, null if they never did.
- **`status.title` is deleted** (crosswords). It copies `crosswords.games.meta
  ->> 'title'`, and its only reader is `replay_board` writing it back.
  `create_game` and `replay_board` stop writing it.
- **What `status` holds today, and where each kind goes.** Facts fixed at
  create (`required_words_count`, `target_rank`, `max_words`, `max_swaps`,
  `max_guesses`, `base`, `max_word_length`, `required_secrets_count`) are
  typed columns on `<game>.games`. Live progress (`found_words_count`,
  `rank_idx`, `swaps_used`, `bag_count`, `deck_left`, `turn_number`) lives in
  the game's own tables, with a copy in `clubpage_info` where the club line
  shows it. The end-of-game summary (`top_score`, `winner_swaps`, `longest`,
  `turns_used`, …) is the same. Every gametype key in `result` (`score`,
  `sets_found`, `found`, `swaps`, `guesses`, `length_score`,
  `letter_count`) already copies the game's own per-player table or is
  worked out from its rows.

Decided 2026-09-27:

- **`setup` is the form's record, and is read for two things only**: showing
  the form's choices back (the Setup options list in the info column, the
  PDF's setup rows) and replaying it (Restart, a new game with the same setup).
  Anything the game's logic needs after create — in SQL or in the front end
  — is a typed column, copied at create: on `<game>.games` for the game's
  own fact (wordle's `max_guesses` and `legal_band` today; codenamesduet's
  `turns`, psychicnum's `max_guesses`, the bee pair's `target_rank`,
  boggle's ladder and dice set, setgame's palette to come), on
  `common.timers` for the shared one (below). The six club lines that read
  `setup` today get the value through `clubpage_info`. Restated 2026-09-27
  from the two bullets this replaces, which said the same for SQL alone.
- **`common.timers` gains `kind` and `seconds`** (`seconds` null unless a
  countdown), copied from `setup.timer` at create, which `require_valid_timer`
  keeps checking. Every game has the row already. The kind is a game fact:
  it decides whether the clients tick at all, what the clock shows, and
  whether a countdown can end the game; the length only the front end reads,
  since no game verifies a timeout against it.
- **The name is `clubpage_info`.**
- **A move that changes the game's status writes `common.games`**
  (`clubpage_info`, and `last_active_at` rides along through its trigger); a
  move that doesn't, doesn't. Opening or leaving a game writes
  `is_current_view`, so "last active" still moves for a game whose moves
  change nothing the club sees (bananagrams' board edits, crosswords' cells).
  Whether crosswords should update its club line now and then is its own
  todo.
- **`current_turn_user_id` stays on `common.games`.** A shared fact that not
  every game uses is still one meaning in one place.
- **`common.games.paused` is deleted.** Nothing sets it; pause works without
  it.
- **`common.game_players.conceded` and `conceded_at` are both deleted.** A
  concession is `player_ended_reason = 'conceded'` at `player_ended_at`, like
  every other way a player's play ends. It is always recorded, even when it
  is the concession that ends the game.
- **The game's reason is the act that ended the game**, never a result: a
  `conceded` game may have a winner. In a game that plays out, it is the
  last player's act ([cross-game-consistency §3b, step 7's question
  4](cross-game-consistency.md#3b-how-it-ended-for-me--won-lost-conceded-no-result-solved-not-started)).
- **`<game>.games.club_handle` is dropped.** It was copied so a security
  rule could check membership without a join; the rules join `common.games`
  instead, a primary-key lookup inside the same check (survey → `club_handle`
  on the game tables). The no-op pokes that write it to wake the game page
  poke any other column instead.
- **`common.games.mode` stays, and the `_compete` suffix is a name, not a
  rule.** The column is the convenient home in SQL; the manifest is where the
  front end knows a gametype's mode. Nothing may read the suffix to learn the
  mode: `common.concede` does today and reads the column after stage 2, and
  docs/states.md's "load-bearing suffix" paragraph goes with it.
- **`clubpage_info` holds `winner_user_id`, never `winner_username`.**
  Usernames don't change and the club page has every member's name from
  `get_club_page`, so the copy has no reason to exist. The same rule as no
  username on a leaderboard entry.
- **A player's `outcome` and `final_ranking` are written together at the
  game's end**, null before it; until then the strip reads
  `player_ended_reason` ("Conceded at 12").
- **setgame coop's `cleared` is `reached_goal`**: clearing the deck is its
  coop goal, and the code stores it as a win. Compete's is
  `resource_exhausted`.
- **scrabble's bots win when every human concedes.** A rule, not a bug: the
  winner is picked among seats that have not conceded, and a bot never does.
  The reason row is `conceded` with a winner, which the reason design allows.
  scrabble's card says so when its area opens.

## Bugs the survey found

Each is fixed by the stage that rewrites the code around it.

- crosswords' and stackdown's compete wins write no `reason` (prod holds
  none).
- letterboxed writes its winner as `winner_id` (every other game:
  `winner_user_id`), writes no `reason` of its own (only `common.concede`'s
  `conceded` reaches it), and its compete timeout ends `won_compete` naming no
  winner — while marking every non-conceded player tied at the best coverage
  `won`, zero letters included (it lacks the no-leader guard boggle and
  wordiply have).
- waffle and wordle compete write `solved: false` at create and never update
  it.
- connections' and psychicnum's Restart assign a `status` without the coop
  counts, so they are missing until the first move.
- wordiply coop writes `result = {finished: true}`, with no `won`; boggle coop
  writes no `result` on any ending.

## The path

Decided 2026-09-27. This plan builds cross-game-consistency's step 7 — its
old stages 7a, 7b and 7d changed the very columns this plan reshapes — and the
rest of that plan falls before or after it.

**Deploying: once per stage** (Joel, 2026-09-27; it was once at the end).
Each stage is a migration plus the code that reads its columns, complete in
itself, so nothing needs to read both shapes and there are no shims; the
front end and the database ship together. "Together" is `gmake deploy`'s
order — the migrations, then `supabase/sql/`, then the edge functions, then
the front end — so for the minutes between the first step and the last, a
tab left open runs the old front end against the new columns (its club-page
select names `play_state` and gets a 400) until `reloadOnStaleBuild` reloads
it once the front end lands. That is every deploy's window; it needs a quiet
hour, not a shim. Before each stage's deploy:

- **The backfills handle every case, not today's rows.** Prod today holds one
  compete game and no concession; friends keep playing while the work goes
  on.
- **Re-read prod** (the survey's Prod queries) and check the maps still cover
  every stored value.
- **Rehearse** the migrations against prod's data (`gmake db-rehearse`), so
  a migration cannot fail partway through the real deploy.

**The order:**

1. **cross-game-consistency first, where it shrinks this plan's surface:**
   - §3a step 6 is done (2026-09-25; verified 2026-09-27: no game defines
     its own `readOnly`, `cellsClickable`, `isLocallyDone`, `canPlay` or
     `myConceded` any more). Every game reads the page's values, so changing
     what those values are built from touches `whereIStand` and
     `useCommonGame`, not sixteen PlayAreas.
   - §3b's 7c, the Stop names (done 2026-09-27), and §4's cheap renames
     (built 2026-09-27; N8 is its own item, next). Neither touches stored
     data.
2. **This plan, in three stages and a per-game debt** — each commit leaves
   the tests green, and each stage deploys when it is done:
   1. **The players.** `common.game_players` gains `player_ended_at`, the
      player's reason pair, `outcome`, `final_ranking` and `solved`, and
      loses `result`, `conceded`, `conceded_at` and `locally_terminal`.
      `EndOutcome` gains `near`, and every two-way check is audited
      (cross-game-consistency §3b → the `near` item). `isLocallyTerminal` →
      `isPlayerEnded`, and every other "terminal" about a player, everywhere
      (§3b question 1).
   2. **The game's lifecycle.** `common.games` gains the reason pair,
      `game_ended_outcome` and `mode`, and loses `play_state`,
      `is_terminal` and `paused`. `common.end_game` takes the reason pair as
      required parameters (§3b question 3); the Stop writes `stopped`, not
      `manual`; codenamesduet works out sudden death. `isTerminal` →
      `isGameEnded`, `TerminalOutcome` → `EndOutcome`, and every other
      "terminal". Also in this stage (found 2026-09-27): the thirteen
      child-table SELECT policies that join `common.games` for
      `is_terminal` read `ended_at is not null`; `strands.club_game_status`
      (unread) is dropped; `src/guards/gameStatusLabels.test.ts`, which
      sweeps `status.reason` against the reachable `play_state`s, is
      rewritten for the reason pair and `game_ended_outcome`; docs/states.md's
      play-state half is rewritten (it describes `play_state`, `is_terminal`,
      `paused` and `status`).
   3. **`status` → `clubpage_info` and `leaderboard`**, one game per commit.
      The club line reads `clubpage_info`, the strip reads `leaderboard`
      (`readLeaderboard.ts` reads the column instead of the key), and the
      game stops reading `status`: its verdict reads the first two stages'
      columns, its live counts its own tables. After stages 1 and 2, because
      the verdict needs their columns.
   4. **`<game>.games` — owed per game, not a stage** (Joel, 2026-09-27):
      done one game at a time as app-audit opens its area, since it fixes no
      bug and rewrites the most code per game. Drop `mode` and
      `club_handle`, rewriting the security rules to join `common.games`;
      the pokes write another column; typed columns for every `setup` fact
      the game's logic reads after create, in SQL (survey → Each game's
      `<game>.games`) or in the front end (Decided → `setup`), and
      `common.timers`' `kind` and `seconds` for the timer.
      What else reads the two columns, per game (found 2026-09-27): the
      `games_state` view and the front end's `useGame` select, which name
      both; the child-table policies, eleven of which read `mode` off the
      game row; letterboxed's three definer helpers; the three build-board
      edge functions that filter the game table on `club_handle`;
      `crosswords.library_for_club` with its two `(club_handle, …)` indexes,
      which need a replacement that joins `common.games` (an index on
      `common.games (club_handle, gametype)` if none serves).
3. **cross-game-consistency §5 after**, the docs placement: many of its
   items describe `status`, the pokes and the manual-end reasoning, which
   this plan rewrites.
4. **game-cards steps 8–9 and this plan's stage 4 stay with app-audit**, one
   game as its area opens.
   game-cards step 7 (the vocabulary in common and shared code) is 7c and
   this plan's stages; it has no work of its own.

**What every stage carries** (added 2026-09-27, from an inventory of the
readers): the generated types (`npm run types:gen`, which strips the file's
stamp — put it back); the pgTAP that reads the columns (`play_state` is
named in about 109 test files, `is_terminal` in 66, `result` in 46,
`conceded` in 39, `locally_terminal` in 9, `games.mode` in 13); the e2e that
read them (`concede`, `terminal-reveal`, `realtime-deaf-window`,
`bananagrams`, `strands`, `psychicnum-terminal`, `e2e/helpers/fixtures.ts`, the
gallery's `verdict` / `index` / `types` / `run` and three game files); and
the reference docs that describe the columns — docs/states.md,
docs/common-schema.md (The game row, Ending a game, Concede, Not playing
any more), docs/game-status-labels.md, docs/naming.md, docs/testing.md,
docs/cheatsheet.md, `src/common/pause-suspend/doc.md`, each game's doc where
it lists its play states and status keys. Stage 3 is one game per commit,
so its first commit adds `clubpage_info` and widens `CommonGameListRow` to
carry both, and its last drops `status`.

**The reason map** (stage 2's backfill): today's stored `reason` to the
category; the detail is today's value (`stopped` for `manual`). The category
depends on the game where one word means two things (`cleared`,
`complete`).

| today's `reason` | games | category |
|---|---|---|
| `manual` | every game | `stopped` |
| `timeout` | every game with a timer | `timeout` |
| `conceded` | `common.concede`, and the ending check of every game that runs its own (connections, psychicnum, scrabble, strands, waffle, wordle) | `conceded` |
| `target` | spellingbee, wordwheel, boggle | `reached_goal` |
| `solved` | codenamesduet, connections, crosswords, psychicnum; wordle, waffle and strands coop | `reached_goal` |
| `solved` | wordle, waffle and strands compete (`ends-when-all-done`) | `reached_goal` — today the word is written whenever anyone solved, whatever act came last (strands writes it at a timeout too), so the stored value cannot say the last player's act; only the new code does (§3b question 4). Prod holds none |
| (none) | crosswords' and stackdown's compete wins (the bug below) | `reached_goal`, keyed on `play_state = 'won_compete'` |
| `cleared` | stackdown | `reached_goal` |
| `cleared` | setgame coop (the deck cleared is the goal; stored `won`) | `reached_goal` |
| `cleared` | setgame compete (the deck ran out) | `resource_exhausted` |
| `complete` | bananagrams (someone went out) | `reached_goal` |
| `complete` | wordiply (the guesses spent; today also written when a concession left every remaining player spent, which the new code writes as `conceded`) | `resource_exhausted` |
| `complete` | scrabble (a player went out with the bag empty) | `resource_exhausted` |
| `exhausted` | psychicnum, waffle, wordle | `resource_exhausted` |
| `mistakes` | connections | `resource_exhausted` |
| `turns` | codenamesduet (a miss in sudden death; the turns running out never ends the game) | `fatal_move` |
| `assassin` | codenamesduet | `fatal_move` |
| `blocked` | scrabble compete (every seat passed in a row) | `all_passed` |
| `unsolved` | strands, unreachable today | `resource_exhausted` |
| flags: `solved` / `timed_out` / `stopped` | letterboxed | `reached_goal` / `timeout` / `stopped` |

An ended row the map does not cover (a reason word not listed, or none and
no letterboxed flag) makes the migration raise, not guess: the rehearsal is
where such a row shows up.

**The other backfills:** `player_ended_at` from `conceded_at` (reason
`conceded`), else from `locally_terminal` (the game's `ended_at`, or the
migration's time for a game still running) — prod holds no such row today.
Before `is_terminal` goes, the prod count of rows where it disagrees with
`ended_at is not null` must still be 0.

**The players' backfill** (added 2026-09-27 — stage 1 drops `result`, and
its `won` is the only stored copy of how each of 2,233 player rows ended):
`outcome` and `final_ranking` from `result.won` and the game's `play_state`:
`won: true` → `won`, ranking 1; `won: false` in a `lost`, `lost_compete` or
`won_compete` game → `lost`; in an `ended` game → `neutral`, except a
conceder → `lost`, and except the two coop endings the game's backfill turns
into wins (Decided → `play_state`), whose players are `won`, ranked 1; no
`won` key (wordiply coop's `{finished: true}`, boggle coop's null, the 181
old bee rows) → the game's own outcome. `solved` from the game's per-player
`solved` column where it has one (letterboxed, stackdown, strands, waffle,
wordle; bananagrams' `progress.solved`), else from a coop `solved` /
`cleared` ending, else null.

## Review (2026-09-27)

A fresh read of this plan, its survey and cross-game-consistency §3b against
the code. Fixed in place above: the reason map (five games write `conceded`
from their own ending check; coop `solved` in wordle and strands; the
compete `solved` word in wordle, waffle and strands is written whenever
anyone solved, so a stored value cannot mean "the last player's act"; a row
for the reasonless compete wins; wordiply's `complete` from a concession; a
raise for any row the map does not cover), the path's stale step-6 item, the
readers each stage must carry, and the players' backfill. Verified and
holding: nothing sets `paused`; the `last_active_at` trigger fires on any
update of the row; `TerminalOutcome` is `won` / `lost` / `neutral`; no index
or filter reads `is_terminal`; codenamesduet's `turns` is only a sudden-death
miss; strands' `unsolved` is unreachable; the club page reads only
`common.games` and already has every member's name from `get_club_page`.

**The review's questions, answered** (Joel, 2026-09-27; each is now a line
in Decided above): `common.games.mode` stays and the `_compete` suffix is a
name, not a rule (1); `clubpage_info` holds `winner_user_id` only (2); the
backfill rewrites scrabble coop's and wordiply coop's `complete` as wins (3);
a player's `outcome` and `final_ranking` are written at the end, and no
constraint excludes `near` from `game_ended_outcome` (4); setgame coop's
`cleared` is `reached_goal` (6); `setup` is read only for the setup rows and for
replaying, everything else is a column, with the timer's `kind` and
`seconds` on `common.timers` (7); scrabble's bots win when every human
concedes (8). Item 9 was a finding, not a question; it is in the bugs.

**The three the reviewer raised, also decided** (Joel, 2026-09-27; each is
in the text above): the leaderboard is a `leaderboard` column on
`common.games` (The model); each stage deploys when it is done (The path →
Deploying); stage 4 is a per-game debt worked as app-audit opens each area
(The path → stage 4). Nothing in this plan is open.