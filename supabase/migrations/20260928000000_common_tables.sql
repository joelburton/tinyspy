-- cs-unmet

-- ============================================================
-- common tables: every game's facts in their one home
-- ============================================================
-- The whole of plans/common-tables-schema.md in one migration: every table it
-- lists ends up as that page describes it, and every stored row is carried
-- across. The page is the spec; each section below names the table it
-- builds, and the backfills follow plans/common-tables.md → The reason map,
-- The other backfills and The players' backfill.
--
-- The order is load-bearing: every new column is added and backfilled while
-- the old columns it is read from still exist, and the old columns are
-- dropped last. An ended game or player the maps do not cover makes the
-- migration raise rather than guess (the rehearsal over prod's dump is where
-- such a row shows up).
--
-- It drops every view and security rule that names a column it drops or
-- renames; `supabase/sql/` recreates them over the new columns.


-- ─── last_active_at stays put ──────────────────────────────
-- `games_touch_last_active` stamps `last_active_at` on every update, and the
-- club page sorts and dates games by it; left on, every game would move to the
-- deploy's date. It is defined in `supabase/sql/`, so on a fresh `db reset` it
-- does not exist yet and the guard skips it. The column becomes
-- `status_changed_at` below, and the trigger is dropped at the end.
do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games disable trigger games_touch_last_active;
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════
-- Who solved, read before the games' own columns go
-- ═══════════════════════════════════════════════════════════
-- Each player's solve as the game recorded it; `common.game_players.solved_at`
-- is read from here.
create temp table solved_players as
  select game_id, user_id, solved_at from letterboxed.players where solved
  union all
  select game_id, user_id, solved_at from stackdown.players   where solved
  union all
  select game_id, user_id, solved_at from strands.players     where solved
  union all
  select game_id, user_id, solved_at from waffle.players      where solved
  union all
  select game_id, user_id, solved_at from wordle.players      where solved
  union all
  select game_id, user_id, finished_at from bananagrams.progress where solved;


-- ═══════════════════════════════════════════════════════════
-- common.games
-- ═══════════════════════════════════════════════════════════
alter table common.games
  add column mode                     text,
  add column game_ended_reason        text,
  add column game_ended_reason_detail text,
  add column game_ended_outcome       text,
  add column game_ended_by_user_id    uuid
    references common.profiles (user_id) on delete set null,
  add column game_status              jsonb not null default '{}'::jsonb,
  add column clubpage_info            jsonb not null default '{}'::jsonb;

-- `game_status` and `clubpage_info` (and `player_status` below) are `{}` on
-- every past game. Each game's status builder, in `supabase/sql/`, fills them
-- from the game's own tables once that half has landed (plans/common-tables.md
-- → Decided → The statuses).

alter table common.games rename column restarts to restart_count;

-- ─── status_changed_at and updated_at ──────────────────────
-- `last_active_at` keeps its values under the name of the one thing that now
-- moves it, the game's status builder (plans/common-tables.md → Decided →
-- Step 3). `updated_at` is stamped by a trigger in `supabase/sql/` on every
-- update; past rows have no truer value than the old stamp.
alter table common.games rename column last_active_at to status_changed_at;
alter index common.common_games_club_handle_last_active_idx
  rename to common_games_club_handle_status_changed_idx;

alter table common.games add column updated_at timestamptz;
update common.games set updated_at = status_changed_at;
alter table common.games
  alter column updated_at set not null,
  alter column updated_at set default now();

-- ─── mode: from each game's own table ──────────────────────
-- Fourteen games store it; bananagrams is a race and codenamesduet a team, and
-- neither has the column.
update common.games g
   set mode = m.mode
  from (
    select id, mode from boggle.games
    union all select id, mode from connections.games
    union all select id, mode from crosswords.games
    union all select id, mode from letterboxed.games
    union all select id, mode from psychicnum.games
    union all select id, mode from scrabble.games
    union all select id, mode from setgame.games
    union all select id, mode from spellingbee.games
    union all select id, mode from stackdown.games
    union all select id, mode from strands.games
    union all select id, mode from waffle.games
    union all select id, mode from wordiply.games
    union all select id, mode from wordle.games
    union all select id, mode from wordwheel.games
    union all select id, 'compete' from bananagrams.games
    union all select id, 'coop' from codenamesduet.games
  ) m
 where m.id = g.id;

-- The suffix is a name, not a rule (plans/common-tables.md → Decided), but a
-- stored mode that disagrees with it is a row to look at, not to carry.
do $$
declare
  disagreeing int;
begin
  select count(*) into disagreeing
    from common.games
   where gametype like '%\_coop' and mode <> 'coop'
      or gametype like '%\_compete' and mode <> 'compete';
  if disagreeing > 0 then
    raise exception 'common tables: % games whose mode disagrees with the gametype suffix', disagreeing;
  end if;
end $$;

-- ─── is_terminal must still agree with ended_at ────────────
-- `ended_at is not null` replaces it, and every backfill below reads
-- `ended_at`; a row where the two disagree would be carried across as the
-- wrong kind of game (plans/common-tables.md → The other backfills).
do $$
declare
  disagreeing int;
begin
  select count(*) into disagreeing
    from common.games
   where is_terminal <> (ended_at is not null);
  if disagreeing > 0 then
    raise exception 'common tables: % games where is_terminal disagrees with ended_at', disagreeing;
  end if;
end $$;

-- ─── The reason pair and the outcome ───────────────────────
-- `word` is today's stored reason; letterboxed stored none and kept flags
-- instead. crosswords' and stackdown's compete wins also stored none
-- (plans/common-tables.md → Bugs the survey found); no compete game is
-- expected before this ships (Joel, 2026-09-28), so one makes the migration
-- raise, to be decided at the rehearsal.
create temp table game_endings as
with stored as (
  select id, gametype, mode, play_state,
         coalesce(
           status ->> 'reason',
           case
             when gametype like 'letterboxed%' then
               case
                 when (status ->> 'solved')::boolean    then 'solved'
                 when (status ->> 'timed_out')::boolean then 'timeout'
                 when (status ->> 'stopped')::boolean   then 'manual'
               end
           end
         ) as word
    from common.games
   where ended_at is not null
)
select id,
       case
         when word = 'manual'    then 'stopped'
         when word = 'timeout'   then 'timeout'
         when word = 'conceded'  then 'conceded'
         when word = 'target'    then 'reached_goal'
         when word = 'solved'    then 'reached_goal'
         when word = 'cleared'   then case mode when 'coop' then 'reached_goal'
                                                else 'resource_exhausted' end
         when word = 'complete'  then case when gametype = 'bananagrams' then 'reached_goal'
                                           else 'resource_exhausted' end
         when word = 'exhausted' then 'resource_exhausted'
         when word = 'mistakes'  then 'resource_exhausted'
         when word = 'unsolved'  then 'resource_exhausted'
         when word = 'turns'     then 'fatal_move'
         when word = 'assassin'  then 'fatal_move'
         when word = 'blocked'   then 'all_passed'
       end as reason,
       case word
         when 'manual' then 'stopped'
         when 'turns'  then 'neutral'
         else word
       end as detail,
       case
         when play_state in ('won', 'won_compete')   then 'won'
         when play_state in ('lost', 'lost_compete') then 'lost'
         -- scrabble coop's and wordiply coop's `complete` are wins (Joel,
         -- 2026-09-27: plans/common-tables.md → Decided).
         when play_state = 'ended' and word = 'complete'
              and gametype in ('scrabble_coop', 'wordiply_coop') then 'won'
         when play_state = 'ended'                   then 'neutral'
       end as outcome
  from stored;

do $$
declare
  unmapped int;
begin
  select count(*) into unmapped
    from game_endings
   where reason is null or detail is null or outcome is null;
  if unmapped > 0 then
    raise exception 'common tables: % ended games the reason map does not cover', unmapped;
  end if;
end $$;

update common.games g
   set game_ended_reason        = e.reason,
       game_ended_reason_detail = e.detail,
       game_ended_outcome       = e.outcome
  from game_endings e
 where e.id = g.id;

-- `game_ended_by_user_id` stays null for every past game: none recorded who
-- ended it (plans/common-tables-schema.md → common.games).

alter table common.games
  alter column mode set not null,
  add constraint games_mode_check
    check (mode in ('coop', 'compete')),
  add constraint games_game_ended_reason_check
    check (game_ended_reason in ('reached_goal', 'resource_exhausted', 'all_passed',
                                 'fatal_move', 'conceded', 'timeout', 'stopped')),
  add constraint games_game_ended_outcome_check
    check (game_ended_outcome in ('won', 'lost', 'near', 'neutral')),
  -- The reason, its detail and the outcome are set together, exactly when the
  -- game has ended.
  add constraint games_game_ended_set_together check (
    (ended_at is null     and game_ended_reason is null     and game_ended_reason_detail is null     and game_ended_outcome is null)
    or
    (ended_at is not null and game_ended_reason is not null and game_ended_reason_detail is not null and game_ended_outcome is not null)
  ),
  add constraint games_game_ended_by_only_when_ended
    check (ended_at is not null or game_ended_by_user_id is null);


-- ═══════════════════════════════════════════════════════════
-- common.game_players
-- ═══════════════════════════════════════════════════════════
alter table common.game_players
  add column player_ended_at            timestamptz,
  add column player_ended_reason        text,
  add column player_ended_reason_detail text,
  add column final_ranking              integer,
  add column outcome                    text,
  add column solved_at                  timestamptz,
  add column player_status              jsonb not null default '{}'::jsonb;

-- ─── solved_at ─────────────────────────────────────────────
-- From the game's own record of the solve; else, in a coop game whose ending
-- was the solve (`solved` or `cleared`, never `target`), every teammate at the
-- game's end.
update common.game_players gp
   set solved_at = s.solved_at
  from solved_players s
 where s.game_id = gp.game_id
   and s.user_id = gp.user_id;

update common.game_players gp
   set solved_at = g.ended_at
  from common.games g
 where g.id = gp.game_id
   and gp.solved_at is null
   and g.mode = 'coop'
   and g.game_ended_reason_detail in ('solved', 'cleared');

-- ─── player_ended: a concession ────────────────────────────
-- Only a compete player stops while the game goes on, and no compete game is
-- expected before this ships (Joel, 2026-09-28). So a player done without
-- conceding (solved, or out of guesses, swaps or mistakes) is not mapped: one
-- makes the migration raise, to be decided at the rehearsal.
do $$
declare
  unmapped int;
begin
  select count(*) into unmapped
    from common.game_players
   where locally_terminal and not conceded;
  if unmapped > 0 then
    raise exception 'common tables: % players done without conceding, which the migration does not map', unmapped;
  end if;
end $$;

update common.game_players
   set player_ended_at            = conceded_at,
       player_ended_reason        = 'conceded',
       player_ended_reason_detail = 'conceded'
 where conceded;

-- ─── outcome and final_ranking, for every ended game ───────
-- A player recorded as having won a game that was not won is a row to look
-- at: the map below would rank them first in a game whose outcome says
-- nobody was.
do $$
declare
  disagreeing int;
begin
  select count(*) into disagreeing
    from common.game_players gp
    join common.games g on g.id = gp.game_id
   where (gp.result ->> 'won')::boolean
     and g.game_ended_outcome <> 'won';
  if disagreeing > 0 then
    raise exception 'common tables: % players marked won in a game that was not won', disagreeing;
  end if;
end $$;

-- From `result.won` and the game's ending. A player whose `result` has no
-- `won` (wordiply coop's `{finished: true}`, boggle coop's null, the old bee
-- rows) takes the game's own outcome — never a compete game's `won`, which
-- would crown every player.
create temp table player_outcomes as
select gp.game_id, gp.user_id,
       case
         when (gp.result ->> 'won')::boolean                              then 'won'
         when g.game_ended_outcome = 'won' and g.mode = 'coop'
              and not gp.conceded                                         then 'won'
         when gp.conceded                                                 then 'lost'
         when (gp.result ->> 'won')::boolean is false
              and g.play_state in ('lost', 'lost_compete', 'won_compete') then 'lost'
         when (gp.result ->> 'won')::boolean is false
              and g.play_state = 'ended'                                  then 'neutral'
         when not coalesce(gp.result ? 'won', false)
              and (g.mode = 'coop' or g.game_ended_outcome <> 'won')      then g.game_ended_outcome
       end as outcome
  from common.game_players gp
  join common.games g on g.id = gp.game_id
 where g.ended_at is not null;

do $$
declare
  unmapped int;
begin
  select count(*) into unmapped from player_outcomes where outcome is null;
  if unmapped > 0 then
    raise exception 'common tables: % players of ended games the outcome map does not cover', unmapped;
  end if;
end $$;

-- No past game ranked below first, so a winner is 1 and nobody else is ranked.
update common.game_players gp
   set outcome       = o.outcome,
       final_ranking = case when o.outcome = 'won' then 1 end
  from player_outcomes o
 where o.game_id = gp.game_id
   and o.user_id = gp.user_id;

alter table common.game_players
  add constraint game_players_player_ended_reason_check
    check (player_ended_reason in ('reached_goal', 'resource_exhausted', 'fatal_move',
                                   'conceded', 'timeout')),
  add constraint game_players_player_ended_set_together check (
    (player_ended_at is null     and player_ended_reason is null     and player_ended_reason_detail is null)
    or
    (player_ended_at is not null and player_ended_reason is not null and player_ended_reason_detail is not null)
  ),
  add constraint game_players_outcome_check
    check (outcome in ('won', 'lost', 'near', 'neutral')),
  -- Ranked first is `won`, ranked lower is `near`, and an unranked player
  -- is neither.
  add constraint game_players_final_ranking_matches_outcome check (
    (final_ranking is null and (outcome is null or outcome in ('lost', 'neutral')))
    or (final_ranking = 1 and outcome = 'won')
    or (final_ranking > 1 and outcome = 'near')
  );


-- ═══════════════════════════════════════════════════════════
-- common.timers
-- ═══════════════════════════════════════════════════════════
-- Copied from `setup.timer`, whose shape `common.require_valid_timer` checks.
alter table common.timers
  add column kind                       text,
  add column countdown_seconds_at_setup integer;

update common.timers t
   set kind                       = g.setup -> 'timer' ->> 'kind',
       countdown_seconds_at_setup = case when g.setup -> 'timer' ->> 'kind' = 'countdown'
                                         then (g.setup -> 'timer' ->> 'seconds')::int end
  from common.games g
 where g.id = t.game_id;

alter table common.timers
  alter column kind set not null,
  add constraint timers_kind_check
    check (kind in ('none', 'countup', 'countdown')),
  add constraint timers_countdown_seconds_at_setup_check
    check (countdown_seconds_at_setup between 1 and 3600),
  add constraint timers_countdown_seconds_only_for_countdown
    check ((kind = 'countdown') = (countdown_seconds_at_setup is not null));


-- ═══════════════════════════════════════════════════════════
-- Each game's own tables
-- ═══════════════════════════════════════════════════════════
-- Every `<game>.games` names its key `game_id` (decision 18) and loses
-- `created_at`, `club_handle` and `mode`; its security rules and views go
-- first, to be recreated by `supabase/sql/`. A typed column for each `setup`
-- value the game reads after create is copied from `setup` with the default
-- `create_game` uses.

-- ─── bananagrams ───────────────────────────────────────────
drop policy if exists games_select         on bananagrams.games;
drop policy if exists player_boards_select on bananagrams.player_boards;
drop policy if exists progress_select      on bananagrams.progress;

alter table bananagrams.games
  add column word_check  text,
  add column dict_2      integer,
  add column dict_3plus  integer,
  add column dump_to_bag boolean;

update bananagrams.games b
   set word_check  = coalesce(g.setup ->> 'word_check', 'off'),
       dict_2      = coalesce((g.setup ->> 'dict_2')::int, 4),
       dict_3plus  = coalesce((g.setup ->> 'dict_3plus')::int, 4),
       dump_to_bag = coalesce((g.setup ->> 'dump_to_bag')::boolean, false)
  from common.games g
 where g.id = b.id;

alter table bananagrams.games
  alter column word_check  set not null,
  alter column dict_2      set not null,
  alter column dict_3plus  set not null,
  alter column dump_to_bag set not null,
  add constraint games_word_check_check check (word_check in ('off', 'win', 'strict')),
  add constraint games_dict_2_check     check (dict_2 between 2 and 6),
  add constraint games_dict_3plus_check check (dict_3plus between 1 and 6);

alter table bananagrams.games rename column id         to game_id;
alter table bananagrams.games rename column bunch_seed to bunch_at_setup;
alter table bananagrams.games rename constraint games_id_fkey to games_game_id_fkey;
alter table bananagrams.games
  drop column created_at,
  drop column club_handle;

alter table bananagrams.progress
  drop column solved,
  drop column finished_at;

-- ─── boggle ────────────────────────────────────────────────
drop policy if exists games_select       on boggle.games;
drop policy if exists found_words_select on boggle.found_words;

alter table boggle.games add column required_band integer;

update boggle.games b
   set required_band = (g.setup ->> 'band')::int
  from common.games g
 where g.id = b.id;

alter table boggle.games
  alter column required_band set not null,
  add constraint games_required_band_check check (required_band between 1 and 6);

alter table boggle.games rename column id          to game_id;
alter table boggle.games rename column n           to board_side_size;
alter table boggle.games rename column win_percent to target_win_percent;
alter table boggle.games rename constraint games_id_fkey          to games_game_id_fkey;
alter table boggle.games rename constraint games_n_check           to games_board_side_size_check;
alter table boggle.games rename constraint games_win_percent_check to games_target_win_percent_check;
alter table boggle.games
  drop column created_at,
  drop column club_handle,
  drop column mode;

-- ─── codenamesduet ─────────────────────────────────────────
drop policy if exists games_select  on codenamesduet.games;
drop policy if exists events_select on codenamesduet.events;
drop policy if exists words_select  on codenamesduet.words;

alter table codenamesduet.games add column max_turns integer;

update codenamesduet.games c
   set max_turns = (g.setup ->> 'turns')::int
  from common.games g
 where g.id = c.id;

alter table codenamesduet.games
  alter column max_turns set not null,
  add constraint games_max_turns_check check (max_turns between 7 and 15);

alter table codenamesduet.games rename column id        to game_id;
alter table codenamesduet.games rename column user_a_id to player_a_user_id;
alter table codenamesduet.games rename column user_b_id to player_b_user_id;
alter table codenamesduet.games rename constraint games_id_fkey        to games_game_id_fkey;
alter table codenamesduet.games rename constraint games_user_a_id_fkey to games_player_a_user_id_fkey;
alter table codenamesduet.games rename constraint games_user_b_id_fkey to games_player_b_user_id_fkey;
alter table codenamesduet.games
  drop column created_at,
  drop column club_handle;

-- ─── connections ───────────────────────────────────────────
drop policy if exists games_select   on connections.games;
drop policy if exists events_select  on connections.events;
drop policy if exists players_select on connections.players;

alter table connections.games rename column id to game_id;
alter table connections.games rename constraint games_id_fkey to games_game_id_fkey;
alter table connections.games
  drop column created_at,
  drop column club_handle,
  drop column mode;

-- "Already matched" is `submit_guess`'s own check (decision 19).
drop index connections.connections_events_one_correct_per_rank_compete;
drop index connections.connections_events_one_correct_per_rank_coop;
alter table connections.events drop column mode;

-- ─── crosswords ────────────────────────────────────────────
drop view if exists crosswords.games_state;
drop policy if exists games_select on crosswords.games;
drop policy if exists cells_select on crosswords.cells;

alter table crosswords.games rename column id   to game_id;
alter table crosswords.games rename column meta to puzzle_content;
alter table crosswords.games rename constraint games_id_fkey to games_game_id_fkey;
-- Takes the two `(club_handle, …)` indexes with it; `library_for_club` finds
-- the club through `common.games` and these two instead.
alter table crosswords.games
  drop column created_at,
  drop column club_handle,
  drop column mode;
create index crosswords_games_puzzle_id_idx on crosswords.games (puzzle_id);
create index crosswords_games_puzzle_date_idx on crosswords.games (puzzle_date)
  where puzzle_date is not null;

alter table crosswords.puzzles rename column meta to puzzle_content;

-- ─── letterboxed ───────────────────────────────────────────
drop view if exists letterboxed.games_state;
drop view if exists letterboxed.players_state;
drop policy if exists games_select   on letterboxed.games;
drop policy if exists events_select  on letterboxed.events;
drop policy if exists players_select on letterboxed.players;

alter table letterboxed.games rename column id             to game_id;
alter table letterboxed.games rename column playable_words to legal_words;
alter table letterboxed.games rename constraint games_id_fkey to games_game_id_fkey;
alter table letterboxed.games
  drop column created_at,
  drop column club_handle,
  drop column mode;

alter table letterboxed.players
  drop column solved,
  drop column solved_at;

-- ─── psychicnum ────────────────────────────────────────────
drop view if exists psychicnum.games_state;
drop policy if exists games_select   on psychicnum.games;
drop policy if exists events_select  on psychicnum.events;
drop policy if exists players_select on psychicnum.players;

alter table psychicnum.games add column max_guesses integer;

update psychicnum.games p
   set max_guesses = (g.setup ->> 'max_guesses')::int
  from common.games g
 where g.id = p.id;

alter table psychicnum.games
  alter column max_guesses set not null,
  add constraint games_max_guesses_check check (max_guesses between 1 and 9);

alter table psychicnum.games rename column id to game_id;
alter table psychicnum.games rename constraint games_id_fkey to games_game_id_fkey;
alter table psychicnum.games
  drop column created_at,
  drop column club_handle,
  drop column mode;

-- ─── scrabble ──────────────────────────────────────────────
drop view if exists scrabble.games_state;
drop view if exists scrabble.players_state;
drop policy if exists games_select   on scrabble.games;
drop policy if exists events_select  on scrabble.events;
drop policy if exists players_select on scrabble.players;

alter table scrabble.games rename column id          to game_id;
alter table scrabble.games rename column shared_rack to coop_rack;
alter table scrabble.games rename column team_score  to coop_score;
alter table scrabble.games rename constraint games_id_fkey to games_game_id_fkey;
alter table scrabble.games
  drop column created_at,
  drop column club_handle,
  drop column mode;

-- A player is found by `user_id`; compete's turn order is already
-- `common.game_players.turn_seat` (decision 8).
alter table scrabble.players drop column seat;
alter table scrabble.events  drop column seat;

-- ─── setgame ───────────────────────────────────────────────
drop view if exists setgame.games_state;
drop policy if exists games_select   on setgame.games;
drop policy if exists events_select  on setgame.events;
drop policy if exists players_select on setgame.players;

alter table setgame.games add column palette text;

update setgame.games s
   set palette = coalesce(g.setup ->> 'palette', 'traditional')
  from common.games g
 where g.id = s.id;

alter table setgame.games
  alter column palette set not null,
  add constraint games_palette_check check (palette in ('traditional', 'colorblind'));

alter table setgame.games rename column id to game_id;
alter table setgame.games rename constraint games_id_fkey to games_game_id_fkey;
alter table setgame.games
  drop column created_at,
  drop column club_handle,
  drop column mode;

-- ─── spellingbee ───────────────────────────────────────────
drop view if exists spellingbee.games_state;
drop policy if exists games_select       on spellingbee.games;
drop policy if exists found_words_select on spellingbee.found_words;

alter table spellingbee.games
  add column target_rank   integer,
  add column required_band integer,
  add column legal_band    integer;

update spellingbee.games s
   set target_rank   = (g.setup ->> 'target_rank')::int,
       required_band = coalesce((g.setup ->> 'required_band')::int, 3),
       legal_band    = coalesce((g.setup ->> 'legal_band')::int, 5)
  from common.games g
 where g.id = s.id;

alter table spellingbee.games
  alter column required_band set not null,
  alter column legal_band    set not null,
  add constraint games_target_rank_check   check (target_rank between 0 and 6),
  add constraint games_required_band_check check (required_band between 1 and 6),
  add constraint games_legal_band_check    check (legal_band between required_band and 6);

alter table spellingbee.games rename column id to game_id;
alter table spellingbee.games rename constraint games_id_fkey to games_game_id_fkey;
alter table spellingbee.games
  drop column created_at,
  drop column club_handle,
  drop column mode;

-- ─── stackdown ─────────────────────────────────────────────
drop view if exists stackdown.games_state;
drop policy if exists games_select   on stackdown.games;
drop policy if exists events_select  on stackdown.events;
drop policy if exists players_select on stackdown.players;

alter table stackdown.games rename column id to game_id;
alter table stackdown.games rename constraint games_id_fkey to games_game_id_fkey;
-- `band` only chose the library board at create; `setup.band` keeps it
-- (decision 20).
alter table stackdown.games
  drop column band,
  drop column created_at,
  drop column club_handle,
  drop column mode;

alter table stackdown.players
  drop column solved,
  drop column solved_at;

-- ─── strands ───────────────────────────────────────────────
drop view if exists strands.games_state;
drop view if exists strands.players_state;
drop view if exists strands.club_game_status;
drop policy if exists games_select   on strands.games;
drop policy if exists events_select  on strands.events;
drop policy if exists players_select on strands.players;

alter table strands.games rename column id   to game_id;
alter table strands.games rename column clue to puzzle_title;
alter table strands.games rename constraint games_id_fkey to games_game_id_fkey;
alter table strands.games
  drop column created_at,
  drop column club_handle,
  drop column mode;

alter table strands.puzzles rename column clue to title;

alter table strands.players
  drop column solved,
  drop column solved_at;

-- ─── waffle ────────────────────────────────────────────────
drop view if exists waffle.games_state;
drop view if exists waffle.players_state;
drop policy if exists games_select   on waffle.games;
drop policy if exists events_select  on waffle.events;
drop policy if exists players_select on waffle.players;

alter table waffle.games rename column id       to game_id;
alter table waffle.games rename column scramble to board_at_setup;
alter table waffle.games rename constraint games_id_fkey to games_game_id_fkey;
alter table waffle.games
  drop column created_at,
  drop column club_handle,
  drop column mode;

alter table waffle.players
  drop column solved,
  drop column solved_at;

-- ─── wordiply ──────────────────────────────────────────────
drop view if exists wordiply.games_state;
drop policy if exists games_select  on wordiply.games;
drop policy if exists events_select on wordiply.events;

alter table wordiply.games rename column id to game_id;
alter table wordiply.games rename constraint games_id_fkey to games_game_id_fkey;
-- `difficulty` only chose the words at create; `setup.difficulty` keeps it
-- (decision 20).
alter table wordiply.games
  drop column difficulty,
  drop column created_at,
  drop column club_handle,
  drop column mode;

-- ─── wordle ────────────────────────────────────────────────
drop view if exists wordle.games_state;
drop policy if exists games_select   on wordle.games;
drop policy if exists events_select  on wordle.events;
drop policy if exists players_select on wordle.players;

alter table wordle.games rename column id to game_id;
alter table wordle.games rename constraint games_id_fkey to games_game_id_fkey;
alter table wordle.games
  drop column created_at,
  drop column club_handle,
  drop column mode;

alter table wordle.players
  drop column solved,
  drop column solved_at;

-- ─── wordwheel ─────────────────────────────────────────────
drop view if exists wordwheel.games_state;
drop policy if exists games_select       on wordwheel.games;
drop policy if exists found_words_select on wordwheel.found_words;

alter table wordwheel.games
  add column target_rank   integer,
  add column required_band integer,
  add column legal_band    integer;

update wordwheel.games w
   set target_rank   = (g.setup ->> 'target_rank')::int,
       required_band = coalesce((g.setup ->> 'required_band')::int, 3),
       legal_band    = coalesce((g.setup ->> 'legal_band')::int, 5)
  from common.games g
 where g.id = w.id;

alter table wordwheel.games
  alter column required_band set not null,
  alter column legal_band    set not null,
  add constraint games_target_rank_check   check (target_rank between 0 and 6),
  add constraint games_required_band_check check (required_band between 1 and 6),
  add constraint games_legal_band_check    check (legal_band between required_band and 6);

alter table wordwheel.games rename column id to game_id;
alter table wordwheel.games rename constraint games_id_fkey to games_game_id_fkey;
alter table wordwheel.games
  drop column created_at,
  drop column club_handle,
  drop column mode;


-- ═══════════════════════════════════════════════════════════
-- The old common columns
-- ═══════════════════════════════════════════════════════════
alter table common.games
  drop column play_state,
  drop column is_terminal,
  drop column status,
  drop column paused;

alter table common.game_players
  drop column result,
  drop column conceded,
  drop column conceded_at,
  drop column locally_terminal;


-- Its column is renamed, so it goes; `supabase/sql/` stamps `updated_at` instead.
drop trigger if exists games_touch_last_active on common.games;
