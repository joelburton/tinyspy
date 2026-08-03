-- ============================================================
-- Test: wordle's half of the terminal reveal
-- ============================================================
-- The mid-game give-up (`wordle.reveal_answer`) was removed 2026-08-03 —
-- wordle now works like every other game: End the game, THEN Reveal, where
-- Reveal is the common `common.reveal_solution` (covered by
-- common/reveal_solution_test.sql). What's left that's wordle-SPECIFIC, and
-- what this file pins:
--
--   - the target unshields at terminal via the ordinary is_terminal gate,
--     whatever the outcome — hiding it on a loss is a display decision, not a
--     shield;
--   - `_sync_title` keys on the common `solution_revealed` flag, so the CLUB
--     LIST can't spell the answer of a game whose players are still allowed to
--     replay it blind. That regressed once already (it keyed on is_terminal and
--     spoiled every lost game), which is why it has its own assertions.

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(8);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Wordle rv', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

-- ── A manual end: over for everyone, but the answer stays covered ──
select wordle.end_game((select id from g1));

-- Still as ada: the target is now readable through games_state — the shield
-- lifts at terminal regardless of outcome.
select isnt(
  (select target from wordle.games_state where id = (select id from g1)),
  null, 'terminal → the target unshields (is_terminal gate)');

reset role;
select is(
  (select play_state from common.games where id = (select id from g1)),
  'ended', 'manual end → the uniform neutral ended terminal');
select is(
  (select solution_revealed from common.games where id = (select id from g1)),
  false, 'manual end → the answer is NOT revealed (a Restart stays honest)');
select isnt(
  (select title from common.games where id = (select id from g1)),
  (select upper(target::text) from wordle.games where id = (select id from g1)),
  'manual end → the club-list title does not spell the answer');

-- ── Asking for it: the common RPC, terminal-only, any player ──
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format($$ select common.reveal_solution(%L::uuid) $$, (select id from g1)),
  'a player may reveal once the game is over');
reset role;
select is(
  (select solution_revealed from common.games where id = (select id from g1)),
  true, 'reveal → the shared flag is set');

-- ── A win reveals + titles with the answer, with nobody asking ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop');
reset role;
-- The target, read as postgres (the column is grant-hidden from players).
select set_config(
  'test.target',
  (select target::text from wordle.games where id = (select id from g2)),
  true);
-- Guess it: the win path runs _sync_title on the way through.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from g2), current_setting('test.target'));
reset role;
select is(
  (select solution_revealed from common.games where id = (select id from g2)),
  true, 'a win reveals by itself — you produced the answer to get there');
select is(
  (select title from common.games where id = (select id from g2)),
  upper(current_setting('test.target')),
  'a win titles the club list with the answer');

select * from finish();
rollback;
