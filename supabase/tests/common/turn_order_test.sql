-- ============================================================
-- Test: the common turn-order primitive
--   common._assign_turn_order / _advance_turn / _require_turn
-- ============================================================
-- The opt-in turn-by-turn coop mode's server core. Free-for-all is the
-- default (games.current_turn_user_id null ⇒ all three helpers inert);
-- a game opts in by calling _assign_turn_order at create-time.
-- Covers:
--   1. _assign_turn_order seats the chosen first player at seat 0,
--      seats everyone densely 0..n-1, and points current_turn_user_id
--      at the first player
--   2. _advance_turn walks the rotation by seat and WRAPS back to 0
--   3. _require_turn passes the current player, rejects anyone else
--      with P0001 'not your turn'
--   4. Free-for-all (never assigned, pointer null) ⇒ _require_turn
--      passes EVERYONE; _advance_turn is a no-op
--   5. Solo (1 player) ⇒ pointer is that player; advance wraps to self;
--      _require_turn always passes
--
-- Uses common.create_game directly (the primitive is gametype-agnostic —
-- it only touches common.game_players + common.games), so this test
-- doesn't couple to any one game's create_game. The rotation tail is
-- randomised, so assertions read "who is at seat N" dynamically rather
-- than pinning a specific non-first player to a specific seat.
-- ============================================================

begin;

set search_path = common, public, extensions;

select plan(14);

\ir ../_shared/setup.psql

-- Set JWT claims WITHOUT switching role away from postgres — keeps
-- execute privilege on common.create_game + the internal turn helpers,
-- all revoked from `authenticated` (same trick as concede_test.sql).
create function pg_temp.as_jwt_only(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
end;
$$;

-- "Seat of whoever the pointer currently names" — the load-bearing read
-- for the advance/wrap assertions. Null when the game is free-for-all.
create function pg_temp.current_seat(g uuid) returns int
language sql as $$
  select gp.turn_seat
    from common.game_players gp
    join common.games gm on gm.id = gp.game_id
   where gp.game_id = g
     and gp.user_id = gm.current_turn_user_id;
$$;

-- 3-member club so the rotation has somewhere to walk.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada', 'bea', 'cade']) as handle;

reset role;
select set_config('request.jwt.claims', '', true);

-- ─── A 3-player turn game, first = ada ───────────────────────
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.turn_game',
  (common.create_game(
    (select handle from club),
    'spellingbee_coop',
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid,
      'cade3333-3333-3333-3333-333333333333'::uuid
    ],
    'turn-title',
    '{"coopStyle": "turns"}'::jsonb,
    null
  ))::text,
  true
);

select common._assign_turn_order(
  current_setting('test.turn_game')::uuid,
  'ada11111-1111-1111-1111-111111111111'
);

-- ─── (1) Assignment ──────────────────────────────────────────
select is(
  (select current_turn_user_id from common.games
    where id = current_setting('test.turn_game')::uuid),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'pointer starts on the chosen first player'
);
select is(
  (select turn_seat from common.game_players
    where game_id = current_setting('test.turn_game')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  0,
  'the chosen first player is seat 0'
);
select is(
  (select array_agg(turn_seat order by turn_seat) from common.game_players
    where game_id = current_setting('test.turn_game')::uuid),
  array[0, 1, 2],
  'seats are dense 0..n-1'
);

-- ─── (2) Advance walks + wraps ───────────────────────────────
select is(pg_temp.current_seat(current_setting('test.turn_game')::uuid), 0,
  'current seat is 0 before advancing');
select common._advance_turn(current_setting('test.turn_game')::uuid);
select is(pg_temp.current_seat(current_setting('test.turn_game')::uuid), 1,
  'advance moves to seat 1');
select common._advance_turn(current_setting('test.turn_game')::uuid);
select is(pg_temp.current_seat(current_setting('test.turn_game')::uuid), 2,
  'advance moves to seat 2');
select common._advance_turn(current_setting('test.turn_game')::uuid);
select is(pg_temp.current_seat(current_setting('test.turn_game')::uuid), 0,
  'advance wraps back to seat 0');

-- ─── (3) _require_turn gates on the pointer ──────────────────
-- Pointer is back on ada (seat 0). ada passes; bea (not current) is rejected.
select lives_ok(
  format($$ select common._require_turn(%L, 'ada11111-1111-1111-1111-111111111111') $$,
         current_setting('test.turn_game')),
  'the current player passes _require_turn'
);
select throws_ok(
  format($$ select common._require_turn(%L, 'bea22222-2222-2222-2222-222222222222') $$,
         current_setting('test.turn_game')),
  'P0001',
  'not your turn',
  'a non-current player is rejected'
);

-- ─── (4) Free-for-all: never assigned ⇒ pointer null ⇒ all pass ──
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.ffa_game',
  (common.create_game(
    (select handle from club),
    'spellingbee_coop',
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid
    ],
    'ffa-title',
    '{}'::jsonb,
    null
  ))::text,
  true
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select current_turn_user_id from common.games
    where id = current_setting('test.ffa_game')::uuid),
  null,
  'a game that never opted in has a null pointer'
);
select lives_ok(
  format($$ select common._require_turn(%L, 'ada11111-1111-1111-1111-111111111111') $$,
         current_setting('test.ffa_game')),
  'free-for-all: everyone passes _require_turn (ada)'
);
select lives_ok(
  format($$ select common._require_turn(%L, 'bea22222-2222-2222-2222-222222222222') $$,
         current_setting('test.ffa_game')),
  'free-for-all: everyone passes _require_turn (bea too)'
);
-- _advance_turn on a free-for-all game is a no-op (pointer stays null).
select common._advance_turn(current_setting('test.ffa_game')::uuid);
select is(
  (select current_turn_user_id from common.games
    where id = current_setting('test.ffa_game')::uuid),
  null,
  'advance is a no-op on a free-for-all game'
);

-- ─── (5) Solo: 1 player, advance wraps to self ───────────────
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.solo_game',
  (common.create_game(
    (select handle from club),
    'spellingbee_coop',
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'solo-title',
    '{"coopStyle": "turns"}'::jsonb,
    null
  ))::text,
  true
);
select common._assign_turn_order(
  current_setting('test.solo_game')::uuid,
  'ada11111-1111-1111-1111-111111111111'
);
reset role;
select set_config('request.jwt.claims', '', true);

select common._advance_turn(current_setting('test.solo_game')::uuid);
select is(
  (select current_turn_user_id from common.games
    where id = current_setting('test.solo_game')::uuid),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'solo: advance wraps back to the sole player'
);

select * from finish();
rollback;
