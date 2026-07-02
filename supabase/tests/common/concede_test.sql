-- ============================================================
-- Test: common.concede(target_game)  (+ common._set_conceded)
-- ============================================================
-- The shared per-player drop-out for compete games with no
-- game-specific "eliminated" state. Concede is a real loss for the
-- conceder but does NOT end the game while others still race; only
-- the LAST active player conceding ends it, as a collective loss.
-- Covers:
--   1. Concede marks JUST the caller (game_players.conceded +
--      conceded_at), game stays non-terminal while others race
--   2. Idempotency: a second concede by the same player raises P0001
--   3. A middle concede keeps the game going (one racer left)
--   4. The LAST active player conceding ends the game as a COLLECTIVE
--      loss (is_terminal, play_state 'lost', status.outcome
--      'conceded', every result {"won": false}, no winner)
--   5. Non-players rejected; conceding a finished game rejected
--
-- Uses common.create_game directly (concede is gametype-agnostic — it
-- only reads game_players + common.games.is_terminal), so this test
-- doesn't couple to any one game's create_game.
-- ============================================================

begin;

set search_path = common, public, extensions;

select plan(13);

\ir ../_shared/setup.psql

-- Set JWT claims WITHOUT switching role away from postgres — keeps
-- execute privilege on common.create_game, which is revoked from
-- `authenticated` (see games_test.sql for the same trick).
create function pg_temp.as_jwt_only(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
end;
$$;

-- 3-member club so we can watch two players drop out before the third.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea', 'cade']) as handle;

reset role;
select set_config('request.jwt.claims', '', true);

-- A 3-player game. gametype string is arbitrary for concede — pick a
-- registered compete one for realism. create_game is revoked from
-- `authenticated`, so create it as_jwt_only (postgres role + ada's jwt).
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.game_id',
  (common.create_game(
    (select handle from club),
    'spellingbee_compete',
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid,
      'cade3333-3333-3333-3333-333333333333'::uuid
    ],
    'test-title',
    '{}'::jsonb,
    null
  ))::text,
  true
);

-- ─── (1) ada concedes; bea + cade still race ───
select lives_ok(
  format($$ select common.concede(%L) $$, current_setting('test.game_id')),
  'a player can concede'
);
select is(
  (select conceded from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true,
  'the conceder is marked conceded'
);
select isnt(
  (select conceded_at from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  null,
  'conceded_at is stamped'
);
select is(
  (select conceded from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false,
  'a still-racing player is NOT conceded'
);
select is(
  (select is_terminal from common.games where id = current_setting('test.game_id')::uuid),
  false,
  'the game stays in progress while others race'
);

-- ─── (2) Idempotency: ada can't concede twice ───
select throws_ok(
  format($$ select common.concede(%L) $$, current_setting('test.game_id')),
  'P0001',
  'you have already conceded',
  'conceding twice is rejected'
);

-- ─── (3) bea concedes; cade alone is still active ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select common.concede(current_setting('test.game_id')::uuid);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select is_terminal from common.games where id = current_setting('test.game_id')::uuid),
  false,
  'still in progress with one racer (cade) left'
);

-- ─── (4) cade (the last active player) concedes → collective loss ───
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select common.concede(current_setting('test.game_id')::uuid);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select is_terminal from common.games where id = current_setting('test.game_id')::uuid),
  true,
  'the last concede ends the game'
);
select is(
  (select play_state from common.games where id = current_setting('test.game_id')::uuid),
  'lost',
  'ended play_state is lost (collective loss)'
);
select is(
  (select status->>'outcome' from common.games where id = current_setting('test.game_id')::uuid),
  'conceded',
  'status.outcome is conceded (distinct from a win / timeout)'
);
select is(
  (select count(*) from common.game_players
    where game_id = current_setting('test.game_id')::uuid
      and result->>'won' = 'false'),
  3::bigint,
  'every player is recorded a loss'
);

-- ─── (5) Non-player rejected; finished game rejected ───
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select common.concede(%L) $$, current_setting('test.game_id')),
  '42501',
  'not playing this game',
  'a non-player cannot concede'
);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select common.concede(%L) $$, current_setting('test.game_id')),
  'P0001',
  'game is already over',
  'conceding a finished game is rejected'
);

select * from finish();
rollback;
