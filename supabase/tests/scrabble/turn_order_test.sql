-- ============================================================
-- Test: scrabble COOP turn-order (opt-in turn-by-turn)
-- ============================================================
-- scrabble is the reconciliation case: compete keeps its OWN seat pointer
-- (scrabble.games.current_seat), while coop opts into the COMMON pointer.
-- create_game seats the common rotation when setup.coopStyle='turns', and
-- the shared-rack move cores (_commit_word / _commit_exchange) gate on
-- _require_turn + advance the common pointer. Exchange is the move exercised
-- here (no dictionary/placement needed); the gate + advance sit in the same
-- coop branch as the word path.
-- Covers:
--   1. create_game seats the common pointer on the chosen first player
--   2. an out-of-turn coop move is rejected ('not your turn')
--   3. an accepted coop move advances the common pointer
--   4. a soft-rejected move (invalid tile) does NOT advance
--   5. free-for-all coop (no coopStyle) leaves the pointer null and ungated
-- ============================================================

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select common.create_club('Scrabble turns', array['ada', 'bea']) as handle;
reset role;

-- ── TURN GAME — ada first ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g on commit drop as
  select id from scrabble.create_game((select handle from cl),
    ('{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"},'
     || '"coopStyle": "turns",'
     || '"firstTurnUserId": "ada11111-1111-1111-1111-111111111111"}')::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
reset role;
-- Pin the shared rack + a 10-tile bag (no 'Z', so 'Z' is a guaranteed
-- not-in-rack tile for the soft-reject case). Exchange needs bag ≥ 7.
select pg_temp.sc_coop((select id from g), array['A','B','C','D','E','F','G'],
  array['H','I','J','K','L','M','N','O','P','Q']);

-- (1) Common pointer seated on ada.
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: create_game seats the common pointer on the chosen first player'
);

-- (2) bea moving out of turn is rejected (version 0 is current, so the stale
-- gate passes and the turn gate fires).
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select scrabble.exchange_tiles(%L::uuid, 0, array['C']) $$, (select id from g)),
  'P0001', 'not your turn',
  'turns: the non-current player is rejected'
);

-- (3) ada (current) exchanges — accepted, advances.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select scrabble.exchange_tiles((select id from g), 0, array['A'])->>'result'),
  'exchanged',
  'turns: the current player''s move is accepted'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: an accepted coop move advances the common pointer to bea'
);

-- (4) SOFT-REJECT does NOT advance: it's bea's turn; bea exchanges 'Z', which
-- isn't in the rack → raises (rolls back). The pointer stays bea's.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select scrabble.exchange_tiles(%L::uuid, 1, array['Z']) $$, (select id from g)),
  'P0001', null,
  'turns: an invalid-tile exchange is soft-rejected'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: a soft-rejected move does NOT advance the turn'
);

-- bea makes a valid exchange → wraps back to ada.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select scrabble.exchange_tiles((select id from g), 1, array['B']);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: bea''s valid move wraps the turn back to ada'
);

-- ── FREE-FOR-ALL coop (no coopStyle) — pointer null, ungated ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ffa on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
reset role;
select pg_temp.sc_coop((select id from ffa), array['A','B','C','D','E','F','G'],
  array['H','I','J','K','L','M','N','O','P','Q']);
select is(
  (select current_turn_user_id from common.games where id = (select id from ffa)),
  null,
  'free-for-all coop: create_game leaves the pointer null'
);
-- bea moves first (would be out of turn in a turn game) — no gate.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select scrabble.exchange_tiles((select id from ffa), 0, array['A'])->>'result'),
  'exchanged',
  'free-for-all coop: any player may move in any order'
);

select * from finish();
rollback;
