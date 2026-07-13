-- ============================================================
-- Test: wordiply turn-order (opt-in turn-by-turn coop)
-- ============================================================
-- The per-game wiring for the common turn primitive: create_game seats
-- the rotation when setup.coopStyle='turns', and submit_guess gates on
-- _require_turn + advances on an accepted, non-terminal guess.
-- Covers:
--   1. create_game seats the pointer on the chosen first player
--   2. an out-of-turn guess is rejected ('not your turn')
--   3. an accepted guess advances the pointer
--   4. a soft-rejected guess (duplicate) does NOT advance
--   5. free-for-all (no coopStyle) leaves the pointer null and ungated
--
-- Base is 'ar'; any longer word containing it is accepted (trusting-commit).
-- ============================================================

begin;
set search_path = wordiply, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Wordiply turns', array['ada', 'bea']) as handle;

-- ── TURN GAME — ada first ──
create temp table g on commit drop as
select * from wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup()
    || jsonb_build_object(
         'coopStyle', 'turns',
         'firstTurnUserId', 'ada11111-1111-1111-1111-111111111111'::text),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
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
  format($$ select wordiply.submit_guess(%L::uuid, 'arxxxxx') $$, (select id from g)),
  'P0001', 'not your turn',
  'turns: the non-current player is rejected'
);

-- (3) ada (current) submits a valid guess — accepted, advances.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordiply.submit_guess((select id from g), 'arxxxxx')->>'ok',
  'true',
  'turns: the current player''s guess is accepted'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: an accepted guess advances the pointer to bea'
);

-- (4) SOFT-REJECT does NOT advance: it's bea's turn; bea re-guesses ada's
-- word (a shared-board duplicate → soft reject). The pointer stays bea's.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordiply.submit_guess((select id from g), 'arxxxxx')->>'reason',
  'duplicate',
  'turns: a duplicate is soft-rejected'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: a soft-rejected guess does NOT advance the turn'
);

-- bea then makes a fresh valid guess → advances back to ada.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g), 'arffff');
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: bea''s fresh guess wraps the turn back to ada'
);

-- ── FREE-FOR-ALL (no coopStyle) — pointer null, ungated ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ffa on commit drop as
select * from wordiply.create_game(
  (select handle from club), pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.wordiply_board()
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from ffa)),
  null,
  'free-for-all: create_game leaves the pointer null'
);
-- bea guesses first (would be out of turn in a turn game) — no gate.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  wordiply.submit_guess((select id from ffa), 'arxxxxx')->>'ok',
  'true',
  'free-for-all: any player may guess in any order'
);

select * from finish();
rollback;
