-- ============================================================
-- Test: waffle compete — independent boards, opponent hidden,
--        fewest-swaps winner
-- ============================================================
--
-- Compete: each player solves their own copy; the winner is whoever
-- solved in the FEWEST swaps (tie-break: earliest solved_at — not
-- exercised here since now() is constant within a test transaction).
-- The game ends only once EVERY player is done (solved or out of
-- swaps). An opponent's board is hidden until the game ends.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(27);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Waffle vs', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),   -- max_swaps = par(1)+5 = 6
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board()
);

-- ── ada solves in 1 swap ────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table a_solve on commit drop as
select waffle.submit_swap((select id from g), 0, 1) as res;

select is((select (res->>'solved')::boolean from a_solve), true,
  'ada solves on her first swap');
select is((select (res->>'terminal')::boolean from a_solve), false,
  'game is NOT terminal yet — bea is still playing');

reset role;
select is(
  (select swaps_used from waffle.players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'ada used 1 swap');
select is(
  (select solved from waffle.players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false, 'bea is not solved');
select is(
  (select swaps_used from waffle.players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'bea board untouched (independent boards in compete)');
-- ada has SOLVED, but the club-list title must not say so: the words are the
-- solution, and common.games.title is readable club-wide, so a mid-race
-- readout would hand bea the answer. Compete holds the placeholder until the
-- whole race ends.
select is(
  (select title from common.games where id = (select id from g)),
  'New compete',
  'compete: a solved leader does NOT leak their words into the title');
-- …and no swap counter on the status either. It used to seed `swaps_used: 0`
-- at create and never update it in compete (the update is coop-only, same leak
-- reason), so the club card read a permanent "0 swaps" on a won race.
select ok(
  (select not (status ? 'swaps_used') from common.games where id = (select id from g)),
  'compete: no swaps_used on the status — absent, not a stale 0');

-- ── Opponent visibility mid-game (as ada) ───────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select ok(
  (select board from waffle.players_state
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222') is null,
  'mid-game: an opponent''s board is hidden (NULL)');
select is(
  (select swaps_used from waffle.players_state
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0, 'mid-game: an opponent''s swaps_used IS visible (the progress strip)');
select ok(
  (select board from waffle.players_state
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111') is not null,
  'a player always sees her own board');

-- The SWAP LOG has to agree with the board rule above, or the weaker one
-- decides: every compete player solves the same puzzle from the same scramble,
-- so replaying an opponent's swaps rebuilds their board — and their green tiles
-- are correct letter positions. A readable log would hand an honest player the
-- answer, which is why swaps_select gates on it. ada sees her own swap only.
select is(
  (select count(*) from waffle.swaps where game_id = (select id from g)),
  1::bigint,
  'mid-game: a player sees only their OWN swaps');
select is(
  (select count(distinct user_id) from waffle.swaps where game_id = (select id from g)),
  1::bigint,
  'mid-game: no opponent rows leak into the log');

-- A solved player is locked out of further swaps.
select throws_ok(
  format($$ select waffle.submit_swap(%L::uuid, 2, 3) $$, (select id from g)),
  'P0001', NULL, 'a solved player cannot swap again');

-- ── bea solves, but in 3 swaps (so ada wins on fewest) ──────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.submit_swap((select id from g), 2, 3);   -- 1, non-solving
select waffle.submit_swap((select id from g), 2, 3);   -- 2, undo
create temp table b_solve on commit drop as
select waffle.submit_swap((select id from g), 0, 1) as res;   -- 3, solve → all done

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
  true, 'ada won — fewest swaps (1 vs 3)');
select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false, 'bea did not win');
-- The WINNER's own count, named at terminal — the number the club-list label
-- prints ("Won by ada · 1 swap"). ada solved in one.
select is(
  (select (status->>'winner_swaps')::int from common.games where id = (select id from g)),
  1, 'the terminal status names the winner''s swap count');

-- ── Post-terminal: the opponent board is now revealed ───────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select board from waffle.players_state
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222')::text,
  'abcdef.g.hijklmn.o.pqrstu',
  'post-terminal: the opponent board is revealed');

-- ── The compete move log (added 2026-08-02) ─────────────────
-- Compete now logs swaps too. ada made 1, bea made 3 — four rows, and each
-- player's `seq` counts from 1 independently, which is exactly why user_id had
-- to join the primary key (without it bea's seq 1 would collide with ada's).
reset role;
select is(
  (select count(*) from waffle.swaps where game_id = (select id from g)),
  4::bigint,
  'compete logs every swap (ada 1 + bea 3)');

-- …and at TERMINAL both players' logs open up — the point of logging them, and
-- safe because the boards themselves are revealed by then anyway.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(distinct user_id) from waffle.swaps where game_id = (select id from g)),
  2::bigint,
  'at terminal: a player sees BOTH logs');
reset role;

select is(
  (select array_agg(seq order by seq) from waffle.swaps
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  array[1, 2, 3],
  'compete seq counts per PLAYER, not game-wide (the PK change)');

select is(
  (select count(*) from waffle.swaps
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1::bigint,
  'ada''s single swap is logged under her own seq 1');

-- ── The terminal title must not spoil an unsolved race ──────
-- common.games.title is readable club-wide. It used to read
-- `_correct_words(solution, solution)` at terminal — the full six, whatever
-- happened — which spoiled a race nobody solved: waffle hides the answer on a
-- loss so Restart stays a genuine second try, and the title undid that from the
-- outside. It now names the correct words on the FURTHEST player's own board,
-- so it can never name a word nobody actually had.

-- (a) The race above was won by ada, whose board IS the solution — so the six
--     words are legitimately hers and the title says them.
reset role;
select isnt(
  (select title from common.games where id = (select id from g)),
  'New compete',
  'terminal compete: a SOLVED race is titled with the winner''s words');

-- (b) A race nobody solves. The title must name what a PLAYER'S BOARD actually
--     has, not the solution's six.
--
--     Note this fixture's scramble is one swap from solved, so an untouched
--     board already shows five correct words — those are the player's own
--     greens, visible from move zero, so naming them leaks nothing. What must
--     NOT appear is the sixth: the word only the solution has.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board()
);
select waffle.concede((select id from g2));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.concede((select id from g2));

reset role;
select is(
  (select play_state from common.games where id = (select id from g2)),
  'lost_compete',
  'precondition: nobody solved it');
select is(
  (select title from common.games where id = (select id from g2)),
  (select waffle._format_title(
            waffle._correct_words(wp.board, wg.solution), 'New compete')
     from waffle.players wp
     join waffle.games wg on wg.id = wp.game_id
    where wp.game_id = (select id from g2)
    limit 1),
  'terminal compete: the title names a real board''s correct words');

-- …and that is genuinely NOT the all-six title the old code produced. Without
-- this the assertion above would pass on any board that happened to be solved.
select isnt(
  (select title from common.games where id = (select id from g2)),
  (select waffle._format_title(
            waffle._correct_words(wg.solution, wg.solution), 'New compete')
     from waffle.games wg where wg.id = (select id from g2)),
  'terminal compete: an unsolved race is NOT titled with the solution''s words');


select * from finish();
rollback;
