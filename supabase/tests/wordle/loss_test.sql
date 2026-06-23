-- ============================================================
-- Test: wordle — the loss boundary (coop) + budget exhaustion (compete)
-- ============================================================
-- gameplay_test covers the coop WIN path and the soft rejects;
-- end_game_test covers the timeout loss. The natural Wordle loss — burn
-- every guess without solving — was the remaining gap. This file pins:
--
--   Coop: the 5th wrong guess (max_guesses=5) flips the shared board to
--   `lost` with everyone {won:false}, reveals the target, and a further
--   guess is rejected ('game is not in progress').
--
--   Compete: a player who exhausts their OWN budget while an opponent is
--   still playing does NOT end the game, and a further guess from that
--   player raises 'no guesses remaining' (the line 429 guard, which is
--   only reachable in compete — in coop, exhaustion makes the game
--   terminal first).
--
-- Both games are created up front so we can read both random targets and
-- pick guess words that miss BOTH — otherwise a guess could accidentally
-- solve a board and the exhaustion never happens.

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(9);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Wordle loss', array['ada', 'bea']) as handle;

create temp table g_coop on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

create temp table g_comp on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete');

-- Five distinct valid guess words that miss BOTH games' targets, read as
-- the superuser (the targets are hidden columns).
reset role;
create temp table tgts on commit drop as
select (select target::text from wordle.games where id = (select id from g_coop)) as coop_w,
       (select target::text from wordle.games where id = (select id from g_comp)) as comp_w;
create temp table valw on commit drop as
select word, row_number() over (order by word) as rn
  from common.words
 where len = 5 and difficulty <= 4
   and word <> (select coop_w from tgts)
   and word <> (select comp_w from tgts)
 order by word limit 5;
grant select on tgts to authenticated;
grant select on valw to authenticated;

-- ─── Coop: burn all 5 guesses without solving ─────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordle.submit_guess((select id from g_coop), (select word from valw where rn = 1));
select wordle.submit_guess((select id from g_coop), (select word from valw where rn = 2));
select wordle.submit_guess((select id from g_coop), (select word from valw where rn = 3));
select wordle.submit_guess((select id from g_coop), (select word from valw where rn = 4));
create temp table c5 on commit drop as
select wordle.submit_guess((select id from g_coop), (select word from valw where rn = 5)) as res;

select is((select res->>'result' from c5), 'incorrect',
  'coop: the 5th wrong guess is still incorrect (no fluke solve)');
select is((select (res->>'terminal')::boolean from c5), true,
  'coop: exhausting the budget is terminal');

reset role;
select is(
  (select play_state from common.games where id = (select id from g_coop)),
  'lost',
  'coop: all guesses burned, none solved → play_state lost');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g_coop) and (result->>'won')::boolean),
  0::bigint,
  'coop loss: nobody is recorded as won');
select is(
  (select max(guesses_used) from wordle.players where game_id = (select id from g_coop)),
  5,
  'coop: exactly max_guesses (5) were used');
select is(
  (select target from wordle.games_state where id = (select id from g_coop))::text,
  (select coop_w from tgts),
  'coop loss: the target is revealed post-terminal');

-- A further guess on the now-terminal game is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format(
    $$ select wordle.submit_guess(%L, %L) $$,
    (select id from g_coop), (select word from valw where rn = 1)
  ),
  'P0001', 'game is not in progress',
  'coop: guessing after a lost game is rejected'
);

-- ─── Compete: ada exhausts her own budget; bea still playing ──
select wordle.submit_guess((select id from g_comp), (select word from valw where rn = 1));
select wordle.submit_guess((select id from g_comp), (select word from valw where rn = 2));
select wordle.submit_guess((select id from g_comp), (select word from valw where rn = 3));
select wordle.submit_guess((select id from g_comp), (select word from valw where rn = 4));
create temp table p5 on commit drop as
select wordle.submit_guess((select id from g_comp), (select word from valw where rn = 5)) as res;

select is((select (res->>'terminal')::boolean from p5), false,
  'compete: one player exhausting her budget does NOT end the game (bea still playing)');

-- ada is now out of guesses while the game is still 'playing' → the
-- 'no guesses remaining' guard fires (unreachable in coop).
select throws_ok(
  format(
    $$ select wordle.submit_guess(%L, %L) $$,
    (select id from g_comp), (select word from valw where rn = 1)
  ),
  'P0001', 'no guesses remaining',
  'compete: a guess past a player''s own exhausted budget is rejected'
);

select * from finish();
rollback;
