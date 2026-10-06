-- cs-fixed-outcome-fix

-- ============================================================
-- scrabble
-- ============================================================
-- What the frontend calls:
--
--   create_game          deals a new game, bots seated after the people
--   play_word            plays a word the page checked and scored
--   exchange_tiles       swaps rack tiles back into the bag
--   pass_turn            passes (compete only)
--   concede              a player drops out of a compete game
--   stop_game            stops the game for everyone, with no result
--   submit_timeout       ends the game when the countdown runs out
--   replay_board         the same table, a new deal
--   get_suggest_context  the board, rack and bands for the coop suggester
--
-- What the scrabble-ai-move edge function calls, for a bot holding the turn:
--
--   get_ai_context       the bot's rack, the board and the bands
--   ai_play_word         the bot's word
--   ai_exchange_tiles    the bot's swap
--   ai_pass_turn         the bot's pass
--
-- What is particular to scrabble (docs/games/scrabble.md has the rest):
--   - A trusting commit: the page (or the AI edge function) checks a play's
--     shape and scores it; the server checks only the dictionary, and that
--     the tiles are in the rack. `version` is the optimistic-concurrency
--     counter every move checks first.
--   - Every player, bot or person, is a user id. Bots are accounts
--     (common.profiles.ai_member) seated in compete after the people; the
--     compete turn order is common.game_players.turn_seat.
--   - Every letter is stored lowercase (`?` the blank); the page draws the
--     capitals.
--   - Coop plays one rack (`team_rack` on the game row); compete gives each
--     player a rack. A player's score is their own in both modes, and the
--     team's is the players' sum less the leftovers rows.
--   - A game ends when a player goes out with the bag empty, when every
--     player still in passes in a row (compete), on the clock, on a Stop, or
--     when every person has conceded. Final scoring subtracts each rack's
--     leftover tiles as a `leftovers` row, and the player who went out
--     collects them as a `went_out` row.
--   - The page reads the blobs `_rebuild_data_cols` writes onto common.games
--     after every move, and nothing from these tables.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema scrabble to authenticated;

-- ============================================================
-- scrabble._new_bag — the standard 100-tile English bag
-- ============================================================
-- A flat text[] of lowercase glyphs (`?` = blank ×2). Only the BAG
-- distribution and the LETTER VALUES live SQL-side (mirroring
-- src/scrabble/lib/board.ts): the bag builder uses the distribution, and final
-- scoring (leftover-rack subtraction) needs the values. The premium grid, word
-- extraction and per-word scoring are the FE's job.
create or replace function scrabble._new_bag()
returns text[]
language sql
immutable
as $$
  select array_agg(d.tile)
    from (values
      ('?', 2),
      ('e',12),('a', 9),('i', 9),('o', 8),('n', 6),('r', 6),('t', 6),
      ('l', 4),('s', 4),('u', 4),('d', 4),('g', 3),
      ('b', 2),('c', 2),('m', 2),('p', 2),
      ('f', 2),('h', 2),('v', 2),('w', 2),('y', 2),
      ('k', 1),('j', 1),('x', 1),('q', 1),('z', 1)
    ) as d(tile, cnt),
    lateral generate_series(1, d.cnt) g;
$$;
revoke execute on function scrabble._new_bag() from public;

drop function if exists scrabble._tile_value(text);

-- ============================================================
-- scrabble._tile_value — a tile's points
-- ============================================================
-- The point value of a tile glyph (lowercase, as stored). Blanks (`?`) — and
-- anything non-letter — score 0. Used only for leftover-rack scoring at the
-- end.
create or replace function scrabble._tile_value(p_tile text)
returns int
language sql
immutable
as $$
  select case p_tile
    when 'a' then 1 when 'e' then 1 when 'i' then 1 when 'o' then 1
    when 'u' then 1 when 'l' then 1 when 'n' then 1 when 's' then 1
    when 't' then 1 when 'r' then 1
    when 'd' then 2 when 'g' then 2
    when 'b' then 3 when 'c' then 3 when 'm' then 3 when 'p' then 3
    when 'f' then 4 when 'h' then 4 when 'v' then 4 when 'w' then 4
    when 'y' then 4
    when 'k' then 5
    when 'j' then 8 when 'x' then 8
    when 'q' then 10 when 'z' then 10
    else 0
  end;
$$;
revoke execute on function scrabble._tile_value(text) from public;

-- ============================================================
-- scrabble._remove_tiles — take tiles out of a rack
-- ============================================================
-- Removes one occurrence of each tile in `p_remove` from `p_rack`, raising
-- if a tile isn't there. This is BOTH the "tiles really in the rack"
-- integrity guard AND the consume step — a play whose tiles aren't in the
-- acting rack is rejected here before anything is written.
create or replace function scrabble._remove_tiles(p_rack text[], p_remove text[])
returns text[]
language plpgsql
immutable
as $$
declare
  r   text[] := coalesce(p_rack, '{}');
  t   text;
  pos int;
begin
  foreach t in array p_remove loop
    pos := array_position(r, t);
    if pos is null then
      -- A FAULT wherever it is reached from: every caller sits behind
      -- _commit_word's or _commit_exchange's version gate, so a rack that has
      -- moved would have bumped the version first. Reaching here means the
      -- client staged a tile it does not hold.
      raise exception 'BUG: a tile that is not in the rack'
        using errcode = 'PN442', hint = 'fault', column = '_',
        detail = format('%L is not in the caller''s rack per the server', t);
    end if;
    -- splice element `pos` out (works at either end and down to empty)
    r := r[1:pos-1] || r[pos+1:];
  end loop;
  return r;
end;
$$;
revoke execute on function scrabble._remove_tiles(text[], text[]) from public;

-- The columns a club member may read. The page reads the blobs on
-- common.games and nothing from here; the bag's order and the dictionary
-- bands stay out of the grant. Revoke first: grants are additive, so a column
-- an earlier grant named (the bag) stays readable until it is revoked.
revoke select on scrabble.games from authenticated;
grant select
  (game_id, board, version, team_rack, consecutive_passes)
  on scrabble.games to authenticated;
drop policy if exists games_select on scrabble.games;
create policy games_select on scrabble.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Everything except the hidden `rack` (ai_level is public — the FE marks which
-- players are bots, and at what strength).
grant select (game_id, user_id, score, ai_level) on scrabble.players to authenticated;
drop policy if exists players_select on scrabble.players;
create policy players_select on scrabble.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on scrabble.events to authenticated;
drop policy if exists events_select on scrabble.events;
create policy events_select on scrabble.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- The two views the page read before it read the blobs, and the definer
-- helpers that showed a rack to its owner alone; the seat rule in the page's
-- `useGame` does that now. supabase/sql is re-applied, not diffed.
drop view if exists scrabble.games_state;
drop view if exists scrabble.players_state;
drop function if exists scrabble._bag_count_for(uuid);
drop function if exists scrabble._rack_for(uuid, int);
drop function if exists scrabble._rack_for(uuid, uuid);
drop function if exists scrabble._rack_count_for(uuid, int);
drop function if exists scrabble._rack_count_for(uuid, uuid);
drop function if exists scrabble._seat_of(uuid, uuid);

drop function if exists scrabble._status(uuid);
drop function if exists scrabble._title_for(uuid);

-- ============================================================
-- scrabble._title_for — the club-list title
-- ============================================================
-- The first three words played, uppercased and dash-joined
-- ("CRANE-BOXY-JET") — so a game is recognizable at a glance (the board is
-- public, so no spoiler concern in either mode). The dash is the app-wide
-- separator for a title built from several words. NULL until the first word
-- is played.
create or replace function scrabble._title_for(p_game_id uuid)
returns text
language sql
stable
security definer
set search_path = scrabble, common, public, extensions
as $$
  select string_agg(upper(p.words[1]), '-' order by p.id)
    from (
      select id, words
        from scrabble.events
       where game_id = p_game_id and kind = 'word' and words is not null
       order by id
       limit 3
    ) p;
$$;

revoke execute on function scrabble._title_for(uuid) from public;

drop function if exists scrabble._seat_turn_order(uuid, int);
drop function if exists scrabble._advance_seat(uuid);

-- The statuses this game wrote before the page read the blobs; supabase/sql
-- is re-applied, not diffed.
drop function if exists scrabble._write_statuses(uuid, boolean);

-- ============================================================
-- The page blobs — what scrabble writes onto common.games
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games`
-- after every move (plans/seat-view.md → The page is written, not assembled),
-- in named pieces a reader can follow, each a `_make_json_*` that builds and
-- writes nothing. The common part of each blob is common's
-- (supabase/sql/common.sql → The page blobs' common parts); this is
-- scrabble's part. Every key is always present, null when it has no value.
--
--   game_data, scrabble's part:
--     version                              the move counter every move sends back
--     nBagTiles                            the bag's order never leaves the server
--     board: {letters}                     the one board, shared in both modes:
--                                          225 characters, row-major, "." an
--                                          empty cell, "c" a C tile, "C" a
--                                          blank played as C
--     team: {rack, score, nRackTiles}      the team's one rack and its score,
--                                          the players' sum less the leftovers;
--                                          null in compete
--     events: [event, …]                   every row, every player's, in both modes:
--       id, userId, kind                   word / exchange / pass / leftovers / went_out
--       placements                         a word's, ["x,y:c", …] under the
--                                          board's case rule; null otherwise
--       words, score, nTiles, tookTurn, at
--     players: [player, …]                 the common player, plus:
--       aiLevel                            a bot's strength in this game; null
--                                          for a person
--       score                              own, in every mode
--       rack                               compete: the player's; coop: null,
--                                          the rack is the team's. Every rack
--                                          is in the blob; the page's useGame
--                                          withholds a rival's until the end
--       nRackTiles                         compete; null in coop
--
--   summary_data, scrabble's part:
--     team: {score}                        null in compete
--     nBagTiles
--     winnerIds                            every player ranked first; null in
--                                          coop, or with no winner
--     winnerScore                          the score the winners share; null
--                                          likewise

-- The board as one string: the 225 cells in order, "." when empty, the letter
-- when a tile sits there — uppercase when that tile was a blank.
create or replace function scrabble._make_json_board(p_board jsonb)
returns jsonb
language sql
immutable
set search_path = scrabble, common, public, extensions
as $$
  select jsonb_build_object('letters', string_agg(
           case when jsonb_typeof(c) <> 'object' then '.'
                when (c->>'b')::boolean then upper(c->>'l')
                else c->>'l' end,
           '' order by o))
    from jsonb_array_elements(p_board) with ordinality as x(c, o);
$$;

revoke execute on function scrabble._make_json_board(jsonb) from public;

-- A word play's placements, each the cell and its letter under the board's
-- case rule: "7,7:c", or "7,7:C" for a blank played as C. Null for a row that
-- placed nothing.
create or replace function scrabble._make_json_placements(p_placements jsonb)
returns jsonb
language sql
immutable
set search_path = scrabble, common, public, extensions
as $$
  select case when p_placements is null then null
              else coalesce(jsonb_agg(
                     (p->>'x') || ',' || (p->>'y') || ':'
                     || case when coalesce((p->>'blank')::boolean, false)
                             then upper(p->>'letter') else p->>'letter' end
                     order by o), '[]'::jsonb) end
    from jsonb_array_elements(coalesce(p_placements, '[]'::jsonb)) with ordinality as x(p, o);
$$;

revoke execute on function scrabble._make_json_placements(jsonb) from public;

-- The log: every row, in the order of play.
create or replace function scrabble._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = scrabble, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',         e.id,
           'userId',     e.user_id,
           'kind',       e.kind,
           'placements', scrabble._make_json_placements(e.placements),
           'words',      to_jsonb(e.words),
           'score',      e.score,
           'nTiles',     e.tile_count,
           'tookTurn',   e.took_turn,
           'at',         e.created_at) order by e.id), '[]'::jsonb)
    from scrabble.events e
   where e.game_id = p_game_id;
$$;

revoke execute on function scrabble._make_json_events(uuid) from public;

-- The team's score: the players' sum, less what the rack still held at the
-- end (the `leftovers` row).
create or replace function scrabble._team_score(p_game_id uuid)
returns int
language sql
stable
set search_path = scrabble, common, public, extensions
as $$
  select (select coalesce(sum(p.score), 0) from scrabble.players p where p.game_id = p_game_id)::int
       + (select coalesce(sum(e.score), 0) from scrabble.events e
           where e.game_id = p_game_id and e.kind = 'leftovers')::int;
$$;

revoke execute on function scrabble._team_score(uuid) from public;

-- What the team shares: its one rack and its score. Null in compete, where
-- there is no team (plans/team-facts.md).
create or replace function scrabble._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = scrabble, common, public, extensions
as $$
  select case when cg.mode = 'coop' then jsonb_build_object(
           'rack',       to_jsonb(g.team_rack),
           'score',      scrabble._team_score(p_game_id),
           'nRackTiles', coalesce(cardinality(g.team_rack), 0)) end
    from scrabble.games g
    join common.games cg on cg.id = g.game_id
   where g.game_id = p_game_id;
$$;

revoke execute on function scrabble._make_json_team(uuid) from public;

-- Every player as scrabble's game_data shows them: the common player, with
-- their own score, a bot's level, and in compete their rack and its count.
create or replace function scrabble._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = scrabble, common, public, extensions
as $$
  select jsonb_agg(
           cp.player || jsonb_build_object(
             'aiLevel',    sp.ai_level,
             'score',      sp.score,
             'rack',       case when cg.mode = 'compete' then to_jsonb(sp.rack) end,
             'nRackTiles', case when cg.mode = 'compete' then coalesce(cardinality(sp.rack), 0) end)
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join scrabble.players sp on sp.game_id = p_game_id and sp.user_id = cp.id
    join common.games cg on cg.id = p_game_id;
$$;

revoke execute on function scrabble._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with scrabble's version, bag
-- count, board, team, log and players on top.
create or replace function scrabble._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = scrabble, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'version',   g.version,
           'nBagTiles', coalesce(cardinality(g.bag), 0),
           'board',     scrabble._make_json_board(g.board),
           'team',      scrabble._make_json_team(p_game_id),
           'events',    scrabble._make_json_events(p_game_id),
           'players',   scrabble._make_json_players(p_game_id))
    from scrabble.games g
   where g.game_id = p_game_id;
$$;

revoke execute on function scrabble._make_json_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one.
create or replace function scrabble._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = scrabble, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'team',        case when cg.mode = 'coop'
                        then jsonb_build_object('score', scrabble._team_score(p_game_id)) end,
    'nBagTiles',   coalesce(cardinality(g.bag), 0),
    'winnerIds',   (select jsonb_agg(gp.user_id order by gp.turn_seat, gp.user_id)
                      from common.game_players gp
                     where gp.game_id = p_game_id
                       and cg.mode = 'compete'
                       and gp.final_ranking = 1),
    'winnerScore', (select max(sp.score)
                      from scrabble.players sp
                      join common.game_players gp
                        on gp.game_id = sp.game_id and gp.user_id = sp.user_id
                     where sp.game_id = p_game_id
                       and cg.mode = 'compete'
                       and gp.final_ranking = 1))
    from scrabble.games g
    join common.games cg on cg.id = g.game_id
   where g.game_id = p_game_id;
$$;

revoke execute on function scrabble._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- scrabble._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from scrabble's own tables,
-- assigning each whole. Every RPC calls it after a move; it is also the
-- repair for one game by hand. The shapes are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function scrabble._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = scrabble._make_json_game_data(p_game_id),
         summary_data = scrabble._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function scrabble._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- scrabble._rebuild_data_cols_for_all — every scrabble game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_rebuild_data_cols` over every scrabble game without re-dating any, and
-- answers how many it rewrote. Run by hand as postgres (`gmake db-psql`); no
-- client calls it, so it has no grant and wears the `_`.
create or replace function scrabble._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('scrabble_coop', 'scrabble_compete')
  loop
    perform scrabble._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function scrabble._rebuild_data_cols_for_all() from public;

drop function if exists scrabble._score_leftovers(uuid, uuid);

-- ============================================================
-- scrabble._score_leftovers — final scoring, as rows and on the scores
-- ============================================================
-- Every rack's leftover tiles are subtracted, and each subtraction is a
-- `leftovers` row: in coop one row for the team's rack, in compete one per
-- player, taken off their score. In compete the player who went out
-- (`p_going_out_user_id`, null when nobody did) collects everyone's leftovers
-- as a `went_out` row — their own rack is empty, so it is the opponents'.
-- Going out earns that bonus; it isn't the win, which is the top score after
-- it. Neither row took a turn: the ending wrote them. The coop row's author is
-- whose act ended the game (`p_ended_by_user_id`), or the client that reported
-- the clock when the turn covered nobody.
create or replace function scrabble._score_leftovers(
  p_game_id           uuid,
  p_going_out_user_id uuid,
  p_ended_by_user_id  uuid
)
returns void
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  g            scrabble.games%rowtype;
  v_left       int;
  v_total_left int := 0;
  r            record;
begin
  select * into g from scrabble.games where game_id = p_game_id;

  if (select mode from common.games where id = p_game_id) = 'coop' then
    v_left := coalesce((select sum(scrabble._tile_value(t)) from unnest(g.team_rack) t), 0);
    if v_left > 0 then
      insert into scrabble.events (game_id, user_id, kind, score, tile_count, took_turn)
      values (p_game_id, coalesce(p_ended_by_user_id, auth.uid()), 'leftovers',
              -v_left, cardinality(g.team_rack), false);
    end if;
    return;
  end if;

  for r in select p.user_id, p.rack,
                  coalesce((select sum(scrabble._tile_value(t)) from unnest(p.rack) t), 0) as left_value
             from scrabble.players p
            where p.game_id = p_game_id
  loop
    if r.left_value > 0 then
      insert into scrabble.events (game_id, user_id, kind, score, tile_count, took_turn)
      values (p_game_id, r.user_id, 'leftovers', -r.left_value, cardinality(r.rack), false);
      update scrabble.players set score = score - r.left_value
       where game_id = p_game_id and user_id = r.user_id;
      v_total_left := v_total_left + r.left_value;
    end if;
  end loop;

  if p_going_out_user_id is not null and v_total_left > 0 then
    insert into scrabble.events (game_id, user_id, kind, score, took_turn)
    values (p_game_id, p_going_out_user_id, 'went_out', v_total_left, false);
    update scrabble.players set score = score + v_total_left
     where game_id = p_game_id and user_id = p_going_out_user_id;
  end if;
end;
$$;
revoke execute on function scrabble._score_leftovers(uuid, uuid, uuid) from public;

drop function if exists scrabble._finish(uuid, text, int);

-- ============================================================
-- scrabble._finish — final scoring, then the ending
-- ============================================================
-- The endings scrabble decides for itself, after `_score_leftovers`
-- (`p_going_out_user_id` goes out with the bag empty, or null). Rankings
-- (docs/win-lose.md):
--
--   coop, resource_exhausted / complete   the bag played out: the team,
--                                         every player ranked 1
--   coop, timeout                         nobody ranked — the one way a coop
--                                         table loses
--   compete, any                          by final score among the players
--                                         who didn't concede, ties sharing a
--                                         rank; a bot can win, and when every
--                                         person has conceded the bots are
--                                         all that is ranked
--
-- A Stop is common._stop's (stop_game scores coop's leftovers first).
-- `p_ended_by_user_id` is whose act ended it.
create or replace function scrabble._finish(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_going_out_user_id uuid,
  p_ended_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_rankings jsonb := '{}'::jsonb;
begin
  perform scrabble._score_leftovers(p_game_id, p_going_out_user_id, p_ended_by_user_id);

  if (select mode from common.games where id = p_game_id) = 'coop' then
    if p_reason_detail = 'complete' then
      select jsonb_object_agg(user_id::text, 1) into v_rankings
        from common.game_players where game_id = p_game_id;
    end if;
  else
    select coalesce(jsonb_object_agg(user_id::text, ranking), '{}'::jsonb)
      into v_rankings
      from (
        select p.user_id, rank() over (order by p.score desc) as ranking
          from scrabble.players p
          join common.game_players gp
            on gp.game_id = p.game_id and gp.user_id = p.user_id
         where p.game_id = p_game_id
           and gp.player_ended_reason is distinct from 'conceded'
      ) ranked;
  end if;

  perform common._end_game(
    p_game_id, p_reason, p_reason_detail, p_ended_by_user_id,
    p_is_no_result => false,
    p_final_rankings => v_rankings
  );
end;
$$;
revoke execute on function scrabble._finish(uuid, text, text, uuid, uuid) from public;

drop function if exists scrabble.create_game(text, jsonb, uuid[], text);

-- ============================================================
-- scrabble.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)
-- ============================================================
-- Setup shape (server validates):
--   { "dict_2": 1..6 (default 3), "dict_3plus": 1..6 (default 3),
--     "ai_count": 0..3, "ai_level": beginner | casual | intermediate |
--       strong | best (compete only),
--     "coop_style": 'free' | 'turns', "first_turn_user_id": uuid,
--     "timer": (none | countup | countdown{seconds}) }
-- Builds + shuffles the 100-tile bag, deals 7-tile racks (per player in
-- compete, one coop rack), seats the bots after the people and picks a
-- random first player (compete), and seeds an empty board.
create or replace function scrabble.create_game(
  p_club_handle     text,
  p_setup           jsonb,
  p_player_user_ids uuid[],
  p_mode            text
)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  new_id        uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  s_dict_2      int;
  s_dict_3plus  int;
  v_bag         text[];
  v_empty_board jsonb;
  uid           uuid;
  v_drawn       text[];
  v_ai_count    int;
  v_ai_level    text;
  v_ai_band     int;
  v_total       int;
  v_bot_ids     uuid[] := array[]::uuid[];
  first_turn    uuid;
begin
  perform common._require_club_member(p_club_handle);
  -- Up to 4 players; compete needs at least 2 (a 1-player race is degenerate).
  perform common._require_player_count_max(p_player_user_ids, 4);
  if array_length(p_player_user_ids, 1) is null then
    raise exception 'BUG: game with no players'
      using errcode = 'PN077', hint = 'fault', column = '_',
      detail = 'player_user_ids was empty';
  end if;

  perform common._require_valid_mode(p_mode);

  s_dict_2     := coalesce((p_setup->>'dict_2')::int, 3);
  s_dict_3plus := coalesce((p_setup->>'dict_3plus')::int, 3);
  if s_dict_2 < 1 or s_dict_2 > 6 then
    raise exception 'BUG: 2-letter dictionary of %', s_dict_2
      using errcode = 'PN078', hint = 'fault', column = '_',
      detail = 'setup.dict_2 must be 1..6';
  end if;
  if s_dict_3plus < 1 or s_dict_3plus > 6 then
    raise exception 'BUG: longer-word dictionary of %', s_dict_3plus
      using errcode = 'PN079', hint = 'fault', column = '_',
      detail = 'setup.dict_3plus must be 1..6';
  end if;

  -- AI players (compete only; docs/games/scrabble.md). 0..3 bots, all at the
  -- single `ai_level`, seated AFTER the people. `ai_level` is the seat's
  -- strength for this game; who sits there is a bot account, picked below.
  v_ai_count := coalesce((p_setup->>'ai_count')::int, 0);
  if v_ai_count < 0 or v_ai_count > 3 then
    raise exception 'BUG: AI count of %', v_ai_count
      using errcode = 'PN080', hint = 'fault', column = '_',
      detail = 'setup.ai_count must be 0..3';
  end if;
  if v_ai_count > 0 and p_mode <> 'compete' then
    raise exception 'BUG: AI opponent in a co-op game'
      using errcode = 'PN081', hint = 'fault', column = '_',
      detail = 'AI opponents seat only in compete';
  end if;
  if v_ai_count > 0 then
    v_ai_level := p_setup->>'ai_level';
    -- The AI band is the level's vocabCap (policy.ts LEVELS): beginner 1,
    -- casual 2, intermediate 4, strong/best full (6).
    v_ai_band := case v_ai_level
                   when 'beginner' then 1 when 'casual' then 2
                   when 'intermediate' then 4 when 'strong' then 6 when 'best' then 6
                   else null end;
    if v_ai_band is null then
      raise exception 'BUG: AI skill of ''%''', coalesce(v_ai_level, '(null)')
      using errcode = 'PN082', hint = 'fault', column = '_',
      detail = 'ai_level is not one of the known levels';
    end if;
    -- The game's dictionary must be at least as wide as the AI knows, else it
    -- can't play at its tuned strength (docs/games/scrabble.md band rule).
    if s_dict_2 < v_ai_band or s_dict_3plus < v_ai_band then
      -- A CROSS-FIELD rule the form already gates on (validateScrabbleSetup
      -- blocks Start), so reaching it means something other than the form sent
      -- the setup.
      raise exception 'BUG: % AI with the dictionary below band %',
        v_ai_level, v_ai_band
      using errcode = 'PN083', hint = 'fault', column = '_',
      detail = 'the dictionary bands must reach the AI''s band';
    end if;
  end if;

  -- Player counts: >=1 person always (the empty-array guard above); the
  -- TOTAL (people + bots) is 2..4 in compete.
  v_total := array_length(p_player_user_ids, 1) + v_ai_count;
  if p_mode = 'compete' and v_total < 2 then
    raise exception 'BUG: race with fewer than two seats'
      using errcode = 'PN084', hint = 'fault', column = '_',
      detail = 'compete needs >= 2 seats including AI';
  end if;
  if v_total > 4 then
    raise exception 'BUG: game with % seats', v_total
      using errcode = 'PN085', hint = 'fault', column = '_',
      detail = 'scrabble seats at most 4';
  end if;

  -- Which bots take the AI seats: the first `v_ai_count` by username, which is
  -- what the setup form's "how many opponents" means. They are ordinary
  -- accounts (common.profiles.ai_member), so they are listed as players below
  -- and reach common.game_players like anyone.
  if v_ai_count > 0 then
    select coalesce(array_agg(p.user_id order by p.username), array[]::uuid[])
      into v_bot_ids
      from (select user_id, username from common.profiles
             where ai_member order by username limit v_ai_count) p;
    if coalesce(array_length(v_bot_ids, 1), 0) < v_ai_count then
      -- Provisioning, not gameplay: the bots are made once per environment by
      -- `gmake db-bots`, and a database that never had it run has no seats to
      -- offer. Nothing the player can fix from the form.
      raise exception 'BUG: % AI opponents asked for, % exist', v_ai_count,
        coalesce(array_length(v_bot_ids, 1), 0)
      using errcode = 'PN496', hint = 'fault', column = '_',
      detail = 'common.profiles has fewer ai_member rows than the setup asked to seat';
    end if;
  end if;

  perform common._require_valid_timer(p_setup->'timer');

  -- Shuffle the bag (the only per-game randomness).
  select array_agg(t order by random()) into v_bag
    from unnest(scrabble._new_bag()) t;

  -- An empty board: 225 JSON nulls.
  select jsonb_agg(null::jsonb) into v_empty_board from generate_series(1, 225);

  -- The bots ride in the player list: they hold a seat, they can win, and
  -- common._end_game writes a result for every game_players row. They are
  -- exempt from that function's club-membership gate — a bot is in no
  -- human's club by design. The saved default strips first_turn_user_id
  -- (a per-game "who goes first" pick; coop_style rides).
  new_id := common._create_game(
    p_club_handle, 'scrabble_' || p_mode, p_mode, p_player_user_ids || v_bot_ids,
    'New game', p_setup, p_setup - 'first_turn_user_id');

  if p_mode = 'compete' then
    insert into scrabble.games (game_id, dict_2, dict_3plus, board, bag)
    values (new_id, s_dict_2, s_dict_3plus, v_empty_board, v_bag);

    -- Deal 7 tiles to each person, then to each bot, threading the bag down.
    -- A bot's row carries this game's strength setting, not the bot's.
    foreach uid in array p_player_user_ids || v_bot_ids loop
      v_drawn := v_bag[1:7];
      v_bag   := v_bag[8:];
      insert into scrabble.players (game_id, user_id, score, rack, ai_level)
      values (new_id, uid, 0, v_drawn,
              case when uid = any(v_bot_ids) then v_ai_level end);
    end loop;
    update scrabble.games gm set bag = v_bag where gm.game_id = new_id;

    -- The turn order walks the people, then the bots — the order the opponent
    -- strip draws — and any of them, a bot included, may open.
    update common.game_players gp
       set turn_seat = o.pos - 1
      from unnest(p_player_user_ids || v_bot_ids) with ordinality as o(user_id, pos)
     where gp.game_id = new_id and gp.user_id = o.user_id;
    update common.games
       set current_turn_user_id = (p_player_user_ids || v_bot_ids)[1 + floor(random() * v_total)::int]
     where id = new_id;
  else
    -- Coop: one rack, on the game row; each player's score is their own.
    v_drawn := v_bag[1:7];
    v_bag   := v_bag[8:];
    insert into scrabble.games (game_id, dict_2, dict_3plus, board, bag, team_rack)
    values (new_id, s_dict_2, s_dict_3plus, v_empty_board, v_bag, v_drawn);

    insert into scrabble.players (game_id, user_id, score)
    select new_id, u, 0 from unnest(p_player_user_ids) u;

    -- Opt-in turn-by-turn coop: when setup.coop_style='turns', seat the COMMON
    -- rotation so _commit_word / _commit_exchange gate the coop-rack moves.
    -- Free-for-all coop leaves the pointer null.
    if p_setup->>'coop_style' = 'turns' then
      first_turn := (p_setup->>'first_turn_user_id')::uuid;
      if first_turn is null or not (first_turn = any(p_player_user_ids)) then
        raise exception 'BUG: first player who is not in the game'
          using errcode = 'PN086', hint = 'fault', column = '_',
      detail = 'setup.first_turn_user_id must be one of the players';
      end if;
      perform common._assign_turn_order(new_id, first_turn);
    end if;
  end if;

  perform scrabble._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. It is the only thing a
  -- call site can filter the `ok` on — without it the branch would match by
  -- merely being `ok` and would draw a second answer as this one.
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

revoke execute on function scrabble.create_game(text, jsonb, uuid[], text) from public;
grant execute on function scrabble.create_game(text, jsonb, uuid[], text) to authenticated;

drop function if exists scrabble._require_move(uuid, int);

-- ============================================================
-- scrabble._require_move — the gate every move core shares
-- ============================================================
-- Locks the game row, then refuses a move into a game deleted since the
-- wrapper asked (only a delete between the two can do that), an ended one,
-- or one built on a board that has moved on (`p_base_version`). Returns the
-- locked row.
--
-- The version gate is THE race, and it decides the rest: somebody else's
-- committed move bumped `version` between this client reading it and this
-- call arriving — in coop any teammate's, in compete the opponent's or a
-- bot's. Nothing was validated and nothing is written: the move was built on
-- a board that no longer exists. It is also why every check after it but the
-- turn is a fault: any state a later check could disagree with — the rack,
-- the bag, the board — would have bumped `version` on its way, so reaching
-- one with a version that MATCHES means this client's own state is wrong.
-- The turn is the exception: it lives on common.games and reaches the client
-- on its own subscription. The ending is checked first for the same reason —
-- a teammate ending the game does NOT bump `version`.
--
-- `p_race_code` is the calling move's own code for the version race, so each
-- move's refusal names the move.
create or replace function scrabble._require_move(
  p_game_id uuid, p_base_version int, p_race_code text
)
returns scrabble.games
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  g scrabble.games%rowtype;
begin
  select * into g from scrabble.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('scrabble');
  end if;

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  if g.version <> p_base_version then
    raise exception 'Board changed'
      using errcode = p_race_code, hint = 'race', column = '_',
      detail = format('the board is at version %s, this move was built on %s',
                      g.version, p_base_version);
  end if;

  return g;
end;
$$;
revoke execute on function scrabble._require_move(uuid, int, text) from public;

drop function if exists scrabble._commit_word(uuid, int, int, jsonb, text[], int);

-- ============================================================
-- scrabble._commit_word — the core WORD move (a trusting commit)
-- ============================================================
-- The heart of a word play, shared by the person's RPC (play_word) and the
-- bot's (ai_play_word) — the caller authorizes the actor and passes the
-- acting player `p_user_id`; this does the move. The FE (or the AI edge
-- function) validated the geometry and computed `p_words` and `p_score`
-- (lib/play.ts). The server: version gate → turn check → integrity guards →
-- dictionary check (the only validation it does) → apply + draw + score +
-- log + advance + end check.
--
-- Answers, and the page's lib/answer.ts says what each is worth:
--   { result:'invalid', bad_words }    -- a word fails the band (free reject)
--   { result:'accepted', drawn }       -- played; `drawn` is the tiles it drew
--
-- Every letter arrives lowercase, as it is stored and as the page holds it.
create or replace function scrabble._commit_word(
  p_game_id      uuid,
  p_user_id      uuid,
  p_base_version int,
  p_placements   jsonb,
  p_words        text[],
  p_score        int
)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  g            scrabble.games%rowtype;
  v_mode       text;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  v_rack       text[];   -- the acting rack (compete: the player's; coop: coop_rack)
  v_board      jsonb;
  v_consumed   text[] := '{}';
  v_nplay      int := 0;
  rec          jsonb;
  v_x int; v_y int; v_letter text; v_blank boolean; v_idx int;
  bad_words    text[];
  v_ndraw      int;
  v_drawn      text[];
  v_new_rack   text[];
begin
  g := scrabble._require_move(p_game_id, p_base_version, 'PN437');
  select mode into v_mode from common.games where id = p_game_id;

  -- The common turn pointer: compete always, coop when it was set up turn by
  -- turn (a no-op for free-for-all coop).
  perform common._require_turn(p_game_id, p_user_id);

  if coalesce(array_length(p_words, 1), 0) = 0 then
    -- Every check from here down is a FAULT (see _require_move).
    -- `evaluatePlay` also refuses each of these locally, in the player's own
    -- words, before the call is ever made.
    raise exception 'BUG: a play forming no word'
      using errcode = 'PN439', hint = 'fault', column = '_',
      detail = 'a play must form at least one word';
  end if;

  v_rack  := case when v_mode = 'coop' then g.team_rack
                  else (select rack from scrabble.players
                         where game_id = p_game_id and user_id = p_user_id) end;
  v_board := g.board;

  -- ─── Integrity guards: apply placements to a LOCAL board ──
  -- (in-bounds, on an empty cell, no two on the same cell) and
  -- collect the consumed tile glyphs. Nothing is persisted yet.
  for rec in select jsonb_array_elements(p_placements) loop
    v_x := (rec->>'x')::int;
    v_y := (rec->>'y')::int;
    v_letter := rec->>'letter';
    v_blank  := coalesce((rec->>'blank')::boolean, false);
    if v_x < 0 or v_x > 14 or v_y < 0 or v_y > 14 then
      raise exception 'BUG: a tile off the board'
        using errcode = 'PN440', hint = 'fault', column = '_',
        detail = 'a placement falls outside the 15x15 grid';
    end if;
    v_idx := v_y * 15 + v_x;
    if jsonb_typeof(v_board -> v_idx) = 'object' then
      raise exception 'BUG: a tile on an occupied square'
        using errcode = 'PN441', hint = 'fault', column = '_',
        detail = format('a tile already sits on cell %s', v_idx);
    end if;
    v_consumed := v_consumed || (case when v_blank then '?' else v_letter end);
    v_board := jsonb_set(v_board, array[v_idx::text],
                         jsonb_build_object('l', v_letter, 'b', v_blank));
    v_nplay := v_nplay + 1;
  end loop;

  -- Consume the tiles from the rack (raises if any aren't there).
  v_rack := scrabble._remove_tiles(v_rack, v_consumed);

  -- ─── Dictionary check (the only server-side validation) ──
  -- Legal iff difficulty <= the band for the word's LENGTH (dict_2 for
  -- 2-letter words, dict_3plus for 3+) AND valid in american OR british
  -- (permissive).
  select array_agg(w) into bad_words
    from unnest(p_words) w
   where not exists (
     select 1 from common.words cw
      where cw.word = w
        and cw.difficulty <= (case when length(w) = 2 then g.dict_2 else g.dict_3plus end)
        and (cw.american or cw.british)
   );
  if array_length(bad_words, 1) > 0 then
    -- Free reject: nothing written, no version bump, no log. An `ok`, because
    -- the dictionary is the ONLY validation the client cannot do — asking is
    -- what the move was for, and this is the answer.
    return common._ok_envelope(
      jsonb_build_object('result', 'invalid', 'bad_words', to_jsonb(bad_words)));
  end if;

  -- ─── Commit ──────────────────────────────────────────────
  -- Draw replacements from the bag (server-owned randomness).
  v_ndraw := least(v_nplay, coalesce(array_length(g.bag, 1), 0));
  v_drawn := g.bag[1:v_ndraw];
  v_new_rack := v_rack || v_drawn;

  insert into scrabble.events (game_id, user_id, kind, placements, words, score, took_turn)
  values (p_game_id, p_user_id, 'word', p_placements, p_words, p_score, true);

  update scrabble.games
     set board = v_board,
         bag = g.bag[v_ndraw+1:],
         team_rack = case when v_mode = 'coop' then v_new_rack else team_rack end,
         version = version + 1,
         consecutive_passes = 0
   where game_id = p_game_id;
  -- The score is the player's own in both modes; the rack is theirs in compete.
  update scrabble.players
     set rack = case when v_mode = 'compete' then v_new_rack else rack end,
         score = score + p_score
   where game_id = p_game_id and user_id = p_user_id;

  -- Title = the first three words played (recognizable in the club list).
  update common.games gm
     set title = coalesce(scrabble._title_for(p_game_id), gm.title)
   where gm.id = p_game_id;

  -- ─── End check: going out (bag empty AND acting rack empty) ──
  if coalesce(array_length(g.bag, 1), 0) = v_ndraw
     and coalesce(array_length(v_new_rack, 1), 0) = 0 then
    perform scrabble._finish(
      p_game_id, 'resource_exhausted', 'complete',
      case when v_mode = 'compete' then p_user_id end, p_user_id);
  else
    -- Hand the turn on (a no-op for free-for-all coop).
    perform common._advance_turn(p_game_id);
  end if;

  perform scrabble._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(
    jsonb_build_object(
      'result', 'accepted',
      'drawn', to_jsonb(v_drawn)));

-- The wrappers each carry their OWN copy of this block, and must: a
-- wrapper's player gate raises BEFORE it delegates, so this block never
-- sees it.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function scrabble._commit_word(uuid, uuid, int, jsonb, text[], int) from public;

drop function if exists scrabble._require_person(uuid, text);

-- ============================================================
-- scrabble._require_person / _require_bot — who a move is for
-- ============================================================
-- A person's move is the caller's own: a deleted game is asked first (the
-- delete takes the memberships with it — docs/envelopes.md → a missing game
-- row is PN485), then the caller must be seated. A bot's move may be driven
-- by any member of the game (trust model — a person at the table pokes the
-- bot along), and `p_user_id` must be one of this game's bots. Each raises
-- with the calling move's own code (`p_code`); both return the acting player.
create or replace function scrabble._require_person(p_game_id uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  caller_id uuid;
begin
  if not exists (select 1 from scrabble.games where game_id = p_game_id) then
    perform common._raise_game_deleted('scrabble');
  end if;
  caller_id := common._require_game_player(p_game_id);
  if not exists (select 1 from scrabble.players
                  where game_id = p_game_id and user_id = caller_id) then
    -- create_game seats every player, so a member without a row is a broken
    -- client.
    raise exception 'BUG: a move from a player with no seat'
      using errcode = p_code, hint = 'fault', column = '_',
      detail = 'no scrabble.players row for the caller';
  end if;
  return caller_id;
end;
$$;
revoke execute on function scrabble._require_person(uuid, text) from public;

drop function if exists scrabble._require_bot(uuid, uuid, text);

create or replace function scrabble._require_bot(p_game_id uuid, p_user_id uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
begin
  if not exists (select 1 from scrabble.games where game_id = p_game_id) then
    perform common._raise_game_deleted('scrabble');
  end if;
  perform common._require_game_player(p_game_id);
  if not exists (select 1 from scrabble.players
                  where game_id = p_game_id and user_id = p_user_id
                    and ai_level is not null) then
    raise exception 'BUG: an AI move for a player who is not a bot'
      using errcode = p_code, hint = 'fault', column = '_',
      detail = format('%s is not one of this game''s bots', p_user_id);
  end if;
  return p_user_id;
end;
$$;
revoke execute on function scrabble._require_bot(uuid, uuid, text) from public;

drop function if exists scrabble.play_word(uuid, int, jsonb, text[], int);

-- ============================================================
-- scrabble.play_word / ai_play_word — a word, the person's or a bot's
-- ============================================================
-- Authorize the actor, then delegate to `_commit_word` (the contract is
-- documented there). The bot's twin is driven by the scrabble-ai-move edge
-- function, which computes the words and score with the same lib the FE
-- uses, so the trusting-commit core validates them identically; the core's
-- turn check (the bot holds the turn pointer) prevents playing out of turn.
create or replace function scrabble.play_word(
  p_game_id      uuid,
  p_base_version int,
  p_placements   jsonb,
  p_words        text[],
  p_score        int
)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  return scrabble._commit_word(p_game_id, scrabble._require_person(p_game_id, 'PN443'),
                               p_base_version, p_placements, p_words, p_score);
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function scrabble.play_word(uuid, int, jsonb, text[], int) from public;
grant execute on function scrabble.play_word(uuid, int, jsonb, text[], int) to authenticated;

drop function if exists scrabble.ai_play_word(uuid, int, int, jsonb, text[], int);

create or replace function scrabble.ai_play_word(
  p_game_id      uuid,
  p_user_id      uuid,
  p_base_version int,
  p_placements   jsonb,
  p_words        text[],
  p_score        int
)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  return scrabble._commit_word(p_game_id, scrabble._require_bot(p_game_id, p_user_id, 'PN444'),
                               p_base_version, p_placements, p_words, p_score);
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function scrabble.ai_play_word(uuid, uuid, int, jsonb, text[], int) from public;
grant execute on function scrabble.ai_play_word(uuid, uuid, int, jsonb, text[], int) to authenticated;

drop function if exists scrabble._commit_exchange(uuid, int, int, text[]);

-- ============================================================
-- scrabble._commit_exchange — swap rack tiles back into the bag
-- ============================================================
-- Returns `p_rack_tiles` (glyphs; `?` for a blank) to the bag, reshuffles,
-- and redraws the same count. Requires the bag to hold ≥ 7 tiles (standard
-- rule). Compete: costs the turn and CLEARS the pass streak — swapping tiles
-- is a real attempt to get unstuck, not a refusal to move, and since it needs
-- 7+ tiles in the bag it can't stall the endgame, where blocked ends happen.
-- Coop: a rack refresh (and a turn, in turn-by-turn coop). The core shared
-- by exchange_tiles (a person) and ai_exchange_tiles (a bot).
--
-- The page's lib/answer.ts says what the row this wrote is worth. Answers
-- `{ result:'exchanged', drawn }`, the tiles it drew.
create or replace function scrabble._commit_exchange(
  p_game_id      uuid,
  p_user_id      uuid,
  p_base_version int,
  p_rack_tiles   text[]
)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  g          scrabble.games%rowtype;
  v_mode     text;
  v_rack     text[];
  v_bag      text[];
  v_n        int;
  v_drawn    text[];
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  g := scrabble._require_move(p_game_id, p_base_version, 'PN447');
  select mode into v_mode from common.games where id = p_game_id;
  -- The common turn pointer; a no-op for free-for-all coop.
  perform common._require_turn(p_game_id, p_user_id);

  v_n := coalesce(array_length(p_rack_tiles, 1), 0);
  if v_n = 0 then
    raise exception 'BUG: a swap of no tiles'
      using errcode = 'PN449', hint = 'fault', column = '_',
      detail = 'an exchange needs at least one tile';
  end if;
  if coalesce(array_length(g.bag, 1), 0) < 7 then
    raise exception 'BUG: a swap against a bag under seven'
      using errcode = 'PN450', hint = 'fault', column = '_',
      detail = 'the bag holds fewer tiles than the exchange asks for';
  end if;

  v_rack := case when v_mode = 'coop' then g.team_rack
                 else (select rack from scrabble.players
                        where game_id = p_game_id and user_id = p_user_id) end;

  -- Remove the chosen tiles (guards they're in the rack), return them to
  -- the bag, reshuffle the whole bag, redraw the same count.
  v_rack := scrabble._remove_tiles(v_rack, p_rack_tiles);
  select array_agg(t order by random()) into v_bag
    from unnest(g.bag || p_rack_tiles) t;
  v_drawn := v_bag[1:v_n];
  v_bag   := v_bag[v_n+1:];
  v_rack  := v_rack || v_drawn;

  insert into scrabble.events (game_id, user_id, kind, tile_count, took_turn)
  values (p_game_id, p_user_id, 'exchange', v_n, true);

  update scrabble.games
     set bag = v_bag, version = version + 1,
         team_rack = case when v_mode = 'coop' then v_rack else team_rack end,
         consecutive_passes = 0
   where game_id = p_game_id;
  if v_mode = 'compete' then
    update scrabble.players set rack = v_rack
     where game_id = p_game_id and user_id = p_user_id;
  end if;
  -- An exchange consumes the turn and never ends the game, so the turn always
  -- moves on (a no-op for free-for-all coop).
  perform common._advance_turn(p_game_id);

  perform scrabble._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(
    jsonb_build_object('result', 'exchanged', 'drawn', to_jsonb(v_drawn)));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function scrabble._commit_exchange(uuid, uuid, int, text[]) from public;

drop function if exists scrabble.exchange_tiles(uuid, int, text[]);

-- ============================================================
-- scrabble.exchange_tiles / ai_exchange_tiles — a swap, the person's or a bot's
-- ============================================================
-- Authorize the actor, then delegate to `_commit_exchange`.
create or replace function scrabble.exchange_tiles(
  p_game_id uuid, p_base_version int, p_rack_tiles text[]
)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  return scrabble._commit_exchange(p_game_id, scrabble._require_person(p_game_id, 'PN451'),
                                   p_base_version, p_rack_tiles);
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function scrabble.exchange_tiles(uuid, int, text[]) from public;
grant execute on function scrabble.exchange_tiles(uuid, int, text[]) to authenticated;

drop function if exists scrabble.ai_exchange_tiles(uuid, int, int, text[]);

create or replace function scrabble.ai_exchange_tiles(
  p_game_id uuid, p_user_id uuid, p_base_version int, p_rack_tiles text[]
)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  return scrabble._commit_exchange(p_game_id, scrabble._require_bot(p_game_id, p_user_id, 'PN452'),
                                   p_base_version, p_rack_tiles);
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function scrabble.ai_exchange_tiles(uuid, uuid, int, text[]) from public;
grant execute on function scrabble.ai_exchange_tiles(uuid, uuid, int, text[]) to authenticated;

drop function if exists scrabble._commit_pass(uuid, int, int);

-- ============================================================
-- scrabble._commit_pass — forfeit a turn (compete only)
-- ============================================================
-- Coop has no turns to pass in free-for-all, and the coop "we're stuck" path
-- is exchange or Stop. Feeds the consecutive-pass streak that ends a blocked
-- game: once EVERY player still in has passed in a row, it ends all_passed /
-- blocked, the last passer as who ended it. That is the casual house rule —
-- tournament Scrabble wants six scoreless turns; here, once the table has been
-- round once with nobody willing to play, it's over. The threshold is the
-- players still in, so it tracks drop-outs (common._advance_turn skips a
-- player who has ended, so their turn could never contribute a pass). A bot
-- passes like anyone else, and never concedes. The core shared by pass_turn
-- (a person) and ai_pass_turn (a bot).
create or replace function scrabble._commit_pass(p_game_id uuid, p_user_id uuid, p_base_version int)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  g          scrabble.games%rowtype;
  v_active   int;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  g := scrabble._require_move(p_game_id, p_base_version, 'PN456');
  if (select mode from common.games where id = p_game_id) <> 'compete' then
    -- A fault because the FE renders PassButton in compete only, so nothing
    -- unbroken asks. NOT because the rule is settled: scrabble supports opt-in
    -- turn-by-turn coop, where there IS a turn to pass. See
    -- docs/games/scrabble.md → Deferred.
    raise exception 'BUG: a pass in a coop game'
      using errcode = 'PN454', hint = 'fault', column = '_',
      detail = 'pass_turn is compete-only today';
  end if;
  perform common._require_turn(p_game_id, p_user_id);

  insert into scrabble.events (game_id, user_id, kind, took_turn)
  values (p_game_id, p_user_id, 'pass', true);

  update scrabble.games
     set version = version + 1,
         consecutive_passes = consecutive_passes + 1
   where game_id = p_game_id;

  select count(*) into v_active
    from common.game_players gp
   where gp.game_id = p_game_id and gp.player_ended_at is null;

  if g.consecutive_passes + 1 >= v_active then
    perform scrabble._finish(p_game_id, 'all_passed', 'blocked', null, p_user_id);
  else
    perform common._advance_turn(p_game_id);
  end if;

  perform scrabble._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(
    jsonb_build_object('result', 'passed'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function scrabble._commit_pass(uuid, uuid, int) from public;

drop function if exists scrabble.pass_turn(uuid, int);

-- ============================================================
-- scrabble.pass_turn / ai_pass_turn — a pass, the person's or a bot's
-- ============================================================
-- Authorize the actor, then delegate to `_commit_pass`.
create or replace function scrabble.pass_turn(p_game_id uuid, p_base_version int)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  return scrabble._commit_pass(p_game_id, scrabble._require_person(p_game_id, 'PN458'),
                               p_base_version);
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function scrabble.pass_turn(uuid, int) from public;
grant execute on function scrabble.pass_turn(uuid, int) to authenticated;

drop function if exists scrabble.ai_pass_turn(uuid, int, int);

create or replace function scrabble.ai_pass_turn(p_game_id uuid, p_user_id uuid, p_base_version int)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  return scrabble._commit_pass(p_game_id, scrabble._require_bot(p_game_id, p_user_id, 'PN459'),
                               p_base_version);
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function scrabble.ai_pass_turn(uuid, uuid, int) from public;
grant execute on function scrabble.ai_pass_turn(uuid, uuid, int) to authenticated;

drop function if exists scrabble._maybe_finish_compete(uuid);

-- ============================================================
-- scrabble._maybe_finish_compete — nobody left racing?
-- ============================================================
-- The check the elimination games share by name (connections / waffle /
-- wordle / strands); scrabble's one caller is concede, since a move ends a
-- game by going out or by the pass streak, neither reachable once everybody
-- has dropped out.
--
-- It counts PEOPLE only: a bot never concedes, so counting it would leave a
-- table whose people had all dropped out playing forever. When none are
-- left, final scoring runs and the game ends conceded / conceded, with the
-- bots ranked by score — the bots win when every person concedes (Joel,
-- 2026-09-27: plans/common-tables.md → Decided). `p_ended_by_user_id` is the
-- last person to concede. A game with no bots ended inside common._concede,
-- which the caller handles. MUST be called with this game's row already
-- locked. Returns whether it ended the game.
create or replace function scrabble._maybe_finish_compete(p_game_id uuid, p_ended_by_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
begin
  if exists (
    select 1
      from common.game_players gp
      join common.profiles pr on pr.user_id = gp.user_id
     where gp.game_id = p_game_id
       and gp.player_ended_reason is distinct from 'conceded'
       and not pr.ai_member
  ) then
    return false;
  end if;

  perform scrabble._finish(p_game_id, 'conceded', 'conceded', null, p_ended_by_user_id);
  return true;
end;
$$;

revoke execute on function scrabble._maybe_finish_compete(uuid, uuid) from public;

drop function if exists scrabble.concede(uuid);

-- ============================================================
-- scrabble.concede — a player drops out of a compete game
-- ============================================================
-- Turn-based, so a concession is more than a record: the conceder leaves the
-- turn order (common._advance_turn skips them), forfeits any win (_finish
-- ranks only players who didn't concede), and if it was their turn the turn
-- moves on so the game isn't stuck. When the LAST person concedes the game
-- ends: in a game with bots through _maybe_finish_compete, and in one
-- without inside common._concede, a loss for everyone — final scoring still
-- runs, so the scores the page shows are the final ones. Compete only (coop
-- has no race).
create or replace function scrabble.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  caller_id  uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so a concession and a final move serialize and
  -- one of them sees the other's result (docs/common-schema.md → Concede).
  perform 1 from scrabble.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('scrabble');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  caller_id := common._concede(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform scrabble._score_leftovers(p_game_id, null, caller_id);
  elsif not scrabble._maybe_finish_compete(p_game_id, caller_id) then
    -- Others are still playing. If it was the conceder's turn, hand it on.
    if (select current_turn_user_id from common.games where id = p_game_id) = caller_id then
      perform common._advance_turn(p_game_id);
    end if;
  end if;

  -- Bump version so optimistic-concurrency readers refetch.
  update scrabble.games set version = version + 1 where game_id = p_game_id;
  perform scrabble._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

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

revoke execute on function scrabble.concede(uuid) from public;
grant execute on function scrabble.concede(uuid) to authenticated;

drop function if exists scrabble.submit_timeout(uuid);

-- ============================================================
-- scrabble.submit_timeout — countdown-timer expiry
-- ============================================================
-- Fired by every connected client when a countdown hits 0; the first ends the
-- game, the rest find it ended and answer the game-over race. Runs final
-- scoring, because a Scrabble score is real: compete ranks by it, so the
-- leader wins (docs/games/scrabble.md §2.7). Coop: a loss — the one way a
-- coop table loses. Ended by whoever held the turn, or nobody in free-for-all
-- coop.
--
-- The lock matters more here than anywhere: every client races to call this,
-- and final scoring is NOT idempotent (it subtracts the leftover racks), so
-- without it two callers could subtract twice and flip the winner.
create or replace function scrabble.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from scrabble.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('scrabble');
  end if;
  perform common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  perform scrabble._finish(p_game_id, 'timeout', 'timeout', null,
    (select current_turn_user_id from common.games where id = p_game_id));

  perform scrabble._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function scrabble.submit_timeout(uuid) from public;
grant execute on function scrabble.submit_timeout(uuid) to authenticated;

drop function if exists scrabble.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists scrabble.end_game(uuid);

-- ============================================================
-- scrabble.stop_game — the "we're done" action
-- ============================================================
-- Any player stops the game for the whole table, with no result, in either
-- mode (docs/common-schema.md → Stop). COOP scores the leftovers: ending with
-- tiles still in the rack FORFEITS their value from the team's score (so a
-- team is pushed to find plays for its last tiles rather than just stopping —
-- the same leftover penalty a natural end applies), the `leftovers` row in
-- the stopper's name. COMPETE ends flat: no scoring.
create or replace function scrabble.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the final move waits for it and then reads the
  -- game as over. The row check comes before the membership gate:
  -- `delete_game` takes this row, `common.games` and every `game_players` row
  -- together, so a caller whose game was just deleted has no membership left.
  perform 1 from scrabble.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('scrabble');
  end if;

  perform common._stop(p_game_id);

  if (select mode from common.games where id = p_game_id) = 'coop' then
    perform scrabble._score_leftovers(p_game_id, null, auth.uid());
  end if;

  perform scrabble._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function scrabble.stop_game(uuid) from public;
grant execute on function scrabble.stop_game(uuid) to authenticated;

drop function if exists scrabble.get_suggest_context(uuid);

-- ============================================================
-- scrabble.get_suggest_context — read-only RPC for the move suggester
-- ============================================================
-- The `scrabble-suggest-move` Edge Function (docs/games/scrabble.md) needs the
-- dictionary bands to generate only game-legal moves — but dict_2/dict_3plus
-- are deliberately EXCLUDED from the column grant on scrabble.games (the FE
-- never validates words). This SECURITY DEFINER RPC is the one sanctioned
-- door, the shape of codenamesduet.get_clue_context: membership is the
-- authorization, and the feature gate ("suggestions are a coop feature")
-- lives HERE, not in the edge function.
--
-- One SELECT returns an atomic, mutually consistent snapshot: a teammate's
-- concurrent play can't tear board from rack, and `version` rides along so
-- the FE can detect a suggestion that went stale in flight. The board is the
-- page's own string (`_make_json_board`), decoded by the same `lib/board.ts`.
-- Unwrapped by the edge function, not relayed.
create or replace function scrabble.get_suggest_context(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  g scrabble.games%rowtype;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first: a friend may delete the game from the club list at any
  -- moment, and the delete takes the memberships with it (docs/envelopes.md →
  -- a missing game row is PN485).
  select * into g from scrabble.games where game_id = p_game_id;
  if not found then
    perform common._raise_game_deleted('scrabble');
  end if;

  perform common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: a teammate finished the game, or the clock ran out, while the
    -- suggest button was still on screen.
    perform common._raise_game_over();
  end if;

  -- Compete hints are a house-rules question, deliberately deferred
  -- (docs/games/scrabble.md "Deferred") — and in compete the rack is private,
  -- so this gate is also what keeps the suggester from becoming a
  -- rack-reading side channel.
  if (select mode from common.games where id = p_game_id) <> 'coop' then
    -- A fault: mode is fixed at create_game and the FE renders no suggest
    -- button in compete, so nothing unbroken asks.
    raise exception 'BUG: a suggestion in a compete game'
      using errcode = 'PN462', hint = 'fault', column = '_',
      detail = 'the AI suggester would be a win button in a race';
  end if;

  return common._ok_envelope(jsonb_build_object(
    'result', 'context',
    'board', scrabble._make_json_board(g.board),
    'rack', to_jsonb(g.team_rack),
    'dict_2', g.dict_2,
    'dict_3plus', g.dict_3plus,
    'version', g.version
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

revoke execute on function scrabble.get_suggest_context(uuid) from public;
grant execute on function scrabble.get_suggest_context(uuid) to authenticated;

drop function if exists scrabble.get_ai_context(uuid);

-- ============================================================
-- scrabble.get_ai_context — the bot's move context (compete)
-- ============================================================
-- The twin of get_suggest_context, for the `scrabble-ai-move` Edge Function:
-- the SECURITY DEFINER door to the bot holding the turn — its hidden rack,
-- the server-only dictionary bands, the board and the version, atomically.
-- Any game MEMBER may drive the bot (trust model — a person at the table
-- pokes the bot along).
--
-- It finds whoever holds the turn pointer and answers with that bot's
-- context, `user_id` naming it, if a bot holds the turn — else `done` (a
-- person's turn, an ended game, or coop). So the edge function just loops
-- "get context → play → repeat until done", which also walks a chain of
-- bots taking turns in a row. TWO `ok`s, and `done` is the ordinary one: every
-- client pokes this on every version bump, so "nothing for the bot to do" is
-- the answer most calls get. It raises only for a missing game.
create or replace function scrabble.get_ai_context(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  g           scrabble.games%rowtype;
  pl          scrabble.players%rowtype;
  cg          common.games%rowtype;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first: a friend may delete the game from the club list at any
  -- moment, and the delete takes the memberships with it (docs/envelopes.md →
  -- a missing game row is PN485).
  select * into g from scrabble.games where game_id = p_game_id;
  if not found then
    perform common._raise_game_deleted('scrabble');
  end if;

  perform common._require_game_player(p_game_id);

  select * into cg from common.games where id = p_game_id;
  if cg.mode <> 'compete' or cg.ended_at is not null or cg.current_turn_user_id is null then
    return common._ok_envelope(jsonb_build_object('result', 'done'));
  end if;

  select * into pl from scrabble.players
   where game_id = p_game_id and user_id = cg.current_turn_user_id;
  if pl.ai_level is null then
    -- A person holds the turn.
    return common._ok_envelope(jsonb_build_object('result', 'done'));
  end if;

  return common._ok_envelope(jsonb_build_object(
    'result', 'context',
    'user_id', pl.user_id,
    'board', scrabble._make_json_board(g.board),
    'rack', to_jsonb(pl.rack),
    'dict_2', g.dict_2,
    'dict_3plus', g.dict_3plus,
    'ai_level', pl.ai_level,
    'version', g.version,
    'n_bag_tiles', coalesce(array_length(g.bag, 1), 0)
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

revoke execute on function scrabble.get_ai_context(uuid) from public;
grant execute on function scrabble.get_ai_context(uuid) to authenticated;

drop function if exists scrabble.replay_board(uuid);

-- ============================================================
-- scrabble.replay_board — deal this game again from scratch
-- ============================================================
-- The "Replay board" game-menu item. NOTE what "the board" means here:
-- scrabble's 15×15 premium grid is the SAME for every game (the standard
-- layout, not a generated puzzle), so there is no per-game board to restore.
-- What a replay restores is the SETUP — same club, same players and bots,
-- same turn order, same dictionary bands — and then re-deals: a freshly
-- shuffled bag, new racks, an empty grid. "Same table, new deal", not "same
-- puzzle again"; New game additionally makes a NEW game row.
--
-- Any game player may call it, mid-game or after the game ends (no ended
-- check — it's a restart). Both modes reset ALL players.
--
-- Three subtleties:
--   - **`version` is BUMPED, not zeroed.** It's the optimistic-concurrency
--     counter every move checks against the client's `p_base_version`.
--     Zeroing it would let a client holding a stale mid-game version commit
--     a move against the fresh deal; bumping keeps it monotonic, so every
--     in-flight move fails its version check.
--   - **compete re-randomizes the opener**, matching create_game — after
--     common._reset_game, which rewinds the turn to `turn_seat` 0.
--   - **coop's turn order rewinds** to the player seated first inside
--     common._reset_game; a free-for-all game has a null pointer and stays
--     null.
create or replace function scrabble.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = scrabble, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  g           scrabble.games%rowtype;
  v_mode      text;
  v_bag       text[];
  v_board     jsonb;
  v_drawn     text[];
  r           record;
begin
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the re-deal could land on a half-applied play.
  select * into g from scrabble.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('scrabble');
  end if;

  -- The row check comes BEFORE the membership gate: `delete_game` takes this
  -- row, `common.games` and every `game_players` row together, so a caller
  -- whose game was just deleted has no membership left either, and would be
  -- told "You are not in this game" — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);
  select mode into v_mode from common.games where id = p_game_id;

  select array_agg(t order by random()) into v_bag from unnest(scrabble._new_bag()) t;
  select jsonb_agg(null::jsonb) into v_board from generate_series(1, 225);

  delete from scrabble.events where game_id = p_game_id;

  if v_mode = 'compete' then
    -- Re-deal every player in turn order, threading the bag down.
    for r in select gp.user_id from common.game_players gp
              where gp.game_id = p_game_id order by gp.turn_seat loop
      v_drawn := v_bag[1:7];
      v_bag   := v_bag[8:];
      update scrabble.players
         set score = 0, rack = v_drawn
       where game_id = p_game_id and user_id = r.user_id;
    end loop;
    update scrabble.games
       set board = v_board, bag = v_bag, version = g.version + 1,
           consecutive_passes = 0
     where game_id = p_game_id;
  else
    -- Coop: one rack on the game row, and every player's own score back to
    -- nothing.
    v_drawn := v_bag[1:7];
    v_bag   := v_bag[8:];
    update scrabble.games
       set board = v_board, bag = v_bag, version = g.version + 1,
           team_rack = v_drawn, consecutive_passes = 0
     where game_id = p_game_id;
    update scrabble.players set score = 0 where game_id = p_game_id;
  end if;

  -- The club-list title is the first three words played (_title_for), so a
  -- replayed game would otherwise still advertise the previous deal's words.
  update common.games set title = 'New game' where id = p_game_id;

  perform common._reset_game(p_game_id);

  -- Compete opens on a random player, after reset_game rewound the turn.
  if v_mode = 'compete' then
    update common.games
       set current_turn_user_id = (
         select user_id from common.game_players
          where game_id = p_game_id order by random() limit 1)
     where id = p_game_id;
  end if;

  perform scrabble._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function scrabble.replay_board(uuid) from public;
grant execute on function scrabble.replay_board(uuid) to authenticated;
