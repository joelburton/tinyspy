-- ============================================================
-- Test: wordle.replay_board (restart this game from scratch)
-- ============================================================
-- The "Replay board" game-menu item. Resets the working state on the
-- SAME game row — the frozen puzzle (target / budgets) stays, everything
-- the players did is wiped, and the target re-shields (it's gated on
-- is_terminal, which the reset clears). Available from a finished game
-- OR mid-game; any game player may call it; a non-player is rejected.

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(12);

-- ── Coop: lose (burn the budget), then replay → fully reset ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Wordle rp', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

-- Five distinct valid guesses that miss the target (read back as the
-- superuser — the target is a hidden column), burning the whole budget
-- → a real coop LOSS: guess rows, guesses_used=5, terminal, target
-- revealed. The full state a replay must undo.
reset role;
create temp table tgt on commit drop as
select target::text as w from wordle.games where id = (select id from g1);
create temp table valw on commit drop as
select word, row_number() over (order by word) as rn
  from common.words
 where len = 5 and difficulty <= 4 and word <> (select w from tgt)
 order by word limit 5;
grant select on tgt to authenticated;
grant select on valw to authenticated;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from g1), (select word from valw where rn = 1));
select wordle.submit_guess((select id from g1), (select word from valw where rn = 2));
select wordle.submit_guess((select id from g1), (select word from valw where rn = 3));
select wordle.submit_guess((select id from g1), (select word from valw where rn = 4));
select wordle.submit_guess((select id from g1), (select word from valw where rn = 5));

reset role;
select is(
  (select play_state from common.games where id = (select id from g1)),
  'lost', 'coop: precondition — budget burned, game lost');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.replay_board((select id from g1));

-- The replayer sees a clean slate (still as ada — games_state is the
-- caller's view, which is exactly where the re-shield must hold).
select is(
  (select target from wordle.games_state where id = (select id from g1)),
  null, 'coop: replay → the target is SHIELDED again (is_terminal cleared)');

reset role;
select is(
  (select play_state from common.games where id = (select id from g1)),
  'playing', 'coop: replay → play_state back to playing');
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  false, 'coop: replay → is_terminal cleared');
select is(
  (select ended_at from common.games where id = (select id from g1)),
  null, 'coop: replay → ended_at cleared');
select is(
  (select (status->>'guesses_used')::int from common.games where id = (select id from g1)),
  0, 'coop: replay → status.guesses_used reset to 0');
select is(
  (select count(*) from wordle.guesses where game_id = (select id from g1)),
  0::bigint, 'coop: replay → the guess log is cleared');
select is(
  (select count(*) from wordle.players
     where game_id = (select id from g1)
       and guesses_used = 0 and solved = false and solved_at is null),
  2::bigint, 'coop: replay → both players zeroed + unsolved');
select is(
  (select count(*) from common.game_players
     where game_id = (select id from g1) and result is null and not conceded),
  2::bigint, 'coop: replay → per-player results + concede cleared');
select is(
  (select target from wordle.games where id = (select id from g1))::text,
  (select w from tgt), 'coop: replay → the SAME target survives (run it back)');

-- ── Mid-game replay (no play_state guard) ────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from g1), (select word from valw where rn = 1));
select wordle.replay_board((select id from g1));
reset role;
select is(
  (select count(*) from wordle.guesses where game_id = (select id from g1)),
  0::bigint, 'mid-game replay → the fresh guess is wiped too');

-- ── Non-player rejected ─────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select wordle.replay_board(%L::uuid) $$, (select id from g1)),
  NULL, NULL, 'a non-player cannot replay the board');

select * from finish();
rollback;
