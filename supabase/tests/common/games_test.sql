-- ============================================================
-- Test: common.games + common.game_players + the 3 new helpers
-- ============================================================
--
-- Covers Phase 1 of the common.games architectural shift:
--
--   - common.games: RLS (club members see all club games), base
--     shape
--   - common.game_players: RLS via parent games, base shape
--   - common.create_game: caller membership, player-uid
--     membership, both rows landed
--   - common.require_game_player: auth + game-player gate
--   - common.end_game: ended_at + status_summary +
--     per-player results + is_active flipped to false
--
-- Per-game tests (tinyspy/psychicnum/wordknit) exercise these
-- helpers indirectly through their own create_game RPCs; this
-- file pins the contract directly.
--
-- "Which game is active for this club" is now derived from
-- common.games.is_active (with a partial unique index enforcing
-- one-active-per-club). The separate club_active_game pointer
-- table is gone.
--
-- See ../tinyspy/create_game_test.sql for the pgTAP / personas
-- primer, and helpers_test.sql for the "as_jwt_only" trick we
-- reuse here to call security-revoked helpers as postgres while
-- still simulating an authenticated caller's auth.uid().

begin;

set search_path = common, public, extensions;

select plan(21);

\ir ../_shared/setup.psql

-- Set JWT claims (so auth.uid() returns a real uuid) WITHOUT
-- switching role away from postgres — keeps execute privilege on
-- the security-revoked helpers.
create function pg_temp.as_jwt_only(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
end;
$$;

-- ============================================================
-- Set up a club
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select * from common.create_club('Ada and Bea', array['ada','bea']);

reset role;
select set_config('request.jwt.claims', '', true);

-- ============================================================
-- common.create_game — happy path
-- ============================================================
-- Caller is ada; players are [ada, bea]; gametype 'wordknit'.
-- The new game_id goes into session-config so we can read it
-- back across role switches (temp tables are role-bound).

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');

select set_config(
  'test.created_game_id',
  (common.create_game(
    (select id from club),
    'wordknit',
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid
    ],
    'test-title',
    '{}'::jsonb
  ))::text,
  true
);

select isnt(
  current_setting('test.created_game_id')::uuid,
  null,
  'create_game: returns a non-null uuid'
);

select is(
  (select gametype from common.games where id = current_setting('test.created_game_id')::uuid),
  'wordknit',
  'create_game: common.games row has the right gametype'
);

select is(
  (select club_id from common.games where id = current_setting('test.created_game_id')::uuid),
  (select id from club),
  'create_game: common.games row has the right club_id'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid),
  2,
  'create_game: 2 game_players rows landed (one per uid in player_user_ids)'
);

-- ============================================================
-- common.create_game — rejects on caller not a club member
-- ============================================================
-- Dee tries to start a game in ada+bea's club.

select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select common.create_game(%L::uuid, 'wordknit',
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid],
       'test-title', '{}'::jsonb) $$,
    (select id from club)
  ),
  '42501',
  'not a member of this club',
  'create_game: non-member caller is rejected (via require_club_member)'
);

-- ============================================================
-- common.create_game — rejects on empty player_user_ids
-- ============================================================

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format(
    $$ select common.create_game(%L::uuid, 'wordknit', array[]::uuid[], 'test-title', '{}'::jsonb) $$,
    (select id from club)
  ),
  'P0001',
  'player_user_ids must not be empty',
  'create_game: empty player_user_ids is rejected'
);

-- ============================================================
-- common.create_game — rejects when a listed uid isn't a club member
-- ============================================================
-- ada lists dee (an outsider) as a player.

select throws_ok(
  format(
    $$ select common.create_game(%L::uuid, 'wordknit',
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'dee44444-4444-4444-4444-444444444444'::uuid],
       'test-title', '{}'::jsonb) $$,
    (select id from club)
  ),
  'P0001',
  'player_user_ids contains non-members: dee44444-4444-4444-4444-444444444444',
  'create_game: rejects when a listed uid isn''t in clubs_members'
);

-- ============================================================
-- common.games / game_players RLS
-- ============================================================
-- ada (member) sees the game; dee (outsider) doesn't. game_players
-- visibility inherits from the parent game via the EXISTS
-- subquery in the policy.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from common.games
    where id = current_setting('test.created_game_id')::uuid),
  1,
  'games RLS: club member sees the game they created'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid),
  2,
  'game_players RLS: club member sees the player rows'
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from common.games
    where id = current_setting('test.created_game_id')::uuid),
  0,
  'games RLS: outsider sees zero rows'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid),
  0,
  'game_players RLS: outsider sees zero rows'
);

-- ============================================================
-- common.require_game_player
-- ============================================================

reset role;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  format(
    $$ select common.require_game_player(%L::uuid) $$,
    current_setting('test.created_game_id')::uuid
  ),
  '42501',
  'must be authenticated',
  'require_game_player: null auth.uid() raises 42501'
);

select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select common.require_game_player(%L::uuid) $$,
    current_setting('test.created_game_id')::uuid
  ),
  '42501',
  'not playing this game',
  'require_game_player: outsider raises 42501'
);

select pg_temp.as_jwt_only('bea22222-2222-2222-2222-222222222222');
select is(
  (select common.require_game_player(current_setting('test.created_game_id')::uuid)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'require_game_player: in-game player gets back their caller_id'
);

-- ============================================================
-- common.end_game
-- ============================================================
-- Precondition: common.create_game left this row in is_active=true
-- (the create_game RPC's transition). end_game should flip it off.

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select is_active from common.games
    where id = current_setting('test.created_game_id')::uuid),
  true,
  'precondition: game starts is_active=true after create_game'
);

-- Now end the game with status_summary + per-player results.
select common.end_game(
  current_setting('test.created_game_id')::uuid,
  '{"outcome": "solved", "matched": 4, "mistakes": 1}'::jsonb,
  format(
    '{"%s": {"won": true}, "%s": {"won": true}}',
    'ada11111-1111-1111-1111-111111111111',
    'bea22222-2222-2222-2222-222222222222'
  )::jsonb
);

select isnt(
  (select ended_at from common.games
    where id = current_setting('test.created_game_id')::uuid),
  null,
  'end_game: ended_at is set'
);

select is(
  (select status_summary->>'outcome' from common.games
    where id = current_setting('test.created_game_id')::uuid),
  'solved',
  'end_game: status_summary persisted'
);

select is(
  (select result->>'won' from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'true',
  'end_game: ada''s per-player result persisted'
);

select is(
  (select result->>'won' from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'true',
  'end_game: bea''s per-player result persisted'
);

select is(
  (select is_active from common.games
    where id = current_setting('test.created_game_id')::uuid),
  false,
  'end_game: is_active flipped to false'
);

-- ============================================================
-- common.end_game — unknown game
-- ============================================================

select throws_ok(
  $$ select common.end_game('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
                            '{}'::jsonb, '{}'::jsonb) $$,
  'P0002',
  'game not found',
  'end_game: unknown game raises P0002'
);

-- ============================================================
select * from finish();
rollback;
