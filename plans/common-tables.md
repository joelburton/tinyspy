# Common tables — where a game's facts live

**Status: decided (Joel, 2026-09-27); the path is below, and no stage has
started.** It grew out of
cross-game-consistency's old §3b (how it ended for me)
and built that plan's step 7. The facts it rests on — both common
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
- **The statuses** are what the game page shows of the game's progress —
  the info column's numbers, the opponent strip, the ending's words — and
  replace `status` (Joel, 2026-09-28; [Decided → The statuses](#the-statuses-2026-09-28)).
  The info column and the strip read the statuses and nothing else, and any
  other part of the page may read them too (Joel, 2026-09-29). Two
  columns, each a copy of the game's own tables, never the source:
  - **`common.games.game_status`**: the table-facts the page shows (cards
    left in the deck, tiles in the bag, the target rank).
  - **`common.game_players.player_status`**: that player's player-facts and
    team-facts the page shows (my score, my guesses, the hints we used), and
    any common column the page shows about them, such as `final_ranking`.
  - They hold data, not text: the RPC does the counting, the front end the
    wording.
  - Both are written by one builder per game, `<game>._write_statuses`
    (Joel, 2026-09-28), called at create, at Restart, and at the end of
    every move — so a live game never shows `{}`.
- **`common.games.clubpage_info`** is what the club page shows beyond
  `common.games`' columns: a small subset of the statuses' numbers, since the
  club page reads nothing else.
  - It is a copy, written by the same builder, and never read by the game.
  - It holds data, not text: each manifest's `summaryFor` still words the club
    line.
  - A stale copy shows at once on the club page.
- **`common.game_players`** holds the per-player facts every game has, as
  typed columns: joined, turn seat, when the player ended, outcome,
  `final_ranking`, `solved_at`, and the player's reason pair (a concession is
  one of its reasons), plus the `player_status` copy. `result` goes.
- **`<game>.games`** holds the game's own facts and nothing `common.games`
  already has — no `mode`, no `club_handle`. Its jsonb has one shape in every
  row (crosswords' puzzle, a grid), never a bag of keys.
- **`<game>.players` and the child tables** (events, found words, cells,
  guesses) keep their roles, and stay the truth the statuses are built from.
- **The club page reads only `common.games`**: one query and one Realtime
  subscription. Never a game's own tables, and never `common.game_players`.
- **The game page reloads off `common.games`.** A move writes `common.games`
  in the same transaction as the game's own tables, so the page's one
  `common.games` subscription tells it to reload them; a game keeps a
  subscription of its own only for writes that don't touch `common.games`
  (crosswords' cells).

## Why this model

Four were weighed (Joel, 2026-09-27):

- **Fold `<game>.games` into jsonb on `common.games`.** Workable, but every
  gametype fact becomes jsonb, which is harder to validate and to read.
- **`common.games` holds only what the club page needs.** Turn order and
  conceding are shared machinery — `common._advance_turn`, `common.concede`,
  the turn bell, `computePlayerStanding` — and it is shared because the facts sit in one
  table with one shape. Split across sixteen tables, that code is copied per
  game or names its table at run time.
- **The club page also reads `common.game_players`.** A second subscription
  for every club page, and the summary worked out far from the RPC that
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
- **Sudden death** is worked out in codenamesduet (`turn_number` past
  `max_turns` while the game hasn't ended), not stored as a state.
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
  the game's own tables, with a copy in `clubpage_info` where the summary
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
  `common.timers` for the shared one (below). The six summaries that read
  `setup` today get the value through `clubpage_info`. Restated 2026-09-27
  from the two bullets this replaces, which said the same for SQL alone.
- **`common.timers` gains `kind` and `seconds`** (`seconds` null unless a
  countdown), copied from `setup.timer` at create, which `_require_valid_timer`
  keeps checking. Every game has the row already. The kind is a game fact:
  it decides whether the clients tick at all, what the clock shows, and
  whether a countdown can end the game; the length only the front end reads,
  since no game verifies a timeout against it.
- **The name is `clubpage_info`.**
- **Every move RPC ends by calling the game's status builder** (Joel,
  2026-09-28; this replaces "a move that changes the status writes
  `common.games`, a move that doesn't, doesn't"). The builder assigns both
  statuses and `clubpage_info` whether or not they changed, so every move
  writes `common.games` (and `status_changed_at`, [Decided → Step
  3](#step-3-2026-09-28)) and `common.game_players`, and the page's subscriptions fire for every
  move — psychicnum's hint, which only adds an events row the partner's log
  shows, reaches the partner this way. No RPC judges whether a status
  changed. The exceptions are crosswords' `set_cell` and `set_mark`, which
  have a path of their own (the cells subscription), and bananagrams' board
  save, which calls the builder only when it changes the player's count of
  tiles not in their board's largest block — the strip's number — since
  most saves only rearrange a board (Joel, 2026-09-28; docs/games/bananagrams.md
  → The statuses). A game may later drop the call from a move that changes
  nothing another player's page shows — one game at a time, checked
  carefully then. crosswords' two writes don't call the builder, so they
  don't move the club card's date; whether crosswords should update its club
  line now and then is its own todo.
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
  last player's act (docs/win-lose.md → `resource-exhausted`).
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
  username in a `player_status`.
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

### The statuses (2026-09-28)

Joel, after weighing how much of the info column and the opponent strip
`status` could already supply. This replaces the `leaderboard` column, which
was the compete players' numbers and is now a subset of their
`player_status`.

- **What was wrong with `status` was how it was written**, not the idea: it
  merged (so stale keys outlived their writer), each game named its keys its
  own way, and some keys were written in one mode only or never updated. The
  rules below remove each cause.
- **Three kinds of fact**, and where each is stored and copied:
  - **table-fact** — the same for the whole table in either mode, and no
    player's: setgame's deck, scrabble's bag, the target rank. Stored on a
    games row (`common.games` or `<game>.games`); copied, if the page shows
    it, into `game_status`.
  - **player-fact** — one player's: a compete score, the categories Moth
    found in coop connections, the hints we used in strands. Stored on that
    player's row; copied, if the page shows it, into their `player_status`.
  - **team-fact** — the same for the whole team, by definition, in coop: the
    waffle board, strands' hint bar. It is a player-fact in compete, so for
    consistency it is treated as one in coop: stored on the player rows,
    never a games row, and copied into `player_status`. A table-wide number
    is derived from the player rows (a sum or the like) wherever that is
    sensible.
- **Whether a team-fact is the same value on every player's row or each
  player's own share** (summed, Joel leans strongly) is cross-game-consistency
  §1's question, after this plan ships; until then each game stores it as it
  does today, and its statuses copy that. scrabble's `coop_rack` and
  `coop_score`, team-facts on the games row, move to the player rows in the
  same work.
- **The info column and the strip read only the statuses.** A fact the page
  shows is in a status even where it is also a column — `final_ranking` in
  `player_status` if the page shows it. The statuses are never the canonical
  home of anything; any of their values can go stale, which is what the
  builder is for.
- **Any part of the game page may read the statuses** (Joel, 2026-09-29),
  not only the info column and the strip: the pill, the board and `gd` read
  a status where the fact is in one, rather than reading the game's tables
  for it a second time. A key goes into a status because the page shows it,
  never only to spare a read; the builder still writes every key from the
  game's own tables. wordle's `solved_on_winners_count` is the first key
  added on these terms.
- **A status has one shape per game, and every key is always present**, null
  when it has no value (as `common._ok_envelope` keeps its keys): a ranking
  not decided until the end is a `null` key until then, never an absent one.
  So the TypeScript type has no optional keys, and the test checks the exact
  key set at the start, mid-game and at the end.
- **Past games get their statuses from the builders, not the migration.**
  The migration leaves `game_status`, `player_status` and `clubpage_info`
  `{}`; once `supabase/sql/` has landed, every game's builder runs over every
  game, building the old games from their own tables exactly as the new
  ones (a migration cannot call a `supabase/sql/` function). The summaries
  are empty only between the two, inside the maintenance window. Every
  `status` and `result` key is a copy of a game's own tables or worked out
  from them (common-tables-survey.md), except the three the migration
  already moves into columns — the ending's reason, who won, letterboxed's
  flags; a builder in step 4 that needs anything else shows it, and the
  migration, editable until the deploy, extracts it before `status` goes.
- **One builder per game writes both statuses and `clubpage_info`.** It is a
  function of its own, never inlined in a move RPC, even where one RPC is its
  only caller: the RPCs stay short, every game has the same shape, and it
  can be called by hand — after a repair in psql (deleting a mis-clicked move
  and fixing the counts it changed), one call rebuilds every copy. So it
  takes the game id and `p_update_status_changed_at` ([Decided → Step
  3](#step-3-2026-09-28)), reads only the game's tables, and **assigns the
  whole object, never merges**.
- **A TypeScript type per game** gives each status its shape on the front
  end (generated types say only `Json`), and **a pgTAP test per game** runs
  the builder and checks its keys against the type — which catches a key
  still written after it was dropped.
- **The game page reloads off `common.games`** ([The model](#the-model)):
  `useCommonGame`'s subscription, with its reconnect and deaf-window
  handling, triggers each game's reload, and the game's own subscriptions
  and the no-op pokes go. crosswords keeps its cells subscription;
  bananagrams' board is the page's own and is only saved back, so it needs
  none.
- **Hiding a player's numbers is possible later, without undoing this.** For
  now `player_status` is visible to the club, which hides no more than
  today's mix. If it ever matters, a table of private status is added, its
  rule "your own row, or anyone's once the game has ended"; a column grant
  can't do it (it is per role, not per row).
- **The names are `game_status` and `player_status`.** When this lands,
  docs/game-summary.md stops calling the club card's second line the
  game's status.

### Step 3 (2026-09-28)

Joel, while writing common SQL.

- **Parameters are `p_` plus the column name**
  ([docs/code-conventions.md → RPC
  functions](../docs/code-conventions.md#rpc-functions)); every function
  this plan rewrites is renamed as it is rewritten, the rest when next
  touched.
- **`last_active_at` becomes `status_changed_at`**: when the game's status
  last changed. "Active" read like the club's active game, and opening a
  game never meant it changed. Its trigger goes. The builder is its only
  writer: it takes `p_update_status_changed_at`, a required boolean with no
  default, true from create, Restart and every move, false from the
  post-deploy pass over every game and from a repair by hand, so neither
  direction can be forgotten. Opening a game, leaving it and the
  current-view pointer's moves no longer re-date anything (opening game B
  used to re-date the game it displaced). The club list sorts and dates by
  it until Joel says otherwise.
- **`common.games.updated_at` is new**, stamped by a trigger on every update
  of the row and written by nothing else — the audit column, which a data
  pass can trust. Backfilled from `last_active_at`.
- **`last_opened_at` is not in this plan**: a todo in
  src/common/club/todo.md.
- **Each game keeps its own `concede` and `stop_game`, and the shared part
  moves into two helpers.** The game's RPC locks its own game row (the row
  its moves lock, which `common` can't name), calls the helper, adds any
  step of its own, calls its builder, and answers:
  - **`common._concede(p_game_id)`** replaces `common.concede` and
    `common._set_conceded`: the guards, the concession written, and — once
    every player has conceded — `_end_game` as a `conceded` collective loss.
    A game where a player can end some other way runs its own end check
    after it, skipping a game `_concede` already ended. It is not granted to
    `authenticated`: the front end always calls the game's `concede`, and a
    direct call would end a game without its builder.
  - **`common._stop(p_game_id)`**: the player check, the ended check, and
    `end_game(…, 'stopped', 'stopped', caller, false, '{}')`.
  - The lock is needed where a game's own end check reads its own rows as
    well as `common.game_players` — the six that call `_set_conceded` today,
    which take it already (`src/guards/concedeLock.test.ts`). In the other
    nine a concession ends the game only once everyone has conceded, the
    mover included, so there is nothing to race; they take it so every
    `concede` has one shape.
- **`_end_game` takes the rankings as jsonb keyed by user id**
  (common-tables-schema.md → What `common._end_game` takes and does).

### Step 5 (2026-09-28)

Joel, as psychicnum's front end converted first.

- **`summaryFor(row, members)`**: the club page hands each label the club's
  members, and a label names a user id (`clubpage_info.winner_user_id`,
  `gameEnding.endedByUserId`) with `memberById`.
- **The game's ending is `gameEnding`** on the page's `CommonGame` (`cg`) and
  the club list's row (`CommonGameListRow`), never a bare `ending`: a
  name with both a game and a player sense (ending, status, reason, outcome)
  says which it is.
- **A game reads nothing of its own**: its `useGame` is a pure function of the
  `game_data` the page re-reads on its room's `changed` nudge
  (src/common/realtime/doc.md), and keeps no subscription.
- **The game page reads the mode off the row**: `cg.mode` is
  `common.games.mode`, not the manifest's. This narrows "the manifest is where
  the front end knows a gametype's mode" (Decided above) to the club page.

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

**Replanned (Joel, 2026-09-27, later): schema first, one deploy.** The
staged order below made each stage work against a half-changed schema, so
`_end_game` and its callers changed a little per stage — hard to picture.
Nothing has to keep working in development or prod until the end (prod's
data must survive; a maintenance notice covers the window), so the work is
now ordered by layer, and the stages below are its content, not its order:

1. **The target schema, written down** —
   [common-tables-schema.md](common-tables-schema.md): every table as it ends
   up, `<game>.games` included (its typed columns for what the logic reads
   from `setup`, and the columns the game cards add), each column marked
   new / changed / kept / dropped.
2. **One migration** for all of it, with the backfills; applied locally.
3. **Common SQL** on the new schema: `_end_game` once, in its final form;
   `concede`, `_reset_game`, the timers, the policies and views. Done
   (2026-09-28): `_create_game`, `_end_game`, `_reset_game`,
   `_set_player_ended`, `_advance_turn`, `_concede` and `_stop` ([Decided →
   Step 3](#step-3-2026-09-28)); `update_state`, `concede` and
   `_set_conceded` dropped; the `updated_at` trigger in place of
   `last_active_at`'s, and the migration's rename to `status_changed_at`;
   docs/common-schema.md.
4. **Each game's SQL**, one game at a time — its ending, its status
   builder (both statuses and `clubpage_info`, and the pgTAP test of its
   keys), and its full `final_ranking`s (so rankings below first come here,
   not in a later stage). Done (2026-09-28): all sixteen games; the
   `concedeLock` and `endingTouchesGame` guards accept only the new shape;
   docs/states.md, docs/win-lose.md and the other reference docs that named
   the dropped columns. Left for step 5, because it describes front-end
   code: docs/game-summary.md's guard.
5. **The front end:** types, the common pieces (the reload off
   `common.games`), then each game — its status types, its info column and
   strip reading the statuses, and its hook dropping its own subscriptions.
   Also the three build-board edge functions (spellingbee, wordwheel,
   wordiply): their last-board lookup filters the game table on
   `club_handle` and orders by `created_at`, both dropped, so it finds the
   club's last game through `common.games` instead. Every call to an RPC
   that step 4 gave `p_` parameters passes the new keys — the front end's
   and the edge functions' alike (each build-board function calls its
   game's `create_game` by name, through `_shared/startGame.ts`).
6. Tests and docs move with each step.
7. Rehearse against prod's data, re-read prod, the maintenance notice,
   **one deploy**, and, once its `supabase/sql/` step has landed, every
   game's status builder over every game. Then cross-game-consistency §1's
   team state, then §5.

The deploy below is that one deploy. "Together" is `gmake deploy`'s
order — the migrations, then `supabase/sql/`, then the edge functions, then
the front end — so for the minutes between the first step and the last, a
tab left open runs the old front end against the new columns (its club-page
select names `play_state` and gets a 400) until `reloadOnStaleBuild` reloads
it once the front end lands. Before it:

- **The backfills handle every case, not today's rows.** Prod today holds one
  compete game and no concession; friends keep playing while the work goes
  on.
- **Re-read prod** (the survey's Prod queries) and check the maps still cover
  every stored value.
- **Rehearse** the migrations against prod's data (`gmake db-rehearse`), so
  a migration cannot fail partway through the real deploy. The rehearsal
  restores the dump's functions, views, policies and triggers before the
  migrations run, since a `drop column` fails while a policy or view still
  names the column (found 2026-09-28: the rehearsal had run over a database
  with none of them).
- **The pre-flight queries** (Joel, 2026-09-28). Two rows the migration
  raises on rather than maps can appear in a game played after the last
  rehearsal: a crosswords or stackdown compete win with no `reason`, and a
  player `locally_terminal` without conceding. After the maintenance notice
  and before `db push`, both must return 0 on prod:

  ```sql
  select count(*) from common.games
   where ended_at is not null and status ->> 'reason' is null
     and gametype not like 'letterboxed%';
  select count(*) from common.game_players
   where locally_terminal and not conceded;
  ```

**The order:**

1. **cross-game-consistency first, where it shrinks this plan's surface:**
   - §3a step 6 is done (2026-09-25; verified 2026-09-27: no game defines
     its own `readOnly`, `cellsClickable`, `isLocallyDone`, `canPlay` or
     `myConceded` any more). Every game reads the page's values, so changing
     what those values are built from touches `computePlayerStanding` and
     `useCommonGame`, not sixteen PlayAreas.
   - §3b's 7c, the Stop names (done 2026-09-27), and §4's cheap renames
     (built 2026-09-27, N8 included). Neither touches stored data. Next:
     stage 1.
2. **This plan, in three stages and a per-game debt** — each commit leaves
   the tests green, and each stage deploys when it is done:
   1. **The players.** `common.game_players` gains `player_ended_at`, the
      player's reason pair, `outcome`, `final_ranking` and `solved`, and
      loses `result`, `conceded`, `conceded_at` and `locally_terminal`.
      `EndOutcome` gains `near`, and every two-way check is audited
      (cross-game-consistency §3b → the `near` item). **Rankings below first
      wait for stage 3** (Joel, 2026-09-27): stage 1 writes what the games
      know today — the winners `final_ranking` 1 and `won`, everyone else no
      ranking and `lost` or `neutral` — and each game's ending brings the
      full ranking, so no game produces `near` until then. `isPlayerEnded`,
      and every other "player-ended", is plans/endings.md's rename (§3b
      question 1).
   2. **The game's lifecycle.** `common.games` gains the reason pair,
      `game_ended_outcome` and `mode`, and loses `play_state`,
      `is_terminal` and `paused`. `common._end_game` takes the reason pair as
      required parameters (§3b question 3); the Stop writes `stopped`, not
      `manual`; codenamesduet works out sudden death. `EndOutcome` is
      done; `isGameEnded` and every other "ended" is plans/endings.md's
      rename. Also in this stage (found 2026-09-27): the thirteen
      child-table SELECT policies that join `common.games` for
      `is_terminal` read `ended_at is not null`; `strands.club_game_status`
      (unread) is dropped; `src/guards/gameSummaries.test.ts`, which
      sweeps `status.reason` against the reachable `play_state`s, is
      rewritten for the reason pair and `game_ended_outcome`; docs/states.md's
      play-state half is rewritten (it describes `play_state`, `is_terminal`,
      `paused` and `status`).
   3. **`status` → the statuses and `clubpage_info`**, one game per commit.
      The summary reads `clubpage_info`, the info column and the strip
      read `game_status` and `player_status` (`readLeaderboard.ts` goes), and
      the verdict reads the first two stages' columns. After stages 1 and 2, because
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
read them (`concede`, `ending-reveal`, `realtime-deaf-window`,
`bananagrams`, `strands`, `psychicnum-ending`, `e2e/helpers/fixtures.ts`, the
gallery's `verdict` / `index` / `types` / `run` and three game files); and
the reference docs that describe the columns — docs/states.md,
docs/common-schema.md (The game row, Ending a game, Concede, Not playing
any more), docs/game-summary.md, docs/naming.md, docs/testing.md,
docs/cheatsheet.md, `src/common/pause-suspend/doc.md`, each game's doc where
it lists its play states and status keys. Stage 3 is one game per commit,
so its first commit adds `clubpage_info` and widens `CommonGameListRow` to
carry both, and its last drops `status`.

**The reason map** (stage 2's backfill): today's stored `reason` to the
category; the detail is today's value (`stopped` for `manual`, `neutral` for
codenamesduet's `turns`). The category
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
| (none) | crosswords' and stackdown's compete wins (the bug below) | not mapped: prod holds none and no compete game is expected before the deploy, so one makes the migration raise (Joel, 2026-09-28) |
| `cleared` | stackdown | `reached_goal` |
| `cleared` | setgame coop (the deck cleared is the goal; stored `won`) | `reached_goal` |
| `cleared` | setgame compete (the deck ran out) | `resource_exhausted` |
| `complete` | bananagrams (someone went out) | `reached_goal` |
| `complete` | wordiply (the guesses spent; today also written when a concession left every remaining player spent, which the new code writes as `conceded`) | `resource_exhausted` |
| `complete` | scrabble (a player went out with the bag empty) | `resource_exhausted` |
| `exhausted` | psychicnum, waffle, wordle | `resource_exhausted` |
| `mistakes` | connections | `resource_exhausted` |
| `turns` | codenamesduet (a miss in sudden death; the turns running out never ends the game) | `fatal_move`, and the detail is rewritten `neutral` (Joel, 2026-09-28: `turns` misleads — the act is guessing a neutral in sudden death); codenamesduet writes `neutral` from then on |
| `assassin` | codenamesduet | `fatal_move` |
| `blocked` | scrabble compete (every seat passed in a row) | `all_passed` |
| `unsolved` | strands, unreachable today | `resource_exhausted` |
| flags: `solved` / `timed_out` / `stopped` | letterboxed | `reached_goal` / `timeout` / `stopped` |

An ended row the map does not cover (a reason word not listed, or none and
no letterboxed flag) makes the migration raise, not guess: the rehearsal is
where such a row shows up.

**The other backfills:** `player_ended_at` from `conceded_at` (reason
`conceded`). A player `locally_terminal` without conceding is compete-only,
prod holds none and no compete game is expected before the deploy, so one
makes the migration raise (Joel, 2026-09-28).
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
update of the row; no index
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
in the text above): the compete players' numbers get a home of their own,
now `player_status` (Decided → The statuses); each stage deploys when it is done (The path →
Deploying); stage 4 is a per-game debt worked as app-audit opens each area
(The path → stage 4). Nothing in this plan is open.