-- cs-unmet

-- ============================================================
-- Test: waffle compete — independent boards, opponent hidden,
--        fewest-swaps winner
-- ============================================================
--
-- Compete: each player solves their own copy; every solver is ranked by
-- FEWEST swaps (tie-break: earliest solved_at — not exercised here since
-- now() is constant within a test transaction).
-- The game ends only once EVERY player is done (solved or out of
-- swaps). An opponent's board is hidden until the game ends.

begin;

set search_path = waffle, common, public, extensions;

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select plan(30);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Waffle vs', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),   -- max_swaps = par(1)+5 = 6
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id;

-- ── ada solves in 1 swap ────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table a_solve on commit drop as
select waffle.submit_swap((select id from g), 0, 1) as res;

select is((select (res->'data'->>'solved')::boolean from a_solve), true,
  'ada solves on her first swap');
select is((select (res->'data'->>'terminal')::boolean from a_solve), false,
  'game is NOT terminal yet — bea is still playing');

reset role;
select is(
  (select swaps_used from waffle.players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1, 'ada used 1 swap');
select is(
  (select solved_at from common.game_players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  null, 'bea is not solved');

-- The solver is DONE while bea plays her board out, and the common roster has
-- to hear it: ada's closed tab must not pause the game for bea. Her ending is
-- the solve, not a concession — ada is in fact about to win this one.
select is(
  (select player_ended_reason || '/' || player_ended_reason_detail
     from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'::uuid
      and player_ended_at is not null and solved_at is not null),
  'reached_goal/solved',
  'compete: a solve ends the solver, reached_goal/solved'
);
select is(
  (select player_ended_at from common.game_players
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'::uuid),
  null,
  'compete: a racer still swapping has not ended'
);
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
-- …and no swap counter on the club line either. The count is coop's alone for
-- the same leak reason, so in compete the key is always present and always
-- null.
select is(
  (select clubpage_info->'swaps_used' from common.games where id = (select id from g)),
  'null'::jsonb,
  'compete: swaps_used on the club line is null, not a count');

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
-- answer, which is why events_select gates on it. ada sees her own swap only.
select is(
  (select count(*) from waffle.events where game_id = (select id from g)),
  1::bigint,
  'mid-game: a player sees only their OWN swaps');
select is(
  (select count(distinct user_id) from waffle.events where game_id = (select id from g)),
  1::bigint,
  'mid-game: no opponent rows leak into the log');

-- A solved player is locked out of further swaps.
select pg_temp.envelope_is(
  waffle.submit_swap((select id from g), 2, 3),
  '{"type":"not-ok","severity":"fault","dbcode":"PN265",
    "message":"Already solved"}'::jsonb,
  'a solved player cannot swap again'
);

-- ── bea solves, but in 3 swaps (so ada wins on fewest) ──────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.submit_swap((select id from g), 2, 3);   -- 1, non-solving
select waffle.submit_swap((select id from g), 2, 3);   -- 2, undo
create temp table b_solve on commit drop as
select waffle.submit_swap((select id from g), 0, 1) as res;   -- 3, solve → all done

select is((select (res->'data'->>'terminal')::boolean from b_solve), true,
  'once every player is done → terminal');

reset role;
-- The last racer's act is the game's reason: bea's solve.
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g)),
  'reached_goal/solved/won',
  'the last racer solving ends the race reached_goal, won');
select is(
  (select game_ended_by_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'the last racer to finish ended the game');
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won', 'ada ranked 1 — fewest swaps (1 vs 3)');
select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from g) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '2/near', 'bea solved too, so she is ranked 2, near');
-- The WINNER's own count, named at the end — the number the club-list label
-- prints ("Won by ada · 1 swap"). ada solved in one.
select is(
  (select (clubpage_info->>'winner_swaps_count')::int from common.games where id = (select id from g)),
  1, 'the club line names the winner''s swap count');

-- ── After the end: the opponent board is now revealed ───────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select board from waffle.players_state
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222')::text,
  'abcdef.g.hijklmn.o.pqrstu',
  'after the end: the opponent board is revealed');

-- ── The compete move log ────────────────────────────────────
-- Compete logs swaps too. ada made 1, bea made 3 — four rows in ONE game-wide
-- order, since the key is the log's own id rather than a per-player count.
reset role;
select is(
  (select count(*) from waffle.events where game_id = (select id from g)),
  4::bigint,
  'compete logs every swap (ada 1 + bea 3)');

-- …and at the END both players' logs open up — the point of logging them, and
-- safe because the boards themselves are revealed by then anyway.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(distinct user_id) from waffle.events where game_id = (select id from g)),
  2::bigint,
  'at the end: a player sees BOTH logs');
reset role;

-- Four rows, four ids: two players' swaps share one sequence rather than each
-- counting from 1, which is what makes the log a single chronological read.
select is(
  (select count(distinct id) from waffle.events where game_id = (select id from g)),
  4::bigint,
  'both players'' swaps are numbered in one game-wide sequence');

select is(
  (select count(*) from waffle.events
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1::bigint,
  'ada''s single swap is logged too');

-- ── The ended title must not spoil an unsolved race ─────────
-- common.games.title is readable club-wide, and waffle hides the answer on a
-- loss so Restart stays a genuine second try. So an ended race is titled with
-- the correct words on the FURTHEST player's own board, never the solution's
-- six — it can never name a word nobody actually had.

-- (a) The race above was won by ada, whose board IS the solution — so the six
--     words are legitimately hers and the title says them.
reset role;
select isnt(
  (select title from common.games where id = (select id from g)),
  'New compete',
  'ended compete: a SOLVED race is titled with the winner''s words');

-- (b) A race nobody solves. The title must name what a PLAYER'S BOARD actually
--     has, not the solution's six.
--
--     Note this fixture's scramble is one swap from solved, so an untouched
--     board already shows five correct words — those are the player's own
--     greens, visible from move zero, so naming them leaks nothing. What must
--     NOT appear is the sixth: the word only the solution has.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select (waffle.create_game(
  (select handle from club), pg_temp.waffle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.waffle_board()
)->'data'->>'id')::uuid as id;
select waffle.concede((select id from g2));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select waffle.concede((select id from g2));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g2)),
  'lost',
  'precondition: nobody solved it');
select is(
  (select title from common.games where id = (select id from g2)),
  (select waffle._format_title(
            waffle._correct_words(wp.board, wg.solution), 'New compete')
     from waffle.players wp
     join waffle.games wg on wg.game_id = wp.game_id
    where wp.game_id = (select id from g2)
    limit 1),
  'ended compete: the title names a real board''s correct words');

-- …and that is genuinely NOT the solution's all-six title. Without this the
-- assertion above would pass on any board that happened to be solved.
select isnt(
  (select title from common.games where id = (select id from g2)),
  (select waffle._format_title(
            waffle._correct_words(wg.solution, wg.solution), 'New compete')
     from waffle.games wg where wg.game_id = (select id from g2)),
  'ended compete: an unsolved race is NOT titled with the solution''s words');


select * from finish();
rollback;
