-- cs-unmet

-- ============================================================
-- wordiply
-- ============================================================
-- What the page and the wordiply-build-board edge function call:
--
--   candidate_bases  samples base fragments for the builder to try
--   try_base         gates one fragment and, if it passes, builds its board
--   matching_words   every legal word containing a base (the builder's count)
--   create_game      starts a game on a built board
--   submit_guess     plays a word that contains the base, or records a reject
--   concede          a racer drops out of a compete game
--   stop_game        stops the game for everyone, with no result
--   submit_timeout   ends the game when the countdown runs out
--   replay_board     the same base again from scratch
--
-- and the view `games_state`, the game row.
--
-- What is particular to wordiply (docs/games/wordiply.md has the rest):
--   - Every word must contain the base and be longer than it. Five accepted
--     words each — the team's five in coop, each racer's own five in compete.
--   - Only the length shows during play. The length score (the longest word
--     against the board's longest possible, `_length_score`) and the letter
--     count are written to the statuses once the game has ended.
--   - The frontend holds the legal list and judges the dictionary; the server
--     re-checks only the two free rules (longer than the base, contains it).
--     Every submission is logged, rejects included.
--   - Coop's five words spent is a win. A compete race plays out: it ends once
--     nobody is left racing, ranked by length score, then letter count, then
--     the earlier last word.
--   - Guesses are the one mode-aware read: coop sees everyone's, compete only
--     your own until the game ends.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema wordiply to authenticated;
grant usage on schema wordiply to service_role;

-- Every column is readable: nothing on the board is secret, and hiding the
-- longest word until the end is the page's choice.
grant select
  (game_id, base, max_word_length, longest_words, legal_words)
  on wordiply.games to authenticated;

grant select on wordiply.events to authenticated;

-- Any club member may read any of the club's games.
drop policy if exists games_select on wordiply.games;
create policy games_select on wordiply.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Club membership is the outer gate; inside, coop shows everyone's guesses,
-- you always see your own, and once the game ends everyone sees everyone's
-- (the compete reveal).
drop policy if exists events_select on wordiply.events;
create policy events_select on wordiply.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
         and (
               cg.mode = 'coop'
            or events.user_id = (select auth.uid())
            or cg.ended_at is not null
             )
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through the RPCs below.

drop view if exists wordiply.games_state;

-- ============================================================
-- wordiply.games_state — the game row the frontend reads
-- ============================================================
-- security_invoker, so games_select decides which rows the caller sees.
create view wordiply.games_state with (security_invoker = true) as
select
  g.game_id,
  g.base,
  g.max_word_length,
  g.longest_words,
  g.legal_words
  from wordiply.games g;

grant select on wordiply.games_state to authenticated;

drop function if exists wordiply._length_score(int, int);

-- ============================================================
-- wordiply._length_score — the length-bar percentage
-- ============================================================
-- round(100 * longest / max_len), clamped to [0, 100]; 0 for a degenerate
-- board with no length. The frontend's port (lib/scoring.ts) must match it
-- exactly.
create or replace function wordiply._length_score(p_longest int, p_max_len int)
returns int
language sql
immutable
set search_path = wordiply, common, public, extensions
as $$
  select case
           when p_max_len <= 0 then 0
           else least(100, round(100.0 * p_longest / p_max_len)::int)
         end;
$$;

revoke execute on function wordiply._length_score(int, int) from public;

drop function if exists wordiply.matching_words(text, int);

-- ============================================================
-- wordiply.matching_words — every legal word containing a base
-- ============================================================
-- Every clean legal word that CONTAINS the base as a contiguous substring and
-- is longer than it. try_base builds a board from it and the edge function
-- counts it; this is the one place the "what counts as a legal guess"
-- predicate lives.
--
-- Word LENGTH is deliberately NOT capped — a long best word like
-- 'compartmentalizations' (for 'part') is a legitimate, satisfying target.
-- The lever that keeps a board sane is a MAX-CHILDREN gate in try_base: a
-- base with tens of thousands of matches ('in', 'an') is a non-puzzle (and a
-- huge payload). Good bases are typically 3–4 letters, or an UNCOMMON 2-letter
-- one ('za', 'rw').
--
-- The legal band is the CLEAN band (american, not slang, no slur/crude) —
-- stricter than wordwheel's permissive legal side — because this set also
-- determines the longest word, and a slur must not be the answer.
--
-- security invoker (common.words is readable by every player); stable so one
-- SELECT can call it without re-running it.
create or replace function wordiply.matching_words(p_base text, p_legal_band int)
returns table(word text, len int)
language sql
stable
security invoker
set search_path = wordiply, common, public, extensions
as $$
  select w.word, w.len
    from common.words w
   where w.difficulty <= p_legal_band
     and w.american
     and not w.slang
     and w.slur = 0
     and w.crude = 0
     and w.len > char_length(p_base)
     -- Not sargable → a seq scan, fine at a few calls per board build.
     and position(p_base in w.word) > 0;
$$;

revoke execute on function wordiply.matching_words(text, int) from public;
grant execute on function wordiply.matching_words(text, int) to authenticated;

drop function if exists wordiply.candidate_bases(int, int);

-- ============================================================
-- wordiply.candidate_bases — sample base fragments for the builder
-- ============================================================
-- The base is a 2–4 letter COMBINATION, not a word, so it can't be picked
-- from the dictionary. Instead this samples `p_n` common SOURCE words and hands
-- back their 2–4 letter contiguous substrings — each, by construction, in at
-- least one real word. The edge function tries them through try_base until
-- one clears the gate. Sourcing from common words (`p_source_band`, ~3) keeps
-- the base recognizable whatever the legal band.
--
-- volatile (random()); security invoker (reads common.words as the caller).
create or replace function wordiply.candidate_bases(p_source_band int, p_n int)
returns table(base text)
language sql
volatile
security invoker
set search_path = wordiply, common, public, extensions
as $$
  select frag from (
    select distinct substring(w.word from i for l) as frag
      from (
        select word from common.words
         where american and not slang and slur = 0 and crude = 0
           and difficulty <= p_source_band
           and len between 4 and 9
         order by random()
         limit p_n
      ) w,
      generate_series(1, 9) i,
      generate_series(2, 4) l
     where i + l - 1 <= length(w.word)
  ) frags
  order by random()
  limit p_n;
$$;

revoke execute on function wordiply.candidate_bases(int, int) from public;
grant execute on function wordiply.candidate_bases(int, int) to authenticated;

drop function if exists wordiply.try_base(text, int, int, int, int);

-- ============================================================
-- wordiply.try_base — gate and build a board for one candidate base
-- ============================================================
-- Returns the board's `max_word_length`, `longest_words` (up to three at the
-- max length) and `legal_words` IF the base clears the gate, else no row:
--   - the child count is within [p_min_children, p_max_children] — the max
--     throws out over-generous fragments ('in', 'an', 'ar')
--   - the longest word beats the base by at least `p_min_headroom` letters
-- A rejected fragment costs one common.words scan and transfers nothing: the
-- jsonb aggregation runs only for a passing row.
create or replace function wordiply.try_base(
  p_base text,
  p_legal_band int,
  p_min_children int,
  p_max_children int,
  p_min_headroom int
)
returns table(max_word_length int, longest_words jsonb, legal_words jsonb)
language sql
stable
security invoker
set search_path = wordiply, common, public, extensions
as $$
  with m as (
    select word, len from wordiply.matching_words(p_base, p_legal_band)
  ),
  agg as (
    select count(*)::int as c, coalesce(max(len), 0)::int as mx from m
  )
  select
    agg.mx,
    (select jsonb_agg(word)
       from (select word from m where len = agg.mx order by word limit 3) t),
    (select jsonb_agg(word) from m)
  from agg
  where agg.c between p_min_children and p_max_children
    and agg.mx >= char_length(p_base) + p_min_headroom;
$$;

revoke execute on function wordiply.try_base(text, int, int, int, int) from public;
grant execute on function wordiply.try_base(text, int, int, int, int) to authenticated;

drop function if exists wordiply._track_totals(uuid);

-- ============================================================
-- wordiply._track_totals — each player's numbers so far
-- ============================================================
-- One row per player: the accepted words on their track, the longest one's
-- length, the letters across them, their length score, and when the last one
-- landed. A track is the team's in coop (every row the same) and the player's
-- own in compete. Rejects count for nothing.
--
-- The builder and the ranking both read it, so the numbers the page shows
-- and the numbers a race is decided on are one computation.
create or replace function wordiply._track_totals(p_game_id uuid)
returns table(
  user_id uuid,
  guesses_used int,
  longest int,
  letter_count int,
  length_score int,
  last_guess_at timestamptz
)
language sql
stable
security definer
set search_path = wordiply, common, public, extensions
as $$
  select gp.user_id,
         count(e.id)::int,
         coalesce(max(e.length), 0)::int,
         coalesce(sum(e.length), 0)::int,
         wordiply._length_score(coalesce(max(e.length), 0)::int, g.max_word_length),
         max(e.created_at)
    from common.game_players gp
    join common.games cg on cg.id = gp.game_id
    join wordiply.games g on g.game_id = gp.game_id
    left join wordiply.events e
      on e.game_id = gp.game_id
     and e.valid
     and (cg.mode = 'coop' or e.user_id = gp.user_id)
   where gp.game_id = p_game_id
   group by gp.user_id, g.max_word_length;
$$;

revoke execute on function wordiply._track_totals(uuid) from public;

-- ============================================================
-- wordiply._write_statuses — the page's copies of the game
-- ============================================================
-- Writes `common.games.game_status`, every `common.game_players.player_status`
-- and `common.games.clubpage_info` from wordiply's own tables, assigning each
-- whole (plans/common-tables.md → The statuses). Every key is always present,
-- null when it has no value:
--
--   game_status    {} — the base and the longest length are columns
--   player_status  { guesses_used, length_score, letter_count,
--                    player_ended_reason }
--                  — that player's track (the team's, in coop): its accepted
--                  words, and its two scores, which stay null until the game
--                  has ended; how they ended: out of words, or conceded
--   clubpage_info  { guesses_used, length_score, letter_count,
--                    winner_user_id, winner_length_score }
--                  — coop's shared words used, and its two scores once it
--                  has ended (null in compete, whose summary shows no
--                  progress); compete's sole winner and their length score,
--                  once there is one
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function wordiply._write_statuses(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  v_mode text;
  v_ended boolean;
  v_team_used int;
  v_team_length_score int;
  v_team_letter_count int;
  v_winner uuid;
begin
  select mode, ended_at is not null into v_mode, v_ended
    from common.games where id = p_game_id;

  update common.game_players gp
     set player_status = jsonb_build_object(
           'guesses_used', t.guesses_used,
           'length_score', case when v_ended then t.length_score end,
           'letter_count', case when v_ended then t.letter_count end,
           'player_ended_reason', gp.player_ended_reason)
    from wordiply._track_totals(p_game_id) t
   where gp.game_id = p_game_id
     and gp.user_id = t.user_id;

  if v_mode = 'coop' then
    select guesses_used, length_score, letter_count
      into v_team_used, v_team_length_score, v_team_letter_count
      from wordiply._track_totals(p_game_id)
     limit 1;
  else
    select min(user_id::text)::uuid into v_winner
      from common.game_players
     where game_id = p_game_id and final_ranking = 1
    having count(*) = 1;
  end if;

  update common.games
     set game_status = '{}'::jsonb,
         clubpage_info = jsonb_build_object(
           'guesses_used', v_team_used,
           'length_score', case when v_ended then v_team_length_score end,
           'letter_count', case when v_ended then v_team_letter_count end,
           'winner_user_id', v_winner,
           'winner_length_score', (select t.length_score
                                     from wordiply._track_totals(p_game_id) t
                                    where t.user_id = v_winner)),
         status_changed_at = case when p_update_status_changed_at
                                  then now() else status_changed_at end
   where id = p_game_id;
end;
$$;

revoke execute on function wordiply._write_statuses(uuid, boolean) from public;

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- wordiply's own, each builder bearing its column's name. `game_data` is the
-- common part (supabase/sql/common.sql → The page blobs' common parts) with
-- wordiply's facts on top; the pieces below build each part, so `select
-- game_data from common.games` shows the page what it gets.
--
--   game_data, wordiply's part:
--     puzzle: {base, maxWordLen, longestWords, legalWords}
--                                          frozen at create; the page waits for the
--                                          end to show the longest
--     team: {nGuessesUsed, lengthScore, nLetters, longestWordLen}
--                                          the team's words, summed; null in compete,
--                                          where there is no team (plans/team-facts.md);
--                                          the three scores null until the game ends
--     events: [{id, userId, word, valid, reason, tookTurn, at}, …]
--                                          every submission, rejects included, every
--                                          player's; what a racer may see of a rival
--                                          mid-race is the hook's rule
--     players: [player, …]                 the common player, plus:
--       maxGuesses                         5, the same on every player
--       nGuessesUsed                       this player's own, in every mode
--       lengthScore                        this player's own; null until the game ends
--       nLetters                           this player's own; null until the game ends
--       longestWordLen                     this player's own; null until the game ends
--       board: {words}                     what this seat sees: the team's accepted
--                                          words in coop, the racer's own in compete
--
--   summary_data, wordiply's part (the common part names and dates the game and
--   carries its ending; the winner is `ending.winner`):
--     team: {nGuessesUsed, lengthScore, nLetters}
--                                          the same group, less the longest word's
--                                          length; null in compete
--     maxGuesses
--     winnerLengthScore                    compete's, once the race is won; null in coop

-- The board as built: the base, and the words the builder found for it.
create or replace function wordiply._make_json_puzzle(g wordiply.games)
returns jsonb
language sql
immutable
set search_path = wordiply, common, public, extensions
as $$
  select jsonb_build_object(
    'base',         g.base,
    'maxWordLen',   g.max_word_length,
    'longestWords', g.longest_words,
    'legalWords',   g.legal_words);
$$;

revoke execute on function wordiply._make_json_puzzle(wordiply.games) from public;

-- The log: every submission, rejects included, in the order of play.
create or replace function wordiply._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordiply, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',       e.id,
           'userId',   e.user_id,
           'word',     e.word,
           'valid',    e.valid,
           'reason',   e.reason,
           'tookTurn', e.took_turn,
           'at',       e.created_at) order by e.id), '[]'::jsonb)
    from wordiply.events e
   where e.game_id = p_game_id;
$$;

revoke execute on function wordiply._make_json_events(uuid) from public;

-- One track's numbers: the accepted words of one player, or of the whole team
-- when `p_user_id` is null. The three scores wait for the end of the game.
create or replace function wordiply._make_json_track(
  p_game_id uuid,
  p_user_id uuid,
  p_ended boolean
)
returns jsonb
language sql
stable
set search_path = wordiply, common, public, extensions
as $$
  select jsonb_build_object(
           'nGuessesUsed',   count(e.id),
           'lengthScore',    case when p_ended then
                               wordiply._length_score(coalesce(max(e.length), 0), g.max_word_length)
                             end,
           'nLetters',       case when p_ended then coalesce(sum(e.length), 0) end,
           'longestWordLen', case when p_ended then coalesce(max(e.length), 0) end)
    from wordiply.games g
    left join wordiply.events e
      on e.game_id = g.game_id
     and e.valid
     and (p_user_id is null or e.user_id = p_user_id)
   where g.game_id = p_game_id
   group by g.max_word_length;
$$;

revoke execute on function wordiply._make_json_track(uuid, uuid, boolean) from public;

-- What one seat sees on the board: the accepted words, in the order of play.
-- In coop every seat sees the team's; in compete, the racer's own.
create or replace function wordiply._make_json_board(p_game_id uuid, p_user_id uuid, p_mode text)
returns jsonb
language sql
stable
set search_path = wordiply, common, public, extensions
as $$
  select jsonb_build_object(
    'words', coalesce(jsonb_agg(e.word order by e.id), '[]'::jsonb))
    from wordiply.events e
   where e.game_id = p_game_id
     and e.valid
     and (p_mode = 'coop' or e.user_id = p_user_id);
$$;

revoke execute on function wordiply._make_json_board(uuid, uuid, text) from public;

-- What the team shares: the whole team's track. Null in compete, where there
-- is no team (plans/team-facts.md).
create or replace function wordiply._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordiply, common, public, extensions
as $$
  select case when cg.mode = 'coop' then
           wordiply._make_json_track(p_game_id, null, cg.ended_at is not null)
         end
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function wordiply._make_json_team(uuid) from public;

-- Every player as wordiply's game_data shows them: the common player, with the
-- budget, their own track and this seat's board.
create or replace function wordiply._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordiply, common, public, extensions
as $$
  select jsonb_agg(
           cp.player
             -- submit_guess's budget.
             || jsonb_build_object('maxGuesses', 5)
             || wordiply._make_json_track(p_game_id, cp.id, cg.ended_at is not null)
             || jsonb_build_object('board', wordiply._make_json_board(p_game_id, cp.id, cg.mode))
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join common.games cg on cg.id = p_game_id;
$$;

revoke execute on function wordiply._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with wordiply's puzzle, team, log
-- and players on top.
create or replace function wordiply._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = wordiply, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'puzzle',  wordiply._make_json_puzzle(g),
           'team',    wordiply._make_json_team(p_game_id),
           'events',  wordiply._make_json_events(p_game_id),
           'players', wordiply._make_json_players(p_game_id))
    from wordiply.games g
   where g.game_id = p_game_id;
$$;

revoke execute on function wordiply._make_json_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one.
create or replace function wordiply._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = wordiply, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'team',              wordiply._make_json_team(p_game_id) - 'longestWordLen',
    'maxGuesses',        5,
    'winnerLengthScore', case when cg.mode = 'compete' then
                           (select wordiply._make_json_track(p_game_id, gp.user_id, true)->'lengthScore'
                              from common.game_players gp
                             where gp.game_id = p_game_id and gp.final_ranking = 1
                             limit 1)
                         end)
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function wordiply._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- wordiply._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from wordiply's own tables, assigning
-- each whole. Every RPC calls it after a move, a recorded reject included;
-- it is also the repair for one game by hand. Every key is always present,
-- null when it has no value; the shapes are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function wordiply._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = wordiply._make_json_game_data(p_game_id),
         summary_data = wordiply._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function wordiply._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- wordiply._rebuild_data_cols_for_all — every wordiply game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_rebuild_data_cols` over every wordiply game without re-dating any, and
-- answers how many it rewrote. Run by hand as postgres (`gmake db-psql`); no
-- client calls it, so it has no grant and wears the `_`.
create or replace function wordiply._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('wordiply_coop', 'wordiply_compete')
  loop
    perform wordiply._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function wordiply._rebuild_data_cols_for_all() from public;

drop function if exists wordiply.create_game(text, jsonb, uuid[], text, jsonb);

-- ============================================================
-- wordiply.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)
-- ============================================================
-- Starts a game on a board the wordiply-build-board edge function built under
-- the caller's JWT. The board is taken at face value; only its STRUCTURE is
-- checked.
--
-- Setup shape (server validates):
--   { "difficulty": 1..6 (the band the legal words are drawn from; default 5),
--     "custom_base": "moth" (optional, 2–4 letters: the player names the base
--       instead of the builder sampling one; stripped from the club's saved
--       default, since it is a one-off challenge, not a new baseline),
--     "timer": (none | countup | countdown{seconds}),
--     "coop_style": 'free-for-all' | 'turns' (coop only),
--     "first_turn_user_id": a player (with 'turns'; stripped from the
--       club's saved default) }
-- There is no target_rank; one in the setup is refused.
--
-- Board shape:
--   { "base": "ar", "max_word_length": 9,
--     "longest_words": ["hangars", …], "legal_words": ["arc", "cars", …] }
--
-- The title is the base, uppercased ("AR") — never the best length, which is
-- secret until the end and the title is visible before and during play.
create or replace function wordiply.create_game(
  p_club_handle     text,
  p_setup           jsonb,
  p_player_user_ids uuid[],
  p_mode            text,
  p_board           jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  new_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  s_difficulty int;
  s_custom_base text;
  b_base text;
  b_max_word_length int;
  first_turn uuid;
begin
  perform common._require_club_member(p_club_handle);

  perform common._require_valid_mode(p_mode);
  if p_mode = 'compete' then
    if coalesce(array_length(p_player_user_ids, 1), 0) < 2 then
      raise exception 'BUG: race with fewer than two players'
        using errcode = 'PN122', hint = 'fault', column = '_',
      detail = 'compete needs >= 2 players';
    end if;
  end if;
  perform common._require_player_count_max(p_player_user_ids, 6);

  if p_setup ? 'target_rank' then
    raise exception 'BUG: game with a target rank'
      using errcode = 'PN123', hint = 'fault', column = '_',
      detail = 'wordiply has no target_rank; the setup carried one';
  end if;

  -- The band only chose the words, which the builder has done; it is checked
  -- here and kept in `setup`, not stored.
  s_difficulty := coalesce((p_setup->>'difficulty')::int, 5);
  if s_difficulty < 1 or s_difficulty > 6 then
    raise exception 'BUG: word difficulty of %', s_difficulty
      using errcode = 'PN124', hint = 'fault', column = '_',
      detail = 'setup.difficulty must be 1..6';
  end if;

  perform common._require_valid_timer(p_setup->'timer');

  -- Only the starter's SHAPE is checked here (the same rule as board.base
  -- below); whether its letters yield a board is the edge function's job,
  -- under a looser gate — see docs/games/wordiply.md.
  s_custom_base := nullif(lower(trim(p_setup->>'custom_base')), '');
  if s_custom_base is not null and s_custom_base !~ '^[a-z]{2,4}$' then
    raise exception 'BUG: starter of ''%''', s_custom_base
      using errcode = 'PN125', hint = 'fault', column = '_',
      detail = 'setup.custom_base must be 2-4 lowercase ASCII letters';
  end if;

  b_base := p_board->>'base';
  if b_base is null or b_base !~ '^[a-z]{2,4}$' then
    raise exception 'BUG: generated board came with a starter of ''%''',
      coalesce(b_base, 'null')
      using errcode = 'PN126', hint = 'fault', column = '_',
      detail = 'board.base must be 2-4 lowercase ASCII letters';
  end if;

  -- The builder must have honored the request. This is the only place that
  -- can catch it: every later reader trusts board.base, and the player would
  -- simply be handed a different game than the one they set up.
  if s_custom_base is not null and b_base <> s_custom_base then
    raise exception 'BUG: you asked to start with ''%'' and the generated board used ''%''',
      s_custom_base, b_base
      using errcode = 'PN127', hint = 'fault', column = '_',
      detail = 'board.base does not match the requested setup.custom_base';
  end if;

  -- The best word must beat the base by at least 2 letters, or there's
  -- nothing to reach for. The edge function aims for 3; this is the looser
  -- floor a misbehaving builder can't sneak past.
  b_max_word_length := (p_board->>'max_word_length')::int;
  if b_max_word_length is null or b_max_word_length < char_length(b_base) + 2 then
    raise exception 'BUG: generated board left no room to grow the starter (longest word %)',
      coalesce(b_max_word_length::text, 'none')
      using errcode = 'PN128', hint = 'fault', column = '_',
      detail = 'max_word_length must be >= base length + 2';
  end if;

  if jsonb_typeof(p_board->'longest_words') <> 'array'
     or jsonb_array_length(p_board->'longest_words') < 1 then
    raise exception 'BUG: generated board arrived with no target words'
      using errcode = 'PN129', hint = 'fault', column = '_',
      detail = 'board.longest_words must be a non-empty jsonb array';
  end if;
  if jsonb_typeof(p_board->'legal_words') <> 'array'
     or jsonb_array_length(p_board->'legal_words') < 1 then
    raise exception 'BUG: generated board arrived with no legal words'
      using errcode = 'PN130', hint = 'fault', column = '_',
      detail = 'board.legal_words must be a non-empty jsonb array';
  end if;

  new_id := common._create_game(
    p_club_handle, 'wordiply_' || p_mode, p_mode, p_player_user_ids,
    upper(b_base), p_setup,
    p_setup - 'first_turn_user_id' - 'custom_base'
  );

  -- Opt-in turn-by-turn coop: seat the rotation so submit_guess gates each
  -- guess. Free-for-all and compete leave the pointer null.
  if p_mode = 'coop' and p_setup->>'coop_style' = 'turns' then
    first_turn := (p_setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(p_player_user_ids)) then
      raise exception 'BUG: first player who is not in the game'
        using errcode = 'PN131', hint = 'fault', column = '_',
      detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into wordiply.games (game_id, base, max_word_length, longest_words, legal_words)
  values (new_id, b_base, b_max_word_length, p_board->'longest_words', p_board->'legal_words');

  perform wordiply._write_statuses(new_id, p_update_status_changed_at => true);
  perform wordiply._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. The edge function
  -- relays this envelope untouched.
  return common._ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function wordiply.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function wordiply.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

drop function if exists wordiply._finish_coop(uuid, text);
drop function if exists wordiply._finish_compete(uuid, text, boolean);

-- ============================================================
-- wordiply._finish_compete — end a compete game, whatever ended it
-- ============================================================
-- The ONE place a race's ending is ranked. Two callers pass the act that
-- ended it — _maybe_finish_compete the last racer's (a fifth word, a
-- concession), submit_timeout the clock — and neither ranks anything itself.
--
-- The ranking (docs/win-lose.md → final-ranking): every player who didn't
-- concede and scored, by length score, then letter count, then the earlier
-- last word. Words land in separate transactions, each with its own time, so
-- the last step resolves any tie in play. A
-- race nobody scored in ranks nobody, a collective loss: nobody wins a game
-- nobody scored in. The frontend's compareCompetitors in lib/scoring.ts
-- must match this order.
create or replace function wordiply._finish_compete(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  v_rankings jsonb;
begin
  select coalesce(jsonb_object_agg(user_id::text, ranking), '{}'::jsonb)
    into v_rankings
    from (
      select t.user_id,
             rank() over (order by t.length_score desc, t.letter_count desc,
                                   t.last_guess_at) as ranking
        from wordiply._track_totals(p_game_id) t
        join common.game_players gp
          on gp.game_id = p_game_id and gp.user_id = t.user_id
       where gp.player_ended_reason is distinct from 'conceded'
         and t.length_score > 0
    ) ranked;

  perform common._end_game(
    p_game_id, p_reason, p_reason_detail, p_ended_by_user_id,
    p_is_no_result => false,
    p_final_rankings => v_rankings
  );
end;
$$;

revoke execute on function wordiply._finish_compete(uuid, text, text, uuid) from public;

drop function if exists wordiply._maybe_finish_compete(uuid, text, text, uuid);

-- ============================================================
-- wordiply._maybe_finish_compete — end the compete game if it's over
-- ============================================================
-- A compete game ends when NO player is still racing — every one has spent
-- their five words or conceded. Shared by submit_guess (a fifth word can be
-- the last move) and concede (a drop-out can be, when everyone else has
-- already spent theirs). The act passed is the last racer's, and becomes the
-- game's reason. Everyone conceding is `common._concede`'s ending, so this
-- skips a game that has already ended.
--
-- Returns true when it ended the game, false when someone is still racing.
create or replace function wordiply._maybe_finish_compete(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
begin
  if (select ended_at from common.games where id = p_game_id) is not null then
    return false;
  end if;

  if exists (
    select 1 from common.game_players
     where game_id = p_game_id and player_ended_at is null
  ) then
    return false;
  end if;

  perform wordiply._finish_compete(p_game_id, p_reason, p_reason_detail, p_ended_by_user_id);
  return true;
end;
$$;

revoke execute on function wordiply._maybe_finish_compete(uuid, text, text, uuid) from public;

drop function if exists wordiply.submit_guess(uuid, text, boolean);

-- ============================================================
-- wordiply.submit_guess — the only move (trusting-commit)
-- ============================================================
-- The frontend has judged the word against the board's legal list, so this
-- TRUSTS dictionary legality and only:
--   1. gates the live game (ended, a player, not conceded, the turn, budget)
--   2. dedups by mode (coop: anyone's word; compete: your own)
--   3. re-checks the two FREE rules — the word is longer than the base and
--      contains it — which catch a stale page and cost no lookup
--   4. records the word and checks the ending: coop's fifth accepted word
--      wins; a compete fifth word ends that racer, and ends the race if
--      nobody is left racing
--
-- Every submission is RECORDED, valid or not: the events table is the log.
-- `p_fe_legal` is the frontend's dictionary verdict — false means "I checked
-- the legal list and this isn't on it" — and trusting it is no weaker than
-- trusting its accepts.
--
-- The turn, in turn-by-turn coop: a STRUCTURAL reject (missing_base /
-- too_short) ends the caller's turn — it's a rules error. A dictionary miss
-- does NOT: the word list may be at fault, or it's a typo, and taxing a reach
-- for a long word is backwards in a game whose whole incentive is reaching.
-- No reject spends budget.
--
-- The `ok` carries { result, length, guesses_used, terminal } for an
-- accepted word, with length_score and letter_count added once the game has
-- ended (scores are hidden until then), and { result, reason } for a reject.
create or replace function wordiply.submit_guess(
  p_game_id  uuid,
  p_word     text,
  p_fe_legal boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row wordiply.games%rowtype;
  v_mode text;
  v_ended_at timestamptz;
  w_lower text;
  track_count int;      -- words already on this track, before this one
  ins_length int;
  is_dup boolean;
  out_terminal boolean;
  v_mine record;
  result jsonb;
  reject_reason text;   -- set iff this submission is being recorded as invalid
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first: a friend may have deleted the game, and the delete takes
  -- every membership with it (docs/envelopes.md → a missing game row is PN485).
  select * into g_row from wordiply.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordiply');
  end if;

  caller_id := common._require_game_player(p_game_id);

  select mode, ended_at into v_mode, v_ended_at
    from common.games where id = p_game_id;
  -- A RACE: the last active racer can spend their fifth word, or the clock
  -- run out, while this one is in flight.
  if v_ended_at is not null then
    perform common._raise_game_over();
  end if;

  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- Turn-order gate (opt-in turn-by-turn coop); a no-op otherwise.
  perform common._require_turn(p_game_id, caller_id);

  w_lower := lower(coalesce(p_word, ''));

  -- ─── Budget (the frontend gates, so this only fires on a race) ─
  -- Accepted words only: a reject costs nothing, and the count is also how
  -- many of the five board slots are filled.
  select count(*) into track_count
    from wordiply.events
   where game_id = p_game_id and valid
     and (v_mode = 'coop' or user_id = caller_id);
  if track_count >= 5 then
    raise exception 'No guesses left'
      using errcode = 'PN366', hint = 'race', column = '_',
      detail = 'the guess budget for this player/team is spent';
  end if;

  -- ─── Dedup, FIRST ────────────────────────────────────────
  -- Counts INVALID rows too, and runs before the free rules: a word already
  -- in the log, however it got there, is not a new turn — resubmitting it
  -- must not log a second row, advance the turn, or re-report the first
  -- reason.
  select exists (
    select 1 from wordiply.events e
     where e.game_id = p_game_id and e.word = w_lower
       and (v_mode = 'coop' or e.user_id = caller_id)
  ) into is_dup;
  -- A RACE, and the one branch that records NOTHING: `useFoundWordSubmit`
  -- dedups locally before calling, so reaching this means its list was stale.
  if is_dup then
    -- The MESSAGE is the whole line, matching the frontend's `already_found`
    -- answer exactly (src/wordiply/lib/answer.ts): this rejection arrives by
    -- both routes — caught locally, or lost as a race — and the two must not
    -- read differently. Written twice on purpose: it is not going to change,
    -- and machinery to share it would cost more than it saves.
    raise exception '% — already found', upper(w_lower)
      using errcode = 'PN365', hint = 'race', column = '_',
      detail = 'the word is already in the log under this mode''s dedup rule';
  end if;

  -- ─── The free rules, then the frontend's verdict ─────────
  if char_length(w_lower) <= char_length(g_row.base) then
    reject_reason := 'too_short';
  elsif position(g_row.base in w_lower) = 0 then
    reject_reason := 'missing_base';
  elsif not coalesce(p_fe_legal, true) then
    reject_reason := 'not_a_word';
  end if;

  ins_length := char_length(w_lower);

  -- ─── Rejected: record it, maybe spend the turn, and stop ──
  if reject_reason is not null then
    -- WHO ASKED decides whether a structural reject is an answer or a bug.
    -- `recordReject` sends p_fe_legal false: it REPORTS a rejection the page
    -- already made. `commit` leaves it true, claiming the word is legal — and
    -- the page checks `legalWords` and `minWordLength` before committing, so a
    -- word that breaks a free rule here never passed those checks.
    -- (`not_a_word` is only ever set when p_fe_legal is false.)
    if coalesce(p_fe_legal, true) and reject_reason in ('too_short', 'missing_base') then
      raise exception 'BUG: a guess the client called legal breaks the base rules'
        using errcode = 'PN367', hint = 'fault', column = '_',
        detail = 'commit sent fe_legal true for a word that is ' || reject_reason;
    end if;
    -- A rules error costs your go; a dictionary miss doesn't. That judgment
    -- is this function's — no predicate over the row recovers it, which is
    -- why `took_turn` is stored rather than derived.
    insert into wordiply.events
      (game_id, user_id, kind, word, length, valid, reason, took_turn)
      values (p_game_id, caller_id, 'guess', w_lower, ins_length, false,
              reject_reason, reject_reason in ('too_short', 'missing_base'));
    if reject_reason in ('too_short', 'missing_base') then
      perform common._advance_turn(p_game_id);
    end if;
    -- No status write: nothing a reject changes is in a status. The log is
    -- in game_data, so the blobs are rebuilt.
    perform wordiply._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
    -- An `ok`, not a raise: the row above is the point of the call, and a
    -- raise would take the savepoint down with it.
    return common._ok_envelope(jsonb_build_object('result', 'rejected', 'reason', reject_reason));
  end if;

  -- ─── Accepted (trusted word) ─────────────────────────────
  -- An accepted word always spends the go, the fifth included.
  insert into wordiply.events (game_id, user_id, kind, word, length, took_turn)
    values (p_game_id, caller_id, 'guess', w_lower, ins_length, true);

  if v_mode = 'coop' then
    if track_count + 1 >= 5 then
      -- The team's five words spent is a win: everyone ranked 1.
      perform common._end_game(
        p_game_id, 'resource_exhausted', 'complete', caller_id,
        p_is_no_result => false,
        p_final_rankings => (select jsonb_object_agg(user_id::text, 1)
                               from common.game_players where game_id = p_game_id)
      );
    else
      perform common._advance_turn(p_game_id);
    end if;
  elsif track_count + 1 >= 5 then
    -- The fifth word ends this racer while the others play on, so the roster
    -- has to hear about it: a player nothing is waiting for must not hold
    -- the presence-pause open.
    -- `neutral`: the ranking waits for the end (`loses-by-none`).
    perform common._set_player_ended(p_game_id, caller_id, 'resource_exhausted', 'complete', 'neutral');
    perform wordiply._maybe_finish_compete(p_game_id, 'resource_exhausted', 'complete', caller_id);
  end if;

  perform wordiply._write_statuses(p_game_id, p_update_status_changed_at => true);
  perform wordiply._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  -- The caller's track totals (coop: the team's; compete: their own).
  select * into v_mine
    from wordiply._track_totals(p_game_id) t
   where t.user_id = caller_id;

  out_terminal := (select ended_at from common.games where id = p_game_id) is not null;

  result := jsonb_build_object(
    'result', 'accepted',
    'length', ins_length,
    'guesses_used', v_mine.guesses_used,
    'terminal', out_terminal
  );
  if out_terminal then
    result := result || jsonb_build_object(
      'length_score', v_mine.length_score,
      'letter_count', v_mine.letter_count
    );
  end if;
  return common._ok_envelope(result);

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordiply.submit_guess(uuid, text, boolean) from public;
grant execute on function wordiply.submit_guess(uuid, text, boolean) to authenticated;

drop function if exists wordiply.submit_timeout(uuid);

-- ============================================================
-- wordiply.submit_timeout — countdown-timer expiry
-- ============================================================
-- Fired by the page when a countdown hits 0 (every player races to call it);
-- a second call finds the game ended and answers the game-over race. Coop:
-- the five words not spent in time is a loss, nobody ranked, ended by the
-- turn holder in turn-order coop. Compete: the race ends as it stands,
-- ranked by _finish_compete's rule — the clock crowns the leader, since a
-- score built from real plays means something and voiding it would reward
-- stalling.
create or replace function wordiply.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  v_mode        text;
  v_ended_at    timestamptz;
  v_turn_holder uuid;
begin
  perform 1 from wordiply.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordiply');
  end if;

  perform common._require_game_player(p_game_id);

  select mode, ended_at, current_turn_user_id
    into v_mode, v_ended_at, v_turn_holder
    from common.games where id = p_game_id;
  if v_ended_at is not null then
    perform common._raise_game_over();
  end if;

  if v_mode = 'coop' then
    perform common._end_game(
      p_game_id, 'timeout', 'timeout', v_turn_holder,
      p_is_no_result => false,
      p_final_rankings => '{}'::jsonb
    );
  else
    perform wordiply._finish_compete(p_game_id, 'timeout', 'timeout', null);
  end if;

  perform wordiply._write_statuses(p_game_id, p_update_status_changed_at => true);
  perform wordiply._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordiply.submit_timeout(uuid) from public;
grant execute on function wordiply.submit_timeout(uuid) to authenticated;

drop function if exists wordiply.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists wordiply.end_game(uuid);

-- ============================================================
-- wordiply.stop_game — the Stop
-- ============================================================
-- Any player stops the game for the whole table, in either mode. It is
-- neutral: nobody won, nobody lost (docs/common-schema.md → Stop).
create or replace function wordiply.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the last word waits for it and then reads the
  -- game as over, rather than overwriting the ending.
  perform 1 from wordiply.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordiply');
  end if;

  perform common._stop(p_game_id);

  perform wordiply._write_statuses(p_game_id, p_update_status_changed_at => true);
  perform wordiply._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordiply.stop_game(uuid) from public;
grant execute on function wordiply.stop_game(uuid) to authenticated;

drop function if exists wordiply.replay_board(uuid);

-- ============================================================
-- wordiply.replay_board — restart this board from scratch
-- ============================================================
-- The same base and word lists; the guesses are wiped and the common half is
-- reset (common._reset_game: the ending, each player's ending, the clock, the
-- turn). Any game player may call it, mid-game or after the end.
create or replace function wordiply.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a guess committing during the reset can't strand a row on the
  -- fresh board.
  perform 1 from wordiply.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordiply');
  end if;

  -- The row check comes BEFORE the membership gate: `delete_game` takes this
  -- row and every `game_players` row together, so gate-first would tell a
  -- player whose game was just deleted "You are not in this game".
  perform common._require_game_player(p_game_id);

  delete from wordiply.events where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform wordiply._write_statuses(p_game_id, p_update_status_changed_at => true);
  perform wordiply._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'replayed'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordiply.replay_board(uuid) from public;
grant execute on function wordiply.replay_board(uuid) to authenticated;

drop function if exists wordiply.concede(uuid);

-- ============================================================
-- wordiply.concede — a racer drops out of a compete game
-- ============================================================
-- The per-player quit (compete only — coop is a team, so it ends via the
-- shared Stop, never a concede). `common._concede` records the concession and
-- ends the game if everyone has conceded; otherwise the race ends here if
-- every other racer has already spent their five words, with the concession
-- as the act that ended it. The conceder takes a real loss; the others keep
-- racing.
create or replace function wordiply.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = wordiply, common, public, extensions
as $$
declare
  caller_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked FIRST, so the concession serializes against a concurrent fifth
  -- word (src/guards/concedeLock.test.ts has why).
  perform 1 from wordiply.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('wordiply');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  caller_id := common._concede(p_game_id);
  perform wordiply._maybe_finish_compete(p_game_id, 'conceded', 'conceded', caller_id);

  perform wordiply._write_statuses(p_game_id, p_update_status_changed_at => true);
  perform wordiply._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'conceded'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function wordiply.concede(uuid) from public;
grant execute on function wordiply.concede(uuid) to authenticated;
