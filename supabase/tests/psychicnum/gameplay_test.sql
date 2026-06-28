-- ============================================================
-- Test: psychicnum.submit_guess + request_hint + submit_timeout
-- ============================================================
--
-- The computer hides THREE secret WORDS among the board words;
-- players win by finding all three. Covers coop AND compete.
--
-- We pin a known board + secrets with a postgres-role UPDATE after
-- create_game (the RPC samples them randomly). The board:
--   words   = alpha bravo charlie delta echo foxtrot golf hotel
--   secrets = alpha bravo charlie
-- so delta..hotel are guessable-but-wrong, and a word NOT on the
-- board (e.g. 'zulu') exercises the board-word guard.
--
-- Coop assertions:
--   - a word not on the board is rejected
--   - wrong guess decrements EVERYONE's budget, returns 'wrong'
--   - finding a secret (not the last) returns 'correct', game continues,
--     and bumps the caller's players.secrets_found
--   - re-guessing a taken word (game-wide) is rejected
--   - request_hint reveals an unfound secret as a kind='hint' row,
--     without decrementing the budget
--   - finding the LAST secret returns 'won', play_state='won', team won
--   - last-budget wrong guess → 'lost', play_state='lost'
--   - submit_timeout flips to 'lost'
--
-- Compete assertions:
--   - wrong guess decrements ONLY the caller's budget
--   - finding all three (caller's own) returns 'won', play_state='won_compete'
--   - game ends for everyone on the win, even those with budget left
--   - all-exhausted → 'lost', play_state='lost_compete'

begin;

set search_path = psychicnum, common, public, extensions;

select plan(31);

\ir ../_shared/setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('test club', array['ada','bea']) as handle;

-- ============================================================
-- COOP — find all three to win
-- ============================================================

create temp table coop_g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 5, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
reset role;
update psychicnum.games
   set words = array['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'],
       secrets = array['alpha','bravo','charlie']
 where id = (select id from coop_g);

-- (1) A word not on the board is rejected
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 'zulu') $$, (select id from coop_g)),
  'P0001', 'not a word on the board',
  'coop: a word not on the board is rejected'
);

-- (2) Non-player rejected
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 'delta') $$, (select id from coop_g)),
  '42501', 'not playing this game',
  'coop: non-player submit_guess rejected'
);

-- (3) ada submits wrong (delta): decrement EVERY player's budget
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  psychicnum.submit_guess((select id from coop_g), 'delta'),
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

-- (4) ada finds a secret (alpha): returns 'correct', game continues
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  psychicnum.submit_guess((select id from coop_g), 'alpha'),
  'correct',
  'coop: finding a secret (not the last) returns correct'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from coop_g)),
  'playing',
  'coop: one secret found keeps play_state=playing'
);

-- (5) ada's secrets_found bumped to 1
select is(
  (select secrets_found from psychicnum.players
    where game_id = (select id from coop_g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1,
  'coop: a correct guess bumps the caller''s secrets_found'
);

-- (6) re-guessing a taken word (game-wide in coop) is rejected
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 'alpha') $$, (select id from coop_g)),
  'P0001', 'word already guessed',
  'coop: re-guessing a word another player took is rejected'
);

-- (7) request_hint reveals an unfound secret (bravo or charlie — alpha found)
select is(
  (select psychicnum.request_hint((select id from coop_g)) = any(array['bravo','charlie'])),
  true,
  'coop: request_hint returns an as-yet-unfound secret'
);

-- (8) the hint is logged as a kind='hint' row...
reset role;
select is(
  (select count(*)::int from psychicnum.guesses
    where game_id = (select id from coop_g) and kind = 'hint'),
  1,
  'coop: request_hint logs a kind=hint row'
);

-- (9) ...and does NOT spend any budget (still 3 each: one wrong + one find)
select is(
  (select array_agg(guesses_remaining order by user_id) from psychicnum.players
    where game_id = (select id from coop_g)),
  array[3, 3],
  'coop: request_hint does not decrement the budget'
);

-- (10) bea finds bravo, then charlie (the last) → team wins
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from coop_g), 'bravo');
select is(
  psychicnum.submit_guess((select id from coop_g), 'charlie'),
  'won',
  'coop: finding the last secret returns won'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from coop_g)),
  'won',
  'coop: finding all three flips play_state to won'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from coop_g) and (result->>'won')::boolean = true),
  2,
  'coop: every player gets game_players.result = {won: true} on team win'
);

-- (11) submit_guess on a finished game is rejected
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 'echo') $$, (select id from coop_g)),
  'P0001', 'game is not active',
  'coop: submit_guess on terminal game rejected'
);

-- ============================================================
-- COOP loss — exhaust the budget without finding all three
-- ============================================================

create temp table coop_loss on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 3, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
reset role;
update psychicnum.games
   set words = array['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'],
       secrets = array['alpha','bravo','charlie']
 where id = (select id from coop_loss);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from coop_loss), 'delta');
select psychicnum.submit_guess((select id from coop_loss), 'echo');

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
  psychicnum.submit_guess((select id from coop_loss), 'foxtrot'),
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
-- COMPETE — each racer must find all three themselves
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table comp_g on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 3, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);
reset role;
update psychicnum.games
   set words = array['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'],
       secrets = array['alpha','bravo','charlie']
 where id = (select id from comp_g);

-- (1) ada submits wrong (delta): decrement ONLY ada's budget
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from comp_g), 'delta');

reset role;
select is(
  (select array_agg(guesses_remaining order by user_id) from psychicnum.players
    where game_id = (select id from comp_g)),
  array[2, 3],
  'compete: wrong guess decrements ONLY caller (ada→2, bea stays at 3)'
);

-- (2) bea finds all three on her own → wins
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  psychicnum.submit_guess((select id from comp_g), 'alpha'),
  'correct',
  'compete: finding a secret (not the last) returns correct'
);
select psychicnum.submit_guess((select id from comp_g), 'bravo');
select is(
  psychicnum.submit_guess((select id from comp_g), 'charlie'),
  'won',
  'compete: finding the last secret returns won'
);

reset role;
select is(
  (select play_state from common.games where id = (select id from comp_g)),
  'won_compete',
  'compete: completing the set flips play_state to won_compete'
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

-- (3) ada (with budget remaining=2) cannot guess after bea won
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 'alpha') $$, (select id from comp_g)),
  'P0001', 'game is not active',
  'compete: game ends for everyone on the win, even those with budget left'
);

-- ============================================================
-- COMPETE loss — both exhaust without completing the set
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table comp_loss on commit drop as
select * from psychicnum.create_game(
  (select handle from club),
  '{"guesses": 3, "word_count": 8, "difficulty": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);
reset role;
update psychicnum.games
   set words = array['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel'],
       secrets = array['alpha','bravo','charlie']
 where id = (select id from comp_loss);

-- ada exhausts on wrong guesses (the already-guessed guard is per-caller in
-- compete, so bea reusing the same words below is fine).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from comp_loss), 'delta');
select psychicnum.submit_guess((select id from comp_loss), 'echo');
select psychicnum.submit_guess((select id from comp_loss), 'foxtrot');

-- ada now at 0 budget; trying to guess again raises.
select throws_ok(
  format($$ select psychicnum.submit_guess(%L::uuid, 'golf') $$, (select id from comp_loss)),
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

-- bea exhausts too. The last wrong guess (total_remaining → 0) ends it.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from comp_loss), 'delta');
select psychicnum.submit_guess((select id from comp_loss), 'echo');
select is(
  psychicnum.submit_guess((select id from comp_loss), 'golf'),
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
  '{"guesses": 7, "word_count": 8, "difficulty": 3, "timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
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
