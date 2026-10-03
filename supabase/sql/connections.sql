-- cs-blessed-connections

-- ============================================================
-- connections
-- ============================================================
-- What the frontend calls:
--
--   next_puzzle_for_club  the earliest puzzle none of the players has played,
--                         for the setup dialog and create_game
--   puzzle_for_date       the puzzle published on a date, whoever has played it
--   create_game           deals a puzzle's sixteen tiles and starts the game
--   submit_guess          records a guess the frontend has already judged
--   concede               a racer drops out of a compete game
--   stop_game             stops the game for everyone, with no result
--   submit_timeout        ends the game when the countdown runs out
--   replay_board          restarts the same tiles from scratch
--
-- What is particular to connections (src/connections/doc.md has the rest):
--   - The frontend knows the answer: the categories are on the public board,
--     the frontend judges each guess, and submit_guess checks only the
--     payload's shape and the game's state (the trust model).
--   - Puzzles come from an imported archive, taken in order: the earliest
--     date nobody about to be seated has played, in any club.
--   - A player is out on the fourth mistake. Coop's budget is the team's,
--     spent by every player's own misses summed; in compete each racer has
--     their own, and the first to match all four categories wins at once.
--   - Every row is each player's own, in both modes (plans/team-facts.md);
--     what the team shares is summed at build time, into `team`.
--   - The frontend reads none of these tables: it reads the page blobs the
--     builder writes onto `common.games` (The page blobs, below). What a
--     racer may see of a rival mid-race is the hook's rule
--     (src/connections/hooks/useGame.ts), not a policy's.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema connections to authenticated;

-- Public knowledge — puzzles aren't sensitive. The setup dialog's two lookups
-- read them, and create_game reads `categories` to build the board.
grant select on connections.puzzles to authenticated;

-- RLS is enabled on this table (20260813000000_rls_seed_tables.sql) so it can't
-- fail open, but the content is not secret and every authenticated player needs
-- all of it — so the policy is permissive. The GRANT above is the real gate;
-- this states the row-level answer instead of leaving it to RLS being off.
drop policy if exists puzzles_select on connections.puzzles;
create policy puzzles_select on connections.puzzles
  for select to authenticated
  using (true);


-- The puzzle-import script (supabase/scripts/import-connections-
-- puzzles.ts) connects as the service_role and needs USAGE on
-- the schema + INSERT on this table. authenticated has no INSERT
-- grant; writes go through service_role only.
grant usage on schema connections to service_role;
grant insert, select on connections.puzzles to service_role;

drop policy if exists games_select on connections.games;
create policy games_select on connections.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Guesses: any club member sees every row. Who may see a rival's guesses
-- mid-race is the hook's rule (src/connections/hooks/useGame.ts), applied to
-- `game_data`; nothing reads this table from the client.
drop policy if exists events_select on connections.events;
create policy events_select on connections.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Players: club-member-wide read in both modes; nothing on the client reads
-- it.
drop policy if exists players_select on connections.players;
create policy players_select on connections.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on connections.games to authenticated;
grant select on connections.events to authenticated;
grant select on connections.players to authenticated;

-- A view this schema does not define. The drop stays here for good: this
-- file is the whole definition of what connections' schema contains, so a
-- database that still carries the view has nothing else that would ever
-- remove it.
drop view if exists connections.club_game_status;

drop function if exists connections.next_puzzle_for_club(uuid[]);

-- ============================================================
-- connections.next_puzzle_for_club — the only puzzle choice there is
-- ============================================================
-- The archive is a queue (src/connections/doc.md → Game rules): the earliest
-- `puzzle_date` that no player in `p_seen_by` has a game on, in ANY club.
-- `p_seen_by` is the people about to be seated — create_game's
-- `p_player_user_ids`, and the same array the setup dialog passes for its
-- preview — so a puzzle one of them played alone elsewhere is out, and one
-- played by four OTHER people in a big club is not.
--
-- SECURITY DEFINER on purpose: another player's solo-club games are invisible
-- to the caller under RLS, and they are exactly what has to be excluded. What
-- escapes is a puzzle id — never a club, a game or a name — though a reader
-- could infer roughly how far a club-mate has got from which puzzles they are
-- not offered. Friends, not adversaries (CLAUDE.md's trust model).
--
-- Matching is on `puzzle_date`, NOT `puzzle_id`: the FK is soft
-- (`on delete set null`, the library-puzzle provenance rule), so a re-import
-- can orphan it, while the denormalized date on the game row is the durable
-- identity. Ascending, so a club works forward through the archive in
-- publication order.
--
-- `data` is ONE puzzle. The empty case — everyone here has played everything
-- — is a form-validation not-ok (the raise below says why), so there is no
-- `ok` arm for it; the handler at the bottom turns the raise into an
-- envelope, and a raw Postgres error still reaches `runRpc` as a fault.
-- `plpgsql`, not `sql`, because the empty case RAISES.
create or replace function connections.next_puzzle_for_club(p_seen_by uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = connections, common, public, extensions
as $$
    declare
  found jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  select s.found into found from (
      select (
        select jsonb_build_object(
                 'id', p.id,
                 'puzzle_date', p.puzzle_date,
                 -- What the dialog shows as "next up". The date leads (it is the
                 -- puzzle's name, even if nobody picks by it), then the two
                 -- alphabetically-first tiles as a human-readable fingerprint —
                 -- enough to tell two puzzles apart, and no more of a spoiler
                 -- than the sixteen you see a second later.
                 'label',
                 p.puzzle_date::text || ': ' || coalesce(
                   (select string_agg(t.tile, ', ' order by t.tile)
                      from (select jsonb_array_elements_text(c -> 'tiles') as tile
                                      from jsonb_array_elements(p.categories) c
                                     order by 1
                                     limit 2) t),
                   '?')
               )
          from connections.puzzles p
         where p.puzzle_date is not null
           and not exists (
                 select 1
                   from connections.games g
                   join common.game_players gp on gp.game_id = g.game_id
                  where g.puzzle_date = p.puzzle_date
                    and gp.user_id = any(p_seen_by)
               )
         order by p.puzzle_date
         limit 1
      ) as found
    ) s;

  -- PN302 — a VALIDATION, not an empty success. Running out of puzzles is not
  -- a quieter kind of yes: it BLOCKS Start, and what fixes it is an input on
  -- this very form — uncheck a player who has played them all, or type a date
  -- and play one again. That is the shape of a validation, and it belongs on
  -- the form, in red, rather than in a passing line.
  --
  -- `column = 'puzzle_id'` — the PUZZLE field, not the form line. Two controls
  -- can technically fix this, but nobody setting up a game thinks "remove a
  -- player to get a puzzle"; the answer belongs where the question was asked.
  -- `serverErrorKeys.test.ts` has a justified entry for it: a LOADER's
  -- parameters are the question (which players?), never the field its answer
  -- lands in, so the usual "name one of your own arguments" rule cannot apply.
  --
  -- The sentence NAMES THE REMEDY, which is what makes the red date field make
  -- sense rather than look like an accusation: the field it lights up is the
  -- way out of the condition it is reporting. It carries no brand:
  -- `Connections` is the manifest's, not the schema's (docs/naming.md →
  -- codename vs brand), and the dialog is already titled with it.
  if found is null then
    raise exception 'Everyone here has played every puzzle. You can open one already played by its date.'
      using errcode = 'PN302', hint = 'form-validation', column = 'puzzle_id',
      detail = 'no puzzle unseen by every uid in p_seen_by';
  end if;

  return common._ok_envelope(jsonb_build_object('result', 'found', 'puzzle', found));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function connections.next_puzzle_for_club(uuid[]) from public;
grant execute on function connections.next_puzzle_for_club(uuid[]) to authenticated;

drop function if exists connections.puzzle_for_date(date);

-- ============================================================
-- connections.puzzle_for_date — the deliberate override
-- ============================================================
-- next_puzzle_for_club answers the common case ("give us one nobody here has
-- done"). This answers the rare one: you know a date and you want THAT
-- puzzle — the friends talked about it, or you want to replay one together.
--
-- It filters NOTHING. A puzzle every player has already finished comes back
-- exactly like an untouched one, and create_game will start a second game on
-- it rather than reopening the first. That is the point of an override: the
-- picker's whole job is to stop you stumbling into a repeat, and this is the
-- door marked "yes, I mean it".
--
-- SECURITY INVOKER (unlike its sibling, which must see across clubs to
-- exclude): this reads only connections.puzzles, which is public reference
-- data with a plain select grant. Nothing about anyone's history is involved.
--
-- Same return shape as next_puzzle_for_club, so the shared setup section can
-- render either without caring which it asked. `puzzle_date` is unique, so
-- this is one puzzle or none; none means nothing was published that day —
-- PN303, a VALIDATION for the same reason PN302 is one: it blocks Start, and
-- the thing that fixes it is the box you just typed in. Here
-- `column = 'puzzle_id'` is the field literally being edited. `plpgsql`, not
-- `sql`, because the empty case RAISES.
create or replace function connections.puzzle_for_date(target_date date)
returns jsonb
language plpgsql
stable
set search_path = connections, common, public, extensions
as $$
declare
  found jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  select s.found into found
    from (
      select (
        select jsonb_build_object(
                 'id', p.id,
                 'puzzle_date', p.puzzle_date,
                 'label',
                 p.puzzle_date::text || ': ' || coalesce(
                   (select string_agg(t.tile, ', ' order by t.tile)
                      from (select jsonb_array_elements_text(c -> 'tiles') as tile
                                      from jsonb_array_elements(p.categories) c
                                     order by 1
                                     limit 2) t),
                   '?')
               )
          from connections.puzzles p
         where p.puzzle_date = target_date
      ) as found
    ) s;

  -- The date is IN the message, because the field it lands under holds the date
  -- and a bare "no puzzle" would make the reader check what they typed.
  if found is null then
    raise exception 'No puzzle for %. Try another date.', target_date
      using errcode = 'PN303', hint = 'form-validation', column = 'puzzle_id',
      detail = 'no connections.puzzles row with that puzzle_date';
  end if;

  return common._ok_envelope(jsonb_build_object('result', 'found', 'puzzle', found));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

-- `security invoker` (the default), unlike its twin — it filters nothing, so it
-- needs no elevated view of other clubs' games. That makes the grant below
-- load-bearing: running as the caller, it needs `common._ok_envelope` to be
-- callable by `authenticated`, which is granted where the builder is defined.
revoke execute on function connections.puzzle_for_date(date) from public;
grant execute on function connections.puzzle_for_date(date) to authenticated;

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- connections' own, each builder bearing its column's name (the three verbs
-- are supabase/sql/common.sql → The page blobs' common parts). `game_data` is
-- the common part (supabase/sql/common.sql → The page blobs' common parts)
-- with connections' facts on top; the pieces below build each part, so
-- `select game_data from common.games` shows the page what it gets.
--
--   game_data, connections' part:
--     puzzle: {date, cats, tileOrder}       frozen at create_game: the NYT date (null
--                                           for a puzzle that is not one of theirs),
--                                           the four categories, the sixteen tiles
--                                           in this game's shuffle; public in both
--                                           modes (the frontend judges each guess)
--     team: {nMatchedCats, nMistakes}       what the team shares, summed over the
--                                           rows; null in compete, where there is no
--                                           team (plans/team-facts.md)
--     events: [{id, userId, tiles, result, matchedCatRank, at}, …]
--                                           every player's; what a racer may see of a
--                                           rival mid-race is the hook's rule
--     players: [player, …]                  the common player, plus:
--       nMatchedCats                        this player's own, in every mode
--       nMistakes                           this player's own, in every mode
--       maxMistakes                         the budget, the same on every player
--       board: {matchedCats, tilesLeft}     what this seat's grid shows: the bands,
--                                           each a category with its `matchedAt`, in
--                                           the order they were matched, and the
--                                           tiles still loose in `tileOrder`; one
--                                           board in coop, each racer's own in compete
--
--   summary_data, connections' part (the common part names and dates the
--   game and carries its ending; the winner is `ending.winner`):
--     team: {nMatchedCats, nMistakes}       the same group; null in compete, whose
--                                           summary shows no progress
--     maxMistakes
--
-- The statuses (`game_status`, `player_status`, `clubpage_info`) are not
-- written: nothing reads connections' any more. The columns stay until a
-- migration retires them for every game.

-- The puzzle this game is played on, as `create_game` froze it onto
-- `connections.games`: the date, and the two halves of the `board` column.
create or replace function connections._make_json_puzzle(g connections.games)
returns jsonb
language sql
immutable
set search_path = connections, common, public, extensions
as $$
  select jsonb_build_object(
    'date',      g.puzzle_date,
    'cats',      g.board -> 'categories',
    'tileOrder', g.board -> 'tileOrder');
$$;

revoke execute on function connections._make_json_puzzle(connections.games) from public;

-- The log: every recorded guess, in the order of play. `result` is the wire
-- word the column stores; what it is worth is the frontend's (lib/answer.ts).
create or replace function connections._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = connections, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',             e.id,
           'userId',         e.user_id,
           'tiles',          to_jsonb(e.tiles),
           'result',         e.result,
           'matchedCatRank', e.matched_cat_rank,
           'at',             e.created_at) order by e.id), '[]'::jsonb)
    from connections.events e
   where e.game_id = p_game_id;
$$;

revoke execute on function connections._make_json_events(uuid) from public;

-- What one seat's grid shows. A matched category IS a `result = 'correct'`
-- row joined to the puzzle's category by rank, so the bands are those rows in
-- the order they were written — the team's in coop, the seat's own in compete
-- — each category carrying when it was matched; the loose tiles are
-- `tileOrder` with the bands' tiles taken out, in the same order.
create or replace function connections._make_json_board(p_game_id uuid, p_user_id uuid, p_mode text)
returns jsonb
language sql
stable
set search_path = connections, common, public, extensions
as $$
  with matched as (
    select cat || jsonb_build_object('matchedAt', e.created_at) as cat, e.id
      from connections.events e
      join connections.games g on g.game_id = e.game_id
      join lateral jsonb_array_elements(g.board -> 'categories') cat
        on (cat ->> 'rank')::int = e.matched_cat_rank
     where e.game_id = p_game_id
       and e.result = 'correct'
       and (p_mode = 'coop' or e.user_id = p_user_id)
  ),
  banded as (
    select jsonb_array_elements_text(cat -> 'tiles') as tile from matched
  )
  select jsonb_build_object(
    'matchedCats', (select coalesce(jsonb_agg(cat order by id), '[]'::jsonb) from matched),
    'tilesLeft',   (select coalesce(jsonb_agg(t.tile order by t.ord), '[]'::jsonb)
                      from connections.games g,
                           jsonb_array_elements_text(g.board -> 'tileOrder') with ordinality as t(tile, ord)
                     where g.game_id = p_game_id
                       and t.tile not in (select tile from banded)));
$$;

revoke execute on function connections._make_json_board(uuid, uuid, text) from public;

-- What the team shares: the two counts summed over every row. Each row holds
-- its player's own, so the sum counts every match and every miss once. Null
-- in compete, where there is no team (plans/team-facts.md).
create or replace function connections._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = connections, common, public, extensions
as $$
  select case when cg.mode = 'coop' then (
           select jsonb_build_object(
             'nMatchedCats', sum(n_matched_cats),
             'nMistakes',    sum(n_mistakes))
             from connections.players
            where game_id = p_game_id)
         end
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function connections._make_json_team(uuid) from public;

-- Every player as connections' game_data shows them: the common player, with
-- their own two counts, the budget and this seat's board. The budget is the
-- game's constant, four, the same `MISTAKE_BUDGET` the frontend holds.
create or replace function connections._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = connections, common, public, extensions
as $$
  select jsonb_agg(
           cp.player || jsonb_build_object(
             'nMatchedCats', p.n_matched_cats,
             'nMistakes',    p.n_mistakes,
             'maxMistakes',  4,
             'board',        connections._make_json_board(p_game_id, cp.id, cg.mode))
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join connections.players p on p.game_id = p_game_id and p.user_id = cp.id
    join common.games cg on cg.id = p_game_id;
$$;

revoke execute on function connections._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with connections' puzzle, team,
-- log and players on top.
create or replace function connections._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = connections, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'puzzle',  connections._make_json_puzzle(g),
           'team',    connections._make_json_team(p_game_id),
           'events',  connections._make_json_events(p_game_id),
           'players', connections._make_json_players(p_game_id))
    from connections.games g
   where g.game_id = p_game_id;
$$;

revoke execute on function connections._make_json_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one.
create or replace function connections._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = connections, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'team',        connections._make_json_team(p_game_id),
    'maxMistakes', 4);
$$;

revoke execute on function connections._make_json_summary_data(uuid, timestamptz) from public;

-- The name this had while it wrote the statuses; supabase/sql is re-applied,
-- not diffed.
drop function if exists connections._write_statuses(uuid, boolean);

-- ============================================================
-- connections._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from connections' own tables,
-- assigning each whole. Every RPC calls it after a move, so the blobs carry
-- what the move left; it is also the repair for one game by hand. Every key
-- is always present, null when it has no value; the shapes are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function connections._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = connections._make_json_game_data(p_game_id),
         summary_data = connections._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function connections._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- connections._rebuild_data_cols_for_all — every connections game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_rebuild_data_cols` over every connections game without re-dating any, and
-- answers how many it rewrote. Run by hand as postgres (`gmake db-psql`); no
-- client calls it, so it has no grant and wears the `_`.
create or replace function connections._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('connections_coop', 'connections_compete')
  loop
    perform connections._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function connections._rebuild_data_cols_for_all() from public;

drop function if exists connections.create_game(text, jsonb, uuid[], text);

-- ============================================================
-- connections.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)
-- ============================================================
-- Starts a game in a club: validates the mode + setup shape, looks up the
-- puzzle by id (or picks the next one nobody here has played), builds the
-- per-game board (the puzzle's categories + a freshly-shuffled tileOrder),
-- writes the common header through common._create_game, then its own row and
-- one connections.players row per player (both counts default to 0), and
-- writes the page blobs.
--
-- `p_player_user_ids` is the explicit list of who's actually playing THIS
-- game. Defaults are not enforced server-side; the FE's setup dialog
-- defaults to all current club members but lets the player pick a subset.
-- The caller must be in it (common._create_game checks).
--
-- Setup shape:
--   {
--     "puzzle_id": "<uuid>",         -- OPTIONAL; absent means "you choose"
--     "timer": (
--         { "kind": "none" }
--       | { "kind": "countup" }
--       | { "kind": "countdown", "seconds": <int 1..3600> }
--     ),
--     "coop_style": "free-for-all" | "turns",
--     "first_turn_user_id": "<uuid>"  -- with "turns" only
--   }
--
-- Title formula: "<puzzle_date>: <TILE1>-<TILE2>" where TILE1/TILE2
-- are the first 2 alphabetical tiles across all 16.
-- A puzzle is hard to remember by date alone; the tiles ground it
-- in something memorable ("oh, that one with BUCKS and HAIL").
create or replace function connections.create_game(
  p_club_handle text,
  p_setup jsonb,
  p_player_user_ids uuid[],
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  new_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  s_puzzle_id uuid;
  puzzle_row connections.puzzles%rowtype;
  board_categories jsonb;
  tile_order text[];
  j int;
  tmp text;
  first_two_tiles text;
  game_title text;
  first_turn uuid;
begin
  -- ─── Validate mode + player-count ────────────────────────
  perform common._require_valid_mode(p_mode);

  if p_mode = 'compete' then
    -- Compete needs an opposing PLAYER. The FE manifest hides the
    -- compete Start button in 1-player clubs; this guard is the
    -- server-side catch. Matches psychicnum's pattern.
    if coalesce(array_length(p_player_user_ids, 1), 0) < 2 then
      raise exception 'BUG: race with fewer than two players'
        using errcode = 'PN061', hint = 'fault', column = '_',
      detail = 'compete needs >= 2 players';
    end if;
  end if;

  -- Player-count upper bound. Must agree with the
  -- `numberOfPlayers: [1, 6]` (coop) / `[2, 6]` (compete)
  -- declarations in src/connections/manifest.ts.
  perform common._require_player_count_max(p_player_user_ids, 6);

  -- ─── Which puzzle ────────────────────────────────────────
  -- ABSENT is the normal case, and it means "you choose": the setup dialog
  -- has no picker, so the server derives the next puzzle nobody being seated
  -- has played (next_puzzle_for_club above). Deriving HERE rather than
  -- trusting a value the dialog computed is what makes the preview and the
  -- actual start impossible to disagree — if someone else starts the same
  -- puzzle while your dialog sits open, you get the genuinely-next one
  -- instead of a duplicate.
  --
  -- PRESENT still wins, and that is not a leftover: every test fixture pins
  -- a specific puzzle (the e2e helpers, pg_temp.connections_setup) because
  -- the assertions are about THAT puzzle's categories. A server that always
  -- chose would make those tests assert against whatever the fixture club
  -- happened not to have played.
  if (p_setup->>'puzzle_id') is null then
    -- Reading the ENVELOPE's `data`, which names its answer: `{"result":
    -- "found", "puzzle": {…}}`. A spent archive is PN302, a not-ok, whose
    -- `data` is null — so this stays null and the next branch raises this
    -- function's own PN062 for it.
    s_puzzle_id := (connections.next_puzzle_for_club(p_player_user_ids)
                      -> 'data' -> 'puzzle' ->> 'id')::uuid;
    if s_puzzle_id is null then
      -- It names the PICKER, not the puzzle box: the archive is exhausted
      -- for THESE players, so unchecking someone is what brings a puzzle
      -- back. Picking a date plays one again, which is a different wish.
      -- The wording deliberately does not say "you have played them all": the
      -- exclusion spans clubs and players, so the usual cause is that SOMEONE
      -- at the table has, which reads as a lie to everyone else.
      raise exception 'Everyone here has played every puzzle'
        using errcode = 'PN062', hint = 'form-validation', column = 'player_user_ids',
        detail = 'every imported puzzle has been played by one of these players';
    end if;
  else
    begin
      s_puzzle_id := (p_setup->>'puzzle_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'BUG: puzzle reference the server cannot read'
        using errcode = 'PN063', hint = 'fault', column = '_',
        detail = 'setup.puzzle_id is not a uuid';
    end;
  end if;

  -- Canonical timer-shape validation. See common._require_valid_timer
  -- for the accepted shapes and the exact raise messages.
  perform common._require_valid_timer(p_setup->'timer');

  -- Load the puzzle. The FK on connections.games.puzzle_id would also
  -- catch a bad id at INSERT time, but a clear "puzzle not found"
  -- error is friendlier than a foreign-key violation. RLS-free
  -- read (the table has a permissive SELECT grant).
  select * into puzzle_row from connections.puzzles
   where connections.puzzles.id = s_puzzle_id;
  if not found then
    -- The id came from this server moments ago, so reaching here means the
    -- puzzle was retired between picking it and pressing Start. Clearing the
    -- date is the fix, which is the box it names.
    raise exception 'That puzzle is no longer available'
      using errcode = 'PN065', hint = 'form-validation', column = 'puzzle_id',
      detail = 'no connections.puzzles row for that id; run the puzzle import';
  end if;

  board_categories := puzzle_row.categories;

  -- Extract all 16 tiles from the puzzle's categories.
  select array_agg(t)
    into tile_order
    from jsonb_array_elements(board_categories) c,
         jsonb_array_elements_text(c->'tiles') t;

  -- Title = "<puzzle_date>: <TILE1>-<TILE2>" — same formula in both modes; the
  -- puzzle's NYT date is mode-independent, and players still want a memorable
  -- handle on the game in the club list regardless of mode. The two tiles are
  -- a peek at the board — a date alone says which puzzle, not what's in it.
  -- Built BEFORE the shuffle since alphabetical order is order-independent.
  select string_agg(t, '-' order by t) into first_two_tiles
    from (
      select unnest(tile_order) as t
      order by 1
      limit 2
    ) first2;
  game_title := format('%s: %s', puzzle_row.puzzle_date, first_two_tiles);

  -- Fisher-Yates shuffle for the display order.
  for i in reverse 16..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tile_order[i];
    tile_order[i] := tile_order[j];
    tile_order[j] := tmp;
  end loop;

  -- Common-side coordination: validates auth + caller membership +
  -- player membership, inserts common.games (with title + setup) +
  -- game_players, returns the canonical id we'll use below.
  --
  -- The saved default strips `puzzle_id` so a remembered puzzle can never
  -- re-pin an already-played one over the derivation, and
  -- `first_turn_user_id` because it is a per-game "who goes first" pick, not
  -- a per-club preference. The coop_style toggle rides.
  new_id := common._create_game(
    p_club_handle, 'connections_' || p_mode, p_mode, p_player_user_ids, game_title,
    p_setup,
    p_setup - 'first_turn_user_id' - 'puzzle_id'
  );

  -- Opt-in turn-by-turn coop: when setup.coop_style='turns', seat the common
  -- rotation so submit_guess gates each guess. Free-for-all / compete leave
  -- the pointer null. Runs after common._create_game seeds game_players.
  if p_mode = 'coop' and p_setup->>'coop_style' = 'turns' then
    first_turn := (p_setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(p_player_user_ids)) then
      raise exception 'BUG: first player who is not in the game'
        using errcode = 'PN064', hint = 'fault', column = '_',
      detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  -- Copy the puzzle's categories AND date onto the game (board + puzzle_date),
  -- so the game is self-contained — playable + self-describing even if the
  -- puzzle is later deleted (puzzle_id is a soft, provenance-only FK).
  insert into connections.games (game_id, puzzle_id, puzzle_date, board)
  values (
    new_id,
    s_puzzle_id,
    puzzle_row.puzzle_date,
    jsonb_build_object('categories', board_categories,
                       'tileOrder',  to_jsonb(tile_order))
  );

  -- One player row per player, both counts at 0. Each row is its player's
  -- own in either mode; coop's shared budget is their sum.
  insert into connections.players (game_id, user_id)
  select new_id, uid from unnest(p_player_user_ids) as uid;

  perform connections._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  -- `result` even though this is the only `ok` this function has — a call site
  -- cannot assert a case the payload does not carry, and the alternative it is
  -- left with (`typeof data.id === 'string'`) is a shape test rather than
  -- equality against a value. SetupGameModal branches on exactly this; without
  -- it the game was created and the player got the chain's scream.
  return common._ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

-- One block, and it has never heard of any specific condition: it reads the
-- SQLSTATE, re-raises anything that isn't ours, and lets the raise itself carry
-- the message, the kind and the field.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function connections.create_game(text, jsonb, uuid[], text) from public;
grant execute on function connections.create_game(text, jsonb, uuid[], text) to authenticated;

drop function if exists connections._maybe_finish_compete(uuid);

-- ============================================================
-- connections._maybe_finish_compete — end the game if nobody's alive
-- ============================================================
-- A compete game ends when NO player is still in it — every one has ended,
-- by four mistakes or by conceding (a solve is an immediate win, handled in
-- submit_guess). Shared by submit_guess (a 4th mistake can knock out the
-- last player) and connections.concede (a drop-out can leave nobody). It is
-- a collective loss, nobody ranked; the act passed is the last player's and
-- becomes the game's reason (plans/common-tables.md → The game's reason is
-- the act that ended the game). Everyone conceding is `common._concede`'s
-- ending, so this skips a game that has already ended.
--
-- Returns true when it ended the game.
create or replace function connections._maybe_finish_compete(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = connections, common, public, extensions
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

  perform common._end_game(
    p_game_id, p_reason, p_reason_detail, p_ended_by_user_id,
    p_is_no_result => false,
    p_final_rankings => '{}'::jsonb
  );
  return true;
end;
$$;

revoke execute on function connections._maybe_finish_compete(uuid, text, text, uuid) from public;

drop function if exists connections.submit_guess(uuid, text[], text, int);

-- ============================================================
-- connections.submit_guess — record a submission (mode-aware)
-- ============================================================
-- The frontend knows the answer: the caller has already evaluated the guess
-- against the public `board.categories` and sends the result and, when
-- result='correct', the matched category's rank. This validates auth, the
-- payload shape and the game state, then records and branches on mode.
--
-- Every write lands on the CALLER's row, in both modes (plans/team-facts.md):
-- a match is theirs, a miss is theirs. What differs by mode is what the
-- counts are checked against.
--
-- Coop branch:
--   - correct → a rank anyone already matched is a race; otherwise insert
--     the events row; 4 matched across the team → reached_goal/'solved', the
--     team ranked 1.
--   - wrong/oneAway → a repeat of a tile set anyone already tried is a race;
--     otherwise insert the row and n_mistakes++ on the caller's row; the
--     team's misses summed reaching 4 → resource_exhausted/'mistakes'.
--
-- Compete branch:
--   - a caller with n_mistakes >= 4 is out: a race.
--   - correct → a rank the caller already matched is a race; otherwise
--     insert the row; the caller's 4th match ends the race at once, the
--     caller alone ranked 1 (the rest are short of the goal).
--   - wrong/oneAway → a repeat of the caller's own tile set is a race;
--     otherwise insert the row and n_mistakes++ on the caller's row; the 4th
--     mistake ends that player, and _maybe_finish_compete ends the game if
--     nobody is left.
--
-- "Already matched" is checked here rather than by an index, since the games
-- row lock below makes the check safe against a concurrent guess
-- (plans/common-tables-schema.md → The database describes a row's shape, not
-- the game's rules).
--
-- Turn-order coop advances the turn on every recorded guess that doesn't end
-- the game; a race records nothing and advances nothing.
--
-- Concurrency: SELECT FOR UPDATE on connections.games serializes concurrent
-- submits across both modes. Two racers submitting the same correct guess:
-- the first commits as the winner, the second finds the game ended and
-- answers the game-over race.
create or replace function connections.submit_guess(
  p_game_id uuid,
  p_tiles text[],
  p_result text,
  p_matched_category_rank int default null
)
returns jsonb
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  caller_id uuid;
  v_mode text;
  v_ended_at timestamptz;
  caller_mistakes int;
  caller_matched int;
  team_matched int;
  team_mistakes int;
  v_rankings jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Lock the game row: every guess, match and mistake serializes on it.
  perform 1 from connections.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('connections');
  end if;

  -- Auth + game-player gate (deferred to after the lock). See
  -- common._require_game_player — checks the caller is actually
  -- IN this game (per common.game_players), not just a club
  -- member. A club member who didn't sit down at this game can
  -- still WATCH it (club-wide RLS) but can't act.
  caller_id := common._require_game_player(p_game_id);

  select ended_at, mode into v_ended_at, v_mode
    from common.games where id = p_game_id;

  if v_ended_at is not null then
    -- A race: a teammate ended the game (or it timed out) while this guess was
    -- in flight. The FE hides the board once the game ends, so the only way
    -- here is a client that has not heard yet.
    perform common._raise_game_over();
  end if;

  -- A conceded player is out of the race — no more guesses. The FE hides the
  -- board from a conceder, so this only fires on a race (a guess in flight
  -- when the concession commits, or a stale second tab). Without it a
  -- conceder could complete the win condition and be recorded the winner.
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- Turn-order gate (opt-in turn-by-turn coop). No-op for free-for-all
  -- (pointer null) and compete; raises 'not your turn' otherwise. The
  -- turn ADVANCES only on the two coop continue paths below
  -- (a fresh correct-but-not-won guess, a fresh wrong-but-not-lost guess)
  -- — a duplicate raises before either.
  perform common._require_turn(p_game_id, caller_id);

  -- ─── Light payload validation (mode-independent) ─────────
  -- Server-side checks for shape, not for rule correctness — the
  -- FE is trusted to apply the rules under the friends-only
  -- trust model (see CLAUDE.md). These guards catch malformed
  -- payloads (lengths, enum values) so the data we persist is at
  -- least well-typed.
  if p_tiles is null or array_length(p_tiles, 1) <> 4 then
    raise exception 'BUG: guess that was not four tiles'
      using errcode = 'PN247', hint = 'fault', column = '_',
      detail = format('a guess is exactly 4 tile ids; got %s',
                      coalesce(array_length(p_tiles, 1), 0));
  end if;

  if p_result not in ('correct', 'oneAway', 'wrong') then
    raise exception 'BUG: unknown guess result'
      using errcode = 'PN248', hint = 'fault', column = '_',
      detail = format('result must be correct, oneAway or wrong; got %L', p_result);
  end if;

  if p_result = 'correct' then
    if p_matched_category_rank is null
       or p_matched_category_rank not between 0 and 3 then
      raise exception 'BUG: correct guess with no category'
        using errcode = 'PN249', hint = 'fault', column = '_',
        detail = 'a correct guess must name a category rank 0..3';
    end if;
  end if;

  -- ─── Caller's per-player row (compete needs the elim check) ─
  select n_mistakes into caller_mistakes
    from connections.players
   where game_id = p_game_id and user_id = caller_id;
  if caller_mistakes is null then
    -- _require_game_player passed but there's no players row;
    -- shouldn't happen since create_game seeds them. Defensive.
    raise exception 'BUG: you are not in this game'
      using errcode = 'PN250', hint = 'fault', column = '_',
      detail = 'no connections.players row for the caller';
  end if;

  -- Compete-only: a player out on mistakes can't submit. (In coop the whole
  -- game would already have ended on the team's fourth miss, so the ended
  -- check above catches it.)
  if v_mode = 'compete' and caller_mistakes >= 4 then
    -- A race: your own fourth mistake landed and the row saying so has not
    -- arrived — milliseconds usually, unbounded in a deaf window, permanent in
    -- a stale second tab.
    raise exception 'Out of mistakes'
      using errcode = 'PN251', hint = 'race', column = '_',
      detail = 'this player is out on mistakes';
  end if;

  -- ─── Correct guess ───────────────────────────────────────
  if p_result = 'correct' then
    if exists (
      select 1 from connections.events e
       where e.game_id = p_game_id
         and e.result = 'correct'
         and e.matched_cat_rank = p_matched_category_rank
         and (v_mode = 'coop' or e.user_id = caller_id)
    ) then
      -- PN300 — a RACE, and the textbook one. The rank was taken between this
      -- caller's read and their submit: in coop by a peer who matched the same
      -- category, in compete by this player twice. Nothing was written, so the
      -- guess did not happen — which is exactly what `race` means, and what an
      -- `ok` here could not say.
      --
      -- The message covers both modes: in coop somebody got there first, in
      -- compete you did, and either way the category is already matched.
      raise exception 'That category is already matched'
        using errcode = 'PN300', hint = 'race', column = '_',
        detail = 'this category rank is already matched (coop: by anyone; compete: by the caller)';
    end if;

    insert into connections.events
      (game_id, user_id, kind, tiles, result, matched_cat_rank, took_turn)
    values
      (p_game_id, caller_id, 'guess', p_tiles, p_result, p_matched_category_rank, true);

    -- The caller's own count, on their row; the compete win check below
    -- reuses it.
    select count(*) into caller_matched
      from connections.events gu
     where gu.game_id = p_game_id
       and gu.user_id = caller_id
       and gu.result = 'correct';
    update connections.players
       set n_matched_cats = caller_matched
     where game_id = p_game_id and user_id = caller_id;

    if v_mode = 'coop' then
      -- Coop win check: 4 correct rows across the team ⇒ it solved it.
      select count(*) into team_matched
        from connections.events gu
       where gu.game_id = p_game_id and gu.result = 'correct';

      if team_matched >= 4 then
        update common.game_players
           set solved_at = now()
         where game_id = p_game_id;
        select jsonb_object_agg(user_id::text, 1) into v_rankings
          from common.game_players where game_id = p_game_id;
        perform common._end_game(
          p_game_id, 'reached_goal', 'solved', caller_id,
          p_is_no_result => false,
          p_final_rankings => v_rankings
        );
      else
        -- Turn-order: an accepted coop guess that doesn't yet complete the
        -- puzzle hands the turn on (no-op for free-for-all).
        perform common._advance_turn(p_game_id);
      end if;
    else
      -- Compete win check: the caller's 4th match ends the race at once —
      -- opponents with mistakes left don't get to keep trying.
      if caller_matched >= 4 then
        update common.game_players
           set solved_at = now()
         where game_id = p_game_id and user_id = caller_id;
        perform common._end_game(
          p_game_id, 'reached_goal', 'solved', caller_id,
          p_is_no_result => false,
          p_final_rankings => jsonb_build_object(caller_id::text, 1)
        );
      end if;
    end if;

    perform connections._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

    -- The match is written. `result` NAMES THE CASE, in the wire word the
    -- column stores; what it is worth is the frontend's (lib/answer.ts), so
    -- no outcome rides here.
    return common._ok_envelope(jsonb_build_object('result', 'correct'));
  end if;

  -- ─── Wrong / oneAway: cost a mistake ─────────────────────
  -- Dedup a repeat of the same (order-insensitive) tile set — the wrong/
  -- oneAway analog of the correct branch's already-matched check. Coop's
  -- selection is a shared union, so two players can Submit the identical 4
  -- tiles at once; the games-row lock serializes us, so this SELECT sees the
  -- first transaction's committed row. Without it one wrong guess costs TWO
  -- of the four mistakes (possibly the losing one) plus a duplicate event-log
  -- row. Scope: coop = anyone's prior guess, compete = the caller's own. The
  -- FE already blocks repeats ("You already tried that"); this is the
  -- authoritative, race-safe backstop. (Each guess is 4 distinct tiles, so
  -- mutual containment `@>`/`<@` is exact set-equality.)
  if exists (
    select 1 from connections.events gu
     where gu.game_id = p_game_id
       and (v_mode = 'coop' or gu.user_id = caller_id)
       and gu.tiles @> p_tiles and gu.tiles <@ p_tiles
  ) then
    -- PN301 — the same race as PN300 above, one branch earlier in the guess's
    -- life. Nothing was written and no mistake was counted, so the guess did
    -- not happen.
    --
    -- Legitimate in BOTH modes by the test in docs/envelopes.md → What makes a
    -- race legitimate. Coop: a peer's identical guess landed in the gap between
    -- this caller's local dup-check and their insert — another player's action
    -- arriving by subscription, a window not theirs to close. Compete: the
    -- caller's own repeat, which looks like the doc's third row but is not,
    -- because the board unlocks on the RPC's reply while `events` updates by
    -- subscription — so a fast second submit outruns its own row.
    --
    -- The words are the FE's own, verbatim from the local dup-check it backs
    -- up, so a player cannot tell which of the two routes caught it.
    raise exception 'You already tried that'
      using errcode = 'PN301', hint = 'race', column = '_',
      detail = 'this tile set was already guessed (coop: by anyone; compete: by the caller)';
  end if;

  -- A miss is still the player having a go — the fourth mistake included. It
  -- is the caller's, on their row, in both modes.
  insert into connections.events
    (game_id, user_id, kind, tiles, result, matched_cat_rank, took_turn)
  values
    (p_game_id, caller_id, 'guess', p_tiles, p_result, null, true);

  update connections.players
     set n_mistakes = n_mistakes + 1
   where game_id = p_game_id and user_id = caller_id
  returning n_mistakes into caller_mistakes;

  if v_mode = 'coop' then
    -- The team's budget is spent by everyone's misses together.
    select sum(n_mistakes) into team_mistakes
      from connections.players
     where game_id = p_game_id;

    if team_mistakes >= 4 then
      perform common._end_game(
        p_game_id, 'resource_exhausted', 'mistakes', caller_id,
        p_is_no_result => false,
        p_final_rankings => '{}'::jsonb
      );
    else
      -- Turn-order: an accepted coop guess that costs a mistake but not the
      -- 4th hands the turn on (no-op for free-for-all).
      perform common._advance_turn(p_game_id);
    end if;
  else
    -- The fourth mistake puts this racer out while the others keep going, so
    -- the common roster has to hear about it: a player nothing is waiting for
    -- must not hold the presence-pause open. Then the collective-loss check:
    -- nobody left and nobody won ends the game.
    if caller_mistakes >= 4 then
      -- Eliminated: `lost` at once (`loses-by-mistake-budget`).
      perform common._set_player_ended(p_game_id, caller_id, 'resource_exhausted', 'mistakes', 'lost');
      perform connections._maybe_finish_compete(p_game_id, 'resource_exhausted', 'mistakes', caller_id);
    end if;
  end if;

  perform connections._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  -- The mistake is counted, and the answer says which of the two verdicts it
  -- recorded: an `ok` branch is chosen by `data` (docs/envelopes.md →
  -- Choosing which `ok` branch), never by the value the caller sent. No
  -- outcome rides — what a verdict is worth is lib/answer.ts's.
  return common._ok_envelope(jsonb_build_object('result', p_result));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function connections.submit_guess(uuid, text[], text, int) from public;
grant execute on function connections.submit_guess(uuid, text[], text, int) to authenticated;

drop function if exists connections.concede(uuid);

-- ============================================================
-- connections.concede — a racer drops out of a compete game
-- ============================================================
-- connections is an ELIMINATION game (a player can be out — 4 mistakes —
-- without the table ending): `common._concede` records the concession and
-- ends the game if everyone has conceded; otherwise the game ends here if
-- every other player is already out, with the concession as the act that
-- ended it. Compete only (coop is a team; it ends via the shared Stop).
create or replace function connections.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  caller_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Lock this game's connections.games row FIRST so the concession serializes
  -- against a concurrent submit_guess (which also locks this row before
  -- common.games). Without it the two don't serialize, each reads the other's
  -- uncommitted "still in it" state (READ COMMITTED), both decline to end the
  -- game, and it wedges. Same lock order as the move path (no deadlock).
  perform 1 from connections.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('connections');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  caller_id := common._concede(p_game_id);
  perform connections._maybe_finish_compete(p_game_id, 'conceded', 'conceded', caller_id);

  perform connections._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function connections.concede(uuid) from public;
grant execute on function connections.concede(uuid) to authenticated;

drop function if exists connections.submit_timeout(uuid);

-- ============================================================
-- connections.submit_timeout — countdown expiry handler
-- ============================================================
-- Fired by the FE when the count-down timer hits 0. Everyone loses
-- regardless of mode — in coop it's the team losing the clock; in compete
-- the race ended with nobody having found all four, and a race that ends
-- when decided has nobody at the goal, so it ranks nobody (psychicnum does
-- the same). Who ended it is the turn-holder in turn-order coop, nobody
-- otherwise.
--
-- Concurrency: multiple clients may fire submit_timeout at the same instant
-- because each client's local timer hits 0 around the same wall-clock moment.
-- The `SELECT ... FOR UPDATE` lock serializes them; whichever transaction
-- commits first ends the game, and the rest find it ended and answer the
-- game-over race — a peer beat them to it, and realtime carries the loss to
-- every client.
create or replace function connections.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  v_ended_at timestamptz;
  v_turn_holder uuid;
begin
  perform 1 from connections.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('connections');
  end if;

  -- Auth + game-player gate. See common._require_game_player.
  perform common._require_game_player(p_game_id);

  select ended_at, current_turn_user_id into v_ended_at, v_turn_holder
    from common.games where id = p_game_id;
  if v_ended_at is not null then
    perform common._raise_game_over();
  end if;

  perform common._end_game(
    p_game_id, 'timeout', 'timeout', v_turn_holder,
    p_is_no_result => false,
    p_final_rankings => '{}'::jsonb
  );

  perform connections._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function connections.submit_timeout(uuid) from public;
grant execute on function connections.submit_timeout(uuid) to authenticated;

drop function if exists connections.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists connections.end_game(uuid);

-- ============================================================
-- connections.stop_game — the Stop
-- ============================================================
-- connections' own endings are all decided ones: coop solves or loses (4
-- matches / 4 mistakes / timeout), compete has a winner or a no-winner loss.
-- This is the friends' "we just want to quit": any player stops the game
-- for the whole table, in either mode, and it is neutral — nobody won,
-- nobody lost (docs/common-schema.md → Stop). Distinct from suspending,
-- which leaves the game being played; a Stopped game lands in the club's
-- finished games.
create or replace function connections.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from connections.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('connections');
  end if;

  perform common._stop(p_game_id);

  perform connections._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function connections.stop_game(uuid) from public;
grant execute on function connections.stop_game(uuid) to authenticated;

drop function if exists connections.replay_board(uuid);

-- ============================================================
-- connections.replay_board — restart this puzzle from scratch
-- ============================================================
-- The Restart action: reset the working state on the SAME game row. The
-- frozen puzzle (`board` — the categories AND this game's shuffled tileOrder —
-- plus `puzzle_date`) stays, so it's the same sixteen tiles in the same
-- arrangement, solved again; everything the players did is wiped. Any game
-- player may call it, from a finished game OR mid-game (no ended check —
-- it's a restart). Both modes reset ALL players (a group "run it back", per
-- the friends trust model).
--
-- Resets the connections-specific working state (every player's two counts
-- zeroed; the guess log cleared, which is also what un-matches the
-- categories — a matched category IS a `result='correct'` guess row, so
-- deleting the log rebuilds the board by construction), then hands the
-- common-layer reset to common._reset_game and writes the page blobs.
create or replace function connections.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray guess row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move ending the board that was just reset.
  perform 1 from connections.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('connections');
  end if;

  -- The row check comes BEFORE the membership gate, and the order is the whole
  -- point: `delete_game` takes this row, `common.games` and every
  -- `game_players` row together, so a caller whose game was just deleted has no
  -- membership left either. Gate-first told them "You are not in this game",
  -- which is both wrong and unhelpful — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  update connections.players
     set n_mistakes = 0,
         n_matched_cats = 0
   where game_id = p_game_id;

  delete from connections.events where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform connections._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function connections.replay_board(uuid) from public;
grant execute on function connections.replay_board(uuid) to authenticated;
