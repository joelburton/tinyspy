-- ============================================================
-- Test: letterboxed's half of the terminal reveal
-- ============================================================
-- The common flag `common.games.solution_revealed` is what lets the FE draw
-- the "Solvable in two" block (InfoCol gates on it). The mechanics of the
-- button itself are common/reveal_solution_test.sql; what's letterboxed-
-- SPECIFIC, and what this file pins, is WHEN the flag may flip on its own.
--
-- `common.end_game` opens the solution on any win, on the stated premise that
-- "you can only win these games by producing the solution, so it's already in
-- front of you." That is true of waffle (the solved grid IS the answer) and
-- wordle (you typed the target). It is NOT true here: a letterboxed win means
-- covering twelve letters with ANY chain inside the cap, and the seeded pair
-- is a different, usually much shorter answer the players never saw. Showing
-- it unasked hands over the one thing the post-mortem was for.
--
-- So: winning must leave the flag alone, and Reveal must still work
-- afterwards. Both modes, because both call common.end_game with a winning
-- play_state ('won' for coop, 'won_compete' for a race).

begin;

set search_path = letterboxed, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(8);

-- ============================================================
-- Coop: a 2-player table covers all twelve
-- ============================================================
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('LB reveal', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.lb_board()
);

-- Precondition: nothing is revealed while the game is live.
select ok(
  (select not solution_revealed from common.games where id = (select id from g)),
  'a fresh coop game hides the seeded pair'
);

-- Win it the way a table actually would — the two seeded words happen to be
-- the shortest route on this fixture board, but the flag must not care.
select letterboxed.submit_word((select id from g), 'adgjbehk');
select letterboxed.submit_word((select id from g), 'kcfil');

select is(
  (select play_state from common.games where id = (select id from g)),
  'won',
  'covering all twelve wins the coop game'
);

-- ── THE POINT ──
select ok(
  (select not solution_revealed from common.games where id = (select id from g)),
  'winning does NOT reveal the seeded pair — a letterboxed win is not the pair'
);

-- Reveal still works once they ask for it.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.reveal_solution((select id from g));
reset role;

select ok(
  (select solution_revealed from common.games where id = (select id from g)),
  'and Reveal still opens it at terminal'
);

-- ============================================================
-- Compete: the same, for a race that someone wins
-- ============================================================
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.lb_board()
);

select ok(
  (select not solution_revealed from common.games where id = (select id from gc)),
  'a fresh compete game hides the seeded pair'
);

select letterboxed.submit_word((select id from gc), 'adgjbehk');
select letterboxed.submit_word((select id from gc), 'kcfil');
reset role;

select is(
  (select play_state from common.games where id = (select id from gc)),
  'won_compete',
  'first to cover all twelve wins the race'
);

-- ── THE POINT, again ──
select ok(
  (select not solution_revealed from common.games where id = (select id from gc)),
  'winning the race does NOT reveal the seeded pair either'
);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.reveal_solution((select id from gc));
reset role;

select ok(
  (select solution_revealed from common.games where id = (select id from gc)),
  'and Reveal opens it for the race too'
);

select * from finish();
rollback;
