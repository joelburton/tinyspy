-- cs-fixed-outcome-fix

-- ============================================================
-- strands
-- ============================================================
-- What the frontend calls:
--
--   next_puzzle_for_club  the next archive puzzle none of the players has seen
--   puzzle_for_date       the archive puzzle for a date, played or not
--   create_game           starts a game on an archive puzzle
--   submit_path           traces a word
--   spend_hint            cashes the hint bar for a ringed puzzle word
--   concede               a racer drops out of a compete game
--   stop_game             stops the game for everyone, with no result
--   submit_timeout        ends the game when the countdown runs out
--   replay_board          the same puzzle again from scratch
--
-- What the frontend reads is none of this schema's tables: `_rebuild_data_cols`
-- writes the page blobs onto `common.games` after every move (plans/seat-view.md
-- → The page is written, not assembled) — `game_data`, `summary_data`, and
-- `shell_data` through common — and the page reads those.
--
-- What is particular to strands (docs/games/strands.md has the rest):
--   - THE SHIELD. The solution is hidden by a column grant, and `game_data`
--     carries it only once the game has ended. A dictionary lookup forces a
--     server round trip anyway, so every trace is classified here: a theme
--     word, the spangram, a hint word (which fills the hint bar), or a miss.
--   - A puzzle word is matched by the CELLS it covers and the word they spell,
--     not by the ordered path (_path_key).
--   - The puzzle words tile the board exactly, so finding every one and using
--     every cell are the same thing: solving. Coop solves together; in
--     compete solving ends only your own race, and the solver with the fewest
--     hints wins once nobody is left racing.
--   - Coop's hint bar and ringed hint are one pool, written onto every coop
--     player's row in lock-step; the hints cashed are each player's own.
--   - A rival's hint bar, ringed hint and found words stay hidden mid-race;
--     their hint count is public. That is the hook's rule
--     (src/strands/hooks/useGame.ts), not a policy's: the blob carries
--     everything, the hook withholds.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema strands to authenticated;

-- ============================================================
-- strands.puzzles — the archive
-- ============================================================
-- The setup form lists what's available, plus the TITLE — and that is all an
-- ordinary player may read: not the board, and certainly not the solution.
-- The presence of ANY column grant flips the table to "only granted columns
-- visible", so the safe ones are enumerated and the rest are hidden by
-- omission.
--
-- The title is on the safe side because it is what a person recognizes a
-- puzzle BY — it is already the game's title ("2025-06-15: Here's to him!",
-- see create_game) and on screen from the first second of play — and it is
-- the honest way to tell which puzzles you have played. The board and the
-- solution stay shielded because those ARE the puzzle.
--
-- REVOKE FIRST, and this is load-bearing rather than tidy. Grants are ADDITIVE,
-- so a table-wide `grant select` that ever reached this database — a stray psql
-- line, a bad migration — would NOT be undone by re-applying this file: the
-- column grants below would simply be added alongside it, and `solution` would
-- stay readable. Since supabase/sql/ is meant to be the authoritative CURRENT
-- definition, the shield has to start by clearing whatever came before.
revoke select on strands.puzzles from authenticated;
grant select (id, source_id, puzzle_date, title) on strands.puzzles to authenticated;

drop policy if exists puzzles_select on strands.puzzles;
create policy puzzles_select on strands.puzzles
  for select to authenticated
  using (true);

-- The import CLI writes puzzles as the service_role (bypasses RLS; it is the
-- only writer — there is no INSERT grant to authenticated). It needs schema
-- USAGE plus full column access, including `solution`, to seed the library;
-- update too, since the importer upserts and a re-fetch may carry a corrected
-- puzzle.
grant usage on schema strands to service_role;
grant insert, update, select on strands.puzzles to service_role;

-- ============================================================
-- strands.games
-- ============================================================
-- Everything EXCEPT `solution`. `game_data` (`_make_json_puzzle`) is the only
-- path a client has to it, and carries it only once the game has ended.
-- Revoke first — see the note on strands.puzzles above.
revoke select on strands.games from authenticated;
grant select
  (game_id, puzzle_id, puzzle_date, board, puzzle_title,
   min_word_length, hint_cost, band)
  on strands.games to authenticated;

-- Reading is club-gated; acting is player-gated in the RPCs.
drop policy if exists games_select on strands.games;
create policy games_select on strands.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- ============================================================
-- strands.players
-- ============================================================
-- Any club member reads every column. What a racer may see of a rival
-- mid-race — the hint count, and not the bar or the ringed hint — is the
-- hook's rule (src/strands/hooks/useGame.ts), applied to `game_data`; nothing
-- reads this table from the client. Revoke first — see the note on
-- strands.puzzles above.
revoke select on strands.players from authenticated;
grant select on strands.players to authenticated;

drop policy if exists players_select on strands.players;
create policy players_select on strands.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- ============================================================
-- strands.events
-- ============================================================
-- The log: any club member sees every row. Who may see a rival's rows
-- mid-race is the hook's rule (src/strands/hooks/useGame.ts), applied to
-- `game_data`; nothing reads this table from the client.
grant select on strands.events to authenticated;

drop policy if exists events_select on strands.events;
create policy events_select on strands.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- The views the frontend read before the page blobs, their definers, and the
-- statuses' writer; supabase/sql is re-applied, not diffed, so the drops stay.
drop view if exists strands.players_state;
drop view if exists strands.games_state;
drop view if exists strands.club_game_status;
drop function if exists strands._hint_points_for(uuid, uuid);
drop function if exists strands._active_hint_for(uuid, uuid);
drop function if exists strands._player_state_visible(uuid, uuid);
drop function if exists strands._solution_for(uuid);
drop function if exists strands._write_statuses(uuid, boolean);

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- strands' own, each builder bearing its column's name. `game_data` is the
-- common part (supabase/sql/common.sql → The page blobs' common parts) with
-- strands' facts on top; the pieces below build each part, so `select
-- game_data from common.games` shows the page what it gets.
--
-- A tile's id is its place, "r,c" — the key `_path_key` compares by — and
-- every path in a blob is a list of tile ids, in the order it was traced.
--
--   game_data, strands' part:
--     puzzle: {title, tiles, words}        frozen at create: the theme prompt;
--                                          all 48 tiles, each {id, letter, row,
--                                          col}, row by row; the puzzle words,
--                                          each {word, tileIds, spangram},
--                                          spangram first, null until the game
--                                          ends
--     team: {nFoundWords, nHintsUsed, hintPoints}
--                                          what the team shares: the words found,
--                                          the players' hints summed, the one
--                                          hint bar; null in compete
--                                          (plans/team-facts.md)
--     events: [{id, userId, kind, word, result, tileIds, tookTurn, at}, …]
--                                          every row, every player's; a guess's
--                                          trace, or a hint's ringed word; what a
--                                          racer may see of a rival mid-race is
--                                          the hook's rule
--     players: [player, …]                 the common player, plus:
--       nFoundWords, nHintsUsed            this player's own, in every mode
--       hintPoints                         a racer's hint bar; null in coop,
--                                          where the bar is the team's
--       board: {words, hintTileIds}        this seat's found words, in the order
--                                          found, and its ringed hint (null when
--                                          none shows): the shared ones in coop,
--                                          each racer's own in compete
--
--   summary_data, strands' part (the common part names and dates the game
--   and carries its ending; the winner is `ending.winner`):
--     team                                 the same group; null in compete
--     nWinnerHints                         the hints the race was won on; null
--                                          in coop, or with no winner

-- A path's cells as tile ids, in the order given.
create or replace function strands._make_json_tile_ids(p_coords jsonb)
returns jsonb
language sql
immutable
set search_path = strands, common, public, extensions
as $$
  select coalesce(jsonb_agg((c->>0) || ',' || (c->>1) order by o), '[]'::jsonb)
    from jsonb_array_elements(p_coords) with ordinality as x(c, o);
$$;

revoke execute on function strands._make_json_tile_ids(jsonb) from public;

-- The board's 48 tiles, row by row.
create or replace function strands._make_json_tiles(p_board text[])
returns jsonb
language sql
immutable
set search_path = strands, common, public, extensions
as $$
  select jsonb_agg(jsonb_build_object(
           'id',     (r - 1) || ',' || (c - 1),
           'letter', substr(p_board[r], c, 1),
           'row',    r - 1,
           'col',    c - 1) order by r, c)
    from generate_series(1, cardinality(p_board)) r,
         generate_series(1, length(p_board[1])) c;
$$;

revoke execute on function strands._make_json_tiles(text[]) from public;

-- The puzzle words, spangram first.
create or replace function strands._make_json_words(p_solution jsonb)
returns jsonb
language sql
immutable
set search_path = strands, common, public, extensions
as $$
  select jsonb_build_array(jsonb_build_object(
           'word',     p_solution->'spangram'->>'word',
           'tileIds',  strands._make_json_tile_ids(p_solution->'spangram'->'coords'),
           'spangram', true))
         || coalesce((
           select jsonb_agg(jsonb_build_object(
                    'word',     t->>'word',
                    'tileIds',  strands._make_json_tile_ids(t->'coords'),
                    'spangram', false) order by o)
             from jsonb_array_elements(p_solution->'themeWords') with ordinality as x(t, o)),
           '[]'::jsonb);
$$;

revoke execute on function strands._make_json_words(jsonb) from public;

-- The prompt, the tiles, and the puzzle words once the game has ended (the
-- column grant keeps them from any client read).
create or replace function strands._make_json_puzzle(sg strands.games, p_ended boolean)
returns jsonb
language sql
immutable
set search_path = strands, common, public, extensions
as $$
  select jsonb_build_object(
    'title', sg.puzzle_title,
    'tiles', strands._make_json_tiles(sg.board),
    'words', case when p_ended then strands._make_json_words(sg.solution) end);
$$;

revoke execute on function strands._make_json_puzzle(strands.games, boolean) from public;

-- The log: every row, in the order of play.
create or replace function strands._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = strands, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',       e.id,
           'userId',   e.user_id,
           'kind',     e.kind,
           'word',     e.word,
           'result',   e.result,
           'tileIds',  strands._make_json_tile_ids(e.path),
           'tookTurn', e.took_turn,
           'at',       e.created_at) order by e.id), '[]'::jsonb)
    from strands.events e
   where e.game_id = p_game_id;
$$;

revoke execute on function strands._make_json_events(uuid) from public;

-- The words a seat has found, in the order found: everyone's in coop, where
-- the board is shared; the player's own in compete.
create or replace function strands._make_json_found_words(p_game_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
set search_path = strands, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'word',     e.word,
           'tileIds',  strands._make_json_tile_ids(e.path),
           'spangram', e.result = 'spangram') order by e.id), '[]'::jsonb)
    from strands.events e
    join common.games cg on cg.id = e.game_id
   where e.game_id = p_game_id
     and e.result in ('theme', 'spangram')
     and (cg.mode = 'coop' or e.user_id = p_user_id);
$$;

revoke execute on function strands._make_json_found_words(uuid, uuid) from public;

-- The puzzle words found: one player's own, or every player's when `p_user_id`
-- is null — the team's.
create or replace function strands._count_found_words(p_game_id uuid, p_user_id uuid)
returns int
language sql
stable
set search_path = strands, common, public, extensions
as $$
  select count(*)::int
    from strands.events e
   where e.game_id = p_game_id
     and e.result in ('theme', 'spangram')
     and (p_user_id is null or e.user_id = p_user_id);
$$;

revoke execute on function strands._count_found_words(uuid, uuid) from public;

-- What the team shares: the words found, the hints the players cashed, and
-- the one hint bar, which every coop row carries alike. Null in compete,
-- where there is no team (plans/team-facts.md).
create or replace function strands._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = strands, common, public, extensions
as $$
  select case when cg.mode = 'coop' then jsonb_build_object(
           'nFoundWords', strands._count_found_words(p_game_id, null),
           'nHintsUsed',  (select sum(sp.n_hints_used)::int from strands.players sp
                            where sp.game_id = p_game_id),
           'hintPoints',  (select max(sp.hint_points) from strands.players sp
                            where sp.game_id = p_game_id)) end
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function strands._make_json_team(uuid) from public;

-- Every player as strands' game_data shows them: the common player, with their
-- own counts, a racer's hint bar, and this seat's board.
create or replace function strands._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = strands, common, public, extensions
as $$
  select jsonb_agg(
           cp.player || jsonb_build_object(
             'nFoundWords', strands._count_found_words(p_game_id, cp.id),
             'nHintsUsed',  sp.n_hints_used,
             'hintPoints',  case when cg.mode = 'compete' then sp.hint_points end,
             'board',       jsonb_build_object(
               'words',       strands._make_json_found_words(p_game_id, cp.id),
               'hintTileIds', case when sp.active_hint_coords is not null
                                   then strands._make_json_tile_ids(sp.active_hint_coords) end))
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join strands.players sp on sp.game_id = p_game_id and sp.user_id = cp.id
    join common.games cg on cg.id = p_game_id;
$$;

revoke execute on function strands._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with strands' puzzle, team, log
-- and players on top.
create or replace function strands._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = strands, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'puzzle',  strands._make_json_puzzle(sg, cg.ended_at is not null),
           'team',    strands._make_json_team(p_game_id),
           'events',  strands._make_json_events(p_game_id),
           'players', strands._make_json_players(p_game_id))
    from strands.games sg
    join common.games cg on cg.id = sg.game_id
   where sg.game_id = p_game_id;
$$;

revoke execute on function strands._make_json_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one. A race's
-- winners share a rank only on the same hints, so any one of them says it.
create or replace function strands._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = strands, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'team',         strands._make_json_team(p_game_id),
    'nWinnerHints', (select min(sp.n_hints_used)
                       from strands.players sp
                       join common.game_players gp
                         on gp.game_id = sp.game_id and gp.user_id = sp.user_id
                      where sp.game_id = p_game_id
                        and cg.mode = 'compete'
                        and gp.final_ranking = 1))
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function strands._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- strands._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from strands' own tables, assigning
-- each whole. Every RPC calls it after a move; it is also the repair for one
-- game by hand. Every key is always present, null when it has no value; the
-- shapes are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function strands._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = strands._make_json_game_data(p_game_id),
         summary_data = strands._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function strands._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- strands._rebuild_data_cols_for_all — every strands game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_rebuild_data_cols` over every strands game without re-dating any, and
-- answers how many it rewrote. Run by hand as postgres (`gmake db-psql`); no
-- client calls it, so it has no grant and wears the `_`.
create or replace function strands._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('strands_coop', 'strands_compete')
  loop
    perform strands._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function strands._rebuild_data_cols_for_all() from public;

drop function if exists strands.next_puzzle_for_club(uuid[]);

-- ============================================================
-- strands.next_puzzle_for_club — the only puzzle choice there is
-- ============================================================
-- connections.next_puzzle_for_club's twin, and deliberately identical in
-- shape — read that one for the full reasoning. The short version: for
-- strands the date means nothing (the archive is a queue), and the question
-- anyone asks is "give us one nobody here has seen."
--
-- `p_seen_by` is the players about to be seated, not the club's membership: a
-- puzzle is out if ANY of them has ever been a player on a game of it, in ANY
-- club — including a solo club the caller cannot see. Hence SECURITY DEFINER;
-- excluding what a club-mate played alone is the whole point.
--
-- Match on `puzzle_date` rather than the soft `puzzle_id` FK, ascending so a
-- club works forward in publication order. The label is the title, which is
-- how a person recognizes a strands puzzle.
create or replace function strands.next_puzzle_for_club(p_seen_by uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = strands, common, public, extensions
as $$
declare
  found jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  select jsonb_build_object(
           'id', p.id,
           'puzzle_date', p.puzzle_date,
           'label', p.puzzle_date::text || ': ' || p.title
         )
    into found
    from strands.puzzles p
   where not exists (
           select 1
             from strands.games g
             join common.game_players gp on gp.game_id = g.game_id
            where g.puzzle_date = p.puzzle_date
              and gp.user_id = any(p_seen_by)
         )
   order by p.puzzle_date
   limit 1;

  -- A VALIDATION, not an empty success, and connections' PN302 word for word.
  -- Running out of puzzles BLOCKS Start, and what fixes it is an input on this
  -- very form — uncheck a player who has played them all, or type a date and
  -- play one again. `column = 'puzzle_id'` puts it under the field that is the
  -- way out: nobody setting up a game thinks "remove a player to get a
  -- puzzle". The sentence carries no brand, which is what lets the two games
  -- share it.
  if found is null then
    raise exception 'Everyone here has played every puzzle. You can open one already played by its date.'
      using errcode = 'PN416', hint = 'form-validation', column = 'puzzle_id',
      detail = 'no puzzle unseen by every uid in p_seen_by';
  end if;

  return common._ok_envelope(jsonb_build_object('result', 'found', 'puzzle', found));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function strands.next_puzzle_for_club(uuid[]) from public;
grant execute on function strands.next_puzzle_for_club(uuid[]) to authenticated;

drop function if exists strands.puzzle_for_date(date);

-- ============================================================
-- strands.puzzle_for_date — the deliberate override
-- ============================================================
-- connections.puzzle_for_date's twin: next_puzzle_for_club answers "give us
-- one nobody here has done", and this answers "I know the date, I want that
-- one" — filtering nothing, so an already-played puzzle comes back and starts
-- a SECOND game rather than reopening the first.
--
-- SECURITY INVOKER, unlike its sibling: it reads no history, only the
-- archive, whose `title` and `puzzle_date` are already granted.
create or replace function strands.puzzle_for_date(p_date date)
returns jsonb
language plpgsql
stable
set search_path = strands, common, public, extensions
as $$
declare
  found jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  select jsonb_build_object(
           'id', p.id,
           'puzzle_date', p.puzzle_date,
           'label', p.puzzle_date::text || ': ' || p.title
         )
    into found
    from strands.puzzles p
   where p.puzzle_date = p_date;

  -- The date is IN the message, because the field it lands under holds the date
  -- and a bare "no puzzle" would make the reader check what they typed.
  -- connections' PN303, verbatim.
  if found is null then
    raise exception 'No puzzle for %. Try another date.', p_date
      using errcode = 'PN417', hint = 'form-validation', column = 'puzzle_id',
      detail = 'no strands.puzzles row with that puzzle_date';
  end if;

  return common._ok_envelope(jsonb_build_object('result', 'found', 'puzzle', found));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function strands.puzzle_for_date(date) from public;
grant execute on function strands.puzzle_for_date(date) to authenticated;

drop function if exists strands.create_game(text, jsonb, uuid[], text);

-- ============================================================
-- strands.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)
-- ============================================================
-- Setup shape (server-validated):
--   { puzzle_id: uuid,            -- which archived puzzle; absent = the next
--                                 --   one none of the players has seen
--     band: 1..6,                -- dictionary ceiling for HINT words
--     hint_cost: 1..10,          -- hint words per hint (NYT plays 3)
--     min_word_length: 3..8,     -- shortest word that can earn a point
--     timer: <the common shape>,
--     coop_style: 'free' | 'turns',
--     first_turn_user_id: uuid } -- required iff coop_style = 'turns'
--
-- Everything needed to PLAY and to IDENTIFY the game is copied onto the row
-- (board, title, solution, puzzle_date), leaving puzzle_id a soft,
-- provenance-only FK — the library-puzzle rule in docs/common.md. The archive
-- can be pruned or re-imported without touching a game in flight. The three
-- knobs are copied too: the move RPC reads all three on every submission.
create or replace function strands.create_game(
  p_club_handle text,
  p_setup jsonb,
  p_player_user_ids uuid[],
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  new_id             uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  s_puzzle_id        uuid;
  puzzle_row         strands.puzzles%rowtype;
  v_band             int;
  v_hint_cost        int;
  v_min_word_length  int;
  game_title         text;
  first_turn         uuid;
begin
  perform common._require_valid_mode(p_mode);

  -- Compete needs an opposing PLAYER. The manifest hides its Start button in a
  -- one-player club; this is the server-side catch.
  if p_mode = 'compete' and coalesce(array_length(p_player_user_ids, 1), 0) < 2 then
    raise exception 'BUG: race with fewer than two players'
      using errcode = 'PN066', hint = 'fault', column = '_',
      detail = 'compete needs >= 2 players';
  end if;

  -- Upper bound must agree with `numberOfPlayers` in the manifest.
  perform common._require_player_count_max(p_player_user_ids, 6);

  -- ─── Which puzzle ────────────────────────────────────────
  -- Absent means "you choose" — the server derives the next puzzle none of the
  -- players being seated has seen. Present still wins, because every test
  -- fixture pins a specific puzzle. See connections.create_game; the two games
  -- do this identically on purpose.
  if (p_setup->>'puzzle_id') is null then
    -- Reading the ENVELOPE's `data`. A spent archive is PN416, a not-ok whose
    -- `data` is null, so this stays null and the next branch raises this
    -- function's own PN067 for it, which says the same sentence.
    s_puzzle_id := (strands.next_puzzle_for_club(p_player_user_ids)
                      -> 'data' -> 'puzzle' ->> 'id')::uuid;
    if s_puzzle_id is null then
      -- The wording deliberately does not say "you have played them all": the
      -- exclusion spans clubs and players, so the usual cause is that SOMEONE
      -- at the table has, which reads as a lie to everyone else.
      raise exception 'Everyone here has played every puzzle. You can open one already played by its date.'
        using errcode = 'PN067', hint = 'form-validation', column = 'puzzle_id',
        detail = 'every imported puzzle has been played by one of these players';
    end if;
  else
    begin
      s_puzzle_id := (p_setup->>'puzzle_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'BUG: puzzle reference the server cannot read'
        using errcode = 'PN068', hint = 'fault', column = '_',
        detail = 'setup.puzzle_id is not a uuid';
    end;
  end if;

  -- Defaults match the manifest's, so a client that omits a knob still starts
  -- a sane game; the range checks then reject anything else. Ranges duplicate
  -- the table CHECKs deliberately — a named error beats a raw 23514.
  v_band            := coalesce((p_setup->>'band')::int, 5);
  v_hint_cost       := coalesce((p_setup->>'hint_cost')::int, 3);
  v_min_word_length := coalesce((p_setup->>'min_word_length')::int, 4);

  if v_band < 1 or v_band > 6 then
    raise exception 'BUG: hint dictionary of %', v_band
      using errcode = 'PN069', hint = 'fault', column = '_',
      detail = 'setup.band must be 1..6';
  end if;
  if v_hint_cost < 1 or v_hint_cost > 10 then
    raise exception 'BUG: hint cost of %', v_hint_cost
      using errcode = 'PN070', hint = 'fault', column = '_',
      detail = 'setup.hint_cost must be 1..10';
  end if;
  if v_min_word_length < 3 or v_min_word_length > 8 then
    raise exception 'BUG: shortest word of %', v_min_word_length
      using errcode = 'PN071', hint = 'fault', column = '_',
      detail = 'setup.min_word_length must be 3..8';
  end if;

  perform common._require_valid_timer(p_setup->'timer');

  -- Load the puzzle. The FK would catch a bad id at INSERT, but "puzzle not
  -- found" is friendlier than a foreign-key violation.
  select * into puzzle_row from strands.puzzles where id = s_puzzle_id;
  if not found then
    raise exception 'That puzzle is no longer available'
      using errcode = 'PN072', hint = 'form-validation', column = 'puzzle_id',
      detail = 'no strands.puzzles row for that id; run the puzzle import';
  end if;

  -- Title = "<date>: <title>", e.g. "2025-06-15: Here's to him!". The puzzle's
  -- title is the theme PROMPT, not the answer — it's on screen from the first
  -- second — so it spoils nothing and tells one game from another far better
  -- than a bare date would.
  game_title := format('%s: %s', puzzle_row.puzzle_date, puzzle_row.title);

  -- The saved default strips the per-GAME picks: which puzzle and who opens a
  -- turn game. The knobs and coop_style ride, since those are how this club
  -- likes to play.
  new_id := common._create_game(
    p_club_handle, 'strands_' || p_mode, p_mode, p_player_user_ids, game_title,
    p_setup,
    p_setup - 'puzzle_id' - 'first_turn_user_id'
  );

  -- Opt-in turn-by-turn COOP. Compete never rotates — everyone races at once —
  -- and free-for-all leaves the pointer null, making common._require_turn a
  -- no-op in submit_path.
  if p_mode = 'coop' and p_setup->>'coop_style' = 'turns' then
    begin
      first_turn := (p_setup->>'first_turn_user_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'BUG: first player the server cannot read'
        using errcode = 'PN073', hint = 'fault', column = '_',
      detail = 'setup.first_turn_user_id is not a uuid';
    end;
    if first_turn is null or not (first_turn = any(p_player_user_ids)) then
      raise exception 'BUG: first player who is not in the game'
        using errcode = 'PN074', hint = 'fault', column = '_',
      detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into strands.games (
    game_id, puzzle_id, puzzle_date, board, puzzle_title, solution,
    min_word_length, hint_cost, band
  )
  values (
    new_id, s_puzzle_id, puzzle_row.puzzle_date,
    puzzle_row.board, puzzle_row.title, puzzle_row.solution,
    v_min_word_length, v_hint_cost, v_band
  );

  -- One row per player. In coop these move in lock-step (the pool is shared);
  -- in compete each is its own race.
  insert into strands.players (game_id, user_id)
  select new_id, uid from unnest(p_player_user_ids) as uid;

  perform strands._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. It is the only thing a
  -- call site can filter the `ok` on.
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

revoke execute on function strands.create_game(text, jsonb, uuid[], text) from public;
grant execute on function strands.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- strands._path_key — a path's PLACEMENT, order-independent
-- ============================================================
-- The sorted set of cells a path covers, as "r,c" text. Two paths with the same
-- key occupy exactly the same tiles, whatever order they were traced in.
--
-- WHY NOT THE ORDERED PATH: a word with a repeated letter can have two
-- interchangeable tiles, and then more than one legal trace spells the same
-- word over the identical cells. Real case ("Eyes on the prize"): INTENTION
-- runs through two N's at [5,1] and [6,1], each adjacent to both of the
-- other's neighbors —
--
--   I[5,0] N[6,1] T[6,2] E[7,3] N[7,2] T[7,1] I[7,0] O[6,0] N[5,1]
--   I[5,0] N[5,1] T[6,2] E[7,3] N[7,2] T[7,1] I[7,0] O[6,0] N[6,1]
--
-- — the same nine tiles, differing only in which N was touched first. Matching
-- the stored coord ARRAY would reject the first as "not a puzzle word". What
-- identifies a find is WHICH TILES it consumes, and the word those tiles spell
-- — never the order they were visited in.
drop function if exists strands._path_key(jsonb);
create or replace function strands._path_key(p_coords jsonb)
returns text[]
language sql
immutable
as $$
  select array_agg((e->>0) || ',' || (e->>1) order by (e->>0)::int, (e->>1)::int)
    from jsonb_array_elements(p_coords) e;
$$;

drop function if exists strands._consumed_keys(uuid, uuid);

-- ============================================================
-- strands._consumed_keys — cells locked by found puzzle words
-- ============================================================
-- "r,c" keys for every cell a found puzzle word occupies. Those tiles are
-- spent: they can't be traced again, which is coherent only because the hidden
-- words tile the board exactly (48 cells, each once — asserted at import).
--
-- WHOSE finds count depends on the mode, and this is the one place that
-- difference lives: coop shares one board, so anyone's find locks the tiles for
-- everyone; compete gives each player their own progress over the same letters,
-- so only `p_user_id`'s own finds lock theirs.
create or replace function strands._consumed_keys(p_game_id uuid, p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = strands, common, public, extensions
as $$
  select coalesce(array_agg(distinct (e->>0) || ',' || (e->>1)), '{}')
    from strands.events g
    join common.games cg on cg.id = g.game_id,
         lateral jsonb_array_elements(g.path) e
   where g.game_id = p_game_id
     and g.result in ('theme', 'spangram')
     and (cg.mode = 'coop' or g.user_id = p_user_id);
$$;
revoke execute on function strands._consumed_keys(uuid, uuid) from public;

drop function if exists strands._maybe_finish_compete(uuid, boolean);
drop function if exists strands._finish_compete(uuid, text, text, uuid);

-- ============================================================
-- strands._finish_compete — rank the race and end it
-- ============================================================
-- The race plays out, so it is ranked once it ends (docs/win-lose.md): every
-- player who SOLVED is ranked by the fewest hints, then the earliest solve,
-- ties sharing a rank; a player still mid-board, or one who conceded, didn't
-- finish and is unranked. "First to solve" would crown the wrong person — a
-- player still going might yet finish on fewer hints — which is why a solve
-- ends only that player's race. The reason is the act that ended the game
-- (`p_reason`, `p_reason_detail`, by `p_ended_by_user_id`).
create or replace function strands._finish_compete(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  v_rankings jsonb;
begin
  select coalesce(jsonb_object_agg(user_id::text, ranking), '{}'::jsonb)
    into v_rankings
    from (
      select gp.user_id,
             rank() over (order by sp.n_hints_used, gp.solved_at) as ranking
        from strands.players sp
        join common.game_players gp
          on gp.game_id = sp.game_id and gp.user_id = sp.user_id
       where sp.game_id = p_game_id and gp.solved_at is not null
    ) ranked;

  perform common._end_game(
    p_game_id, p_reason, p_reason_detail, p_ended_by_user_id,
    p_is_no_result => false,
    p_final_rankings => v_rankings
  );
end;
$$;

revoke execute on function strands._finish_compete(uuid, text, text, uuid) from public;

-- ============================================================
-- strands._maybe_finish_compete — end the race if nobody is left racing
-- ============================================================
-- A compete game ends when NO player is still racing — every one has solved
-- or conceded. Shared by submit_path (a solve can be the last move) and
-- concede (a drop-out can be — if everyone else already solved, the concede
-- is what empties the racing set). The act passed is the last racer's, and
-- becomes the game's reason. Everyone conceding is common._concede's ending,
-- so this skips a game that has already ended. Returns true when it ended
-- the game.
create or replace function strands._maybe_finish_compete(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = strands, common, public, extensions
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

  perform strands._finish_compete(p_game_id, p_reason, p_reason_detail, p_ended_by_user_id);
  return true;
end;
$$;

revoke execute on function strands._maybe_finish_compete(uuid, text, text, uuid) from public;

drop function if exists strands.submit_path(uuid, jsonb);

-- ============================================================
-- strands.submit_path — trace a word (THE move RPC)
-- ============================================================
-- Takes the traced path `p_path` ([[r,c], …]) and classifies it. The `ok`
-- carries { result, hint_points }, `result` ∈ theme | spangram | hint_word |
-- duplicate | too_short | invalid, and `hint_points` the caller's bar after
-- the move, which is how the frontend says a word filled it.
--
-- Note what is NOT returned: the word TOTAL. It's part of the answer — knowing
-- a board holds six words is real information about a shielded puzzle — so the
-- server computes it for the solve check and keeps it.
--
-- CLASSIFICATION ORDER is a rule, not an implementation detail. The theme
-- check runs FIRST and unconditionally, before any length gate: 4-letter theme
-- words are common (33 of 148 sampled), so a club that raises min_word_length
-- to 5 would otherwise have real answers rejected as "too short".
--
-- HARD vs SOFT rejects. A structurally impossible path (off-board,
-- non-adjacent, self-crossing) RAISES: the FE's reducer cannot produce one, so
-- it means a broken client, and logging it would pollute an event log that
-- players read. A path through a SPENT tile also raises, with one honest route
-- in: a coop submit in flight while a peer's find lands. A word that is merely
-- wrong — too short, unknown, already counted — is a legitimate move, so it
-- answers softly and IS logged.
--
-- Solving: coop — the game ends reached_goal / solved, the team ranked 1 and
-- solved. Compete — the solver's own race ends (solved_at, reached_goal), and
-- the race ends once nobody is left racing (_maybe_finish_compete).
--
-- The `for update` lock serializes concurrent coop submissions against the
-- shared hint bar and the found set.
create or replace function strands.submit_path(p_game_id uuid, p_path jsonb)
returns jsonb
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  caller_id      uuid;
  g              strands.games%rowtype;
  v_mode         text;
  n              int;
  rs             int[];
  cs             int[];
  consumed       text[];
  norm_path      jsonb;
  v_word         text;
  i              int;
  v_result       text;
  matched        boolean := false;
  v_points       int;
  v_found        int;
  v_total        int;
  v_rankings     jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first: a friend may delete the game from the club list at any
  -- moment, and the delete takes the memberships with it (docs/envelopes.md →
  -- a missing game row is PN485).
  select * into g from strands.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('strands');
  end if;

  caller_id := common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: a teammate finished the board, or the clock ran out, while this
    -- trace was in flight.
    perform common._raise_game_over();
  end if;

  -- A conceded player is out of the race — no more traces. The FE freezes the
  -- board on a concession, so this only fires on a race (a submit in flight
  -- when the concession commits, or a stale second tab).
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- Turn-order gate (no-op for free-for-all). Before classification, so an
  -- out-of-turn trace is refused outright rather than quietly scored.
  perform common._require_turn(p_game_id, caller_id);

  select mode into v_mode from common.games where id = p_game_id;

  -- ─── Structural validation (hard rejects) ────────────────
  -- Every check from here to the classification below is a FAULT, and one
  -- rule covers them all: the frontend BUILDS the trace, cell by cell, through
  -- `clickTile` — which only ever appends an adjacent, unvisited, on-board
  -- cell. A shape that fails one of these did not come from our board. The
  -- single exception is PN421 further down, which a TEAMMATE
  -- can cause.
  if p_path is null or jsonb_typeof(p_path) <> 'array' then
    raise exception 'BUG: a trace that is not a path'
      using errcode = 'PN422', hint = 'fault', column = '_',
      detail = 'path must be a json array';
  end if;
  n := jsonb_array_length(p_path);
  if n < 1 then
    raise exception 'BUG: an empty trace'
      using errcode = 'PN423', hint = 'fault', column = '_',
      detail = 'path must have at least one cell';
  end if;

  -- Every element must be a two-number [row, col] BEFORE the casts below, so a
  -- malformed cell gets this designed error rather than a raw cast failure
  -- (jsonb has no integer type of its own, so integer-ness is "equals its own
  -- floor"; the ::numeric::int cast then accepts an integral 2.0 as 2, which
  -- is what the normalization comment further down promises).
  if exists (
    select 1 from jsonb_array_elements(p_path) e
     where jsonb_typeof(e) <> 'array'
        or jsonb_array_length(e) <> 2
        or jsonb_typeof(e->0) <> 'number'
        or jsonb_typeof(e->1) <> 'number'
        or (e->>0)::numeric <> floor((e->>0)::numeric)
        or (e->>1)::numeric <> floor((e->>1)::numeric)
  ) then
    raise exception 'BUG: a trace cell that is not [row, col]'
      using errcode = 'PN424', hint = 'fault', column = '_',
      detail = 'each path cell must be [row, col]';
  end if;

  select array_agg(((e->>0)::numeric)::int order by ord),
         array_agg(((e->>1)::numeric)::int order by ord)
    into rs, cs
    from jsonb_array_elements(p_path) with ordinality as t(e, ord);

  consumed := strands._consumed_keys(p_game_id, caller_id);

  for i in 1..n loop
    if rs[i] < 0 or rs[i] > 7 or cs[i] < 0 or cs[i] > 5 then
      raise exception 'BUG: a trace off the board'
        using errcode = 'PN425', hint = 'fault', column = '_',
        detail = format('path cell %s is outside the 8x6 board', i - 1);
    end if;
    if (rs[i] || ',' || cs[i]) = any (consumed) then
      -- THE ONE RACE among the path checks, and a teammate causes it: they
      -- found a word overlapping the path you were drawing. The frontend drops
      -- a trace as soon as a peer's find consumes one of its cells, but a find
      -- landing while your trace is in flight beats that. The words are the
      -- frontend's own, from when it owned this sentence.
      raise exception 'Crosses a found word'
        using errcode = 'PN421', hint = 'race', column = '_',
        detail = 'a path cell belongs to an already-found word';
    end if;
    if i > 1 then
      -- 8-way adjacency: diagonals count. Same rule as
      -- src/strands/lib/board.ts `adjacent` and the puzzle importer's.
      if abs(rs[i] - rs[i-1]) > 1 or abs(cs[i] - cs[i-1]) > 1
         or (rs[i] = rs[i-1] and cs[i] = cs[i-1]) then
        raise exception 'BUG: a trace that jumps'
          using errcode = 'PN426', hint = 'fault', column = '_',
      detail = 'consecutive path cells must be 8-way adjacent';
      end if;
      -- No revisiting: a trace may not cross itself.
      if exists (select 1 from generate_series(1, i - 1) k
                  where rs[k] = rs[i] and cs[k] = cs[i]) then
        raise exception 'BUG: a trace that crosses itself'
          using errcode = 'PN427', hint = 'fault', column = '_',
      detail = 'a path may not use a cell twice';
      end if;
    end if;
  end loop;

  -- The word this path spells, read off the frozen board: lowercase, as the
  -- board and the dictionary are stored.
  v_word := '';
  for i in 1..n loop
    v_word := v_word || substr(g.board[rs[i] + 1], cs[i] + 1, 1);
  end loop;

  -- Canonical form for comparison against the stored coords: rebuilt from the
  -- parsed ints so a client sending 2.0 or extra whitespace can't dodge a match.
  select jsonb_agg(jsonb_build_array(r, c) order by ord)
    into norm_path
    from unnest(rs, cs) with ordinality as t(r, c, ord);

  -- ─── 1. A puzzle word? Matched by PLACEMENT + WORD ────────
  -- Two conditions, and both are needed:
  --
  --   the CELLS  — a find is identified by which tiles it consumes, compared
  --                order-independently (see _path_key: a repeated letter can
  --                make two traces cover the same tiles);
  --   the WORD   — so that tracing those same tiles in an order spelling
  --                something else isn't a find.
  --
  -- String alone would misclassify: puzzle words often appear in an ordinary
  -- dictionary too (in one sampled puzzle, all 8 did). Cells alone would accept
  -- a scramble. Together they're exact.
  if strands._path_key(g.solution->'spangram'->'coords') = strands._path_key(norm_path)
     and g.solution->'spangram'->>'word' = v_word then
    matched := true;
    v_result := 'spangram';
  elsif exists (
    select 1 from jsonb_array_elements(g.solution->'themeWords') tw
     where strands._path_key(tw->'coords') = strands._path_key(norm_path)
       and tw->>'word' = v_word
  ) then
    matched := true;
    v_result := 'theme';
  end if;

  -- ─── 2..4. Not a puzzle word: length, dedup, dictionary ───
  if not matched then
    if n < g.min_word_length then
      v_result := 'too_short';
    elsif exists (
      -- Credited-once, scoped like the board: coop shares its credit, compete
      -- keeps each player's own — otherwise your rival finding ADAPT would
      -- silently deny you the point.
      select 1 from strands.events gu
       where gu.game_id = p_game_id
         and gu.word = v_word
         and gu.result = 'hint_word'
         and (v_mode = 'coop' or gu.user_id = caller_id)
    ) then
      v_result := 'duplicate';
    elsif exists (
      -- The MAY-ENTER tier (docs/common.md): difficulty alone gates a word the
      -- player CHOSE to type. No slur / crude / slang / dialect filter — we
      -- don't put those in front of you, and we don't stop you typing one.
      select 1 from common.words w
       where w.word = v_word
         and w.difficulty <= g.band
    ) then
      v_result := 'hint_word';
    else
      v_result := 'invalid';
    end if;
  end if;

  -- `kind` spelled out rather than left to its default: the table holds hints
  -- too, so which kind this row is belongs at the call site.
  -- A trace that FOUND something is a turn; a duplicate, a too-short path and
  -- a word the dictionary does not have are misfires. The game already
  -- declines to punish those, and the column records that rather than
  -- re-deriving it at every read.
  insert into strands.events (game_id, user_id, kind, word, path, result, took_turn)
  values (p_game_id, caller_id, 'guess', v_word, norm_path, v_result,
          v_result in ('theme', 'spangram', 'hint_word'));

  -- ─── Counters ────────────────────────────────────────────
  if v_result = 'hint_word' then
    -- The bar CAPS at hint_cost: points earned while a hint sits unspent are
    -- lost. A deliberate rule, not an overflow bug — the full bar is the
    -- signal, which is why nothing warns about it.
    --
    -- COOP moves every row in lock-step (one shared pool); COMPETE moves only
    -- the earner's.
    update strands.players sp
       set hint_points = least(sp.hint_points + 1, g.hint_cost)
     where sp.game_id = p_game_id
       and (v_mode = 'coop' or sp.user_id = caller_id);
  end if;
  select sp.hint_points into v_points
    from strands.players sp
   where sp.game_id = p_game_id and sp.user_id = caller_id;

  if matched then
    -- A spent hint retires the moment its word is found — for whoever was
    -- looking at it (everyone in coop, just you in compete). By PLACEMENT,
    -- like the match above, so a word traced the other way round still
    -- retires its hint.
    update strands.players sp
       set active_hint_coords = null
     where sp.game_id = p_game_id
       and strands._path_key(sp.active_hint_coords) = strands._path_key(norm_path)
       and (v_mode = 'coop' or sp.user_id = caller_id);
  end if;

  -- Progress is the CALLER's in compete, the team's in coop — the same scope
  -- the board itself uses.
  select count(*) into v_found
    from strands.events gu
   where gu.game_id = p_game_id
     and gu.result in ('theme', 'spangram')
     and (v_mode = 'coop' or gu.user_id = caller_id);
  v_total := jsonb_array_length(g.solution->'themeWords') + 1;

  -- ─── Solving ─────────────────────────────────────────────
  -- "Every puzzle word found" and "every cell used" are the same statement,
  -- because the puzzle words tile the board exactly. Counting words is the
  -- cheaper half of that identity.
  if matched and v_found >= v_total then
    if v_mode = 'coop' then
      update common.game_players set solved_at = now() where game_id = p_game_id;
      select jsonb_object_agg(user_id::text, 1) into v_rankings
        from common.game_players where game_id = p_game_id;
      perform common._end_game(
        p_game_id, 'reached_goal', 'solved', caller_id,
        p_is_no_result => false,
        p_final_rankings => v_rankings
      );
    else
      -- Solving ends YOUR race, not THE race: a player still going could yet
      -- finish on fewer hints. A solver nothing is waiting for must not hold
      -- presence-pause open for the players still tracing, which is what
      -- ending their own race says.
      update common.game_players set solved_at = now()
       where game_id = p_game_id and user_id = caller_id;
      -- `neutral`: fewer hints may yet beat it (`announce-when-ended`).
      perform common._set_player_ended(p_game_id, caller_id, 'reached_goal', 'solved', 'neutral');
      perform strands._maybe_finish_compete(p_game_id, 'reached_goal', 'solved', caller_id);
    end if;
  elsif v_result in ('theme', 'spangram', 'hint_word') then
    -- Turn-order advances only on an ACCEPTED move. A rejected trace (too
    -- short, unknown, already counted) is a misfire, not a turn. No-op in
    -- compete, whose pointer is null.
    perform common._advance_turn(p_game_id);
  end if;

  perform strands._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  -- SIX `ok` answers, and three of them read like refusals without being one:
  -- `duplicate`, `too_short` and `invalid` are the game's rules applied to a
  -- move that genuinely happened — a game-rule refusal is `ok`, because
  -- answering is what the move was FOR (docs/envelopes.md). Nothing local was
  -- consulted first: strands ships no word list to the client, so the
  -- server's verdict is the first anyone knows.
  --
  -- The case alone: what each result reads as, and its words, are the
  -- frontend's (src/strands/lib/answer.ts).
  return common._ok_envelope(
    jsonb_build_object('result', v_result, 'hint_points', v_points));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function strands.submit_path(uuid, jsonb) from public;
grant execute on function strands.submit_path(uuid, jsonb) to authenticated;

drop function if exists strands.spend_hint(uuid);

-- ============================================================
-- strands.spend_hint — cash the bar for a revealed word
-- ============================================================
-- Picks a RANDOM unfound puzzle word and publishes its COORDS (never its word:
-- a hint rings the tiles and leaves the player to work out the order).
--
-- Server-side by necessity, not preference: the coop hint pool is SHARED, so
-- every player must see the same revealed word. A client-side pick would show
-- three players three different hints for one spent token.
--
-- NOT turn-gated. Spending is a team decision about a team resource, not a
-- move, so it neither requires nor consumes a turn in a turn-order game.
--
-- The `ok` carries `result` alone: the ring is on the board once the blobs
-- are rebuilt, and what a spent hint reads as is the frontend's
-- (src/strands/lib/answer.ts).
create or replace function strands.spend_hint(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  caller_id uuid;
  g         strands.games%rowtype;
  v_mode    text;
  p_row     strands.players%rowtype;
  coords    jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first: a friend may delete the game from the club list at any
  -- moment, and the delete takes the memberships with it (docs/envelopes.md →
  -- a missing game row is PN485).
  select * into g from strands.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('strands');
  end if;

  caller_id := common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  -- Same guard as submit_path: a conceded player has no race left to hint.
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  select mode into v_mode from common.games where id = p_game_id;

  -- ─── The three the SHARED POOL makes racy ──────────────
  -- In coop the hint bar is one resource with several hands on it, so a
  -- teammate can fill it, spend it or ring a word between your check and your
  -- click.
  select * into p_row from strands.players
   where game_id = p_game_id and user_id = caller_id;
  if (select solved_at from common.game_players
        where game_id = p_game_id and user_id = caller_id) is not null then
    -- Your own solve, arriving by subscription while the hint button is still
    -- up: it has no in-flight lock of its own.
    raise exception 'You''ve already finished this board'
      using errcode = 'PN431', hint = 'race', column = '_',
      detail = 'this player has already consumed the board';
  end if;

  if p_row.hint_points < g.hint_cost then
    -- The button computes the shortfall itself and says so without calling, so
    -- reaching here proves the pool moved after that check.
    raise exception 'Hint bar not full yet'
      using errcode = 'PN432', hint = 'race', column = '_',
      detail = 'the hint bar is not full';
  end if;

  -- An unspent hint blocks a second one: the board can only ring one word at a
  -- time without becoming unreadable, and the bar is capped anyway.
  if p_row.active_hint_coords is not null then
    raise exception 'A hint is already showing'
      using errcode = 'PN433', hint = 'race', column = '_',
      detail = 'one puzzle word is already ringed';
  end if;

  -- A word already found is not worth revealing. WHOSE finds count is the
  -- board's own rule — shared in coop, your own in compete. By PLACEMENT, so
  -- a word found via the other equivalent trace counts as found.
  select tw->'coords' into coords
    from jsonb_array_elements(
           g.solution->'themeWords' || jsonb_build_array(g.solution->'spangram')
         ) tw
   where not exists (
     select 1 from strands.events gu
      where gu.game_id = p_game_id
        and gu.result in ('theme', 'spangram')
        and strands._path_key(gu.path) = strands._path_key(tw->'coords')
        and (v_mode = 'coop' or gu.user_id = caller_id)
   )
   order by random()
   limit 1;

  if coords is null then
    -- UNREACHABLE, so a fault rather than a refusal: a board with everything
    -- found has already ended, and the gate above catches that.
    raise exception 'BUG: a hint with every puzzle word found'
      using errcode = 'PN434', hint = 'fault', column = '_',
      detail = 'every puzzle word is already found';
  end if;

  -- Coop shares the pool, so the emptied bar AND the reveal land on every row —
  -- one token bought one hint for the team. Compete's pool is the spender's
  -- alone. Either way the hint is counted to whoever cashed it.
  update strands.players sp
     set active_hint_coords = coords,
         hint_points = 0,
         n_hints_used = sp.n_hints_used + (sp.user_id = caller_id)::int
   where sp.game_id = p_game_id
     and (v_mode = 'coop' or sp.user_id = caller_id);

  -- Log it: ONE row attributed to the caller, not one per player — a shared
  -- pool still has a single person who decided to cash it. `path` carries the
  -- canonical coords, so the history viewer can re-ring the hint exactly as it
  -- looked; `word` stays null, since a hint has never said its word.
  insert into strands.events (game_id, user_id, kind, path, took_turn)
  values (p_game_id, caller_id, 'hint', coords, false);

  perform strands._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(jsonb_build_object('result', 'hinted'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function strands.spend_hint(uuid) from public;
grant execute on function strands.spend_hint(uuid) to authenticated;

drop function if exists strands.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists strands.end_game(uuid);

-- ============================================================
-- strands.stop_game — the Stop
-- ============================================================
-- Any player may end it: a group decision, not an owner's. Neutral in both
-- modes (docs/common-schema.md → Stop): compete does NOT crown the best
-- solver here — a race called off early didn't finish, and handing the trophy
-- to whoever was ahead would reward stopping at the right moment.
--
-- Ending puts the solution in `game_data` but on nobody's screen: each player
-- asks for it with their own Reveal, a local display toggle.
create or replace function strands.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the winning trace waits for it and then reads the
  -- game as over. The row check comes before the membership gate — see
  -- replay_board.
  perform 1 from strands.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('strands');
  end if;

  perform common._stop(p_game_id);

  perform strands._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function strands.stop_game(uuid) from public;
grant execute on function strands.stop_game(uuid) to authenticated;

drop function if exists strands.concede(uuid);

-- ============================================================
-- strands.concede — drop out of a compete race
-- ============================================================
-- Compete only: a coop team has nobody to keep racing, so it stops with
-- stop_game instead. `common._concede` records the concession (and ends the
-- game as a loss if every player conceded); then, since a racer may also end
-- by solving, _maybe_finish_compete checks whether the concession left
-- nobody racing — a table where two players quit and a third had already
-- SOLVED ends with that solver winning.
create or replace function strands.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  caller_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a last solve and a last concession serialize and one of them
  -- sees the other's result (docs/common-schema.md → Concede).
  perform 1 from strands.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('strands');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  caller_id := common._concede(p_game_id);
  perform strands._maybe_finish_compete(p_game_id, 'conceded', 'conceded', caller_id);

  perform strands._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function strands.concede(uuid) from public;
grant execute on function strands.concede(uuid) to authenticated;

drop function if exists strands.replay_board(uuid);

-- ============================================================
-- strands.replay_board — run this puzzle back
-- ============================================================
-- Same board, everything the players did wiped: the event log, the found
-- words (which live IN that log), the hint bar, the spend count, any showing
-- hint, and every solve. Callable mid-game or after the game ends — it's a
-- restart. The solution leaves `game_data` again: the builder writes it only
-- once the game has ended, and common._reset_game clears the ending.
create or replace function strands.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- FOR UPDATE: a replay racing a submission must not interleave with it, or
  -- the reset could land on a half-applied move — a stray log row in the
  -- "fresh" game, or an in-flight winning move ending the board just reset.
  perform 1 from strands.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('strands');
  end if;

  -- The row check comes BEFORE the membership gate: `delete_game` takes this
  -- row, `common.games` and every `game_players` row together, so a caller
  -- whose game was just deleted has no membership left either, and would be
  -- told "You are not in this game" — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  delete from strands.events where game_id = p_game_id;

  update strands.players
     set hint_points = 0,
         n_hints_used = 0,
         active_hint_coords = null
   where game_id = p_game_id;

  update common.game_players set solved_at = null where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform strands._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function strands.replay_board(uuid) from public;
grant execute on function strands.replay_board(uuid) to authenticated;

drop function if exists strands.submit_timeout(uuid);

-- ============================================================
-- strands.submit_timeout — the countdown expiring
-- ============================================================
-- Fired by every connected client when its local countdown hits 0; the row
-- lock serializes them, the first ends the game, and the rest find it over
-- and answer the game-over race.
--
-- The clock is a LOSS in coop: the game had a REACHABLE END — find every
-- puzzle word — and the team didn't reach it. In compete it stops the race
-- wherever it stands, and the ranking is applied to whoever HAD solved; a
-- player mid-board simply didn't finish. Ended by whoever held the turn in
-- turn-by-turn coop, else nobody.
create or replace function strands.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = strands, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  v_ended_by uuid;
begin
  perform 1 from strands.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('strands');
  end if;

  perform common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  select current_turn_user_id into v_ended_by from common.games where id = p_game_id;

  if (select mode from common.games where id = p_game_id) = 'compete' then
    perform strands._finish_compete(p_game_id, 'timeout', 'timeout', v_ended_by);
  else
    perform common._end_game(
      p_game_id, 'timeout', 'timeout', v_ended_by,
      p_is_no_result => false,
      p_final_rankings => '{}'::jsonb
    );
  end if;

  perform strands._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function strands.submit_timeout(uuid) from public;
grant execute on function strands.submit_timeout(uuid) to authenticated;
