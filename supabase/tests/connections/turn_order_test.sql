-- ============================================================
-- Test: connections turn-order (opt-in turn-by-turn coop)
-- ============================================================
-- The per-game wiring for the common turn primitive. connections is the
-- subtle case: a guess is RECORDED for both correct AND wrong results
-- (both consume the shared budget), but a duplicate tile-set is a silent
-- no-op `return` — so the turn must advance on a fresh guess and NOT on a
-- duplicate. (The server trusts the FE-supplied `result` under the
-- friends-only model, so a 'wrong' guess needn't actually be wrong.)
-- Covers:
--   1. create_game seats the pointer on the chosen first player
--   2. an out-of-turn guess is rejected ('not your turn')
--   3. an accepted (wrong) guess advances the pointer
--   4. a duplicate (soft no-op) does NOT advance
--   5. free-for-all (no coopStyle) leaves the pointer null and ungated
-- ============================================================

begin;
set search_path = connections, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Turns club', array['ada','bea']) as handle;
create temp table puzzle on commit drop as
select pg_temp.connections_puzzle() as id;

-- ── TURN GAME — ada first ──
create temp table g on commit drop as
select * from connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle), jsonb_build_object('kind','none'))
    || jsonb_build_object(
         'coopStyle', 'turns',
         'firstTurnUserId', 'ada11111-1111-1111-1111-111111111111'::text),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

-- (1) Pointer seated on ada.
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: create_game seats the pointer on the chosen first player'
);

-- (2) bea guessing out of turn is rejected.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select connections.submit_guess(%L::uuid,
             array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'wrong', null) $$,
         (select id from g)),
  'P0001', 'not your turn',
  'turns: the non-current player is rejected'
);

-- (3) ada (current) submits a wrong guess — accepted (a mistake), advances.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format($$ select connections.submit_guess(%L::uuid,
             array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'wrong', null) $$,
         (select id from g)),
  'turns: the current player''s guess is accepted'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: an accepted (wrong) guess advances the pointer to bea'
);

-- (4) SOFT-REJECT (duplicate tile set) does NOT advance. It's bea's turn;
-- bea re-submits ada's exact tiles → the no-op `return`. Pointer stays bea.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select connections.submit_guess(%L::uuid,
             array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'wrong', null) $$,
         (select id from g)),
  'turns: a duplicate tile-set is a silent no-op'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: a duplicate (no-op) guess does NOT advance the turn'
);

-- bea then makes a FRESH wrong guess → advances back to ada.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.submit_guess((select id from g),
  array['BANANA','BIRCH','BREAD','BRICK']::text[], 'wrong', null);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: a fresh guess from bea wraps the turn back to ada'
);

-- ── FREE-FOR-ALL (no coopStyle) — pointer null, ungated ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ffa on commit drop as
select * from connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle), jsonb_build_object('kind','none')),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from ffa)),
  null,
  'free-for-all: create_game leaves the pointer null'
);
-- bea guesses first (would be out of turn in a turn game) — no gate.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select connections.submit_guess(%L::uuid,
             array['ALPHA','ANGEL','APPLE','ARROW']::text[], 'wrong', null) $$,
         (select id from ffa)),
  'free-for-all: any player may guess in any order'
);

select * from finish();
rollback;
