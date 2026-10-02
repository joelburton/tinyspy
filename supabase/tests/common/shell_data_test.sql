-- cs-unmet

-- ============================================================
-- Test: shell_data — common._make_json_shell_data
-- ============================================================
-- `common.games.shell_data` is what GamePage shows and nothing more, written whole
-- by common._make_json_shell_data: at create by common._create_game, and after every
-- move by each game's status builder (supabase/sql/common.sql → The page
-- blobs' common parts). This file pins the blob a page gets:
--
--   1. A fresh game, as a whole: the five-field roster, nobody ended
--   2. A player who ended while the game plays on leaves the roster's
--      stillPlaying; the game is not ended
--   3. The game's ending
--   4. A Restart undoes it and counts
--   5. The roster is in seat order
--
-- The common helpers do not write shell_data themselves — a game's builder
-- does, after them — so this file writes shell_data by hand where a builder
-- would. The player facts game_data shows are game_data_common_test.sql's.
-- See games_test.sql for the as_jwt_only trick.
-- ============================================================

begin;

set search_path = common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql

-- Set JWT claims WITHOUT switching role away from postgres — keeps execute
-- privilege on the security-revoked helpers.
create function pg_temp.as_jwt_only(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
end;
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('test club', array['ada', 'bea']) as handle;

reset role;
select set_config('request.jwt.claims', '', true);

-- The two games: a free-for-all compete race, and a coop game seated in turns.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config('test.race', (common._create_game(
  (select handle from club), 'spellingbee_compete', 'compete',
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'test-title', '{"timer": {"kind": "none"}}'::jsonb, null))::text, true);
select set_config('test.turns', (common._create_game(
  (select handle from club), 'psychicnum_coop', 'coop',
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'turns-title', '{"timer": {"kind": "none"}}'::jsonb, null))::text, true);
reset role;
select set_config('request.jwt.claims', '', true);

-- Shorthands: the two games' ids, a game's shell_data, and one player inside it.
create function pg_temp.race() returns uuid language sql as
  $$ select current_setting('test.race')::uuid $$;
create function pg_temp.turns() returns uuid language sql as
  $$ select current_setting('test.turns')::uuid $$;
create function pg_temp.shell_data(game uuid) returns jsonb language sql as
  $$ select shell_data from common.games where id = game $$;
-- Write it, as a game's builder would after a move.
create function pg_temp.write_shell_data(game uuid) returns void language sql as
  $$ update common.games set shell_data = common._make_json_shell_data(game) where id = game $$;
create function pg_temp.player(game uuid, uid uuid) returns jsonb language sql as
  $$ select p from jsonb_array_elements((select shell_data -> 'players' from common.games where id = game)) p
      where p ->> 'id' = uid::text $$;

-- A player as shell_data shows them while they play.
create function pg_temp.playing(uid uuid, name text) returns jsonb language sql as $$
  select jsonb_build_object(
    'id',           uid,
    'username',     name,
    'color',        (select color from common.profiles where user_id = uid),
    'ai',           false,
    'stillPlaying', true)
$$;

-- ─── (1) A fresh game, as a whole ───
select is(
  pg_temp.shell_data(pg_temp.race()),
  jsonb_build_object(
    'id',           pg_temp.race(),
    'gametype',     'spellingbee_compete',
    'club',         jsonb_build_object('handle', (select handle from club)),
    'title',        'test-title',
    'restartCount', 0,
    'ended',        false,
    'players',      jsonb_build_array(
      pg_temp.playing('ada11111-1111-1111-1111-111111111111', 'ada'),
      pg_temp.playing('bea22222-2222-2222-2222-222222222222', 'bea'))),
  '_create_game writes the whole shell_data of a fresh game: the roster, nobody ended, by username'
);

-- ─── (2) A player ends while the game plays on ───
select common._set_player_ended(
  pg_temp.race(), 'ada11111-1111-1111-1111-111111111111',
  'reached_goal', 'solved', 'won');
select pg_temp.write_shell_data(pg_temp.race());

select is(
  pg_temp.player(pg_temp.race(), 'ada11111-1111-1111-1111-111111111111'),
  pg_temp.playing('ada11111-1111-1111-1111-111111111111', 'ada') || '{"stillPlaying": false}'::jsonb,
  'a player who ended is no longer still playing, and shell_data says nothing else about it'
);
select is(
  pg_temp.player(pg_temp.race(), 'bea22222-2222-2222-2222-222222222222'),
  pg_temp.playing('bea22222-2222-2222-2222-222222222222', 'bea'),
  'the other player plays on'
);
select is(
  (pg_temp.shell_data(pg_temp.race()) ->> 'ended')::boolean,
  false,
  'one player ending does not end the game'
);

-- ─── (3) The game ends ───
select common._end_game(
  pg_temp.race(), 'reached_goal', 'solved', 'ada11111-1111-1111-1111-111111111111',
  p_is_no_result => false,
  p_final_rankings => '{"ada11111-1111-1111-1111-111111111111": 1}'::jsonb);
select pg_temp.write_shell_data(pg_temp.race());

select is(
  (pg_temp.shell_data(pg_temp.race()) ->> 'ended')::boolean,
  true,
  'ended'
);
select is(
  (select jsonb_agg(p -> 'stillPlaying') from jsonb_array_elements(pg_temp.shell_data(pg_temp.race()) -> 'players') p),
  '[false, false]'::jsonb,
  '… and nobody is still playing'
);

-- ─── (4) A Restart undoes it and counts ───
select common._reset_game(pg_temp.race());
select pg_temp.write_shell_data(pg_temp.race());

select is(
  pg_temp.shell_data(pg_temp.race()),
  jsonb_build_object(
    'id',           pg_temp.race(),
    'gametype',     'spellingbee_compete',
    'club',         jsonb_build_object('handle', (select handle from club)),
    'title',        'test-title',
    'restartCount', 1,
    'ended',        false,
    'players',      jsonb_build_array(
      pg_temp.playing('ada11111-1111-1111-1111-111111111111', 'ada'),
      pg_temp.playing('bea22222-2222-2222-2222-222222222222', 'bea'))),
  'after a Restart shell_data is the fresh one, with the restart counted'
);

-- ─── (5) The roster is in seat order ───
select common._assign_turn_order(pg_temp.turns(), 'bea22222-2222-2222-2222-222222222222');
select pg_temp.write_shell_data(pg_temp.turns());

select is(
  (select jsonb_agg(p ->> 'username') from jsonb_array_elements(pg_temp.shell_data(pg_temp.turns()) -> 'players') p),
  '["bea", "ada"]'::jsonb,
  'a seated game lists its players by seat'
);
select is(
  pg_temp.shell_data(pg_temp.turns()) ? 'turns',
  false,
  '… and shell_data carries nothing about the turn: that is the game_data''s'
);

select * from finish();
rollback;
