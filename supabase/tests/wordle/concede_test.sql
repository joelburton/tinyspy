-- ============================================================
-- Test: wordle.concede(target_game)  (elimination-game concede)
-- ============================================================
-- wordle is an ELIMINATION game (a player can be done — solved or out
-- of guesses — without the table ending), so it can't use the generic
-- common.concede. wordle.concede flips the shared conceded flag
-- (common._set_conceded) then re-runs its own terminal check
-- (_maybe_finish_compete), which counts a conceder as done and
-- excludes them from the win. Covers:
--   1. A concede while an opponent still races keeps the game going
--   2. When the last racer finishes, the game ends and the CONCEDER
--      forfeits (recorded a loss even though the game had a winner)
--   3. Everyone conceding ends it as a collective loss (no winner)
--   4. Concede is rejected in coop (a team doesn't drop out)
-- ============================================================

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

-- ─── A 2-player compete game (ada + bea) ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Wordle concede', array['ada', 'bea']) as handle;
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
grant select on tgt to authenticated;

-- ─── (1) ada concedes; bea is still racing → game continues ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.concede((select id from g));
select is(
  (select conceded from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'the conceder is marked conceded');
reset role;
select is(
  (select is_terminal from common.games where id = (select id from g)),
  false, 'the game continues while bea still races');

-- ─── (2) bea solves → game ends; bea wins, ada (conceded) forfeits ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.submit_guess((select id from g), (select w from tgt));
reset role;
select is(
  (select is_terminal from common.games where id = (select id from g)),
  true, 'the game ends when the last racer finishes');
select is(
  (select play_state from common.games where id = (select id from g)),
  'won_compete', 'there is a winner');
select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'true', 'bea wins');
select is(
  (select result->>'won' from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'false', 'ada (conceded) forfeits — recorded a loss');

-- ─── (3) both players concede → collective loss, no winner ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete'
);
select wordle.concede((select id from g2)); -- ada out, bea still racing
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordle.concede((select id from g2)); -- last racer out
reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'lost_compete', 'everyone conceding → no winner (lost_compete)');
select is(
  (select status->>'winner' from common.games where id = (select id from g2)),
  null, 'no winner recorded when all conceded');

-- ─── (4) concede is rejected in coop ───
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(6),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop'
);
select throws_ok(
  format($$ select wordle.concede(%L) $$, (select id from gc)),
  'P0001',
  'concede is only for compete games',
  'conceding a coop game is rejected'
);

select * from finish();
rollback;
