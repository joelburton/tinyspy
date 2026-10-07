-- cs-unmet

-- ============================================================
-- bananagrams
-- ============================================================
-- What the frontend calls:
--
--   create_game        deals a new race
--   save_player_board  snapshots a player's private board
--   peel               draws a round for everyone, or goes out and wins
--   dump               trades one tile for three
--   check_board        answers "is my board legal?" for the caller's board
--   concede            a racer drops out
--   stop_game          stops the game for everyone, with no result
--   submit_timeout     ends the race when the countdown runs out
--   replay_board       re-deals the same tiles from scratch
--
-- What is particular to bananagrams (docs/games/bananagrams.md has the rest):
--   - Compete only, with no mode parameter; one player is allowed.
--   - Each player's board is the page's own: the page holds it and saves it
--     back (save_player_board), and the blob carries each board as last
--     saved. The tiles a player holds are the server's: dealt, grown by a
--     peel, swapped by a dump. The hand is only the page's way of showing the
--     tiles not on the board.
--   - A player's `nUnplacedTiles`, the number rivals see, is the tiles they
--     hold that are not in their board's largest block (_main_block_size) — a
--     tile pushed off to the side is no more placed than one in the hand.
--   - The only way to win is to peel with an empty hand when the bunch cannot
--     refill the table. A peel draws 1 tile and a dump 3, as constants.
--   - Every letter is stored lowercase; the page draws the capitals.
--   - The page reads the blobs `_rebuild_data_cols` writes onto common.games,
--     and nothing from these tables. A board save rebuilds them too, so a
--     rival's count moves as the board does.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema bananagrams to authenticated;

-- The columns a club member may read. The page reads the blobs on
-- common.games and nothing from here; the deal and the two piles stay out of
-- the grant, since their order is every draw to come. Revoke first: grants
-- are additive, so a column an earlier grant named (the bunch) stays readable
-- until it is revoked.
revoke select on bananagrams.games from authenticated;
grant select
  (game_id, hand_size, word_check, dict_2, dict_3plus, dump_to_bag)
  on bananagrams.games to authenticated;
drop policy if exists games_select on bananagrams.games;
create policy games_select on bananagrams.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Everything except a player's `board` and `tiles`: the page's useGame
-- withholds a rival's until the end, and the table says the same.
revoke select on bananagrams.player_boards from authenticated;
grant select (game_id, user_id, updated_at) on bananagrams.player_boards to authenticated;
drop policy if exists player_boards_select on bananagrams.player_boards;
create policy player_boards_select on bananagrams.player_boards
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = player_boards.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on bananagrams.events to authenticated;
drop policy if exists events_select on bananagrams.events;
create policy events_select on bananagrams.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- ============================================================
-- bananagrams._full_bag — the standard 144-tile letter distribution
-- ============================================================
-- One source for the tile set: create_game shuffles it to build a game, and
-- replay_board subtracts the recorded `bunch_at_setup` from it to rebuild the
-- out-of-play bag. Immutable, so it folds at plan time.
create or replace function bananagrams._full_bag()
returns text
language sql
immutable
as $$
  select
    repeat('a', 13) || repeat('b', 3)  || repeat('c', 3)  || repeat('d', 6)  ||
    repeat('e', 18) || repeat('f', 3)  || repeat('g', 4)  || repeat('h', 3)  ||
    repeat('i', 12) || repeat('j', 2)  || repeat('k', 2)  || repeat('l', 5)  ||
    repeat('m', 3)  || repeat('n', 8)  || repeat('o', 11) || repeat('p', 3)  ||
    repeat('q', 2)  || repeat('r', 9)  || repeat('s', 6)  || repeat('t', 9)  ||
    repeat('u', 6)  || repeat('v', 3)  || repeat('w', 3)  || repeat('x', 2)  ||
    repeat('y', 3)  || repeat('z', 2);
$$;
revoke execute on function bananagrams._full_bag() from public;

-- ============================================================
-- bananagrams._main_block_size — tiles in the board's largest block
-- ============================================================
-- The size of the largest group of filled cells joined up, down, left or
-- right (a diagonal touch does not join), or 0 for an empty board. A tile the
-- player holds that is not in this block — still in the page's hand, or
-- pushed off to the side of the board — is not yet placed, so a player's
-- `nUnplacedTiles` is their tiles minus this (_make_json_players).
--
-- Each filled cell is visited once: a walk over the grid starts a flood from
-- every filled cell no earlier flood reached, and keeps the largest count.
create or replace function bananagrams._main_block_size(p_board text)
returns int
language plpgsql
immutable
as $$
declare
  seen boolean[] := array_fill(false, array[625]);
  stack int[];
  cell int;
  neighbor int;
  block_size int;
  largest int := 0;
begin
  for start_cell in 1..625 loop
    if substr(p_board, start_cell, 1) <> '.' and not seen[start_cell] then
      seen[start_cell] := true;
      stack := array[start_cell];
      block_size := 0;
      while cardinality(stack) > 0 loop
        cell := stack[cardinality(stack)];
        stack := stack[1:cardinality(stack) - 1];
        block_size := block_size + 1;
        -- The four neighbors, null past an edge of the 25×25 grid.
        foreach neighbor in array array[
          case when (cell - 1) / 25 > 0  then cell - 25 end,
          case when (cell - 1) / 25 < 24 then cell + 25 end,
          case when (cell - 1) % 25 > 0  then cell - 1 end,
          case when (cell - 1) % 25 < 24 then cell + 1 end
        ] loop
          if neighbor is not null and not seen[neighbor]
             and substr(p_board, neighbor, 1) <> '.' then
            seen[neighbor] := true;
            stack := stack || neighbor;
          end if;
        end loop;
      end loop;
      largest := greatest(largest, block_size);
    end if;
  end loop;
  return largest;
end;
$$;
revoke execute on function bananagrams._main_block_size(text) from public;

-- The counter and the statuses this game wrote before the page read the
-- blobs; supabase/sql is re-applied, not diffed.
drop function if exists bananagrams._count_unplaced(uuid, uuid[]);
drop function if exists bananagrams._write_statuses(uuid, boolean);

-- ============================================================
-- The page blobs — what bananagrams writes onto common.games
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games`
-- after every move and every board save (plans/seat-view.md → The page is
-- written, not assembled), in named pieces a reader can follow, each a
-- `_make_json_*` that builds and writes nothing. The common part of each blob
-- is common's (supabase/sql/common.sql → The page blobs' common parts); this
-- is bananagrams' part. Every key is always present, null when it has no
-- value.
--
-- `static_game_data` is what nothing after `create_game` changes, written once
-- by `_write_static_game_data`; the page hands it to `useGame`, which merges
-- each key back into its place in `game_data`.
-- bananagrams' is the common part alone: it has no puzzle, and every tile and
-- board is in play.
--
--   game_data, bananagrams' part:
--     nBunchTiles                          the draw pile's count; its order never
--                                          leaves the server
--     nBagTiles                            the out-of-play reserve's count
--     team                                 null: compete only
--     events: [event, …]                   every row, in order:
--       id, userId, kind                   peel / dump / went_out
--       tile                               the letter dumped; null otherwise
--       nDrawn                             1 on a peel, 3 on a dump, 0 on going out
--       at
--     players: [player, …]                 the common player, plus:
--       tiles                              every letter they hold, hand and board
--                                          together, one lowercase string. Every
--                                          player's is in the blob; the page's
--                                          useGame withholds a rival's until the end
--       nTiles                             length(tiles)
--       nUnplacedTiles                     tiles not in their board's main block
--                                          (_main_block_size): the strip's number
--       board: {letters}                   the 625-character grid as last saved,
--                                          row-major, "." an empty cell. Withheld
--                                          from a rival as `tiles` is
--
--   summary_data, bananagrams' part:
--     nBunchTiles

-- The log: every row, in the order of play.
create or replace function bananagrams._make_json_events(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = bananagrams, common, public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',     e.id,
           'userId', e.user_id,
           'kind',   e.kind,
           'tile',   e.tile,
           'nDrawn', e.n_drawn,
           'at',     e.created_at) order by e.id), '[]'::jsonb)
    from bananagrams.events e
   where e.game_id = p_game_id;
$$;

revoke execute on function bananagrams._make_json_events(uuid) from public;

-- Every player as bananagrams' game_data shows them: the common player, with
-- the tiles they hold, the two counts, and their board as last saved. The
-- unplaced count is clamped at 0: the page may have placed a tile the server
-- has not been told it holds yet.
create or replace function bananagrams._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = bananagrams, common, public, extensions
as $$
  select jsonb_agg(
           cp.player || jsonb_build_object(
             'tiles',          pb.tiles,
             'nTiles',         length(pb.tiles),
             'nUnplacedTiles', greatest(length(pb.tiles) - bananagrams._main_block_size(pb.board), 0),
             'board',          jsonb_build_object('letters', pb.board))
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join bananagrams.player_boards pb on pb.game_id = p_game_id and pb.user_id = cp.id;
$$;

revoke execute on function bananagrams._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with bananagrams' two counts, the
-- log and the players on top.
create or replace function bananagrams._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = bananagrams, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'nBunchTiles', length(g.bunch),
           'nBagTiles',   length(g.bag),
           'team',        null,
           'events',      bananagrams._make_json_events(p_game_id),
           'players',     bananagrams._make_json_players(p_game_id))
    from bananagrams.games g
   where g.game_id = p_game_id;
$$;

revoke execute on function bananagrams._make_json_game_data(uuid) from public;

-- The game summed up: the one number a list of games shows for this one. The
-- winner is already in the common part's `players`: the one ranked first
-- (`finalRanking` 1).
create or replace function bananagrams._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = bananagrams, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
           'nBunchTiles', length(g.bunch))
    from bananagrams.games g
   where g.game_id = p_game_id;
$$;

revoke execute on function bananagrams._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- bananagrams._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Rebuilds the page blobs (`game_data`, `summary_data`, and `shell_data`
-- through `common._make_json_shell_data`) from bananagrams' own tables,
-- assigning each whole. Every RPC calls it after a move, and save_player_board
-- after every save; it is also the repair for one game by hand. The shapes
-- are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function bananagrams._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = bananagrams._make_json_game_data(p_game_id),
         summary_data = bananagrams._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function bananagrams._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- bananagrams._write_static_game_data — one game's static blob, written
-- ============================================================
-- Writes `static_game_data`, which nothing after create changes, so no move
-- writes it: `create_game` calls this once, and `_rebuild_data_cols_for_all`
-- for a shape change. bananagrams adds nothing to the common part.
create or replace function bananagrams._write_static_game_data(p_game_id uuid)
returns void
language sql
security definer
set search_path = bananagrams, common, public, extensions
as $$
  update common.games
     set static_game_data = common._make_json_static_game_data(p_game_id)
   where id = p_game_id;
$$;

revoke execute on function bananagrams._write_static_game_data(uuid) from public;

-- ============================================================
-- bananagrams._rebuild_data_cols_for_all — every bananagrams game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_write_static_game_data` and `_rebuild_data_cols` over every bananagrams
-- game without re-dating any, and answers how many it rewrote. Run by hand as
-- postgres (`gmake db-psql`); no client calls it, so it has no grant and wears
-- the `_`.
create or replace function bananagrams._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype = 'bananagrams'
  loop
    perform bananagrams._write_static_game_data(v_game_id);
    perform bananagrams._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function bananagrams._rebuild_data_cols_for_all() from public;

drop function if exists bananagrams.create_game(text, jsonb, uuid[]);

-- ============================================================
-- bananagrams.create_game(p_club_handle, p_setup, p_player_user_ids)
-- ============================================================
-- Deals a new race. Compete only, single gametype 'bananagrams', so there is
-- no mode parameter. One player is allowed: a one-player race is just "finish
-- your own tiles."
--
-- Setup shape (each field validated below):
--   { "hand_size": 15 | 21,
--     "bunch_size": 1..144 (≥ player_count × hand_size),
--     "word_check": 'off' | 'win' | 'strict', "dict_2": 2..6, "dict_3plus": 1..6
--       (the two bands required unless word_check is 'off'),
--     "dump_to_bag": bool,
--     "timer": (none | countdown{seconds}) }
--
-- `word_check` gates the real-word check: 'off' = never, 'win' = on the
-- winning peel only, 'strict' = on EVERY peel (see peel and _win_blockers);
-- the dict_* bands set the obscurity ceilings it uses. The four are copied to
-- their columns, with the defaults 'off', 4, 4 and false.
--
-- The deal: shuffle the 144-tile bag, keep `bunch_size` of them as this
-- game's tiles (`bunch_at_setup`; the rest start in the out-of-play `bag`),
-- and hand each player a contiguous slice of hand_size letters as their
-- starting `tiles`. Everything past the dealt slices is the `bunch` that peel
-- and dump draw from. Each player's `board` starts empty.
create or replace function bananagrams.create_game(
  p_club_handle text,
  p_setup jsonb,
  p_player_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  new_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  s_hand_size int;
  s_bunch_size int;
  s_word_check text;
  s_dict_2 int;
  s_dict_3plus int;
  letters text[];
  shuffled text[];
  player_count int;
  s_bunch_at_setup text;
  s_bag text;
  s_bunch text;
begin
  -- ─── Player count: 1..6 (solo allowed — see above) ──
  -- MUST AGREE with numberOfPlayers: [1, 6] in
  -- src/bananagrams/manifest.ts. See docs/code-conventions.md →
  -- "Per-game player counts".
  perform common._require_player_count_max(p_player_user_ids, 6);
  player_count := coalesce(array_length(p_player_user_ids, 1), 0);

  -- ─── Validate setup shape ────────────────────────────
  if (p_setup->>'hand_size') is null then
    raise exception 'BUG: game with no hand size'
      using errcode = 'PN094', hint = 'fault', column = '_',
      detail = 'setup.hand_size absent';
  end if;
  s_hand_size := (p_setup->>'hand_size')::int;
  if s_hand_size not in (15, 21) then
    raise exception 'BUG: hand size of %', s_hand_size
      using errcode = 'PN095', hint = 'fault', column = '_',
      detail = 'setup.hand_size must be 15 or 21';
  end if;

  -- bunch_size: how many tiles to draw from the 144-tile set for this game.
  -- ≤ 144 (the full Bananagrams bag); smaller = a shorter game on a random
  -- subset. MUST be ≥ player_count × hand_size or the deal can't be made —
  -- the FE disables Start on the same check (see bananagrams bunchSizeError),
  -- but the server is the authority.
  if (p_setup->>'bunch_size') is null then
    raise exception 'BUG: game with no bunch size'
      using errcode = 'PN096', hint = 'fault', column = '_',
      detail = 'setup.bunch_size absent';
  end if;
  s_bunch_size := (p_setup->>'bunch_size')::int;
  if s_bunch_size < 1 or s_bunch_size > 144 then
    raise exception 'BUG: bunch size of %', s_bunch_size
      using errcode = 'PN097', hint = 'fault', column = '_',
      detail = 'setup.bunch_size must be 1..144';
  end if;
  if player_count * s_hand_size > s_bunch_size then
    -- A CROSS-FIELD rule the form already gates on (its manifest's `validate`
    -- couples the bunch to the headcount and blocks Start), so reaching it
    -- means something other than the form sent the setup.
    raise exception 'BUG: bunch of % for % players of % tiles',
      s_bunch_size, player_count, s_hand_size
      using errcode = 'PN098', hint = 'fault', column = '_',
      detail = 'players x hand_size exceeds bunch_size';
  end if;

  -- word_check (optional, default 'off'): how strictly real words are enforced.
  --   'off'    — never (only board connectivity is checked, at win).
  --   'win'    — a WINNING peel additionally requires every word to be real.
  --   'strict' — EVERY peel requires it: you can't peel with an invalid board
  --              (see peel + _win_blockers). Connectivity is checked regardless
  --              of this. The two obscurity ceilings (common.words difficulty)
  --              are required unless 'off': dict_2 for 2-letter words (2..6 —
  --              band 1 has too few 2-letter words to be fun) and dict_3plus for
  --              longer words (1..6).
  s_word_check := coalesce(p_setup->>'word_check', 'off');
  if s_word_check not in ('off', 'win', 'strict') then
    raise exception 'BUG: word-check setting of ''%''', s_word_check
      using errcode = 'PN099', hint = 'fault', column = '_',
      detail = 'word_check must be off, win or strict';
  end if;
  if s_word_check <> 'off' then
    if (p_setup->>'dict_2') is null then
      raise exception 'BUG: word checking with no 2-letter dictionary'
        using errcode = 'PN100', hint = 'fault', column = '_',
      detail = 'dict_2 required when word_check is on';
    end if;
    s_dict_2 := (p_setup->>'dict_2')::int;
    if s_dict_2 < 2 or s_dict_2 > 6 then
      raise exception 'BUG: 2-letter dictionary of %', s_dict_2
        using errcode = 'PN101', hint = 'fault', column = '_',
      detail = 'setup.dict_2 must be 2..6';
    end if;
    if (p_setup->>'dict_3plus') is null then
      raise exception 'BUG: word checking with no longer-word dictionary'
        using errcode = 'PN102', hint = 'fault', column = '_',
      detail = 'dict_3plus required when word_check is on';
    end if;
    s_dict_3plus := (p_setup->>'dict_3plus')::int;
    if s_dict_3plus < 1 or s_dict_3plus > 6 then
      raise exception 'BUG: longer-word dictionary of %', s_dict_3plus
        using errcode = 'PN103', hint = 'fault', column = '_',
      detail = 'setup.dict_3plus must be 1..6';
    end if;
  end if;

  perform common._require_valid_timer(p_setup->'timer');

  -- ─── Build the bunch: shuffle the 144-tile bag, take bunch_size ──
  -- string_to_array(_, NULL) splits the string into one element per char.
  letters := string_to_array(bananagrams._full_bag(), NULL);

  -- A fresh seed makes the shuffle order unpredictable. setseed wants a
  -- double in [-1, 1].
  perform setseed(random() * 2 - 1);
  select array_agg(ch order by random()) into shuffled
    from unnest(letters) as ch;

  -- Split the shuffled 144 at bunch_size: the first bunch_size tiles are this
  -- game's tiles (hands + draw pile, recorded as bunch_at_setup); the rest
  -- aren't in play but aren't thrown away either — they start the out-of-play
  -- BAG, which a dump can dip into when the bunch is short.
  s_bunch_at_setup := array_to_string(shuffled[1:s_bunch_size], '');
  s_bag := coalesce(array_to_string(shuffled[s_bunch_size + 1:144], ''), '');

  -- ─── Common header + gametype rows ───────────────────
  new_id := common._create_game(
    p_club_handle, 'bananagrams', 'compete', p_player_user_ids,
    -- Placeholder: the real title needs the game's id, which only exists once
    -- common._create_game has inserted the row (rewritten just below).
    'New game',
    p_setup,
    p_setup
  );

  -- The title (the club card's heading). Every other game names itself after
  -- its content, but bananagrams has no shared content to name: each player
  -- builds a private grid from a private hand, so anything drawn from play
  -- would be either meaningless or a leak. So the title is a pure IDENTIFIER —
  -- the first six hex digits of the game's own uuid, like a short commit hash.
  -- Two games in a club list are always tellable apart, and the handle doubles
  -- as a lookup key for finding the game a friend is asking about. (Six hex
  -- digits collide at ~1-in-16M.) The brand is shown from the FE manifest,
  -- never stored here.
  update common.games cg
     set title = '#' || upper(left(new_id::text, 6))
   where cg.id = new_id;

  -- The bunch = every tile past the dealt slices
  -- (shuffled[player_count*hand_size + 1 .. bunch_size]). coalesce to '' for
  -- the "exact deal, nothing left over" case so NOT NULL holds.
  s_bunch := coalesce(
    (select string_agg(shuffled[gidx], '' order by gidx)
       from generate_series(player_count * s_hand_size + 1, s_bunch_size) as gidx),
    ''
  );
  insert into bananagrams.games (
    game_id, hand_size, word_check, dict_2, dict_3plus, dump_to_bag,
    bunch_at_setup, bunch, bag
  )
  values (
    new_id, s_hand_size, s_word_check, coalesce(s_dict_2, 4), coalesce(s_dict_3plus, 4),
    coalesce((p_setup->>'dump_to_bag')::boolean, false),
    s_bunch_at_setup, s_bunch, s_bag
  );

  -- Deal: player `pi` (1-based, ordered by user id — the order replay_board
  -- re-deals in, so a Restart gives each player the same hand) gets the slice
  -- shuffled[(pi-1)*hs + 1 .. pi*hs] as their starting `tiles` (everything
  -- they hold; nothing placed yet). The board starts empty — a 25×25 =
  -- 625-char string of '.'.
  insert into bananagrams.player_boards (game_id, user_id, board, tiles)
  select
    new_id,
    pu.uid,
    repeat('.', 25 * 25),
    (
      select string_agg(shuffled[gidx], '' order by gidx)
        from generate_series((pu.pi - 1) * s_hand_size + 1, pu.pi * s_hand_size) as gidx
    )
  from (select uid, row_number() over (order by uid) as pi
          from unnest(p_player_user_ids) as uid) pu;

  perform bananagrams._write_static_game_data(new_id);
  perform bananagrams._rebuild_data_cols(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. The name is here even
  -- though this is the only `ok` — a call site cannot assert a case the payload
  -- does not carry, and without it the branch would match by being `ok` and draw
  -- a second answer as this one.
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

revoke execute on function bananagrams.create_game(text, jsonb, uuid[]) from public;
grant execute on function bananagrams.create_game(text, jsonb, uuid[]) to authenticated;

drop function if exists bananagrams.save_player_board(uuid, text);

-- ============================================================
-- bananagrams.save_player_board — snapshot the private board
-- ============================================================
-- The board is high-frequency, PRIVATE scratch state (drag a tile, place a
-- letter — many times a second). It does NOT round-trip per move; the FE owns
-- it as local state and snapshots the whole grid here on a debounce and when
-- the board component unmounts (which is what makes pause, navigating away
-- and shelving durable — PauseBoundary UNMOUNTS the play area, so an
-- un-snapshotted board would be lost).
--
-- Only `p_board` is sent. The player's `tiles` (everything they hold) is
-- SERVER-owned — set at the deal, grown by peel, swapped by dump — and the
-- snapshot never touches it. The hand the player sees is the page's idea:
-- `tiles` minus what is on the board.
--
-- Trust model: the board is private and unvalidated, so it is stored as
-- handed — no check that the placed letters are a subset of `tiles`. Its
-- shape is checked: 625 cells, each a lowercase letter or empty.
--
-- Then the blobs are rebuilt, every save: the saver's board in the blob is
-- the board as last saved, which is what their page seeds from on a remount,
-- and their `nUnplacedTiles` is the number a rival's strip shows.
--
-- A save into an ended game, or from a player who has conceded, is dropped —
-- a late unmount-snapshot must not clobber a final board or revive a
-- conceder's counts. Each of those is a NAMED answer, so a save and a
-- discard never look the same:
--   { result: 'saved' } | { result: 'game-over' } | { result: 'conceded' }
create or replace function bananagrams.save_player_board(p_game_id uuid, p_board text)
returns jsonb
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  caller_id uuid;
  v_ended_at timestamptz;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  caller_id := common._require_game_player(p_game_id);

  -- Locked like every move, so a save and a peel or dump don't interleave
  -- their rebuilds of the blobs.
  perform 1 from bananagrams.games where game_id = p_game_id for update;
  if not found then
    raise exception 'BUG: a board save for a game that does not exist'
      using errcode = 'PN349', hint = 'fault', column = '_',
      detail = 'no bananagrams.games row for p_game_id';
  end if;

  select ended_at into v_ended_at from common.games where id = p_game_id;
  if v_ended_at is not null then
    return common._ok_envelope(jsonb_build_object('result', 'game-over'));
  end if;

  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    return common._ok_envelope(jsonb_build_object('result', 'conceded'));
  end if;

  -- The FE builds the 625-char grid itself from lowercase tiles; a player
  -- cannot hand over another shape, so a wrong one is ours.
  if length(p_board) <> 25 * 25 or p_board !~ '^[a-z.]*$' then
    raise exception 'BUG: a board save with the wrong grid shape'
      using errcode = 'PN350', hint = 'fault', column = '_',
      detail = 'the 25x25 board snapshot must be 625 chars, each a lowercase letter or .';
  end if;

  update bananagrams.player_boards
     set board = p_board,
         updated_at = now()
   where game_id = p_game_id and user_id = caller_id;

  perform bananagrams._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(jsonb_build_object('result', 'saved'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function bananagrams.save_player_board(uuid, text) from public;
grant execute on function bananagrams.save_player_board(uuid, text) to authenticated;

drop function if exists bananagrams._win_blockers(text, integer, integer, boolean);

-- ============================================================
-- bananagrams._win_blockers — board legality
-- ============================================================
-- Returns the 0-indexed cells that block a legal win, or an empty array if the
-- board is a valid Bananagrams grid. A board is legal when:
--   1. ALWAYS: every filled tile is in ONE 4-connected mass (orthogonal only —
--      a diagonal touch does NOT connect). Geography is structural — a
--      scattered board isn't a real grid, so this holds even in trust-the-
--      friends mode.
--   2. WHEN p_check_words: every run of 2+ tiles (across and down) spells a
--      real word — one in common.words at difficulty ≤ the band for its
--      LENGTH: `p_dict_2` for 2-letter words, `p_dict_3plus` for longer ones
--      (2-letter words are a much thinner, separate vocabulary, so they get
--      their own band). Single tiles aren't words, so they're never checked.
-- The blockers are the union of: tiles NOT in the main mass (the flood-fill
-- from the top-left-most tile — so disconnected stragglers light up) and (when
-- checking words) every tile of an invalid word. The FE paints these red until
-- the player edits.
--
-- Plain `language sql` (not security definer): it reads only common.words
-- (granted to all) off the board it's handed, so it runs fine inside peel's
-- definer context with nothing extra to leak.
create or replace function bananagrams._win_blockers(
  p_board text,
  p_dict_2 int,
  p_dict_3plus int,
  p_check_words boolean
)
returns int[]
language sql
stable
set search_path = bananagrams, common, public, extensions
as $$
  with recursive filled as (
    select i - 1 as cidx, (i - 1) / 25 as r, (i - 1) % 25 as c
      from generate_series(1, 625) as i
     where substr(p_board, i, 1) <> '.'
  ),
  -- Flood-fill the connected mass from the lowest-index tile (4-adjacency:
  -- Manhattan distance 1 — never diagonal).
  flood as (
    select cidx, r, c from filled where cidx = (select min(cidx) from filled)
    union
    select f.cidx, f.r, f.c
      from filled f
      join flood fl on abs(f.r - fl.r) + abs(f.c - fl.c) = 1
  ),
  disconnected as (
    select cidx from filled
    except
    select cidx from flood
  ),
  -- Words across: group consecutive cells in a row (gaps-and-islands on
  -- c − row_number()); a group of 2+ is a word.
  hgroups as (
    select cidx, c, substr(p_board, cidx + 1, 1) as ch,
           c - row_number() over (partition by r order by c) as grp, r
      from filled
  ),
  hwords as (
    select array_agg(cidx order by c) as cells, string_agg(ch, '' order by c) as word
      from hgroups group by r, grp having count(*) >= 2
  ),
  -- Words down: same trick, partitioned by column.
  vgroups as (
    select cidx, r, substr(p_board, cidx + 1, 1) as ch,
           r - row_number() over (partition by c order by r) as grp, c
      from filled
  ),
  vwords as (
    select array_agg(cidx order by r) as cells, string_agg(ch, '' order by r) as word
      from vgroups group by c, grp having count(*) >= 2
  ),
  bad_word_cells as (
    select unnest(cells) as cidx
      from (select cells, word from hwords union all select cells, word from vwords) w
     where p_check_words
       and not exists (
         select 1 from common.words cw
          where cw.word = w.word
            and cw.difficulty <= case when length(w.word) = 2 then p_dict_2 else p_dict_3plus end
       )
  )
  select coalesce(
    (select array_agg(distinct cidx order by cidx)
       from (select cidx from disconnected
             union
             select cidx from bad_word_cells) u),
    '{}'::int[]
  );
$$;
revoke execute on function bananagrams._win_blockers(text, integer, integer, boolean) from public;

drop function if exists bananagrams.peel(uuid);

-- ============================================================
-- bananagrams.peel — draw a round, or go out (Bananas!)
-- ============================================================
-- A player who has placed every tile they hold (empty hand) clicks "Peel".
-- Two outcomes, decided by whether the bunch can refill the whole table:
--
--   - Enough tiles (bunch ≥ the players still racing): EVERY player still
--     racing draws 1 from the bunch and the game continues. (Yes — everyone
--     draws, not just the peeler; that's the threshold's shape.)
--   - Not enough: the peeler goes out and WINS — the Bananagrams endgame. The
--     race ends when decided: the peeler alone is ranked 1, and everyone else
--     is short of the goal (docs/win-lose.md).
--
-- The base gate is "hand empty" (placed == length(tiles)), trusting the FE
-- flushed its latest board first.
--
-- **Board check on a peel.** A WINNING peel is always checked for GEOGRAPHY
-- via _win_blockers — the grid must be one connected mass. When `word_check`
-- is 'win' or 'strict' it ALSO requires every word to be real. If anything
-- blocks, the game stays in progress and the offending cells come back for
-- the FE to paint red. A CONTINUING peel is not checked — you're not winning
-- yet — EXCEPT under 'strict', where the same check runs on every peel.
--
-- Three ok answers, and `invalid` is one of them ON PURPOSE: a board that isn't
-- ready is a state of play, not a rejection — the game stays in progress and the
-- player fixes the red cells and peels again.
--   { result: 'dealt' } | { result: 'won' } | { result: 'invalid', invalid_cells: int[] }
create or replace function bananagrams.peel(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  caller_id uuid;
  g bananagrams.games%rowtype;
  v_board text;
  n_tiles int;
  n_placed int;
  racing_count int;
  v_blockers int[];
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so two peels, or a peel and a dump, serialize on
  -- the shared bunch: the second sees the game over or the smaller bunch.
  select * into g from bananagrams.games where game_id = p_game_id for update;
  -- A friend deleted the game while this call was in flight: the shared race,
  -- asked before the membership gate, which the delete took with it.
  if not found then
    perform common._raise_game_deleted('bananagrams');
  end if;

  caller_id := common._require_game_player(p_game_id);

  -- A RACE, not a bug: the Peel button is gone once the game ends, but
  -- someone else's winning peel can land while this click is in flight.
  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  -- A conceded player is out of the race — they can't peel. Also a race: the
  -- button is hidden once you concede, so reaching this means a second tab
  -- that has not heard yet.
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- Gate: the caller's hand must be empty (every held tile placed).
  select board, length(tiles), length(replace(board, '.', ''))
    into v_board, n_tiles, n_placed
    from bananagrams.player_boards
   where game_id = p_game_id and user_id = caller_id;
  -- The board row is written at deal, and `_require_game_player` above has
  -- already established membership — so a member with no board is an
  -- inconsistency of ours.
  if v_board is null then
    raise exception 'BUG: a peel from a player with no board'
      using errcode = 'PN341', hint = 'fault', column = '_',
      detail = 'no bananagrams.player_boards row for (p_game_id, caller)';
  end if;
  -- The Peel button is disabled until the hand empties, and clicking it flushes
  -- the board first so this comparison is against what the player sees. A
  -- mismatch here means that flush did not land — ours to fix, not theirs.
  if n_placed <> n_tiles then
    raise exception 'BUG: a peel with tiles still in hand'
      using errcode = 'PN342', hint = 'fault', column = '_',
      detail = 'peel requires every tile placed on the board';
  end if;

  -- Only players still racing draw on a peel — one who has conceded neither
  -- needs tiles nor holds up the bunch math — so the winning-peel threshold is
  -- against them, not the whole roster.
  select count(*)::int into racing_count
    from common.game_players
   where game_id = p_game_id and player_ended_at is null;

  -- ─── Not enough to refill the table → the peeler goes out (win) ───
  if length(g.bunch) < racing_count then
    v_blockers := bananagrams._win_blockers(v_board, g.dict_2, g.dict_3plus, g.word_check <> 'off');
    if array_length(v_blockers, 1) > 0 then
      return common._ok_envelope(jsonb_build_object(
        'result', 'invalid', 'invalid_cells', to_jsonb(v_blockers)));
    end if;

    update common.game_players
       set solved_at = now()
     where game_id = p_game_id and user_id = caller_id;
    -- First to go out wins, and the game ends with them.
    perform common._set_player_ended(p_game_id, caller_id, 'reached_goal', 'complete', 'won');

    perform common._end_game(
      p_game_id, 'reached_goal', 'complete', caller_id,
      p_is_no_result => false,
      p_final_rankings => jsonb_build_object(caller_id::text, 1)
    );

    insert into bananagrams.events (game_id, user_id, kind, n_drawn)
    values (p_game_id, caller_id, 'went_out', 0);

    perform bananagrams._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
    return common._ok_envelope(jsonb_build_object('result', 'won'));
  end if;

  -- ─── Strict: a CONTINUING peel is checked too ───
  if g.word_check = 'strict' then
    v_blockers := bananagrams._win_blockers(v_board, g.dict_2, g.dict_3plus, true);
    if array_length(v_blockers, 1) > 0 then
      return common._ok_envelope(jsonb_build_object(
        'result', 'invalid', 'invalid_cells', to_jsonb(v_blockers)));
    end if;
  end if;

  -- ─── Enough → every player still racing draws 1 from the bunch ───
  -- The racer at rank `pi` (1-based, a stable order) takes bunch[pi].
  with ranked as (
    select user_id, row_number() over (order by user_id) as pi
      from common.game_players
     where game_id = p_game_id and player_ended_at is null
  )
  update bananagrams.player_boards pb
     set tiles = pb.tiles || substr(g.bunch, r.pi::int, 1),
         updated_at = now()
    from ranked r
   where pb.game_id = p_game_id and pb.user_id = r.user_id;

  -- Advance the bunch past the drawn tiles.
  update bananagrams.games
     set bunch = substr(g.bunch, racing_count + 1)
   where game_id = p_game_id;

  -- The peeler's row: everyone drew, but one player peeled.
  insert into bananagrams.events (game_id, user_id, kind, n_drawn)
  values (p_game_id, caller_id, 'peel', 1);

  perform bananagrams._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'dealt'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function bananagrams.peel(uuid) from public;
grant execute on function bananagrams.peel(uuid) to authenticated;

drop function if exists bananagrams.check_board(uuid);

-- ============================================================
-- bananagrams.check_board — "is my board legal?", on demand
-- ============================================================
-- The **Check words** action button. Runs the same legality test a winning
-- peel runs — one connected mass, every word real — against the caller's own
-- board, and hands back the offending cells so the FE can paint them red
-- exactly as a blocked peel does.
--
-- **Always available, whatever `word_check` says.** That option governs when
-- the server ENFORCES words (never / on the winning peel / on every peel);
-- this is the player asking a question about their own board, and the answer
-- is useful in all three. So the words are always checked, at the game's two
-- bands (4 and 4 when the game was made with word_check 'off' — the form's
-- defaults, and the reason its two band pickers show regardless of mode).
--
-- Read-only: no state, no log, no peer effect. It reveals nothing the player
-- doesn't already have on screen. Caller-scoped, so it can't inspect a peer's
-- board.
--
-- THREE answers, because the surface says three different things. An empty
-- board has no blockers, so "clean" and "empty" are one shape unless they are
-- named — and congratulating someone who has not put a tile down is the bug
-- that naming prevents. Only `invalid` carries the blockers:
--   { result: 'invalid', invalid_cells: int[] } | { result: 'empty' } | { result: 'clean' }
create or replace function bananagrams.check_board(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  v_caller     uuid;
  v_board      text;
  v_dict_2     int;
  v_dict_3plus int;
  v_blockers   int[];
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  v_caller := common._require_game_player(p_game_id);

  select board into v_board
    from bananagrams.player_boards
   where game_id = p_game_id and user_id = v_caller;
  -- The board row is written at deal, and `_require_game_player` above has
  -- already established membership — so a member with no board is an
  -- inconsistency of ours, not something a player reached.
  if v_board is null then
    raise exception 'BUG: a board check for a player with no board'
      using errcode = 'PN337', hint = 'fault', column = '_',
      detail = 'no bananagrams.player_boards row for (p_game_id, caller)';
  end if;

  select dict_2, dict_3plus into v_dict_2, v_dict_3plus
    from bananagrams.games where game_id = p_game_id;

  v_blockers := bananagrams._win_blockers(v_board, v_dict_2, v_dict_3plus, true);

  if array_length(v_blockers, 1) > 0 then
    return common._ok_envelope(jsonb_build_object(
      'result', 'invalid', 'invalid_cells', to_jsonb(v_blockers)));
  end if;
  if length(replace(v_board, '.', '')) = 0 then
    return common._ok_envelope(jsonb_build_object('result', 'empty'));
  end if;
  return common._ok_envelope(jsonb_build_object('result', 'clean'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function bananagrams.check_board(uuid) from public;
grant execute on function bananagrams.check_board(uuid) to authenticated;

drop function if exists bananagrams.dump(uuid, text);

-- ============================================================
-- bananagrams.dump — swap one tile for three from the bunch
-- ============================================================
-- A player stuck with an awkward tile (a Q, a lone consonant) trades it and
-- draws 3 in return — a net +2 to the hand, the cost of getting unstuck.
--
-- What happens to the DUMPED tile depends on `dump_to_bag`:
--   - false — return-to-bunch: it goes to the BACK of the bunch and may be
--     drawn again later.
--   - true — to-the-bag: it goes to the `bag` reserve instead, so the BUNCH
--     depletes (the game ends sooner).
-- Either way the player still draws 3.
--
-- The draw: 3 tiles from the FRONT of the bunch; if the bunch is short, the
-- rest comes from the FRONT of the bag (which holds the tiles a smaller
-- bunch_size left out, and any dumped to it). So you can dump as long as the
-- bunch and bag together cover the draw.
--
-- Two guarantees from the rules:
--   - You can't dump unless bunch + bag can cover the draw. The dumped tile is
--     placed only AFTER the draw, so it can never refill its own swap.
--   - You won't draw back the SAME tile: it lands at the BACK, behind anything
--     drawn. (You might draw the same LETTER if another copy was near a front —
--     that's allowed.)
--
-- No board or word check (trust model); the only check is that the caller
-- actually holds the tile they're dumping.
--
-- One ok answer — { result: 'dumped' } — since the swap either happens or is
-- refused; the new hand arrives with the rebuilt blob, not in the reply.
create or replace function bananagrams.dump(p_game_id uuid, p_tile text)
returns jsonb
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  caller_id uuid;
  g bananagrams.games%rowtype;
  v_tile text;
  from_bunch int;
  from_bag int;
  new_bunch text;
  new_bag text;
  caller_tiles text;
  drawn text;
  pos int;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so a dump and a peel serialize on the shared bunch.
  select * into g from bananagrams.games where game_id = p_game_id for update;
  -- A friend deleted the game while this call was in flight: the shared race,
  -- asked before the membership gate, which the delete took with it.
  if not found then
    perform common._raise_game_deleted('bananagrams');
  end if;

  caller_id := common._require_game_player(p_game_id);

  -- A RACE: the dump zone is gone once the game ends, but a rival's winning
  -- peel can land while this drop is in flight.
  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  -- A conceded player is out of the race — they can't drain the shared bunch
  -- with a dump. The FE hides the dump zone from a conceder, so this only
  -- fires on a race (a dump in flight when the concession commits, or a stale
  -- second tab).
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- The letter always comes off a tile the FE rendered — there is no way to
  -- type one — so anything else is ours.
  v_tile := p_tile;
  if v_tile !~ '^[a-z]$' then
    raise exception 'BUG: a dump of something that is not a tile'
      using errcode = 'PN346', hint = 'fault', column = '_',
      detail = 'a tile id is a single letter';
  end if;

  -- A RACE, not a bug: the dump zone reads its own count and refuses the drop
  -- below it, but the bunch is SHARED — a rival's peel can drain it between
  -- that read and this call.
  if length(g.bunch) + length(g.bag) < 3 then
    raise exception 'Bunch too low to dump'
      using errcode = 'PN347', hint = 'race', column = '_',
      detail = 'the bunch holds fewer than the 3 tiles a dump returns';
  end if;

  -- The caller must hold the tile they're dumping. Also a race: the board is
  -- FE-owned while `tiles` is server-owned (docs/games/bananagrams.md), so the
  -- server's view of the hand can legitimately lag the screen's for a moment.
  select tiles into caller_tiles
    from bananagrams.player_boards
   where game_id = p_game_id and user_id = caller_id;
  pos := position(v_tile in caller_tiles);
  if pos = 0 then
    raise exception 'You don''t have that tile'
      using errcode = 'PN348', hint = 'race', column = '_',
      detail = 'the dumped tile is not in the caller''s hand per the server';
  end if;

  from_bunch := least(length(g.bunch), 3);
  from_bag  := 3 - from_bunch;
  drawn := substr(g.bunch, 1, from_bunch) || substr(g.bag, 1, from_bag);
  new_bunch := substr(g.bunch, from_bunch + 1);
  new_bag  := substr(g.bag, from_bag + 1);

  -- The dumped tile then lands at the BACK of the bunch or the bag — after the
  -- draw, so it can't refill its own swap.
  if g.dump_to_bag then
    new_bag := new_bag || v_tile;
  else
    new_bunch := new_bunch || v_tile;
  end if;

  update bananagrams.player_boards
     set tiles = overlay(caller_tiles placing '' from pos for 1) || drawn,
         updated_at = now()
   where game_id = p_game_id and user_id = caller_id;

  update bananagrams.games
     set bunch = new_bunch, bag = new_bag
   where game_id = p_game_id;

  insert into bananagrams.events (game_id, user_id, kind, tile, n_drawn)
  values (p_game_id, caller_id, 'dump', v_tile, 3);

  perform bananagrams._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'dumped'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function bananagrams.dump(uuid, text) from public;
grant execute on function bananagrams.dump(uuid, text) to authenticated;

drop function if exists bananagrams.submit_timeout(uuid);

-- ============================================================
-- bananagrams.submit_timeout — countdown expiry
-- ============================================================
-- Fired by every connected client when a countdown hits 0 before anyone goes
-- out; the first ends the game, the rest find it ended and answer the
-- game-over race. Nobody reached the goal, so nobody is ranked and everyone
-- lost. bananagrams has no turn order, so nobody is recorded as ending it.
create or replace function bananagrams.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so the timeout and a concurrent winning peel serialize.
  perform 1 from bananagrams.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('bananagrams');
  end if;

  perform common._require_game_player(p_game_id);
  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  perform common._end_game(
    p_game_id, 'timeout', 'timeout', null,
    p_is_no_result => false,
    p_final_rankings => '{}'::jsonb
  );

  perform bananagrams._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function bananagrams.submit_timeout(uuid) from public;
grant execute on function bananagrams.submit_timeout(uuid) to authenticated;

drop function if exists bananagrams.replay_board(uuid);

-- ============================================================
-- bananagrams.replay_board — deal this game again from scratch
-- ============================================================
-- The "Restart" menu item, key and end-of-game button. Same game row, same
-- tiles: every board is emptied, every hand is re-dealt from `bunch_at_setup`
-- (the record of this game's shuffled deal), and the draw pile and
-- out-of-play bag go back to their opening sizes.
--
-- **Why bananagrams has a restart at all**, when a fresh deal would be nearly
-- the same game: because *every other game has one*, and a player who can't
-- find "Restart" where they expect it doesn't conclude "this game is different"
-- — they conclude the app is broken. It's a real reset, not an alias for New
-- game: same row, so the club list doesn't grow an entry and everyone stays in
-- the game they're already in.
--
-- Re-dealing from the deal rather than reshuffling keeps it a *restart*: the
-- same hands come back, so "we all misread the rules, start over" returns you
-- to the game you just had. The bag is rebuilt as the full 144-tile
-- distribution minus `bunch_at_setup` — dumps may have moved tiles between
-- bunch and bag, and tile identity is only ever a multiset, so subtracting is
-- exact.
--
-- Any game player may call it, mid-game or after the game ends (no ended
-- check — it's a restart; the FE confirms mid-game). Resets ALL players.
create or replace function bananagrams.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  g         bananagrams.games%rowtype;
  n_players int;
  new_bunch text;
  new_bag   text;
begin
  -- FOR UPDATE: a replay racing a move must not interleave with it, or the
  -- reset could land on a half-applied move.
  select * into g from bananagrams.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('bananagrams');
  end if;

  -- The row check comes BEFORE the membership gate: `delete_game` takes this
  -- row, `common.games` and every `game_players` row together, so a caller
  -- whose game was just deleted has no membership left either, and would be
  -- told "You are not in this game" — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  select count(*) into n_players
    from common.game_players where game_id = p_game_id;

  -- Re-deal: player i (1-based, ordered by user id, as create_game dealt)
  -- takes the deal's [(i-1)*hand + 1 .. i*hand]; the rest of the deal is the
  -- draw pile again.
  update bananagrams.player_boards pb
     set board = repeat('.', 25 * 25),
         tiles = substr(g.bunch_at_setup,
                        ((ord.i - 1) * g.hand_size + 1)::int, g.hand_size),
         updated_at = now()
    from (
      select user_id, row_number() over (order by user_id) as i
        from bananagrams.player_boards where game_id = p_game_id
    ) ord
   where pb.game_id = p_game_id and pb.user_id = ord.user_id;

  new_bunch := substr(g.bunch_at_setup, n_players * g.hand_size + 1);

  -- The out-of-play reserve = everything the deal left behind. Multiset
  -- subtraction, one letter at a time: the order was random to begin with, so
  -- any order is a faithful reserve.
  select coalesce(string_agg(ch, ''), '') into new_bag
    from (
      select ch, row_number() over (partition by ch order by n) as k
        from (select ch, generate_series as n
                from unnest(string_to_array(bananagrams._full_bag(), NULL))
                       with ordinality as t(ch, generate_series)) full_t
    ) full_ranked
   where not exists (
     select 1
       from (
         select ch, row_number() over (partition by ch order by n) as k
           from (select ch, generate_series as n
                   from unnest(string_to_array(g.bunch_at_setup, NULL))
                          with ordinality as t(ch, generate_series)) seed_t
       ) seed_ranked
      where seed_ranked.ch = full_ranked.ch and seed_ranked.k = full_ranked.k
   );

  update bananagrams.games
     set bunch = new_bunch, bag = new_bag
   where game_id = p_game_id;

  -- The log is the previous deal's.
  delete from bananagrams.events where game_id = p_game_id;

  update common.game_players
     set solved_at = null
   where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform bananagrams._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function bananagrams.replay_board(uuid) from public;
grant execute on function bananagrams.replay_board(uuid) to authenticated;

drop function if exists bananagrams.concede(uuid);

-- ============================================================
-- bananagrams.concede — a player drops out of the race
-- ============================================================
-- bananagrams has no other way for a player to end but going out, which ends
-- the game, so `common._concede` decides it all: it records the concession,
-- and when the last racer concedes (a solo game included) ends the game as a
-- loss for everyone. While anyone is still racing, a peel deals only to
-- them. No compete check: bananagrams has no coop sibling.
create or replace function bananagrams.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so every game's concede has one shape
  -- (docs/common-schema.md → Concede).
  perform 1 from bananagrams.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('bananagrams');
  end if;

  perform common._concede(p_game_id);

  perform bananagrams._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function bananagrams.concede(uuid) from public;
grant execute on function bananagrams.concede(uuid) to authenticated;

drop function if exists bananagrams.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists bananagrams.end_game(uuid);

-- ============================================================
-- bananagrams.stop_game — the Stop
-- ============================================================
-- Any player stops the game for the whole table: one click, no verdict for
-- anyone (docs/common-schema.md → Stop). A race has a per-player Concede, but
-- conceding is a loss on your record, and it takes every player doing it to
-- end a game the group has simply lost interest in.
create or replace function bananagrams.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the winning peel waits for it and then reads the
  -- game as over, rather than overwriting the win. The row check comes
  -- before the membership gate — see replay_board.
  perform 1 from bananagrams.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('bananagrams');
  end if;

  perform common._stop(p_game_id);

  perform bananagrams._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

revoke execute on function bananagrams.stop_game(uuid) from public;
grant execute on function bananagrams.stop_game(uuid) to authenticated;
