-- cs-unmet

-- ============================================================
-- Test: wordleone.replay_board (Restart) and the title's reveal rule
-- ============================================================
-- Restart resets the working state on the SAME game row: the puzzle stays,
-- everything the players did is wiped, and the target hides again (it is
-- gated on ended_at, which the reset clears). From a finished game or
-- mid-game; any game player may call it.
--
-- The title never spells an answer nobody guessed: a stopped game reads its
-- last guess, a win reads the answer only because the solve was that guess.

begin;
set search_path = wordleone, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(15);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordleone rp', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (wordleone.create_game(
  (select handle from club), pg_temp.wordleone_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop', pg_temp.wordleone_puzzle())->'data'->>'id')::uuid as id;

-- Two misses, then a Stop: a game with a log, misses, an ending and a
-- revealed target — the full state a Restart must undo.
select wordleone.submit_guess((select id from g), 'crane');
select wordleone.submit_guess((select id from g), 'stare');
select wordleone.stop_game((select id from g));

reset role;
select is(
  (select title from common.games where id = (select id from g)),
  'STARE', 'a stopped game is titled with its last guess, never the answer');
update common.timers set ticks = 99 where game_id = (select id from g);
create temp table static_before on commit drop as
select static_game_data from common.games where id = (select id from g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  wordleone.replay_board((select id from g)),
  '{"type":"ok","data":{"result":"replayed"}}'::jsonb,
  'Restart answers replayed');
select is(
  (select game_data->'puzzle'->'target' from common.games where id = (select id from g)),
  'null'::jsonb, 'Restart → the target is hidden again');

reset role;
select is(
  (select ended_at from common.games where id = (select id from g)),
  null, 'Restart → the game is played again');
select is(
  (select restart_count from common.games where id = (select id from g)),
  1, 'Restart → restart_count up by one');
select is(
  (select count(*) from wordleone.events where game_id = (select id from g)),
  0::bigint, 'Restart → the log is cleared');
select is(
  (select count(*) from wordleone.players where game_id = (select id from g) and n_misses = 0),
  2::bigint, 'Restart → every player''s misses zeroed');
select is(
  (select (summary_data->'team'->>'nMisses')::int from common.games where id = (select id from g)),
  0, 'Restart → the summary''s team count is 0');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g)
      and player_ended_at is null and final_ranking is null and outcome is null
      and solved_at is null),
  2::bigint, 'Restart → per-player endings, results and solves cleared');
select is(
  (select starter::text || '/' || target::text from wordleone.games where game_id = (select id from g)),
  'sieve/verse', 'Restart → the SAME puzzle survives');
select is(
  (select static_game_data from common.games where id = (select id from g)),
  (select static_game_data from static_before),
  'Restart → the static blob, the puzzle''s, is untouched');
select is(
  (select ticks from common.timers where game_id = (select id from g)),
  0, 'Restart → the clock is zeroed');
select is(
  (select title from common.games where id = (select id from g)),
  'New game', 'Restart → the title is the placeholder again');

-- ── Mid-game Restart ────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordleone.submit_guess((select id from g), 'crane');
select wordleone.replay_board((select id from g));
reset role;
select is(
  (select count(*) from wordleone.events where game_id = (select id from g)),
  0::bigint, 'a mid-game Restart wipes the fresh miss too');

-- ── A non-player ────────────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  wordleone.replay_board((select id from g)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN253",
    "message":"You are not in this game"}'::jsonb,
  'a non-player cannot Restart');

select * from finish();
rollback;
