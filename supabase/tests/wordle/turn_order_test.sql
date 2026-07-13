-- ============================================================
-- Test: wordle turn-order (opt-in turn-by-turn coop)
-- ============================================================
-- The per-game wiring for the common turn primitive: create_game seats
-- the rotation when setup.coopStyle='turns', and submit_guess gates on
-- _require_turn + advances on an accepted, non-terminal guess.
-- Covers:
--   1. create_game seats the pointer on the chosen first player
--   2. an out-of-turn guess is rejected ('not your turn')
--   3. an accepted (incorrect but valid) guess advances the pointer
--   4. a soft-rejected guess (duplicate) does NOT advance
--   5. free-for-all (no coopStyle) leaves the pointer null and ungated
--
-- The target is random; we read it back as superuser and pick TWO valid
-- non-target words (one per player) so each turn's guess is accepted.
-- ============================================================

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

-- A turn setup: coop pacing = turns, ada first.
create function pg_temp.wordle_turn_setup(first uuid)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'max_guesses', 6,
    'timer', jsonb_build_object('kind', 'none'),
    'coopStyle', 'turns',
    'firstTurnUserId', first::text
  );
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Wordle turns', array['ada', 'bea']) as handle;

-- ── TURN GAME — ada first ──
create temp table g on commit drop as
select * from wordle.create_game(
  (select handle from club),
  pg_temp.wordle_turn_setup('ada11111-1111-1111-1111-111111111111'),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

-- Two distinct valid non-target words (as superuser, bypassing the hidden
-- target grant) — one per player so each accepted guess is 'incorrect'.
reset role;
create temp table tgt on commit drop as
select target::text as w from wordle.games where id = (select id from g);
create temp table valws on commit drop as
select word, row_number() over (order by word) as n
  from common.words
 where len = 5 and difficulty <= 4 and word <> (select w from tgt)
 order by word limit 2;
grant select on valws to authenticated;

-- (1) Pointer seated on ada.
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: create_game seats the pointer on the chosen first player'
);

-- (2) bea guessing out of turn is rejected.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select wordle.submit_guess(%L::uuid, (select word from valws where n = 1)) $$,
         (select id from g)),
  'P0001', 'not your turn',
  'turns: the non-current player is rejected'
);

-- (3) ada (current) guesses a valid non-target word — accepted, advances.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  wordle.submit_guess((select id from g), (select word from valws where n = 1))->>'result',
  'incorrect',
  'turns: the current player''s valid guess is accepted'
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
  wordle.submit_guess((select id from g), (select word from valws where n = 1))->>'result',
  'duplicate',
  'turns: a duplicate is soft-rejected'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: a soft-rejected guess does NOT advance the turn'
);

-- bea then makes a valid guess → advances back to ada.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.submit_guess((select id from g), (select word from valws where n = 2));
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: bea''s valid guess wraps the turn back to ada'
);

-- ── FREE-FOR-ALL (no coopStyle) — pointer null, ungated ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ffa on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
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
select is(
  wordle.submit_guess((select id from ffa), (select word from valws where n = 1))->>'result',
  'incorrect',
  'free-for-all: any player may guess in any order'
);

select * from finish();
rollback;
