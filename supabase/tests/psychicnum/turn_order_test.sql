-- ============================================================
-- Test: psychicnum turn-order (opt-in turn-by-turn coop)
-- ============================================================
-- psychicnum is the pilot for the common turn primitive. This pins the
-- per-game wiring: create_game seats the rotation when setup.coopStyle=
-- 'turns', and submit_guess gates on _require_turn + advances on an
-- accepted, non-terminal guess.
-- Covers:
--   1. create_game seats the pointer on the chosen first player
--   2. an out-of-turn guess is rejected ('not your turn')
--   3. an accepted (budget-spending) guess advances the pointer
--   4. a soft-rejected guess (duplicate word) does NOT advance — the
--      same player keeps the turn
--   5. a finding-but-not-terminal guess still advances
--   6. create_game rejects a firstTurnUserId that isn't a player
--   7. free-for-all (no coopStyle) leaves the pointer null and ungated
--   8. solo turn game: the pointer wraps back to the lone player
--
-- Board is pinned (postgres UPDATE) to the same fake NATO words the
-- gameplay test uses, so guesses are deterministic.
-- ============================================================

begin;

set search_path = psychicnum, common, public, extensions;

select plan(16);

\ir ../_shared/setup.psql

-- 3-member club: cade is a member but NOT a player in the games below,
-- so he exercises the "firstTurnUserId must be a player" guard.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada','bea','cade']) as handle;

-- ============================================================
-- TURN GAME — ada first, ada + bea rotate
-- ============================================================
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table turn_g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  ('{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"},'
   || '"coopStyle": "turns",'
   || '"firstTurnUserId": "ada11111-1111-1111-1111-111111111111"}')::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where id = (select id from turn_g);

-- (1) Pointer seated on ada (the chosen first player).
select is(
  (select current_turn_user_id from common.games where id = (select id from turn_g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: create_game seats the pointer on the chosen first player'
);

-- (2) bea guessing out of turn is rejected.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 'zdelta') $$, (select id from turn_g)),
  'P0001', 'not your turn',
  'turns: a guess from the non-current player is rejected'
);

-- (3) ada (current) guesses wrong — accepted, returns 'wrong'.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  psychicnum.submit_guess((select id from turn_g), 'zdelta'),
  'wrong',
  'turns: the current player''s guess is accepted'
);

-- (4) ...and the pointer advanced to bea.
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from turn_g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: an accepted guess advances the pointer to the next player'
);

-- (5) Now ada is out of turn.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 'zecho') $$, (select id from turn_g)),
  'P0001', 'not your turn',
  'turns: the player who just went is now rejected'
);

-- (6) bea guesses wrong — accepted, advances back to ada.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  psychicnum.submit_guess((select id from turn_g), 'zecho'),
  'wrong',
  'turns: the new current player may guess'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from turn_g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: the rotation wraps back to ada'
);

-- (7) SOFT-REJECT does NOT advance: ada (current) re-guesses zdelta, an
-- already-taken word. It raises (rolls back), and the turn stays ada's.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 'zdelta') $$, (select id from turn_g)),
  'P0001', 'word already guessed',
  'turns: a duplicate (soft-reject) guess is rejected'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from turn_g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'turns: a soft-rejected guess does NOT advance the turn'
);

-- (8) A finding-but-not-terminal guess advances too (accepted move).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  psychicnum.submit_guess((select id from turn_g), 'zalpha'),
  'correct',
  'turns: finding a secret (not the last) is an accepted guess'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from turn_g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'turns: a correct, non-terminal guess advances the pointer'
);

-- ============================================================
-- (9) create_game rejects a firstTurnUserId that isn't a player
-- ============================================================
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$
    select psychicnum.create_game(
      %L,
      ('{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"},'
       || '"coopStyle": "turns",'
       || '"firstTurnUserId": "cade3333-3333-3333-3333-333333333333"}')::jsonb,
      array['ada11111-1111-1111-1111-111111111111'::uuid,
            'bea22222-2222-2222-2222-222222222222'::uuid],
      'coop'
    )
  $$, (select handle from club)),
  'P0001', 'setup.firstTurnUserId must be one of the players',
  'turns: create_game rejects a first player who is not in the game'
);

-- ============================================================
-- (10) FREE-FOR-ALL (no coopStyle) — pointer null, ungated
-- ============================================================
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ffa_g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where id = (select id from ffa_g);

select is(
  (select current_turn_user_id from common.games where id = (select id from ffa_g)),
  null,
  'free-for-all: create_game leaves the pointer null'
);

-- bea guesses first (would be out of turn in a turn game) — no gate here.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  psychicnum.submit_guess((select id from ffa_g), 'zdelta'),
  'wrong',
  'free-for-all: any player may guess in any order'
);

-- ============================================================
-- (11) SOLO turn game — the pointer wraps back to the lone player
-- ============================================================
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table solo_g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  ('{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"},'
   || '"coopStyle": "turns",'
   || '"firstTurnUserId": "ada11111-1111-1111-1111-111111111111"}')::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop'
);
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where id = (select id from solo_g);

-- ada guesses twice in a row — the rotation of one always returns to her,
-- so neither guess is ever "out of turn".
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from solo_g), 'zdelta');
select is(
  psychicnum.submit_guess((select id from solo_g), 'zecho'),
  'wrong',
  'solo turns: the lone player keeps the turn (advance wraps to self)'
);
reset role;
select is(
  (select current_turn_user_id from common.games where id = (select id from solo_g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'solo turns: the pointer stays on the lone player after advancing'
);

select * from finish();
rollback;
