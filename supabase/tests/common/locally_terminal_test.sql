-- cs-met-connections

-- ============================================================
-- Test: common.game_players.locally_terminal
--       (common._set_locally_terminal + common.reset_game)
-- ============================================================
-- The flag that says "this player is DONE, the game is not". The
-- presence-pause roster is `not conceded and not locally_terminal`,
-- so a racer who was eliminated, spent their budget, or finished
-- ahead of the others stops holding the game open for everyone
-- still playing. Covers:
--   1. The helper marks JUST that player, and leaves `conceded`
--      alone — the two are different facts, and a solver who was
--      marked "conceded" instead would forfeit the win
--   2. Idempotent: the calling branch never has to ask whether it
--      already fired
--   3. common.reset_game clears it, so Restart puts everyone back
--      in the race
--
-- Each gametype's OWN test proves it calls the helper at the right
-- moment (connections' fourth mistake, psychicnum's spent budget,
-- a solve in wordle / waffle / strands, wordiply's fifth guess);
-- this file is the flag itself.
--
-- Uses common.create_game directly — the flag is gametype-agnostic.
-- See common/concede_test.sql for the pgTAP / auth-simulation primer.
-- ============================================================

begin;

set search_path = common, public, extensions;

select plan(7);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- Set JWT claims WITHOUT switching role away from postgres — keeps execute
-- privilege on common.create_game, which is revoked from `authenticated`.
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

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.game_id',
  (common.create_game(
    (select handle from club),
    'spellingbee_compete',
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid
    ],
    'test-title',
    '{}'::jsonb,
    null
  ))::text,
  true
);
reset role;
select set_config('request.jwt.claims', '', true);

-- ─── (1) Nobody starts out done ───
select is(
  (select count(*) from common.game_players
    where game_id = current_setting('test.game_id')::uuid and locally_terminal),
  0::bigint,
  'a fresh game has nobody locally terminal'
);

-- ─── (2) The helper marks one player, and only that player ───
select lives_ok(
  format($$ select common._set_locally_terminal(%L, 'ada11111-1111-1111-1111-111111111111') $$,
         current_setting('test.game_id')),
  'the helper runs'
);
select is(
  (select locally_terminal from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true,
  'the finished player is marked locally terminal'
);
select is(
  (select locally_terminal from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false,
  'the player still going is not'
);

-- ─── (3) It is NOT a second spelling of conceded ───
-- The distinction the column exists for: in wordle, waffle and strands the
-- first player to go locally terminal is the one who SOLVED, and a conceder
-- forfeits any win.
select is(
  (select conceded from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  false,
  'being done does not concede'
);

-- ─── (4) Idempotent ───
select lives_ok(
  format($$ select common._set_locally_terminal(%L, 'ada11111-1111-1111-1111-111111111111') $$,
         current_setting('test.game_id')),
  'marking a player done twice is fine'
);

-- ─── (5) A restart puts everyone back in the race ───
select common.reset_game(current_setting('test.game_id')::uuid, '{}'::jsonb);
select is(
  (select count(*) from common.game_players
    where game_id = current_setting('test.game_id')::uuid and locally_terminal),
  0::bigint,
  'reset_game clears locally_terminal, like conceded'
);

-- ============================================================
select * from finish();
rollback;
