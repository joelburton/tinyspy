-- ============================================================
-- Test: waffle turn-order (opt-in turn-by-turn coop)
-- ============================================================
-- The per-game wiring for the common turn primitive: create_game seats
-- the rotation when setup.coopStyle='turns', and submit_swap gates on
-- _require_turn + advances on an accepted, non-terminal swap.
-- Covers:
--   1. create_game seats the pointer on the chosen first player
--   2. an out-of-turn swap is rejected ('not your turn')
--   3. an accepted (non-solving) swap advances the pointer
--   4. a soft-rejected swap (a hole cell) does NOT advance
--   5. free-for-all (no coopStyle) leaves the pointer null and ungated
--
-- A generous swap budget (extra=5) keeps every swap non-terminal.
-- Positions 2,3 are non-hole cells (holes are 6,8,16,18).
-- ============================================================

begin;
set search_path = waffle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Waffle turns', array['ada', 'bea']) as handle;

-- ── TURN GAME — ada first ──
create temp table g on commit drop as
select * from waffle.create_game(
  (select handle from club),
  pg_temp.waffle_setup(5)
    || jsonb_build_object(
         'coopStyle', 'turns',
         'firstTurnUserId', 'ada11111-1111-1111-1111-111111111111'::text),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
);

-- (1) Pointer seated on ada.
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: create_game seats the pointer on the chosen first player'
);

-- (2) bea swapping out of turn is rejected.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select waffle.submit_swap(%L::uuid, 2, 3) $$, (select id from g)),
  'P0001', 'not your turn',
  'turns: the non-current player is rejected'
);

-- (3) ada (current) makes a valid swap — accepted, advances.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok(
  format($$ select waffle.submit_swap(%L::uuid, 2, 3) $$, (select id from g)),
  'turns: the current player''s swap is accepted'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: an accepted swap advances the pointer to bea'
);

-- (4) SOFT-REJECT does NOT advance: it's bea's turn; bea tries to swap a hole
-- cell (position 6). It raises (rolls back), and the turn stays bea's.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select waffle.submit_swap(%L::uuid, 6, 0) $$, (select id from g)),
  'P0001', 'cannot swap a hole cell',
  'turns: a hole-cell swap is soft-rejected'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: a soft-rejected swap does NOT advance the turn'
);

-- bea makes a valid swap → wraps back to ada.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.submit_swap((select id from g), 2, 3);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: bea''s valid swap wraps the turn back to ada'
);

-- ── FREE-FOR-ALL (no coopStyle) — pointer null, ungated ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ffa on commit drop as
select * from waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.waffle_board()
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from ffa)),
  null,
  'free-for-all: create_game leaves the pointer null'
);
-- bea swaps first (would be out of turn in a turn game) — no gate.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select waffle.submit_swap(%L::uuid, 2, 3) $$, (select id from ffa)),
  'free-for-all: any player may swap in any order'
);

select * from finish();
rollback;
