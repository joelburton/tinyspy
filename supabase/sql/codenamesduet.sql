-- cs-blessed-codenamesduet

-- ============================================================
-- codenamesduet
-- ============================================================
-- What the frontend calls:
--
--   create_game       deals a board and two key cards, and seats the players
--   submit_clue       the clue-giver gives this turn's clue
--   submit_guess      the guesser turns a word over
--   pass_turn         the guesser stops guessing, spending the turn
--   submit_timeout    ends the game when the countdown runs out
--   stop_game         stops the game, with no result
--   replay_board      restarts the same board and keys from scratch
--
-- What the codenamesduet-suggest-clue edge function calls:
--
--   get_clue_context  the clue-giver's view of the board and the clues so far
--   log_hint          records that the clue-giver asked the AI
--
-- What is particular to codenamesduet (src/codenamesduet/doc.md has the rest):
--   - Two players, always a team; there is no concede and no compete mode.
--   - The server decides every guess: it reads the reveal off a key card the
--     guesser's page never sees.
--   - A turn is a clue, then guesses. Its state is `turn_number`, the clue
--     seat, and whether this turn's clue is in (a clue event for the turn);
--     `_point_turn` mirrors it onto common.games.current_turn_user_id.
--   - The turn budget is `max_turns`; the turns left are worked out from it
--     and `turn_number` (_turns_remaining). Sudden death is `turn_number`
--     past `max_turns` while the game hasn't ended: no more clues, and
--     whoever still has words to find guesses.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema codenamesduet to authenticated;

drop policy if exists games_select on codenamesduet.games;
create policy games_select on codenamesduet.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

drop policy if exists words_select on codenamesduet.words;
create policy words_select on codenamesduet.words
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = words.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

drop policy if exists events_select on codenamesduet.events;
create policy events_select on codenamesduet.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- No insert/update/delete policies on any table. All writes go
-- through RPCs. word_pool has no policies at all — only
-- security-definer RPCs read from it.

grant select on codenamesduet.games to authenticated;
grant select on codenamesduet.words to authenticated;
grant select on codenamesduet.events to authenticated;

drop function if exists codenamesduet._seat_has_agents_left(uuid, text);

-- ============================================================
-- codenamesduet._seat_has_agents_left
-- ============================================================
-- Does this seat still have an agent its partner hasn't contacted? A seat's
-- agents are the 'G' cells on its own key; "contacted" is the global
-- revealed_as = 'G' (a green reveal is true for both seats the moment it
-- happens). The rulebook turns on it twice: a seat whose agents are all found
-- gives no more clues (`_end_turn`), and in sudden death — where a guess is
-- read off the PARTNER's key — a player has words to guess only while their
-- partner's seat still has agents left.
create or replace function codenamesduet._seat_has_agents_left(p_game_id uuid, p_seat text)
returns boolean
language sql
stable
security definer
set search_path = codenamesduet, common, public, extensions
as $$
  select exists (
    select 1
      from codenamesduet.words w
      join codenamesduet.games g on g.game_id = w.game_id
     where w.game_id = p_game_id
       and ((case p_seat when 'A' then g.key_card_a else g.key_card_b end) ->> w.position) = 'G'
       and w.revealed_as is distinct from 'G'
  );
$$;

revoke execute on function codenamesduet._seat_has_agents_left(uuid, text) from public;

-- ============================================================
-- codenamesduet._turns_remaining
-- ============================================================
-- The turns left in the budget. The game starts on turn 1 with all
-- `p_max_turns` left, and each spent turn moves the turn number on by one,
-- so the budget is spent when the turn number passes `p_max_turns` — sudden
-- death, where every guess is a turn of its own and this stays 0.
create or replace function codenamesduet._turns_remaining(p_max_turns int, p_turn_number int)
returns int
language sql
immutable
as $$
  select greatest(p_max_turns - p_turn_number + 1, 0)
$$;

revoke execute on function codenamesduet._turns_remaining(int, int) from public;

drop function if exists codenamesduet._point_turn(uuid);

-- ============================================================
-- codenamesduet._point_turn
-- ============================================================
-- Mirrors this game's own turn onto the common turn order, so the page reads
-- whose move it is the way it does in every game (docs/win-lose.md → Where a
-- player stands). The game's turn stays in its own state — the clue seat, and
-- whether this turn's clue is in — and this writes, from that state, who
-- must act now into common.games.current_turn_user_id:
--
--   ordinary play, no clue yet this turn  → the clue-giver
--   ordinary play, the clue is in         → the guesser
--   sudden death, one side with words     → the player who still has words
--   sudden death, both with words         → nobody: the rulebook lets either
--                                           guess, which one pointer cannot
--                                           say; the page supplies the turn
--
-- An ended game's pointer is left where it was: the page never reads it as
-- anyone's turn once the game is over. Every RPC that changes the turn calls
-- this after writing its own state.
create or replace function codenamesduet._point_turn(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  g codenamesduet.games%rowtype;
  has_clue boolean;
  actor_seat text;
  a_has_words boolean;
  b_has_words boolean;
begin
  if (select ended_at from common.games where id = p_game_id) is not null then
    return;
  end if;

  select * into g from codenamesduet.games where game_id = p_game_id;

  if g.turn_number <= g.max_turns then
    has_clue := exists (
      select 1 from codenamesduet.events e
       where e.game_id = p_game_id and e.kind = 'clue'
         and e.turn_number = g.turn_number
    );
    actor_seat := case
      when not has_clue then g.current_clue_giver
      when g.current_clue_giver = 'A' then 'B'
      else 'A'
    end;
  else
    -- Sudden death. A guesses off B's key, B off A's.
    a_has_words := codenamesduet._seat_has_agents_left(p_game_id, 'B');
    b_has_words := codenamesduet._seat_has_agents_left(p_game_id, 'A');
    actor_seat := case
      when a_has_words and b_has_words then null
      when a_has_words then 'A'
      when b_has_words then 'B'
    end;
  end if;

  update common.games
     set current_turn_user_id = case actor_seat
       when 'A' then g.player_a_user_id
       when 'B' then g.player_b_user_id
     end
   where id = p_game_id;
end;
$$;

revoke execute on function codenamesduet._point_turn(uuid) from public;

-- ============================================================
-- codenamesduet._write_statuses — the page's copies of the game
-- ============================================================
-- Writes `common.games.game_status`, every `common.game_players.player_status`
-- and `common.games.clubpage_info` from codenamesduet's own tables, assigning
-- each whole (plans/common-tables.md → The statuses). Every key is always
-- present, null when it has no value:
--
--   game_status    { found_agents_count, turn_number, turns_remaining,
--                    max_turns }
--                  — the info column's agents found, the turn and the
--                  budget; turns_remaining 0 is sudden death (worked out,
--                  _turns_remaining)
--   player_status  {} — both players share everything; there is no strip
--   clubpage_info  { found_agents_count, turns_remaining }
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function codenamesduet._write_statuses(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  g codenamesduet.games%rowtype;
  v_found_agents int;
begin
  select * into g from codenamesduet.games where game_id = p_game_id;
  select count(*) into v_found_agents from codenamesduet.words
   where game_id = p_game_id and revealed_as = 'G';

  update common.game_players
     set player_status = '{}'::jsonb
   where game_id = p_game_id;

  update common.games
     set game_status = jsonb_build_object(
           'found_agents_count', v_found_agents,
           'turn_number', g.turn_number,
           'turns_remaining', codenamesduet._turns_remaining(g.max_turns, g.turn_number),
           'max_turns', g.max_turns),
         clubpage_info = jsonb_build_object(
           'found_agents_count', v_found_agents,
           'turns_remaining', codenamesduet._turns_remaining(g.max_turns, g.turn_number)),
         status_changed_at = case when p_update_status_changed_at
                                  then now() else status_changed_at end
   where id = p_game_id;
end;
$$;

revoke execute on function codenamesduet._write_statuses(uuid, boolean) from public;

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- codenamesduet's own. `game_data` is the common part (supabase/sql/common.sql
-- → The page blobs' common parts) with codenamesduet's facts on top; the
-- pieces below build each part, so `select game_data from common.games` shows
-- the page what it gets.
--
--   game_data, codenamesduet's part:
--     puzzle: {tiles: [{id, word, key}, …]}
--                                          the deal, which never changes: the 25
--                                          words by position, each with both
--                                          players' keys for it, {[userId]: G / N / A}
--     team: {nFoundAgents, nTurnsUsed, maxTurns, suddenDeath, board}
--                                          what the pair shares; board is the
--                                          table as it stands:
--       board: {tiles: [{id, revealed, guessableBy}, …]}
--         revealed: {as, arrows}           what the tile shows (G / N / A) and the
--                                          players to point an arrow at; null
--                                          until anyone guesses it
--         guessableBy                      the players who may still guess it
--     turns: {holder, num, currClue}       the common turn, with the turn's number
--                                          and its clue, {word, count, fromAi, userId},
--                                          null until it is given
--     events: [{id, userId, kind, turnNum, tookTurn, at, clueWord, clueCount,
--               clueFromAi, tileId, result}, …]
--                                          every clue, guess, pass and hint, in order
--     players: [player, …]                 the common player, plus:
--       clueGiver                          gives this turn's clue
--       allAgentsFound                     every agent on this player's key is contacted
--
--   summary_data, codenamesduet's part (the common part names and dates the
--   game and carries its ending):
--     team: {nFoundAgents, nTurnsUsed, maxTurns, suddenDeath}
--
-- It carries both keys: hiding my partner's until the game ends is the page's
-- rule (`makeGameData`).

-- The seat letter a player sits in, from the game row.
create or replace function codenamesduet._seat_of(cg codenamesduet.games, p_user_id uuid)
returns text
language sql
immutable
as $$
  select case p_user_id when cg.player_a_user_id then 'A'
                        when cg.player_b_user_id then 'B' end;
$$;

revoke execute on function codenamesduet._seat_of(codenamesduet.games, uuid) from public;

-- The deal: every word in position order, with both players' keys for it.
create or replace function codenamesduet._make_json_puzzle(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = codenamesduet, common, public, extensions
as $$
  select jsonb_build_object(
    'tiles', jsonb_agg(jsonb_build_object(
               'id',   w.position::text,
               'word', w.word,
               'key',  jsonb_build_object(
                         g.player_a_user_id::text, g.key_card_a -> w.position,
                         g.player_b_user_id::text, g.key_card_b -> w.position))
             order by w.position))
    from codenamesduet.words w
    join codenamesduet.games g on g.game_id = w.game_id
   where w.game_id = p_game_id;
$$;

revoke execute on function codenamesduet._make_json_puzzle(uuid) from public;

-- The table as it stands. A tile shows the agent or the assassin once either
-- is contacted, for both players; short of that, a bystander once either
-- player has turned it over. A live bystander points an arrow at each player
-- who turned it over; a contacted tile points at nobody. A tile may still be
-- guessed by a player until it is contacted or they have turned it over as a
-- bystander (the Duet rule: it may be their partner's agent).
create or replace function codenamesduet._make_json_board(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = codenamesduet, common, public, extensions
as $$
  select jsonb_build_object(
    'tiles', jsonb_agg(jsonb_build_object(
               'id', w.position::text,
               'revealed',
                 case when w.revealed_as is not null then
                        jsonb_build_object('as', w.revealed_as, 'arrows', '[]'::jsonb)
                      when w.neutral_a or w.neutral_b then
                        jsonb_build_object('as', 'N', 'arrows', (
                          select jsonb_agg(s.user_id order by s.seat)
                            from (values ('A', g.player_a_user_id, w.neutral_a),
                                         ('B', g.player_b_user_id, w.neutral_b))
                                   as s(seat, user_id, neutraled)
                           where s.neutraled))
                 end,
               'guessableBy', (
                 select coalesce(jsonb_agg(s.user_id order by s.seat), '[]'::jsonb)
                   from (values ('A', g.player_a_user_id, w.neutral_a),
                                ('B', g.player_b_user_id, w.neutral_b))
                          as s(seat, user_id, neutraled)
                  where w.revealed_as is null and not s.neutraled))
             order by w.position))
    from codenamesduet.words w
    join codenamesduet.games g on g.game_id = w.game_id
   where w.game_id = p_game_id;
$$;

revoke execute on function codenamesduet._make_json_board(uuid) from public;

-- What the pair shares. A turn is used once it is over, and also the turn the
-- game ended on when anything was played in it (a win or the assassin ends a
-- game without ending its turn); sudden death's turns are past the budget,
-- so the count stops at it. Sudden death stays true once a game that reached
-- it has ended.
create or replace function codenamesduet._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = codenamesduet, common, public, extensions
as $$
  select jsonb_build_object(
    'nFoundAgents', (select count(*) from codenamesduet.words
                      where game_id = p_game_id and revealed_as = 'G'),
    'nTurnsUsed',   least(
                      g.turn_number - 1
                      + case when cg.ended_at is not null and exists (
                               select 1 from codenamesduet.events e
                                where e.game_id = p_game_id
                                  and e.turn_number = g.turn_number
                                  and e.kind in ('clue', 'guess', 'pass'))
                             then 1 else 0 end,
                      g.max_turns),
    'maxTurns',     g.max_turns,
    'suddenDeath',  g.turn_number > g.max_turns)
    from codenamesduet.games g
    join common.games cg on cg.id = g.game_id
   where g.game_id = p_game_id;
$$;

revoke execute on function codenamesduet._make_json_team(uuid) from public;

-- This turn's clue, or null until it is given.
create or replace function codenamesduet._make_json_curr_clue(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = codenamesduet, common, public, extensions
as $$
  select jsonb_build_object(
           'word',   e.clue_word,
           'count',  e.clue_count,
           'fromAi', e.clue_from_ai,
           'userId', e.user_id)
    from codenamesduet.events e
    join codenamesduet.games g on g.game_id = e.game_id
   where e.game_id = p_game_id
     and e.kind = 'clue'
     and e.turn_number = g.turn_number;
$$;

revoke execute on function codenamesduet._make_json_curr_clue(uuid) from public;

-- The log: every clue, guess, pass and hint, in the order of play.
create or replace function codenamesduet._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = codenamesduet, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',         e.id,
           'userId',     e.user_id,
           'kind',       e.kind,
           'turnNum',    e.turn_number,
           'tookTurn',   e.took_turn,
           'at',         e.created_at,
           'clueWord',   e.clue_word,
           'clueCount',  e.clue_count,
           'clueFromAi', e.clue_from_ai,
           'tileId',     e.guess_position::text,
           'result',     e.guess_result) order by e.id), '[]'::jsonb)
    from codenamesduet.events e
   where e.game_id = p_game_id;
$$;

revoke execute on function codenamesduet._make_json_events(uuid) from public;

-- Every player as codenamesduet's game_data shows them: the common player,
-- with whether they hold the clue seat and whether their agents are all found.
create or replace function codenamesduet._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = codenamesduet, common, public, extensions
as $$
  select jsonb_agg(
           cp.player || jsonb_build_object(
             'clueGiver',      codenamesduet._seat_of(g, cp.id) = g.current_clue_giver
                                 is true,
             'allAgentsFound', not codenamesduet._seat_has_agents_left(
                                     p_game_id, codenamesduet._seat_of(g, cp.id)))
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join codenamesduet.games g on g.game_id = p_game_id;
$$;

revoke execute on function codenamesduet._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with codenamesduet's puzzle,
-- team, turn, log and players on top.
create or replace function codenamesduet._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = codenamesduet, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'puzzle',  codenamesduet._make_json_puzzle(p_game_id),
           'team',    codenamesduet._make_json_team(p_game_id)
                        || jsonb_build_object('board', codenamesduet._make_json_board(p_game_id)),
           'turns',   (common._make_json_game_data(p_game_id) -> 'turns')
                        || jsonb_build_object(
                             'num',      g.turn_number,
                             'currClue', codenamesduet._make_json_curr_clue(p_game_id)),
           'events',  codenamesduet._make_json_events(p_game_id),
           'players', codenamesduet._make_json_players(p_game_id))
    from codenamesduet.games g
   where g.game_id = p_game_id;
$$;

revoke execute on function codenamesduet._make_json_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one.
create or replace function codenamesduet._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = codenamesduet, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'team', codenamesduet._make_json_team(p_game_id));
$$;

revoke execute on function codenamesduet._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- codenamesduet._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from codenamesduet's own tables,
-- assigning each whole. Every RPC calls it after a move; it is also the repair
-- for one game by hand. Every key is always present, null when it has no
-- value; the shapes are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function codenamesduet._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = codenamesduet._make_json_game_data(p_game_id),
         summary_data = codenamesduet._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function codenamesduet._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- codenamesduet._rebuild_data_cols_for_all — every codenamesduet game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_rebuild_data_cols` over every codenamesduet game without re-dating any, and
-- answers how many it rewrote. Run by hand as postgres (`gmake db-psql`); no
-- client calls it, so it has no grant and wears the `_`.
create or replace function codenamesduet._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype = 'codenamesduet'
  loop
    perform codenamesduet._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function codenamesduet._rebuild_data_cols_for_all() from public;

drop function if exists codenamesduet._end_turn(uuid);

-- ============================================================
-- codenamesduet._end_turn
-- ============================================================
-- Advances the turn counter and swaps the clue-giver, and drops the game into
-- sudden death when the last turn is spent. Called by submit_guess (after a
-- bystander) and pass_turn (the guesser stopping, before or after guesses).
--
-- The clue-giver doesn't always strictly alternate. Per the Duet
-- rulebook: "If all 9 words that you see as green have been covered
-- by agent cards, tell your partner that he or she has no words left
-- to guess. Your partner will be the one who gives clues on all
-- remaining turns." So once a seat's agents are all contacted it gives
-- no more clues — we hand the turn to the partner only if the partner
-- still has an agent to clue, otherwise the current giver keeps it.
--
-- "Both seats done" never reaches here: _end_turn runs on a bystander or
-- a voluntary pass (never the 15th agent, which wins inside submit_guess
-- before this is called), so at least one seat always still has an
-- unfound agent. The else-branch giver is therefore always a seat with
-- agents left.
--
-- It RETURNS the turn state it just wrote — turn number, budget and next
-- clue-giver. Both callers answer in an envelope and put those values in its
-- `data`, and this function is the only place that knows them: it decides
-- the next giver and whether the budget ran out.
create or replace function codenamesduet._end_turn(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  v_max_turns int;
  giver text;
  candidate text;
  next_giver text;
  new_turn_number int;
begin
  select max_turns, turn_number + 1, current_clue_giver
    into v_max_turns, new_turn_number, giver
    from codenamesduet.games where game_id = p_game_id for update;

  -- Who would normally pick up the clue (strict alternation)…
  candidate := case giver when 'A' then 'B' else 'A' end;
  -- …but only if that seat still has a green agent the partner hasn't
  -- contacted yet.
  next_giver := case when codenamesduet._seat_has_agents_left(p_game_id, candidate)
                     then candidate else giver end;

  -- The last turn spent: sudden death, which has no clues, so nobody holds
  -- the clue seat.
  if new_turn_number > v_max_turns then
    next_giver := null;
  end if;

  update codenamesduet.games
     set turn_number = new_turn_number,
         current_clue_giver = next_giver
   where game_id = p_game_id;

  perform codenamesduet._point_turn(p_game_id);
  return jsonb_build_object(
    'turn_number', new_turn_number,
    'turns_remaining', codenamesduet._turns_remaining(v_max_turns, new_turn_number),
    'clue_giver', next_giver
  );
end;
$$;

revoke execute on function codenamesduet._end_turn(uuid) from public;

drop function if exists codenamesduet.create_game(text, jsonb, uuid[]);

-- ============================================================
-- codenamesduet.create_game(p_club_handle, p_setup, p_player_user_ids)
-- ============================================================
-- Validates setup, picks 25 words, generates the Duet key-card
-- distribution, and seats both players: the chosen first clue-giver as A,
-- the other as B.
--
-- p_player_user_ids must contain exactly 2 uuids — both must be members of
-- the club (validated by common._create_game). The manifest declares
-- `numberOfPlayers: [2, 2]`. See docs/code-conventions.md → "Per-game
-- player counts".
--
-- Setup shape:
--   {
--     "turns": 7..15,
--     "first_clue_giver_user_id": "<uuid; must be one of p_player_user_ids>",
--     "timer": { "kind": ... }   (common._require_valid_timer)
--   }
--
-- `turns` is copied to `max_turns`, the budget; the turns left are worked
-- out from it and `turn_number` (_turns_remaining).
create or replace function codenamesduet.create_game(
  p_club_handle text,
  p_setup jsonb,
  p_player_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  new_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  picked_words text[];
  tiles jsonb[];
  a_view text[];
  b_view text[];
  j int;
  tmp jsonb;
  s_turns int;
  s_first uuid;
  seat_a uuid;
  seat_b uuid;
  game_title text;
begin
  -- ─── Validate setup shape ────────────────────────────
  -- Missing-vs-bad-value split so each rejection has its own
  -- clear message. Otherwise PL/pgSQL's % placeholder substitutes
  -- NULL as the empty string and we'd raise "...must be 9, 10, or
  -- 11 (got )" — readable, but confusingly empty in the parens.
  if (p_setup->>'turns') is null then
    raise exception 'BUG: game with no turn budget'
      using errcode = 'PN087', hint = 'fault', column = '_',
      detail = 'setup.turns absent';
  end if;
  s_turns := (p_setup->>'turns')::int;
  -- A sane range, not the form's menu: which budgets are offered is the setup
  -- form's choice (TURN_OPTIONS).
  if s_turns not between 7 and 15 then
    raise exception 'BUG: turn budget of %', s_turns
      using errcode = 'PN088', hint = 'fault', column = '_',
      detail = 'setup.turns must be 7..15';
  end if;

  if (p_setup->>'first_clue_giver_user_id') is null then
    raise exception 'BUG: game with no first clue-giver'
      using errcode = 'PN089', hint = 'fault', column = '_',
      detail = 'setup.first_clue_giver_user_id absent';
  end if;
  begin
    s_first := (p_setup->>'first_clue_giver_user_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'BUG: first clue-giver the server cannot read'
      using errcode = 'PN090', hint = 'fault', column = '_',
      detail = 'setup.first_clue_giver_user_id is not a uuid';
  end;

  -- The timer's shape is checked by the shared helper. When it is a
  -- countdown, the FE's wall-clock timer counts down; expiry fires
  -- codenamesduet.submit_timeout (below).
  perform common._require_valid_timer(p_setup->'timer');

  -- ─── Validate the players + first-clue-giver ─────────
  -- codenamesduet is intrinsically 2-player.
  if array_length(p_player_user_ids, 1) <> 2 then
    raise exception 'BUG: game with % players',
      coalesce(array_length(p_player_user_ids, 1), 0)
      using errcode = 'PN091', hint = 'fault', column = '_',
      detail = 'codenamesduet is exactly 2 players';
  end if;
  if s_first <> p_player_user_ids[1] and s_first <> p_player_user_ids[2] then
    raise exception 'BUG: first clue-giver who is not in the game'
      using errcode = 'PN092', hint = 'fault', column = '_',
      detail = 'the first clue-giver must be one of the players';
  end if;

  -- Assign A/B: first-clue-giver is A (since A always opens the
  -- game), the other is B.
  seat_a := s_first;
  seat_b := case s_first when p_player_user_ids[1]
                         then p_player_user_ids[2]
                         else p_player_user_ids[1] end;

  -- ─── Pick 25 words ────────────────────────────────────
  -- Pulled forward (before common._create_game) so we can use the
  -- picked words to build the title.
  select array_agg(word) into picked_words
    from (select word from codenamesduet.word_pool order by random() limit 25) sub;
  if coalesce(array_length(picked_words, 1), 0) <> 25 then
    raise exception 'BUG: Too few words on server to build a board'
      using errcode = 'PN093', hint = 'fault', column = '_',
      detail = 'codenamesduet.word_pool has fewer than 25 rows; run the seed';
  end if;

  -- ─── Build title ────────────────────────────────────
  -- Format: "WORD1-WORD2-WORD3" — the first three words IN BOARD ORDER, i.e.
  -- the top-left three cells as everyone actually sees them (position 0/1/2 map
  -- to picked_words[1..3] at the insert below).
  --
  -- Board order, not alphabetical: a duet board is never
  -- shuffled or rotated, so the first three cells are a stable, recognizable
  -- handle — you can glance at the grid and know which game this is. Games whose
  -- boards DO get reordered sort the title words instead, because there the
  -- on-screen first-three would drift.
  --
  -- The 25 words are on the shared board every player sees, so naming the game
  -- after three of them leaks nothing; what IS secret is the key card (who's
  -- an agent, who's the assassin), and that never touches the title.
  game_title := array_to_string(picked_words[1:3], '-');

  -- The saved default strips first_clue_giver_user_id — who opens this round
  -- is a per-game decision, not a club preference. The dialog's auto-pick
  -- fills it on the next open.
  new_id := common._create_game(
    p_club_handle, 'codenamesduet', 'coop', p_player_user_ids, game_title, p_setup,
    p_setup - 'first_clue_giver_user_id'
  );

  -- ─── Duet key-card distribution ───────────────────────
  -- Joint distribution (25 cells total):
  --   G/G:3  G/N:5  G/A:1
  --   N/G:5  N/N:7  N/A:1
  --   A/G:1  A/N:1  A/A:1
  tiles := array[]::jsonb[];
  -- noinspection SqlUnused
  for i in 1..3 loop tiles := tiles || jsonb_build_object('a','G','b','G'); end loop;
  -- noinspection SqlUnused
  for i in 1..5 loop tiles := tiles || jsonb_build_object('a','G','b','N'); end loop;
  tiles := tiles || jsonb_build_object('a','G','b','A');
  -- noinspection SqlUnused
  for i in 1..5 loop tiles := tiles || jsonb_build_object('a','N','b','G'); end loop;
  -- noinspection SqlUnused
  for i in 1..7 loop tiles := tiles || jsonb_build_object('a','N','b','N'); end loop;
  tiles := tiles || jsonb_build_object('a','N','b','A');
  tiles := tiles || jsonb_build_object('a','A','b','G');
  tiles := tiles || jsonb_build_object('a','A','b','N');
  tiles := tiles || jsonb_build_object('a','A','b','A');

  -- Fisher-Yates shuffle.
  for i in reverse 25..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tiles[i];
    tiles[i] := tiles[j];
    tiles[j] := tmp;
  end loop;

  a_view := array[]::text[];
  b_view := array[]::text[];
  for i in 1..25 loop
    a_view := a_view || (tiles[i]->>'a');
    b_view := b_view || (tiles[i]->>'b');
  end loop;

  insert into codenamesduet.games (
    game_id, current_clue_giver, max_turns,
    player_a_user_id, player_b_user_id, key_card_a, key_card_b
  ) values (
    new_id, 'A', s_turns,
    seat_a, seat_b, to_jsonb(a_view), to_jsonb(b_view)
  );

  -- Insert the 25 words.
  for i in 0..24 loop
    insert into codenamesduet.words (game_id, position, word)
    values (new_id, i, picked_words[i+1]);
  end loop;

  -- Seat both players on the common turn order — seat A first, so the seats
  -- read the same everywhere — and point it at A, who owes the first clue.
  perform common._assign_turn_order(new_id, seat_a);
  perform codenamesduet._point_turn(new_id);

  perform codenamesduet._write_statuses(new_id, p_update_status_changed_at => true);

  perform codenamesduet._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. REQUIRED, not
  -- decorative: it is the only thing a call site can filter the `ok` on, and
  -- without it the branch would match by merely being `ok` and would draw a
  -- second answer as this one.
  return common._ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

-- The boundary. It reads the SQLSTATE, re-raises anything that isn't ours, and
-- lets the raise itself carry the message, the kind and the field.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function codenamesduet.create_game(text, jsonb, uuid[]) from public;
grant execute on function codenamesduet.create_game(text, jsonb, uuid[]) to authenticated;

drop function if exists codenamesduet.submit_clue(uuid, text, int);
drop function if exists codenamesduet.submit_clue(uuid, text, int, boolean);

-- ============================================================
-- codenamesduet.submit_clue
-- ============================================================
-- The clue-giver gives this turn's clue.
--
-- `p_clue_from_ai` is the client saying this clue is exactly the AI's
-- suggestion, word and count unedited. Only the client saw the suggestion, so
-- it is taken as said — provenance, not a move to adjudicate. It defaults to
-- false.
--
-- It judges nothing about the clue itself: a board word, several words, any
-- count from zero up are all recorded. The players police their own clues, as
-- they would at a table (CLAUDE.md → Trust model); the form allows one digit.
--
-- Five of its six raises are RACES, because every one of them turns on
-- state the clue form cannot see change under it (the sixth, PN384, is a
-- fault). The form is rendered from `current_clue_giver` and the turn's clue
-- event, both of which arrive by subscription, while the Submit button
-- unlocks the moment this RPC replies — so the window between "my move
-- landed" and "my form knows" is real.
create or replace function codenamesduet.submit_clue(
  p_game_id uuid, p_clue_word text, p_clue_count int, p_clue_from_ai boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  caller_id uuid;
  g codenamesduet.games%rowtype;
  caller_seat text;
  stored codenamesduet.events%rowtype;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  select * into g from codenamesduet.games
   where game_id = p_game_id for update;
  if not found then
    -- Any club member may delete the game while the form is up; that is a
    -- race, not a broken client (docs/envelopes.md → a missing game row).
    perform common._raise_game_deleted('codenamesduet');
  end if;

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: the partner pressed Stop, or the countdown expired, while this
    -- clue was being composed. Their action reaches this client by
    -- subscription, so the form is still up when the game is already over.
    perform common._raise_game_over();
  end if;
  if g.turn_number > g.max_turns then
    -- A race: the last turn was spent while this clue was being composed, and
    -- sudden death has no clues.
    raise exception 'Sudden death — no more clues'
      using errcode = 'PN502', hint = 'race', column = '_',
      detail = 'no clues in sudden death';
  end if;

  -- A club member who didn't sit down at this game can't submit clues.
  caller_id := common._require_game_player(p_game_id);

  caller_seat := case caller_id
                   when g.player_a_user_id then 'A'
                   when g.player_b_user_id then 'B'
                 end;

  -- A `case` with no `else` yields NULL, and every comparison against NULL is
  -- NULL, which `if` reads as false — so without this the seat gate below would
  -- fail OPEN for a caller who is in the game but sits in neither column, and
  -- the insert would write a clue with seat = NULL. Unreachable today
  -- (create_game seats both players and PN091 rejects any count but two), which
  -- is exactly why it is a fault: getting here means those invariants broke.
  if caller_seat is null then
    raise exception 'BUG: a clue from a player with no seat'
      using errcode = 'PN384', hint = 'fault', column = '_',
      detail = 'caller matches neither player_a_user_id nor player_b_user_id';
  end if;

  if caller_seat <> g.current_clue_giver then
    -- A race: the giver flips inside _end_turn, which the PARTNER's guess runs.
    -- The form stays up until the new games row arrives.
    raise exception 'Your partner is giving the clue now'
      using errcode = 'PN371', hint = 'race', column = '_',
      detail = 'the other player holds the clue-giver seat';
  end if;

  if exists (
    select 1 from codenamesduet.events e
    where e.game_id = p_game_id and e.kind = 'clue'
      and e.turn_number = g.turn_number
  ) then
    -- A race, and this one is the caller's own: the first clue landed, the
    -- button unlocked on the reply, and the clue event that would have swapped
    -- the panel to the guess view has not arrived yet.
    raise exception 'A clue is already in for this turn'
      using errcode = 'PN372', hint = 'race', column = '_',
      detail = 'one clue per turn';
  end if;

  insert into codenamesduet.events (
    game_id, user_id, kind, took_turn, turn_number, seat,
    clue_word, clue_count, clue_from_ai
  ) values (
    p_game_id, caller_id, 'clue', false, g.turn_number, caller_seat,
    p_clue_word, p_clue_count, p_clue_from_ai
  )
  returning * into stored;

  -- The clue is in, so the move is now the guesser's.
  perform codenamesduet._point_turn(p_game_id);

  perform codenamesduet._write_statuses(p_game_id, p_update_status_changed_at => true);

  perform codenamesduet._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; the rest is the clue as it was recorded, read
  -- back from the row that now exists rather than from the request — which is
  -- the difference between "here is what you sent" and "here is what is
  -- stored".
  return common._ok_envelope(jsonb_build_object(
    'result', 'clued',
    'clue_word', stored.clue_word,
    'clue_count', stored.clue_count,
    'clue_from_ai', stored.clue_from_ai,
    'turn_number', stored.turn_number,
    'seat', stored.seat
  ));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function codenamesduet.submit_clue(uuid, text, int, boolean) from public;
grant execute on function codenamesduet.submit_clue(uuid, text, int, boolean) to authenticated;

drop function if exists codenamesduet.submit_guess(uuid, int);

-- ============================================================
-- codenamesduet.submit_guess
-- ============================================================
-- The guesser turns a word over. Answers in an envelope whose `data` carries
-- the revealed label ('G' | 'N' | 'A') plus the board state the reveal
-- produced. Handles all the Duet rules:
--   - whose key labels this reveal (the clue-giver's in ordinary play; the
--     partner's in sudden death)
--   - the assassin → lost (fatal_move / assassin)
--   - a bystander in sudden death → lost (fatal_move / neutral)
--   - the 15th agent → won (reached_goal / solved)
--   - an agent otherwise → the turn continues (in sudden death, every guess
--     is a turn of its own)
--   - a bystander in ordinary play → the turn ends via _end_turn
-- Every ending is the pair's: both are ranked 1 on a win, nobody on a loss,
-- and the guesser is who ended it.
--
-- Four `ok` answers. The two that end the game are `won` and `lost`, with the
-- ending's detail as `reason`; the two that leave it running are named for
-- what was turned over.
--
-- Its rejections are all races but two, and the reason is the same one the clue
-- form has: the tiles unlock when this RPC replies, while the board and the
-- turn state arrive by subscription. In sudden death the race is the textbook
-- one — either player may guess, so the partner can turn a word over, or lose
-- the game outright, while your guess is in flight.
create or replace function codenamesduet.submit_guess(p_game_id uuid, p_guess_position int)
returns jsonb
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  caller_id uuid;
  g codenamesduet.games%rowtype;
  in_sudden_death boolean;
  caller_seat text;
  key_owner_seat text;
  key_card jsonb;
  revealed_label text;
  green_total int;
  turns_used int;
  turn_state jsonb;
  v_rankings jsonb;
  end_outcome text;
  end_reason text;
  end_detail text;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  if p_guess_position < 0 or p_guess_position > 24 then
    -- The position comes from the tile that was clicked, so an off-board one
    -- never came from our board.
    raise exception 'BUG: a guess off the board'
      using errcode = 'PN377', hint = 'fault', column = '_',
      detail = 'a board position is 0..24';
  end if;

  select * into g from codenamesduet.games
   where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('codenamesduet');
  end if;

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: the partner ended the game — pressed Stop, ran the clock out, or
    -- in sudden death turned over the word that lost it — while this guess was
    -- in flight.
    perform common._raise_game_over();
  end if;
  in_sudden_death := g.turn_number > g.max_turns;

  caller_id := common._require_game_player(p_game_id);
  caller_seat := case caller_id
                   when g.player_a_user_id then 'A'
                   when g.player_b_user_id then 'B'
                 end;

  -- Seatless caller — see the same check in submit_clue for why a NULL seat
  -- slips every gate written as a comparison. Here it would also pick the
  -- WRONG KEY CARD: the sudden-death `case caller_seat when 'A' then 'B' else
  -- 'A' end` below sends NULL down its else, scoring the guess against seat A.
  if caller_seat is null then
    raise exception 'BUG: a guess from a player with no seat'
      using errcode = 'PN386', hint = 'fault', column = '_',
      detail = 'caller matches neither player_a_user_id nor player_b_user_id';
  end if;

  -- Whose key labels this reveal? Most subtle rule in Duet.
  --
  -- In ordinary play: the clue-giver's. A green agent on the clue-giver's side
  -- counts toward the 15; a neutral on their side ends the turn; an assassin
  -- on their side ends the game. The guesser's own key does NOT matter — the
  -- guess is in response to the clue-giver's clue, so the clue-giver's labels
  -- apply.
  --
  -- In sudden death: no clue-giver, but guesses are "from memory of past
  -- clues", and those clues came from the partner. So we still use the
  -- partner's key (the seat opposite the caller).
  if not in_sudden_death then
    if caller_seat = g.current_clue_giver then
      -- A race: your own turn-ending guess made you the giver, and the tiles
      -- unlocked on that guess's reply — before the games row saying so
      -- arrived.
      raise exception 'Your partner is guessing this turn'
        using errcode = 'PN380', hint = 'race', column = '_',
        detail = 'the clue-giver may not also guess';
    end if;
    if not exists (
      select 1 from codenamesduet.events e
      where e.game_id = p_game_id and e.kind = 'clue'
        and e.turn_number = g.turn_number
    ) then
      -- The same window one step further on: the turn rolled over, and the new
      -- one has no clue yet.
      raise exception 'No clue yet this turn'
        using errcode = 'PN381', hint = 'race', column = '_',
        detail = 'no clue has been submitted for this turn';
    end if;
    key_owner_seat := g.current_clue_giver;
  else
    key_owner_seat := case caller_seat when 'A' then 'B' else 'A' end;
    -- The rulebook: "If only one player has words remaining, that player
    -- guesses." A guess here reads the partner's key, so a player whose
    -- partner's agents are all found has nothing left to guess. A race: the
    -- board goes inert for them the moment the last of those agents lands.
    if not codenamesduet._seat_has_agents_left(p_game_id, key_owner_seat) then
      raise exception 'No words left to guess'
        using errcode = 'PN509', hint = 'race', column = '_',
        detail = 'in sudden death the caller''s partner has no agents left';
    end if;
  end if;

  -- Already resolved FOR THIS GUESSER? Two different facts, and they get two
  -- raises because they are two different sentences to the player: the word is
  -- globally done (an agent was contacted, or the assassin was hit), or THIS
  -- SEAT already hit it as a neutral. The PARTNER's neutral does not block the
  -- caller — the word may be the caller's agent in the other direction — which
  -- is why the second condition is seat-scoped and the first is not.
  if exists (
    select 1 from codenamesduet.words w
    where w.game_id = p_game_id and w.position = p_guess_position
      and w.revealed_as is not null
  ) then
    -- A race: in sudden death the partner may have turned it over while this
    -- guess was in flight; in ordinary play it is your own previous guess,
    -- whose words row has not landed yet.
    raise exception 'That word is already revealed'
      using errcode = 'PN382', hint = 'race', column = '_',
      detail = 'that cell has already been turned over';
  end if;

  if exists (
    select 1 from codenamesduet.words w
    where w.game_id = p_game_id and w.position = p_guess_position
      and ((caller_seat = 'A' and w.neutral_a)
           or (caller_seat = 'B' and w.neutral_b))
  ) then
    -- Only ever the caller's own bystander, so the sentence says so. Still a
    -- race for the same reason: the mark is on the board by subscription.
    raise exception 'You already tried that word'
      using errcode = 'PN383', hint = 'race', column = '_',
      detail = 'this seat already turned that cell over as a bystander';
  end if;

  key_card := case key_owner_seat
                when 'A' then g.key_card_a
                when 'B' then g.key_card_b
              end;

  revealed_label := key_card ->> p_guess_position;

  -- Record the reveal on codenamesduet.words. Green (agent contacted) and
  -- assassin are GLOBAL — true for both players. A neutral only marks the
  -- guesser's own seat, so the partner can still guess the word.
  if revealed_label = 'G' then
    update codenamesduet.words set revealed_as = 'G'
      where game_id = p_game_id and position = p_guess_position;
  elsif revealed_label = 'A' then
    update codenamesduet.words set revealed_as = 'A'
      where game_id = p_game_id and position = p_guess_position;
  elsif caller_seat = 'A' then
    update codenamesduet.words set neutral_a = true
      where game_id = p_game_id and position = p_guess_position;
  else
    update codenamesduet.words set neutral_b = true
      where game_id = p_game_id and position = p_guess_position;
  end if;

  -- The agent count as it stands after this reveal. Computed once, before the
  -- branches, because the win check turns on it AND every answer reports it.
  select count(*) into green_total from codenamesduet.words
    where game_id = p_game_id and revealed_as = 'G';

  -- Log every guess; a word can be guessed twice, once per seat. It takes a
  -- turn exactly when the turn number moves on after it: a bystander in
  -- ordinary play (which runs _end_turn below), and an agent in sudden death
  -- that does not win the game — each sudden-death guess is a turn of its own.
  -- An agent in ordinary play, and any guess that ends the game, move nothing.
  insert into codenamesduet.events (
    game_id, user_id, kind, took_turn, turn_number, seat, guess_position, guess_result
  ) values (
    p_game_id, caller_id, 'guess',
    (revealed_label = 'N' and not in_sudden_death)
      or (revealed_label = 'G' and in_sudden_death and green_total < 15),
    g.turn_number, caller_seat, p_guess_position, revealed_label
  );

  -- Does this reveal end the game?
  if revealed_label = 'A' then
    end_outcome := 'lost'; end_reason := 'fatal_move'; end_detail := 'assassin';
  elsif in_sudden_death and revealed_label <> 'G' then
    end_outcome := 'lost'; end_reason := 'fatal_move'; end_detail := 'neutral';
  elsif revealed_label = 'G' and green_total >= 15 then
    end_outcome := 'won'; end_reason := 'reached_goal'; end_detail := 'solved';
  end if;

  if end_outcome is not null then
    update codenamesduet.games set current_clue_giver = null
     where game_id = p_game_id;

    -- Duet is a team: they win together or lose together. A win is both
    -- players' solve.
    if end_outcome = 'won' then
      update common.game_players set solved_at = now() where game_id = p_game_id;
      select jsonb_object_agg(user_id::text, 1) into v_rankings
        from common.game_players where game_id = p_game_id;
    end if;

    perform common._end_game(
      p_game_id, end_reason, end_detail, caller_id,
      p_is_no_result => false,
      p_final_rankings => coalesce(v_rankings, '{}'::jsonb)
    );

    perform codenamesduet._write_statuses(p_game_id, p_update_status_changed_at => true);

    perform codenamesduet._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

    turns_used := g.max_turns - codenamesduet._turns_remaining(g.max_turns, g.turn_number);
    return common._ok_envelope(
      jsonb_build_object(
        'result', end_outcome,
        'reason', end_detail,
        'revealed', revealed_label,
        'found_agents_count', green_total,
        'turns_used', turns_used
      )
    );
  end if;

  -- A bystander in ordinary play ends the turn.
  if revealed_label <> 'G' then
    -- _end_turn hands back the turn state it wrote — the new number, what is
    -- left of the budget, and who clues next (nobody, if that spent the last
    -- turn and dropped the game into sudden death).
    turn_state := codenamesduet._end_turn(p_game_id);
    perform codenamesduet._write_statuses(p_game_id, p_update_status_changed_at => true);
    perform codenamesduet._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
    return common._ok_envelope(
      jsonb_build_object(
        'result', 'bystander',
        'revealed', revealed_label,
        'found_agents_count', green_total,
        'turn_number', turn_state->'turn_number',
        'turns_remaining', turn_state->'turns_remaining',
        'clue_giver', turn_state->>'clue_giver'
      )
    );
  end if;

  -- An agent in sudden death is a turn of its own: the turn number moves on so
  -- the next guess — by either player — is the next row of the log, and it
  -- can leave one side with nothing to guess, which moves the turn to the
  -- other player. In ordinary play an agent does not end the turn.
  if in_sudden_death then
    update codenamesduet.games set turn_number = turn_number + 1
     where game_id = p_game_id
    returning * into g;
    perform codenamesduet._point_turn(p_game_id);
  end if;

  perform codenamesduet._write_statuses(p_game_id, p_update_status_changed_at => true);

  perform codenamesduet._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  -- The same turn keys the bystander answer carries, which is what lets a
  -- reader compare the two answers rather than the two shapes. In sudden
  -- death the number it reports is the next one.
  return common._ok_envelope(
    jsonb_build_object(
      'result', 'agent',
      'revealed', revealed_label,
      'found_agents_count', green_total,
      'turn_number', g.turn_number,
      'turns_remaining', codenamesduet._turns_remaining(g.max_turns, g.turn_number),
      'clue_giver', g.current_clue_giver
    )
  );

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function codenamesduet.submit_guess(uuid, int) from public;
grant execute on function codenamesduet.submit_guess(uuid, int) to authenticated;

drop function if exists codenamesduet.pass_turn(uuid);

-- ============================================================
-- codenamesduet.pass_turn
-- ============================================================
-- The guesser ends the turn without taking any more guesses, spending one
-- turn. Legal even after zero guesses on the turn (e.g. "the clue makes no
-- sense, let's just move on").
--
-- ONE `ok` answer, carrying the turn state the pass produced — including
-- whether it spent the last turn and dropped the game into sudden death
-- (`turns_remaining` 0). That is a state the board renders off the games
-- row, not a separate answer to "did my pass go through", so it rides in
-- `data` rather than splitting the answer in two.
create or replace function codenamesduet.pass_turn(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  caller_id uuid;
  g codenamesduet.games%rowtype;
  caller_seat text;
  turn_state jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  select * into g from codenamesduet.games
   where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('codenamesduet');
  end if;

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: the partner ended the game, or the countdown expired, while the
    -- Pass button was still on screen.
    perform common._raise_game_over();
  end if;
  if g.turn_number > g.max_turns then
    -- A race: the last turn was spent while the Pass button was on screen. In
    -- sudden death every guess is a turn of its own, so there is none to pass.
    raise exception 'Sudden death — no turn to pass'
      using errcode = 'PN503', hint = 'race', column = '_',
      detail = 'no passing in sudden death';
  end if;

  caller_id := common._require_game_player(p_game_id);
  caller_seat := case caller_id
                   when g.player_a_user_id then 'A'
                   when g.player_b_user_id then 'B'
                 end;

  -- Seatless caller — see the same check in submit_clue for why a NULL seat
  -- slips a gate written as a comparison. Here it would pass the turn on
  -- behalf of somebody who is not playing.
  if caller_seat is null then
    raise exception 'BUG: a pass from a player with no seat'
      using errcode = 'PN385', hint = 'fault', column = '_',
      detail = 'caller matches neither player_a_user_id nor player_b_user_id';
  end if;

  if caller_seat = g.current_clue_giver then
    -- A race: your own turn-ending guess made you the giver, and the Pass
    -- button unlocked on that guess's reply — before the games row arrived.
    raise exception 'You''re giving the clue this turn'
      using errcode = 'PN375', hint = 'race', column = '_',
      detail = 'the clue-giver''s exit is submitting a clue';
  end if;

  if not exists (
    select 1 from codenamesduet.events e
    where e.game_id = p_game_id and e.kind = 'clue'
      and e.turn_number = g.turn_number
  ) then
    -- The same window one step on: the turn rolled over under a panel that is
    -- still showing the last turn's clue.
    raise exception 'No clue yet this turn'
      using errcode = 'PN376', hint = 'race', column = '_',
      detail = 'no clue has been submitted for this turn';
  end if;

  -- The pass is recorded against the turn it ends, before _end_turn moves it.
  insert into codenamesduet.events (game_id, user_id, kind, took_turn, turn_number, seat)
  values (p_game_id, caller_id, 'pass', true, g.turn_number, caller_seat);

  -- _end_turn hands back the turn state it wrote, which is the rest of what
  -- passing does.
  turn_state := codenamesduet._end_turn(p_game_id);

  perform codenamesduet._write_statuses(p_game_id, p_update_status_changed_at => true);

  perform codenamesduet._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(jsonb_build_object(
    'result', 'passed',
    'turn_number', turn_state->'turn_number',
    'turns_remaining', turn_state->'turns_remaining',
    'clue_giver', turn_state->>'clue_giver'
  ));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function codenamesduet.pass_turn(uuid) from public;
grant execute on function codenamesduet.pass_turn(uuid) to authenticated;

drop function if exists codenamesduet.submit_timeout(uuid);

-- ============================================================
-- codenamesduet.submit_timeout — wall-clock countdown expired
-- ============================================================
-- The clock is common.timers, advanced by common.tick_timer; when the
-- countdown derived from it hits zero, the FE fires this. The pair lose
-- together (timeout / timeout), and the game was ended by whoever held the
-- turn — nobody, in sudden death with words on both sides.
--
-- Both clients' timers hit zero together, and the lock serializes them. The
-- second finds the game already over and answers common._raise_game_over()'s
-- race — its partner's call beat it.
create or replace function codenamesduet.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from codenamesduet.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('codenamesduet');
  end if;

  perform common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  update codenamesduet.games
     set current_clue_giver = null
   where game_id = p_game_id;

  perform common._end_game(
    p_game_id, 'timeout', 'timeout',
    (select current_turn_user_id from common.games where id = p_game_id),
    p_is_no_result => false,
    p_final_rankings => '{}'::jsonb
  );

  perform codenamesduet._write_statuses(p_game_id, p_update_status_changed_at => true);

  perform codenamesduet._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function codenamesduet.submit_timeout(uuid) from public;
grant execute on function codenamesduet.submit_timeout(uuid) to authenticated;

drop function if exists codenamesduet.replay_board(uuid);

-- ============================================================
-- codenamesduet.replay_board — run this board back from scratch
-- ============================================================
-- The "Restart" game-menu item / terminal-row Restart: reset the working state
-- on the SAME game row. The frozen puzzle stays — the same 25 words and the
-- same two key cards — with every reveal, neutral and event wiped, the
-- turn counter back to 1 (so the whole budget is left) and seat A clueing
-- again.
--
-- **A mulligan, not a fresh puzzle:** the players keep whatever they learned
-- of the key cards. A blind board is **New game**.
--
-- Any game player may call it, mid-game or after the game ends (no ended
-- check — it's a restart; the FE confirms mid-game). Resets BOTH players, per
-- the whole-table restart convention.
create or replace function codenamesduet.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked first, as every move takes it: a restart takes the game row before
  -- the words, the order `submit_guess` takes them in, so the two cannot each
  -- hold what the other waits for.
  perform 1 from codenamesduet.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('codenamesduet');
  end if;

  -- The row check comes BEFORE the membership gate: `delete_game` takes this
  -- row, `common.games` and every `game_players` row together, so a caller
  -- whose game was just deleted has no membership left either, and would be
  -- told "You are not in this game" — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  update codenamesduet.words
     set revealed_as = null, neutral_a = false, neutral_b = false
   where game_id = p_game_id;

  delete from codenamesduet.events where game_id = p_game_id;

  update codenamesduet.games
     set turn_number = 1,
         current_clue_giver = 'A'
   where game_id = p_game_id;

  update common.game_players set solved_at = null where game_id = p_game_id;

  perform common._reset_game(p_game_id);
  -- Back to seat A, who owes the first clue.
  perform codenamesduet._point_turn(p_game_id);

  perform codenamesduet._write_statuses(p_game_id, p_update_status_changed_at => true);

  perform codenamesduet._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function codenamesduet.replay_board(uuid) from public;
grant execute on function codenamesduet.replay_board(uuid) to authenticated;

drop function if exists codenamesduet.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists codenamesduet.end_game(uuid);

-- ============================================================
-- codenamesduet.stop_game — the Stop
-- ============================================================
-- The friends' explicit "we're done here": either player stops the game,
-- mid-clue or in sudden death alike, with no result for either
-- (docs/common-schema.md → Stop). Fired by `act-stop-game`, the Stop button
-- in the info column's action row and the Stop game row of the header menu.
-- Distinct from suspend, which leaves the game running.
create or replace function codenamesduet.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the winning or losing guess waits for it and
  -- then reads the game as over. The row check comes before the membership
  -- gate — see replay_board.
  perform 1 from codenamesduet.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('codenamesduet');
  end if;

  perform common._stop(p_game_id);

  update codenamesduet.games
     set current_clue_giver = null
   where game_id = p_game_id;

  perform codenamesduet._write_statuses(p_game_id, p_update_status_changed_at => true);

  perform codenamesduet._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function codenamesduet.stop_game(uuid) from public;
grant execute on function codenamesduet.stop_game(uuid) to authenticated;

drop function if exists codenamesduet._require_clue_giver(uuid);

-- ============================================================
-- codenamesduet._require_clue_giver — who may ask the AI
-- ============================================================
-- The gate `get_clue_context` and `log_hint` share, so the two can never
-- disagree about who may ask: the game exists, the caller is one of its
-- players, it is in ordinary play (sudden death has no clues), and the caller
-- holds the clue seat. Returns that seat. Raises; the calling RPC's handler
-- turns the raise into the envelope.
--
-- Its refusals are the clue form's own races said again: the AI button sits
-- on that form, one line from Submit, and loses exactly the races Submit
-- loses. The sentences are submit_clue's, word for word — hearing two
-- different ones for a single event would be the tell that they were written
-- twice.
create or replace function codenamesduet._require_clue_giver(p_game_id uuid)
returns text
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  caller_id uuid;
  g codenamesduet.games%rowtype;
  caller_seat text;
begin
  select * into g from codenamesduet.games where game_id = p_game_id;
  if not found then
    perform common._raise_game_deleted('codenamesduet');
  end if;

  caller_id := common._require_game_player(p_game_id);
  caller_seat := case caller_id
                   when g.player_a_user_id then 'A'
                   when g.player_b_user_id then 'B'
                 end;

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race, as in submit_clue: the partner ended the game, or the clock ran
    -- out, while the form was still up.
    perform common._raise_game_over();
  end if;
  if g.turn_number > g.max_turns then
    -- A race, and submit_clue's PN502 word for word: the last turn was spent
    -- while the form was still up.
    raise exception 'Sudden death — no more clues'
      using errcode = 'PN504', hint = 'race', column = '_',
      detail = 'the AI suggester has no clue to give in sudden death';
  end if;

  -- `is distinct from` rather than `<>`, and load-bearing: a caller seated in
  -- neither column gets NULL from the `case` above, and `NULL <> 'A'` is NULL,
  -- which `if` reads as false. The NULL-safe form rejects them instead — which
  -- is why this gate needs no seat check of its own, where the three turn-loop
  -- RPCs each grew one (PN384-PN386).
  if caller_seat is distinct from g.current_clue_giver then
    -- The same race as submit_clue's PN371: the giver flips inside _end_turn,
    -- which the PARTNER's guess runs, and the form stays up until the games row
    -- arrives.
    raise exception 'Your partner is giving the clue now'
      using errcode = 'PN389', hint = 'race', column = '_',
      detail = 'only the clue-giver may ask the AI';
  end if;

  return caller_seat;
end;
$$;

revoke execute on function codenamesduet._require_clue_giver(uuid) from public;

drop function if exists codenamesduet.get_clue_context(uuid);

-- ============================================================
-- codenamesduet.get_clue_context — read-only RPC for the suggester
-- ============================================================
-- Returns a jsonb object with:
--   board:          text[]  — all 25 words in board order, turned over or not:
--                              the clue must not be, or share a root with, any
--                              of them (the rulebook's rule; nothing else
--                              enforces it)
--   greens:         text[]  — caller's unrevealed green agents
--   neutrals:       text[]  — caller's unrevealed neutrals (avoid)
--   assassins:      text[]  — caller's still-unrevealed assassins (avoid).
--                              A Duet key card carries THREE assassins, so
--                              this is an ARRAY of the 0..3 not-yet-revealed
--                              ones — never a single word. Empty [] once all
--                              three are revealed.
--   previous_clues: array of {clue_word, clue_count, seat, turn_number}
--
-- Authorization is `_require_clue_giver`, above, so the Edge Function can stay
-- a thin orchestrator: it gets back either a clean context or a clean
-- rejection. ONE `ok`.
create or replace function codenamesduet.get_clue_context(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  g codenamesduet.games%rowtype;
  caller_seat text;
  caller_key jsonb;
  ctx jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  caller_seat := codenamesduet._require_clue_giver(p_game_id);

  select * into g from codenamesduet.games where game_id = p_game_id;
  caller_key := case caller_seat
                  when 'A' then g.key_card_a
                  when 'B' then g.key_card_b
                end;

  -- Each of the three category lookups uses the caller's key (caller_key)
  -- indexed by w.position; `->>` returns the label as text ('G' | 'N' | 'A').
  select jsonb_build_object(
    'board', coalesce((
      select jsonb_agg(w.word order by w.position)
      from codenamesduet.words w
      where w.game_id = p_game_id
    ), '[]'::jsonb),
    'greens', coalesce((
      select jsonb_agg(w.word order by w.position)
      from codenamesduet.words w
      where w.game_id = p_game_id
        and w.revealed_as is null
        and (caller_key->>w.position) = 'G'
    ), '[]'::jsonb),
    'neutrals', coalesce((
      select jsonb_agg(w.word order by w.position)
      from codenamesduet.words w
      where w.game_id = p_game_id
        and w.revealed_as is null
        and (caller_key->>w.position) = 'N'
    ), '[]'::jsonb),
    'assassins', coalesce((
      select jsonb_agg(w.word order by w.position)
      from codenamesduet.words w
      where w.game_id = p_game_id
        and w.revealed_as is null
        and (caller_key->>w.position) = 'A'
    ), '[]'::jsonb),
    'previous_clues', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'clue_word', e.clue_word,
          'clue_count', e.clue_count,
          'seat', e.seat,
          'turn_number', e.turn_number
        ) order by e.id
      )
      from codenamesduet.events e
      where e.game_id = p_game_id and e.kind = 'clue'
    ), '[]'::jsonb)
  ) into ctx;

  -- `result` NAMES the answer, beside the five lists that ARE it. The edge
  -- function unwraps this rather than relaying it: the board is the first step
  -- of its work, not its answer.
  return common._ok_envelope(ctx || jsonb_build_object('result', 'context'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function codenamesduet.get_clue_context(uuid) from public;
grant execute on function codenamesduet.get_clue_context(uuid) to authenticated;

drop function if exists codenamesduet.log_hint(uuid);

-- ============================================================
-- codenamesduet.log_hint — record that the clue-giver asked the AI
-- ============================================================
-- Called by the `codenamesduet-suggest-clue` edge function AFTER the model has
-- returned a suggestion, so only a hint somebody actually received is logged —
-- a model that declines, or is cut off, leaves no row. The row carries no
-- payload: the suggestion names the agents it targets, and stored where the
-- partner's client can read it, it would spoil their guessing.
--
-- The gate is `_require_clue_giver`, the same one `get_clue_context` asked a
-- moment earlier; between the two the model was thinking, so a refusal here is
-- the same race arriving late. ONE `ok`. A hint spends no turn; it rewrites
-- the statuses like every move, which is how the partner's page hears of it.
create or replace function codenamesduet.log_hint(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  g codenamesduet.games%rowtype;
  caller_seat text;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  caller_seat := codenamesduet._require_clue_giver(p_game_id);

  select * into g from codenamesduet.games where game_id = p_game_id;

  -- The row is read for the turn number alone; the caller is the one the gate
  -- just checked, and `auth.uid()` names them.
  insert into codenamesduet.events (game_id, user_id, kind, took_turn, turn_number, seat)
  values (p_game_id, auth.uid(), 'hint', false, g.turn_number, caller_seat);

  perform codenamesduet._write_statuses(p_game_id, p_update_status_changed_at => true);

  perform codenamesduet._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'logged'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function codenamesduet.log_hint(uuid) from public;
grant execute on function codenamesduet.log_hint(uuid) to authenticated;
