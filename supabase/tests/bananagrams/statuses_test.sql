-- cs-unmet

-- ============================================================
-- Test: bananagrams._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end — which is what catches a key still written after
-- it was dropped. Then the values that matter, that a board save rewrites
-- the statuses only when it changes a player's count of tiles not in their
-- main block, and the one rule about dates: only a call that says so moves
-- status_changed_at.
--
-- Two players of 21 from a bunch of 43 leaves 1 tile in the bunch: too few to
-- refill the table, so the first peel goes out and wins.
-- ============================================================

begin;
set search_path = bananagrams, common, public, extensions;
\ir ../_shared/setup.psql

select plan(17);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   '{}'),
  ('player_status', array['player_ended_reason', 'unplaced_count']),
  ('clubpage_info', array['bunch_tiles_count', 'winner_user_id']);
grant select on want to authenticated;

create function pg_temp.keys_of(j jsonb) returns text[] language sql as $$
  select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(j) k
$$;

-- Every status of one game against the wanted key sets; a mismatch names
-- which status and which row.
create function pg_temp.shapes_ok(p_game_id uuid) returns text language sql as $$
  select coalesce(string_agg(bad, '; '), 'ok') from (
    select 'game_status' as bad from common.games
     where id = p_game_id
       and pg_temp.keys_of(game_status) <> (select keys from want where status = 'game_status')
    union all
    select 'clubpage_info' from common.games
     where id = p_game_id
       and pg_temp.keys_of(clubpage_info) <> (select keys from want where status = 'clubpage_info')
    union all
    select 'player_status of ' || user_id from common.game_players
     where game_id = p_game_id
       and pg_temp.keys_of(player_status) <> (select keys from want where status = 'player_status')
  ) mismatches
$$;

create function pg_temp.unplaced_counts(p_game_id uuid) returns int[] language sql as $$
  select array_agg((player_status->>'unplaced_count')::int order by user_id)
    from common.game_players where game_id = p_game_id
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Bananagrams statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select (bananagrams.create_game(
  (select handle from club),
  '{"hand_size": 21, "bunch_size": 43, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid]
)->'data'->>'id')::uuid as id;

-- ── At the start ──
select is(pg_temp.shapes_ok((select id from g)), 'ok',
  'every status has its full key set at the start');
select is(pg_temp.unplaced_counts((select id from g)), array[21, 21],
  'each player''s status starts with a full hand');
select is(
  (select clubpage_info from common.games where id = (select id from g)),
  '{"bunch_tiles_count": 1, "winner_user_id": null}'::jsonb,
  'the club line starts with the tiles left in the bunch');

-- ada's board: her first 20 tiles in a row from cell 126, and her 21st at
-- `p_stray_cell` — off on its own, or null to join it to the row.
create function pg_temp.ada_board(p_stray_cell int) returns text language sql as $$
  select case when p_stray_cell is null
              then overlay(repeat('.', 625) placing tiles from 126)
              else overlay(overlay(repeat('.', 625) placing left(tiles, 20) from 126)
                           placing right(tiles, 1) from p_stray_cell)
         end
    from bananagrams.player_boards
   where game_id = (select id from g)
     and user_id = 'ada11111-1111-1111-1111-111111111111'
$$;

-- ── A board save rewrites the statuses when it changes the count ──
select bananagrams.save_player_board((select id from g), pg_temp.ada_board(400));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.unplaced_counts((select id from g)), array[1, 21],
  'a save counts a tile off to the side of the main block as unplaced');

-- Moving the stray elsewhere leaves the count at 1, so nothing is rewritten.
update common.games set status_changed_at = '2026-01-01' where id = (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.save_player_board((select id from g), pg_temp.ada_board(500));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status_changed_at from common.games where id = (select id from g)),
  '2026-01-01'::timestamptz,
  'a save that leaves the count alone does not rewrite the statuses');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.save_player_board((select id from g), pg_temp.ada_board(null));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.unplaced_counts((select id from g)), array[0, 21],
  'joining the stray to the block brings the count to 0');
select isnt(
  (select status_changed_at from common.games where id = (select id from g)),
  '2026-01-01'::timestamptz,
  'a save that changes the count rewrites the statuses');

-- ── Mid-game: bea dumps a tile, which rewrites every status ──
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select bananagrams.dump((select id from g),
  (select left(tiles, 1) from bananagrams.player_boards
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g)), 'ok',
  'every status has its full key set mid-game');
select is(pg_temp.unplaced_counts((select id from g)), array[0, 23],
  'a dump adds its two tiles to the dumper''s count');
select is(
  (select (clubpage_info->>'bunch_tiles_count')::int from common.games where id = (select id from g)),
  1,
  'the club line''s bunch count follows the dump (1 drawn, the dumped tile back)');

-- ── At the end: ada peels out ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select bananagrams.peel((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select game_ended_reason from common.games where id = (select id from g)),
  'reached_goal',
  'precondition: the peel went out');
select is(pg_temp.shapes_ok((select id from g)), 'ok',
  'every status has its full key set at the end');
select is(
  (select clubpage_info->>'winner_user_id' from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111',
  'the club line names who went out');
select is(
  (select array_agg(player_status->>'player_ended_reason' order by user_id)
     from common.game_players where game_id = (select id from g)),
  array['reached_goal', null],
  'the winner''s status says she went out, for the strip');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id = (select id from g);
select bananagrams._write_statuses((select id from g), p_update_status_changed_at => false);
select is(
  (select status_changed_at from common.games where id = (select id from g)),
  '2026-01-01'::timestamptz,
  'a rebuild (false) leaves status_changed_at alone');

-- A rebuild assigns, never merges: a key planted in a status does not survive.
update common.games set game_status = game_status || '{"stale": 1}'::jsonb
 where id = (select id from g);
select isnt(pg_temp.shapes_ok((select id from g)), 'ok',
  'precondition: the key-set check sees the planted key');
select bananagrams._write_statuses((select id from g), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g)), 'ok',
  'a rebuild drops a stale key from every status');

select * from finish();
rollback;
