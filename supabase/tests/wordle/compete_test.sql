-- ============================================================
-- Test: wordle compete — independent boards, opponent hidden,
--        fewest-guesses winner
-- ============================================================
-- Compete: same hidden target, independent guess sequences. Players
-- don't see each other's guesses until the game ends. The game ends
-- once every player is done; winner = fewest guesses (tie → earliest,
-- not exercised here since now() is constant in a test transaction).

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(11);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Wordle vs', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);

reset role;
create temp table tgt on commit drop as
select target::text as w from wordle.games where id = (select id from g);
-- Two distinct valid non-target words for bea's wrong guesses.
create temp table vals on commit drop as
select word, row_number() over (order by word) as rn
  from common.words
 where len = 5 and difficulty <= 4 and word <> (select w from tgt)
 limit 2;
-- Grant the postgres-owned temp tables to the personas (authenticated).
grant select on tgt to authenticated;
grant select on vals to authenticated;

-- ── ada solves on her first guess ───────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table a_solve on commit drop as
select wordle.submit_guess((select id from g), (select w from tgt)) as res;
select is((select (res->>'result') from a_solve), 'correct',
  'ada solves on her first guess');
select is((select (res->>'terminal')::boolean from a_solve), false,
  'game is NOT terminal yet — bea is still playing');

reset role;
select is(
  (select guesses_used from wordle.players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'ada used 1 guess');
select is(
  (select guesses_used from wordle.players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'bea board untouched (independent boards in compete)');

-- ── Opponent visibility mid-game (as bea) ───────────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordle.guesses
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  0::bigint,
  'mid-game: bea cannot see ada''s guesses (RLS hides them)');

-- ── bea solves in 3 guesses (so ada wins on fewest) ─────────
select wordle.submit_guess((select id from g), (select word from vals where rn = 1));
select wordle.submit_guess((select id from g), (select word from vals where rn = 2));
create temp table b_solve on commit drop as
select wordle.submit_guess((select id from g), (select w from tgt)) as res;

select is((select (res->>'terminal')::boolean from b_solve), true,
  'once every player is done → terminal');

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won_compete',
  'a winner emerged → won_compete');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'ada won — fewest guesses (1 vs 3)');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false, 'bea did not win');

-- ── Post-terminal: the opponent guesses are now revealed ────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordle.guesses
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1::bigint,
  'post-terminal: ada''s guesses are revealed to bea');
select is(
  (select target from wordle.games_state where id = (select id from g))::text,
  (select w from tgt),
  'post-terminal: the target is revealed');

select * from finish();
rollback;
