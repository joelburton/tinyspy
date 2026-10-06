-- cs-unmet

-- ============================================================
-- setgame
-- ============================================================
-- What the frontend calls:
--
--   create_game     deals a new game
--   submit_set      claims three tiles
--   record_hint     records a coop hint the page computed and showed
--   concede         a racer drops out of a compete game
--   stop_game       stops the game for everyone, with no result
--   submit_timeout  ends the game when the countdown runs out
--   replay_board    the same deck, dealt again from the top
--
-- What is particular to setgame (docs/games/setgame.md has the rest):
--   - A tile is a smallint of four digits, each 1..3 — count, color, fill,
--     shape, so `3121` is three symbols, the first color, the second fill,
--     the first shape. Three tiles are a set when every digit is all-same or
--     all-different, and the SQL algebra (_third) mirrors
--     src/setgame/lib/tiles.ts.
--   - One board, contended by everyone: a claim takes tiles off it, the deck
--     tops it back up, and the deal-three rule keeps a set on the table.
--   - The deck running dry ends the game for everyone at once; nobody
--     finishes alone.
--   - The undealt deck order is the one secret, and nothing ever reveals it.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema setgame to authenticated;

-- Column grant: everything EXCEPT `deck` (its presence flips the table to
-- "only granted columns"). The undealt order is the one secret in this game,
-- and unlike every other shielded column on the roster NOTHING ever reveals
-- it — there is no end-of-game unlock, because the leftover order is of no
-- interest once the game is over. `deck_pos` IS granted: paired with the
-- public `deck_kind` it says how many tiles are left without saying which.
grant select (game_id, deck_kind, palette, deck_pos, board)
  on setgame.games to authenticated;
drop policy if exists games_select on setgame.games;
create policy games_select on setgame.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on setgame.players to authenticated;
drop policy if exists players_select on setgame.players;
create policy players_select on setgame.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Events are club-readable in BOTH modes, with no end-of-game gate — see the
-- table comment in the migration. The tiles were face-up and everyone watched
-- them leave; a rival's claim history says nothing about what is coming, and a
-- hint row says only that someone asked.
grant select on setgame.events to authenticated;
drop policy if exists events_select on setgame.events;
create policy events_select on setgame.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

drop view if exists setgame.games_state;

-- ============================================================
-- setgame._third — the algebra
-- ============================================================
-- The one tile that completes a set with `p_a` and `p_b`.
--
-- Per digit: two equal digits give the same digit back, and two different
-- ones give the remaining value, `6 - x - y` (the three values sum to 6).
-- `src/setgame/lib/tiles.ts` writes the same rule for the board's own checks.
drop function if exists setgame._third(smallint, smallint);
create or replace function setgame._third(p_a smallint, p_b smallint)
returns smallint
language sql
immutable
as $$
  select sum(case when x = y then x else 6 - x - y end * place)::smallint
    from (select (p_a / place) % 10 as x, (p_b / place) % 10 as y, place
            from unnest(array[1000, 100, 10, 1]) as place) d;
$$;
revoke execute on function setgame._third(smallint, smallint) from public;

-- ============================================================
-- setgame._is_set — are these three tiles a set?
-- ============================================================
-- Assumes three DISTINCT tiles; submit_set checks distinctness before it
-- gets here.
drop function if exists setgame._is_set(smallint, smallint, smallint);
create or replace function setgame._is_set(p_a smallint, p_b smallint, p_c smallint)
returns boolean
language sql
immutable
as $$
  select setgame._third(p_a, p_b) = p_c;
$$;
revoke execute on function setgame._is_set(smallint, smallint, smallint) from public;

-- ============================================================
-- setgame._find_set — the first set on the board
-- ============================================================
-- The first set on `p_tiles`, or NULL if it holds none — the question behind
-- both "deal three more" and the coop hint.
--
-- Pairs, not triples: every pair names its completing tile outright, so this
-- asks "is that tile also here?" instead of testing every combination. At the
-- largest board that can exist (21) it is 210 iterations.
drop function if exists setgame._find_set(smallint[]);
create or replace function setgame._find_set(p_tiles smallint[])
returns smallint[]
language plpgsql
immutable
as $$
declare
  tiles smallint[] := p_tiles;
  n int := coalesce(cardinality(p_tiles), 0);
  i int;
  j int;
  t smallint;
begin
  for i in 1 .. n - 1 loop
    for j in i + 1 .. n loop
      t := setgame._third(tiles[i], tiles[j]);
      -- A pair of DISTINCT tiles can never be completed by either of itself;
      -- the guard is for a malformed board with a duplicate, which would
      -- otherwise report a set that isn't one.
      if t <> tiles[i] and t <> tiles[j] and t = any(tiles) then
        return array[tiles[i], tiles[j], t]::smallint[];
      end if;
    end loop;
  end loop;
  return null;
end;
$$;
revoke execute on function setgame._find_set(smallint[]) from public;

-- ============================================================
-- setgame._find_set_with — the first set using one tile
-- ============================================================
-- The first set on `p_tiles` that USES `p_tile`, or NULL. Only the hint needs
-- this: a second hint press must ring another tile of the set the first press
-- pointed at, not of some other set.
drop function if exists setgame._find_set_with(smallint[], smallint);
create or replace function setgame._find_set_with(p_tiles smallint[], p_tile smallint)
returns smallint[]
language plpgsql
immutable
as $$
declare
  tiles smallint[] := p_tiles;
  tile  smallint := p_tile;
  other smallint;
  t     smallint;
begin
  if not (tile = any(tiles)) then
    return null;
  end if;
  foreach other in array tiles loop
    if other = tile then
      continue;
    end if;
    t := setgame._third(tile, other);
    if t <> tile and t <> other and t = any(tiles) then
      return array[tile, other, t]::smallint[];
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function setgame._find_set_with(smallint[], smallint) from public;

-- ============================================================
-- setgame._deck_size / _board_min — the deck's two numbers
-- ============================================================
-- Tiles in a deck: junior drops the fill, so it is a third of the full deck.
-- And the floor a board is topped back up to after a claim: junior deals
-- nine, the same "three rows" shape one column narrower.
drop function if exists setgame._deck_size(text);
create or replace function setgame._deck_size(p_deck_kind text)
returns int
language sql
immutable
as $$
  select case p_deck_kind when 'junior' then 27 else 81 end;
$$;
revoke execute on function setgame._deck_size(text) from public;

drop function if exists setgame._board_min(text);
create or replace function setgame._board_min(p_deck_kind text)
returns int
language sql
immutable
as $$
  select case p_deck_kind when 'junior' then 9 else 12 end;
$$;
revoke execute on function setgame._board_min(text) from public;

-- ============================================================
-- setgame._deal_to_playable — the deal-three rule, run to a fixpoint
-- ============================================================
-- Append three tiles at a time until the board is both big enough AND has a
-- set to find, or the deck runs out. Both halves of the rule live here:
-- "fewer than twelve" and "no set present" are the same loop.
--
-- Running to a FIXPOINT rather than dealing once matters: three fresh tiles
-- can leave the board still set-free (rare, but the whole reason 15- and
-- 18-tile boards exist), and a single pass would hand the players a dead
-- table. Termination is guaranteed twice over — the deck is finite, and a
-- board of 21 always contains a set, so the loop cannot even reach the deck's
-- end on the "no set" branch.
--
-- Tiles appended here go on the END of the board, which is what makes a
-- growing board add a column on the right instead of disturbing the tiles
-- already on the table. (Refilling the HOLES left by a claim is submit_set's
-- job, and deliberately different — see there.)
drop function if exists setgame._deal_to_playable(smallint[], int, smallint[], text);
create or replace function setgame._deal_to_playable(
  inout p_board    smallint[],
  inout p_deck_pos int,
  p_deck           smallint[],
  p_deck_kind      text
)
language plpgsql
immutable
as $$
declare
  deck_size int := setgame._deck_size(p_deck_kind);
  board_min int := setgame._board_min(p_deck_kind);
begin
  loop
    exit when p_deck_pos >= deck_size;
    exit when cardinality(p_board) >= board_min and setgame._find_set(p_board) is not null;
    p_board := p_board || p_deck[p_deck_pos + 1 : p_deck_pos + 3];
    p_deck_pos := p_deck_pos + 3;
  end loop;
end;
$$;
revoke execute on function setgame._deal_to_playable(smallint[], int, smallint[], text) from public;

drop function if exists setgame._write_statuses(uuid, boolean);

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- setgame's own, each builder bearing its column's name. `game_data` is the
-- common part (supabase/sql/common.sql → The page blobs' common parts) with
-- setgame's facts on top; the pieces below build each part, so `select
-- game_data from common.games` shows the page what it gets.
--
-- A tile is `{id}`, its four digits as text ("3121"). Nothing here is
-- private to a seat: the table is face-up and every claim was made in front
-- of everyone, in both modes. The deck's order is the one thing the blob
-- leaves out; only its count is here.
--
-- `static_game_data` is what nothing after `create_game` changes, written once
-- by `_write_static_game_data`; the page hands it to `useGame`, which merges
-- each key back into its place in `game_data` (plans/static-game-data.md).
-- setgame's is the common part alone: it has no puzzle, and its table refills
-- in place.
--
--   game_data, setgame's part:
--     board: {tiles}                       the one table, in slot order: a
--                                          tile's slot is its place on screen
--                                          and its key letter
--     nTilesInDeck                         the tiles still to be dealt
--     team: {nSetsFound, nHintsUsed}       what the team shares: the players'
--                                          counts, summed; null in compete
--                                          (plans/team-facts.md)
--     events: [{id, userId, kind, tiles, boardAfter, tookTurn, at}, …]
--                                          every row, every player's: a
--                                          claim's three tiles or a hint's
--                                          one to three, and the table right
--                                          after
--     players: [player, …]                 the common player, plus:
--       nSetsFound, nHintsUsed             this player's own, in every mode
--
--   summary_data, setgame's part (the common part names and dates the game
--   and carries its ending):
--     team                                 the same group; null in compete
--     nTableSetsFound                      the sets the whole table has taken,
--                                          in both modes — a race's too
--     nTilesInDeck
--     perfectClear                         a coop win that left the table
--                                          empty; null unless a coop win
--     winnerIds                            every player ranked first — a tie
--                                          is an ordinary result here; null
--                                          in coop, or with no winner
--     nWinnerSets                          the sets the winners share; null
--                                          in coop, or with no winner

-- Tiles, in the order given, each `{id}`.
create or replace function setgame._make_json_tiles(p_tiles smallint[])
returns jsonb
language sql
immutable
set search_path = setgame, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t::text) order by o), '[]'::jsonb)
    from unnest(p_tiles) with ordinality as x(t, o);
$$;

revoke execute on function setgame._make_json_tiles(smallint[]) from public;

-- The log: every row, in the order of play.
create or replace function setgame._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = setgame, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',         e.id,
           'userId',     e.user_id,
           'kind',       e.kind,
           'tiles',      setgame._make_json_tiles(e.tiles),
           'boardAfter', setgame._make_json_tiles(e.board_after),
           'tookTurn',   e.took_turn,
           'at',         e.created_at) order by e.id), '[]'::jsonb)
    from setgame.events e
   where e.game_id = p_game_id;
$$;

revoke execute on function setgame._make_json_events(uuid) from public;

-- What the team shares: the sets found and the hints asked, the players'
-- counts summed. Null in compete, where there is no team (plans/team-facts.md).
create or replace function setgame._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = setgame, common, public, extensions
as $$
  select case when cg.mode = 'coop' then jsonb_build_object(
           'nSetsFound', (select sum(sp.n_sets_found)::int from setgame.players sp
                           where sp.game_id = p_game_id),
           'nHintsUsed', (select sum(sp.n_hints_used)::int from setgame.players sp
                           where sp.game_id = p_game_id)) end
    from common.games cg
   where cg.id = p_game_id;
$$;

revoke execute on function setgame._make_json_team(uuid) from public;

-- Every player as setgame's game_data shows them: the common player, with
-- their own counts.
create or replace function setgame._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = setgame, common, public, extensions
as $$
  select jsonb_agg(
           cp.player || jsonb_build_object(
             'nSetsFound', sp.n_sets_found,
             'nHintsUsed', sp.n_hints_used)
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join setgame.players sp on sp.game_id = p_game_id and sp.user_id = cp.id;
$$;

revoke execute on function setgame._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with setgame's table, deck
-- count, team, log and players on top.
create or replace function setgame._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = setgame, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'board',        jsonb_build_object('tiles', setgame._make_json_tiles(sg.board)),
           'nTilesInDeck', setgame._deck_size(sg.deck_kind) - sg.deck_pos,
           'team',         setgame._make_json_team(p_game_id),
           'events',       setgame._make_json_events(p_game_id),
           'players',      setgame._make_json_players(p_game_id))
    from setgame.games sg
   where sg.game_id = p_game_id;
$$;

revoke execute on function setgame._make_json_game_data(uuid) from public;

-- The game summed up: the numbers a list of games shows for this one.
create or replace function setgame._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = setgame, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'team',            setgame._make_json_team(p_game_id),
    'nTableSetsFound', (select sum(sp.n_sets_found)::int from setgame.players sp
                         where sp.game_id = p_game_id),
    'nTilesInDeck',    setgame._deck_size(sg.deck_kind) - sg.deck_pos,
    'perfectClear', case when cg.mode = 'coop' and cg.game_ended_reason = 'reached_goal'
                         then cardinality(sg.board) = 0 end,
    'winnerIds',    (select jsonb_agg(gp.user_id order by gp.turn_seat, gp.user_id)
                       from common.game_players gp
                      where gp.game_id = p_game_id
                        and cg.mode = 'compete'
                        and gp.final_ranking = 1),
    'nWinnerSets',  (select max(sp.n_sets_found)
                       from setgame.players sp
                       join common.game_players gp
                         on gp.game_id = sp.game_id and gp.user_id = sp.user_id
                      where sp.game_id = p_game_id
                        and cg.mode = 'compete'
                        and gp.final_ranking = 1))
    from setgame.games sg
    join common.games cg on cg.id = sg.game_id
   where sg.game_id = p_game_id;
$$;

revoke execute on function setgame._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- setgame._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from setgame's own tables, assigning
-- each whole. Every RPC calls it after a move; it is also the repair for one
-- game by hand. Every key is always present, null when it has no value; the
-- shapes are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function setgame._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = setgame._make_json_game_data(p_game_id),
         summary_data = setgame._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function setgame._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- setgame._write_static_game_data — one game's static blob, written
-- ============================================================
-- Writes `static_game_data`, which nothing after create changes, so no move
-- writes it: `create_game` calls this once, and `_rebuild_data_cols_for_all`
-- for a shape change. setgame adds nothing to the common part.
create or replace function setgame._write_static_game_data(p_game_id uuid)
returns void
language sql
security definer
set search_path = setgame, common, public, extensions
as $$
  update common.games
     set static_game_data = common._make_json_static_game_data(p_game_id)
   where id = p_game_id;
$$;

revoke execute on function setgame._write_static_game_data(uuid) from public;

-- ============================================================
-- setgame._rebuild_data_cols_for_all — every setgame game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_write_static_game_data` and `_rebuild_data_cols` over every setgame game
-- without re-dating any, and answers how many it rewrote. Run by hand as
-- postgres (`gmake db-psql`); no client calls it, so it has no grant and wears
-- the `_`.
create or replace function setgame._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('setgame_coop', 'setgame_compete')
  loop
    perform setgame._write_static_game_data(v_game_id);
    perform setgame._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function setgame._rebuild_data_cols_for_all() from public;


drop function if exists setgame.create_game(text, jsonb, uuid[], text);

-- ============================================================
-- setgame.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)
-- ============================================================
-- Setup shape: { "timer": (none | countup | countdown{seconds}),
--                "deck":  'full' | 'junior',
--                "palette": 'traditional' | 'colorblind',
--                "coop_style": 'free-for-all' | 'turns',
--                "first_turn_user_id": uuid (turn-coop only) }.
--
-- Only 'turns' is tested for below, so anything else — including the key being
-- absent — reads as free-for-all. That is the shared CoopStyleField's own
-- convention. `deck` and `palette` are copied to their columns (`full` and
-- `traditional` when absent, as paletteOf does).
--
-- The board is built INLINE — no puzzle library, no edge function — because a
-- board is just a shuffle. The only work beyond dealing is running the
-- deal-three rule before anyone sees the table, so the opening board is never
-- one of the ~3% that come out set-free.
create or replace function setgame.create_game(
  p_club_handle     text,
  p_setup           jsonb,
  p_player_user_ids uuid[],
  p_mode            text
)
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  new_id       uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  v_deck_kind  text;
  v_palette    text;
  v_deck       smallint[];
  v_board      smallint[];
  v_deck_pos   int;
  first_turn   uuid;
begin
  perform common._require_club_member(p_club_handle);
  -- Must agree with numberOfPlayers in src/setgame/manifest.ts ([1,6]/[2,6]).
  perform common._require_player_count_max(p_player_user_ids, 6);

  perform common._require_valid_mode(p_mode);
  perform common._require_valid_timer(p_setup->'timer');

  v_deck_kind := coalesce(p_setup->>'deck', 'full');
  if v_deck_kind not in ('full', 'junior') then
    raise exception 'BUG: deck of ''%''', v_deck_kind
      using errcode = 'PN075', hint = 'fault', column = '_',
      detail = 'setup deck must be full or junior';
  end if;
  -- The palette's own check constraint catches anything else; the form offers
  -- only these two.
  v_palette := coalesce(p_setup->>'palette', 'traditional');

  -- The shuffle: every tile, four digits of 1..3. Junior keeps only the solid
  -- tiles, fill 1 — the same deck src/setgame/lib/tiles.ts builds.
  select array_agg(n * 1000 + c * 100 + f * 10 + s order by random())::smallint[]
    into v_deck
    from generate_series(1, 3) n, generate_series(1, 3) c,
         generate_series(1, 3) f, generate_series(1, 3) s
   where v_deck_kind = 'full' or f = 1;

  -- Deal the opening board, then run the deal-three rule until it holds a set.
  v_deck_pos := setgame._board_min(v_deck_kind);
  v_board    := v_deck[1 : v_deck_pos];
  select * into v_board, v_deck_pos
    from setgame._deal_to_playable(v_board, v_deck_pos, v_deck, v_deck_kind);

  -- The saved default strips first_turn_user_id: who goes first is a per-game
  -- pick, not a club preference. coop_style rides along.
  new_id := common._create_game(
    p_club_handle, 'setgame_' || p_mode, p_mode, p_player_user_ids,
    -- Placeholder: the real title needs the game's id, which only exists once
    -- common._create_game has inserted the row (rewritten just below).
    'New game',
    p_setup,
    p_setup - 'first_turn_user_id'
  );

  -- The title (the club card's heading), the same pure IDENTIFIER bananagrams
  -- uses: the first six hex digits of the game's own uuid, like a short commit
  -- hash. A title that counted sets would change every few seconds and could
  -- not be used to REFER to a game; a handle that never moves can: "look at
  -- #A3F19C" is something one player can say to another, and something to
  -- search the club list (or the database) for.
  update common.games cg
     set title = '#' || upper(left(new_id::text, 6))
   where cg.id = new_id;

  -- Opt-in turn-by-turn coop: seat the common rotation so submit_set gates
  -- each claim. Free-for-all and compete leave the pointer null (inert).
  if p_mode = 'coop' and p_setup->>'coop_style' = 'turns' then
    first_turn := (p_setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(p_player_user_ids)) then
      raise exception 'BUG: first player who is not in the game'
        using errcode = 'PN076', hint = 'fault', column = '_',
        detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into setgame.games (game_id, deck_kind, palette, deck, deck_pos, board)
  values (new_id, v_deck_kind, v_palette, v_deck, v_deck_pos, v_board);

  insert into setgame.players (game_id, user_id)
  select new_id, uid from unnest(p_player_user_ids) uid;

  perform setgame._write_static_game_data(new_id);
  perform setgame._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. The name is here even
  -- though this is the only `ok` — a call site cannot assert a case the payload
  -- does not carry.
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
revoke execute on function setgame.create_game(text, jsonb, uuid[], text) from public;
grant execute on function setgame.create_game(text, jsonb, uuid[], text) to authenticated;

drop function if exists setgame._finish(uuid, text);

-- ============================================================
-- setgame._finish — the collective ending, both modes
-- ============================================================
-- setgame has no per-player finish line: the deck running dry ends the game
-- for everyone at once. So there is one ending path, reached either by the
-- last claim (`p_reason_detail` 'cleared', ended by `p_ended_by_user_id`) or
-- by the timer ('timeout'). Rankings (docs/win-lose.md):
--
--   coop, cleared     reached_goal: the team, every player ranked 1. Clearing
--                     means no sets left to find, NOT using every tile —
--                     stranding six or nine tiles is the normal ending (a full
--                     clear happens in about 2% of games), so nothing grades
--                     the leftovers
--   coop, timeout     nobody ranked — a loss
--   compete, either   resource_exhausted (cleared) or timeout, ranked on SETS
--                     FOUND among the players who didn't concede and found at
--                     least one, and A TIE IS A TIE: ties share the rank. No
--                     speed tiebreak — the count IS the whole result, and
--                     breaking a 9-9 on who grabbed their last set first would
--                     crown reflexes the score deliberately does not measure.
--                     A conceder keeps the sets they took but can't win;
--                     nobody scoring ranks nobody
create or replace function setgame._finish(
  p_game_id uuid,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_mode text;
  v_rankings jsonb := '{}'::jsonb;
begin
  select mode into v_mode from common.games where id = p_game_id;

  if v_mode = 'coop' then
    if p_reason_detail = 'cleared' then
      select jsonb_object_agg(user_id::text, 1) into v_rankings
        from common.game_players where game_id = p_game_id;
    end if;
  else
    select coalesce(jsonb_object_agg(user_id::text, ranking), '{}'::jsonb)
      into v_rankings
      from (
        select p.user_id, rank() over (order by p.n_sets_found desc) as ranking
          from setgame.players p
          join common.game_players gp
            on gp.game_id = p.game_id and gp.user_id = p.user_id
         where p.game_id = p_game_id
           and gp.player_ended_reason is distinct from 'conceded'
           and p.n_sets_found > 0
      ) ranked;
  end if;

  perform common._end_game(
    p_game_id,
    case when p_reason_detail = 'timeout' then 'timeout'
         when v_mode = 'coop' then 'reached_goal'
         else 'resource_exhausted' end,
    p_reason_detail, p_ended_by_user_id,
    p_is_no_result => false,
    p_final_rankings => v_rankings
  );
end;
$$;
revoke execute on function setgame._finish(uuid, text, uuid) from public;

drop function if exists setgame.submit_set(uuid, smallint[]);

-- ============================================================
-- setgame.submit_set — claim three tiles
-- ============================================================
-- The server re-checks everything the board already checked, because the
-- board is not the authority — but an INVALID selection normally never gets
-- here at all: every tile is face-up, so the FE knows the rule and rejects a
-- non-set before it leaves the client. That is also why there is no
-- wrong-guess penalty to design. The one rejection that happens in real play
-- is PN277: a rival claimed a tile out from under this selection.
--
-- The `for update` lock on the games row is what makes that rejection safe
-- rather than a race — two players claiming overlapping sets serialize, the
-- first commits, and the second finds a tile missing from the board.
--
-- The claim that leaves the deck spent AND the table without a set ends the
-- game ('cleared'), the claimer as who ended it.
create or replace function setgame.submit_set(p_game_id uuid, p_tiles smallint[])
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  caller_id    uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  g            setgame.games%rowtype;
  board_min    int;
  deck_size    int;
  n            int;
  positions    int[] := '{}';
  p            int;
  tile         smallint;
  new_board    smallint[];
  new_pos      int;
  head_holes   int[] := '{}';
  tail_tiles   smallint[] := '{}';
  k            int;
begin
  -- The row first, before the membership gate: a friend deleting the game
  -- takes every membership with it (docs/envelopes.md → a missing game row
  -- is PN485).
  select * into g from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  caller_id := common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: a teammate ended the game, or the countdown expired, while this
    -- claim was in flight.
    perform common._raise_game_over();
  end if;

  -- A conceded player is out of the race. The FE gates on this too, so it only
  -- fires on a genuine race (a claim in flight when the concession commits).
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- Turn-order gate (opt-in turn-by-turn coop). No-op for free-for-all
  -- (pointer null) and for compete.
  perform common._require_turn(p_game_id, caller_id);

  -- ─── Validate the selection ────────────────────────────────
  if cardinality(p_tiles) is distinct from 3
     or (select count(distinct e) from unnest(p_tiles) e) <> 3 then
    raise exception 'BUG: claim that was not three different tiles'
      using errcode = 'PN276', hint = 'fault', column = '_',
      detail = 'a claim is exactly three distinct tiles';
  end if;

  -- Every tile must still be on the board. This is the contention check, and
  -- the error the FE turns into "gone — someone got there first".
  n := cardinality(g.board);
  foreach tile in array p_tiles loop
    p := array_position(g.board, tile);
    if p is null then
      -- THE contention race, and the only one on the roster that is ordinary
      -- rather than exotic: one table, everyone claiming off it, so a rival's
      -- claim lands between your click and your submit. No local gate can see
      -- it — the tiles leave the board by realtime.
      raise exception 'Someone got there first'
        using errcode = 'PN277', hint = 'race', column = '_',
        detail = 'a claimed tile is no longer on the board';
    end if;
    positions := positions || p;
  end loop;

  if not setgame._is_set(p_tiles[1], p_tiles[2], p_tiles[3]) then
    -- The whole board is face-up and the FE runs the same algebra before it
    -- submits (src/setgame/lib/tiles.ts), so a non-set arriving is a bug.
    raise exception 'BUG: bad set'
      using errcode = 'PN278', hint = 'fault', column = '_',
      detail = 'those three tiles are not a set';
  end if;

  -- ─── Take the tiles off the board ──────────────────────────
  board_min := setgame._board_min(g.deck_kind);
  deck_size := setgame._deck_size(g.deck_kind);
  new_pos   := g.deck_pos;

  if n - 3 < board_min and new_pos < deck_size then
    -- The ordinary case: replace the claimed tiles IN PLACE. Every other tile
    -- keeps its slot, its screen position and its keyboard letter, so a claim
    -- never disturbs a scan someone else is in the middle of.
    new_board := g.board;
    for k in 1 .. 3 loop
      new_board[positions[k]] := g.deck[new_pos + k];
    end loop;
    new_pos := new_pos + 3;
  else
    -- The board is coming DOWN (it was above the floor, or the deck is spent),
    -- so three slots have to disappear. Rather than closing the whole board up
    -- — which would shift every tile after the first hole — drop the last
    -- three slots and move their survivors into the holes left behind. At most
    -- three tiles move, and they are the ones at the end of the layout.
    for k in 1 .. 3 loop
      if positions[k] <= n - 3 then
        head_holes := head_holes || positions[k];
      end if;
    end loop;
    for k in n - 2 .. n loop
      if not (k = any(positions)) then
        tail_tiles := tail_tiles || g.board[k];
      end if;
    end loop;
    new_board := g.board[1 : n - 3];
    for k in 1 .. coalesce(cardinality(head_holes), 0) loop
      new_board[head_holes[k]] := tail_tiles[k];
    end loop;
  end if;

  -- Then the deal-three rule: top back up to the floor, and keep dealing while
  -- the table has no set to find. Appends on the right.
  select * into new_board, new_pos
    from setgame._deal_to_playable(new_board, new_pos, g.deck, g.deck_kind);

  update setgame.games
     set board = new_board,
         deck_pos = new_pos
   where game_id = p_game_id;

  -- `board_after` is what makes the history viewer a lookup rather than a
  -- replay of the deal rule — see the events table comment in the migration.
  -- A claim is the move here, so it spends a go — the one that empties the
  -- deck included.
  insert into setgame.events (game_id, user_id, kind, tiles, board_after, took_turn)
  values (p_game_id, caller_id, 'claim', p_tiles, new_board, true);

  update setgame.players
     set n_sets_found = n_sets_found + 1
   where game_id = p_game_id and user_id = caller_id;

  -- ─── Is that the end? ──────────────────────────────────────
  -- The deck is spent AND the table is dead. Both halves matter: a board with
  -- no set is refilled while tiles remain, and a spent deck is only the end
  -- once the leftovers hold nothing.
  if new_pos >= deck_size and setgame._find_set(new_board) is null then
    perform setgame._finish(p_game_id, 'cleared', caller_id);
  else
    -- Turn-order: an accepted, non-final coop claim hands the turn on (no-op
    -- for free-for-all).
    perform common._advance_turn(p_game_id);
  end if;

  perform setgame._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  -- No message: a claim that lands shows itself, in the tiles leaving the
  -- board.
  return common._ok_envelope(
    jsonb_build_object('result', 'claimed'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function setgame.submit_set(uuid, smallint[]) from public;
grant execute on function setgame.submit_set(uuid, smallint[]) to authenticated;

drop function if exists setgame.record_hint(uuid, smallint[]);

-- ============================================================
-- setgame.record_hint — the tally, not the hint
-- ============================================================
-- The hint itself is computed ON THE CLIENT and never stored. It can be: the
-- board is face-up and `src/setgame/lib/tiles.ts` holds the same algebra this
-- file does, so there is nothing to look up. That buys two things — the ring
-- appears on the keystroke instead of after a round trip (it also SELECTS the
-- tiles, so a lag would be felt), and there is no private column to mask.
--
-- What is recorded is the EVENT: who asked, and what they were shown
-- (`p_tiles`). The ring on the board is transient UI; the asking is history,
-- and belongs in the turn log next to the claims.
--
-- `p_tiles` comes from the client, so it is CHECKED — one to three tiles, all
-- on the board, and a genuine partial set. Not for cheating (the trust model
-- answers that, and a hint costs nothing anyway) but to keep a nonsense row
-- out of a log people read.
--
-- BANNED IN COMPETE, per the priced-hint rule: a hint must be banned, earned,
-- scored into the ranking, or free only when self-informative. A hint here is
-- free and generative, so in a race it is a win button.
--
-- No message and no outcome: asking for a hint shows itself, in the ring the
-- client already drew. `n_hints_used` is the count this call just moved.
create or replace function setgame.record_hint(p_game_id uuid, p_tiles smallint[])
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  caller_id uuid;
  g         setgame.games%rowtype;
  tile      smallint;
  v_used    int;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- FOR UPDATE, even though nothing here writes the games row: it is the LOCK
  -- ORDER that matters. This function updates a players row and then inserts
  -- an event, and that insert takes a share lock on the games row through its
  -- foreign key. submit_set goes the other way: it holds the games row FOR
  -- UPDATE from the start and updates the same players row later. Two
  -- transactions, the same two locks, opposite orders — a real deadlock
  -- ("deadlock detected", 40P01), since the third hint claims the set and both
  -- statements fire for the same player at the same instant. Taking the games
  -- row FIRST here makes every writer acquire these locks in the same order.
  --
  -- And the row before the membership gate: a friend deleting the game takes
  -- every membership with it (docs/envelopes.md → a missing game row is PN485).
  select * into g from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  caller_id := common._require_game_player(p_game_id);

  if (select mode from common.games where id = p_game_id) <> 'coop' then
    -- Mode is fixed at create_game and never changes, so no unbroken client
    -- would ask: the compete board offers no hint button at all.
    raise exception 'BUG: hint request in a race'
      using errcode = 'PN280', hint = 'fault', column = '_',
      detail = 'hints are coop-only; a free generative hint would decide a race';
  end if;

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: the game ended under you while the hint request was in flight.
    perform common._raise_game_over();
  end if;

  -- In turn-by-turn coop a hint is part of YOUR TURN: you may ask, then claim,
  -- and the turn only passes when a claim lands (see submit_set). So this is
  -- gated but never advances — asking three times is how a stuck player
  -- finishes their own turn rather than a way to spend someone else's. Gated
  -- on the server as well as in the FE (which hides the button off-turn)
  -- because `n_hints_used` is shared state and the count is what the table sees.
  -- No-op for free-for-all, where the pointer is null.
  perform common._require_turn(p_game_id, caller_id);

  if cardinality(p_tiles) not between 1 and 3
     or (select count(distinct e) from unnest(p_tiles) e) <> cardinality(p_tiles) then
    raise exception 'BUG: hint that was not one to three tiles'
      using errcode = 'PN282', hint = 'fault', column = '_',
      detail = 'a hint is one to three distinct tiles';
  end if;

  foreach tile in array p_tiles loop
    if not (tile = any(g.board)) then
      raise exception 'BUG: hint naming a tile that is not on the board'
        using errcode = 'PN283', hint = 'fault', column = '_',
        detail = 'a hinted tile is not on the board';
    end if;
  end loop;

  -- Two tiles must belong to one set, and three must BE one. A single tile
  -- can't be wrong on its own, so it is taken as given.
  if cardinality(p_tiles) = 3 and not setgame._is_set(p_tiles[1], p_tiles[2], p_tiles[3]) then
    raise exception 'BUG: three-tile hint that is not a set'
      using errcode = 'PN284', hint = 'fault', column = '_',
      detail = 'a three-tile hint must be a set';
  elsif cardinality(p_tiles) = 2
        and not (setgame._third(p_tiles[1], p_tiles[2]) = any(g.board)) then
    raise exception 'BUG: two-tile hint with no third tile on the board'
      using errcode = 'PN285', hint = 'fault', column = '_',
      detail = 'a two-tile hint must be part of a set that is on the board';
  end if;

  update setgame.players
     set n_hints_used = n_hints_used + 1
   where game_id = p_game_id and user_id = caller_id
  returning n_hints_used into v_used;

  -- A hint is part of the asker's turn rather than one of its own.
  insert into setgame.events (game_id, user_id, kind, tiles, board_after, took_turn)
  values (p_game_id, caller_id, 'hint', p_tiles, g.board, false);

  perform setgame._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(
    jsonb_build_object('result', 'recorded', 'n_hints_used', v_used));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function setgame.record_hint(uuid, smallint[]) from public;
grant execute on function setgame.record_hint(uuid, smallint[]) to authenticated;

drop function if exists setgame.submit_timeout(uuid);

-- ============================================================
-- setgame.submit_timeout — countdown-timer expiry
-- ============================================================
-- Fired by every connected client when a countdown hits 0; the first ends the
-- game (_finish, 'timeout'), the rest find it ended and answer the game-over
-- race. Coop: the deck wasn't cleared in time — a loss. Compete: the leaders
-- at the whistle win, since the count of sets taken IS the complete result at
-- every instant; the timer is simply how the session stops. Ended by whoever
-- held the turn (turn-by-turn coop), else nobody.
create or replace function setgame.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  perform common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  perform setgame._finish(p_game_id, 'timeout',
    (select current_turn_user_id from common.games where id = p_game_id));

  perform setgame._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function setgame.submit_timeout(uuid) from public;
grant execute on function setgame.submit_timeout(uuid) to authenticated;

drop function if exists setgame.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists setgame.end_game(uuid);

-- ============================================================
-- setgame.stop_game — the Stop
-- ============================================================
-- The friends' explicit "we're done" button, both modes, with no result
-- (docs/common-schema.md → Stop). Deliberately NOT _finish: a table that
-- stopped early has a leaderboard, but stopping early is not a result, and
-- crowning the leader would make "Stop" a button worth pressing while ahead.
create or replace function setgame.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the last claim waits for it and then reads the
  -- game as over. The row check comes before the membership gate — see
  -- replay_board.
  perform 1 from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  perform common._stop(p_game_id);

  perform setgame._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function setgame.stop_game(uuid) from public;
grant execute on function setgame.stop_game(uuid) to authenticated;

drop function if exists setgame.concede(uuid);

-- ============================================================
-- setgame.concede — a player drops out of a compete race
-- ============================================================
-- No player finishes alone here — the deck running dry ends the game for
-- everyone — so `common._concede` decides it all: it marks the caller out, and
-- when that was the last racer, ends the game as a loss for everyone. A
-- conceder keeps the sets they took but cannot win. Compete only (coop ends
-- via Stop).
create or replace function setgame.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so every game's concede has one shape
  -- (docs/common-schema.md → Concede).
  perform 1 from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  perform common._concede(p_game_id);

  perform setgame._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function setgame.concede(uuid) from public;
grant execute on function setgame.concede(uuid) to authenticated;

drop function if exists setgame.replay_board(uuid);

-- ============================================================
-- setgame.replay_board — run the same deck back
-- ============================================================
-- The "Restart" game-menu item: reset the working state on the SAME game row.
-- The DECK IS KEPT and merely rewound, so the tiles come out in exactly the
-- order they did the first time — the same game, played again. (That is why
-- the deck is stored whole and frozen rather than drawn lazily: a reshuffle
-- would make Restart just another New game.) No title to restore: it is the
-- game's own id, which a replay does not change.
--
-- Any game player may call it, mid-game or after the game ends — it is a
-- restart, so there is no ended check. Both modes reset ALL players.
create or replace function setgame.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  g         setgame.games%rowtype;
  v_board   smallint[];
  v_pos     int;
begin
  -- FOR UPDATE: a replay racing a claim must not interleave with it (submit_set
  -- locks the same row), or the reset could land on a half-applied move.
  select * into g from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  -- The row check comes BEFORE the membership gate: `delete_game` takes this
  -- row, `common.games` and every `game_players` row together, so a caller
  -- whose game was just deleted has no membership left either, and would be
  -- told "You are not in this game" — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  -- Re-deal from the top of the same deck, including the opening deal-three
  -- fixpoint, so the board matches the one create_game produced exactly.
  v_pos   := setgame._board_min(g.deck_kind);
  v_board := g.deck[1 : v_pos];
  select * into v_board, v_pos
    from setgame._deal_to_playable(v_board, v_pos, g.deck, g.deck_kind);

  update setgame.games
     set board = v_board,
         deck_pos = v_pos
   where game_id = p_game_id;

  delete from setgame.events where game_id = p_game_id;

  update setgame.players set n_sets_found = 0, n_hints_used = 0 where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform setgame._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function setgame.replay_board(uuid) from public;
grant execute on function setgame.replay_board(uuid) to authenticated;
