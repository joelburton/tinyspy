-- ============================================================
-- Test: wordle's half of the terminal reveal
-- ============================================================
-- Revealing is a LOCAL, per-player display toggle in the FE
-- (useSolutionReveal) — no RPC, no flag, nothing for SQL to say about it. What
-- IS wordle-specific and server-side, and what this file pins:
--
--   - the target unshields at terminal via the ordinary is_terminal gate,
--     whatever the outcome — hiding it on a loss is a display decision, not a
--     shield;
--   - `_sync_title` NEVER spells the answer of a game the players may still
--     replay blind. It regressed that way once (it keyed on is_terminal and
--     spoiled every lost game), which is why it has its own assertions — and
--     it can't be rescued by a reveal flag any more, since one player looking
--     at their own screen mustn't retitle the club list for everyone.
--   - a WIN still titles with the answer, but only because the winning guess
--     IS the answer — the ordinary "most recent guess" branch, not a reveal.

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(5);

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
select isnt(
  (select title from common.games where id = (select id from g1)),
  (select upper(target::text) from wordle.games where id = (select id from g1)),
  'manual end → the club-list title does not spell the answer');

-- A second _sync_title pass (any wordle RPC runs one) must not drift toward
-- the answer either: there is no state a lost game can reach that re-titles it.
select wordle._sync_title((select id from g1));
select isnt(
  (select title from common.games where id = (select id from g1)),
  (select upper(target::text) from wordle.games where id = (select id from g1)),
  'a re-sync of a lost game still does not spell the answer');

-- ── A win titles with the answer — via the winning GUESS, not a reveal ──
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
  (select title from common.games where id = (select id from g2)),
  upper(current_setting('test.target')),
  'a win titles the club list with the answer (it was the last guess)');

select * from finish();
rollback;
