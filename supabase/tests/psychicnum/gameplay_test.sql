-- ============================================================
-- Test: psychicnum.submit_guess + submit_timeout
-- ============================================================
--
-- Covers coop AND compete mode behavior end-to-end.
--
-- Coop assertions:
--   - wrong guess decrements EVERYONE's player budget
--   - correct guess: play_state='won', team result {won: true}
--   - last-budget wrong guess: play_state='lost', team result {won: false}
--   - duplicate guesses are allowed (legal, decrement normally)
--   - submit_timeout flips to 'lost' with outcome 'lost_timeout'
--
-- Compete assertions:
--   - wrong guess decrements ONLY the caller's budget
--   - correct guess: play_state='won_compete', caller wins,
--     everyone else's game_players.result = {won: false}
--   - game-end after a correct guess prevents further guesses
--     even from opponents who had remaining budget
--   - all-exhausted: play_state='lost_compete' when every
--     player's budget reaches 0
--   - submit_timeout flips to 'lost_compete'
--
-- Strategy: pin the target deterministically with a postgres-
-- role UPDATE after create_game (RPCs roll the target randomly).
-- Then drive scenarios with as_user switching.

begin;

set search_path = psychicnum, common, public, extensions;

select plan(23);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada','bea']) as handle;

-- ============================================================
-- COOP block
-- ============================================================

create temp table coop_g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 5, "max_number": 10, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
reset role;
update psychicnum.games set target = 7 where id = (select id from coop_g);

-- (1) Out-of-range guesses rejected
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 0) $$, (select id from coop_g)),
  'P0001', 'guess must be between 1 and 10',
  'coop: out-of-range guess (0) rejected'
);

-- (2) Non-player rejected
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 5) $$, (select id from coop_g)),
  '42501', 'not playing this game',
  'coop: non-player submit_guess rejected'
);

-- (3) ada submits wrong: decrement EVERY player's budget
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  psychicnum.submit_guess((select id from coop_g), 1),
  'wrong',
  'coop: wrong guess returns wrong'
);

reset role;
select is(
  (select array_agg(guesses_remaining order by user_id) from psychicnum.players
    where game_id = (select id from coop_g)),
  array[4, 4],
  'coop: wrong guess decrements EVERY player budget (5→4 for both)'
);

-- (4) bea submits correct: play_state='won', everyone's result = won:true
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  psychicnum.submit_guess((select id from coop_g), 7),
  'correct',
  'coop: correct guess returns correct'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from coop_g)),
  'won',
  'coop: correct guess flips play_state to won'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from coop_g) and (result->>'won')::boolean = true),
  2,
  'coop: every player gets game_players.result = {won: true} on team win'
);

-- (5) submit_guess on a finished game is rejected
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 4) $$, (select id from coop_g)),
  'P0001', 'game is not active',
  'coop: submit_guess on terminal game rejected'
);

-- (6) Coop loss path — exhaust the budget
create temp table coop_loss on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 3, "max_number": 10, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
reset role;
update psychicnum.games set target = 7 where id = (select id from coop_loss);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from coop_loss), 1);
select psychicnum.submit_guess((select id from coop_loss), 2);

-- After 2 wrong, both player budgets at 1, play_state still playing.
reset role;
select is(
  (select play_state from common.games where id = (select id from coop_loss)),
  'playing',
  'coop: 2 wrong guesses keeps play_state=playing'
);

-- 3rd wrong → team loses.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  psychicnum.submit_guess((select id from coop_loss), 9),
  'lost',
  'coop: 3rd wrong guess returns lost'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from coop_loss)),
  'lost',
  'coop: 3rd wrong flips play_state to lost'
);

-- ============================================================
-- COMPETE block
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table comp_g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 3, "max_number": 10, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);
reset role;
update psychicnum.games set target = 7 where id = (select id from comp_g);

-- (7) ada submits wrong: decrement ONLY ada's budget
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from comp_g), 1);

reset role;
select is(
  (select array_agg(guesses_remaining order by user_id) from psychicnum.players
    where game_id = (select id from comp_g)),
  array[2, 3],
  'compete: wrong guess decrements ONLY caller (ada→2, bea stays at 3)'
);

-- (8) bea submits correct: play_state='won_compete', bea wins, ada loses
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  psychicnum.submit_guess((select id from comp_g), 7),
  'correct',
  'compete: correct guess returns correct'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from comp_g)),
  'won_compete',
  'compete: correct guess flips play_state to won_compete'
);

select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from comp_g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'true',
  'compete: winning caller gets game_players.result = {won: true}'
);

select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from comp_g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'false',
  'compete: opposing player gets game_players.result = {won: false}'
);

-- (9) ada (with budget remaining=2) cannot guess after bea won
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 7) $$, (select id from comp_g)),
  'P0001', 'game is not active',
  'compete: game ends for everyone on first correct, even those with budget left'
);

-- (10) Compete loss path — both exhaust without winning
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table comp_loss on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 3, "max_number": 10, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);
reset role;
update psychicnum.games set target = 7 where id = (select id from comp_loss);

-- ada exhausts.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from comp_loss), 1);
select psychicnum.submit_guess((select id from comp_loss), 2);
select psychicnum.submit_guess((select id from comp_loss), 3);

-- ada now at 0 budget; trying to guess again raises.
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 4) $$, (select id from comp_loss)),
  'P0001', 'no guesses remaining',
  'compete: caller with 0 budget cannot submit (P0001)'
);

-- bea still has 3 — game continues.
reset role;
select is(
  (select play_state from common.games where id = (select id from comp_loss)),
  'playing',
  'compete: game still playing while opponents have budget'
);

-- bea exhausts.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from comp_loss), 1);
select psychicnum.submit_guess((select id from comp_loss), 2);
-- The last wrong guess (the one that takes total_remaining to 0)
-- ends the game with 'lost_compete'.
select is(
  psychicnum.submit_guess((select id from comp_loss), 3),
  'lost',
  'compete: all-exhausted last guess returns lost'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from comp_loss)),
  'lost_compete',
  'compete: all-exhausted flips play_state to lost_compete'
);

-- ============================================================
-- Timeout
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table coop_to on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 7, "max_number": 10, "timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);

select lives_ok(
  format($$ select psychicnum.submit_timeout(%L::uuid) $$, (select id from coop_to)),
  'coop: submit_timeout accepts on playing game'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from coop_to)),
  'lost',
  'coop: submit_timeout flips play_state to lost'
);

-- ============================================================
select * from finish();
rollback;
