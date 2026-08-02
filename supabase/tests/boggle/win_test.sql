-- ============================================================
-- Test: boggle win-on-target (setup.win_percent)
-- ============================================================
-- A game with setup.win_percent set ends with a WIN the moment the team (coop)
-- or a player (compete) reaches win_percent% of the required-words SCORE.
-- The fixture's required set is 9 points (see setup.psql), so a 50% target is
-- ceil(0.5 * 9) = 5 points. Compete is a race: the first player to cross wins
-- outright (status.winner_user_id), regardless of the others' private scores.

begin;
set search_path = boggle, common, public, extensions;
select plan(24);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Boggle Win', array['ada', 'bea']) as handle;

-- ── (1) create_game validates win_percent ────────────────────
create temp table gw on commit drop as
select * from boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup() || jsonb_build_object('win_percent', 75),
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop', pg_temp.boggle_board());
reset role; select set_config('request.jwt.claims', '', true);
select is((select win_percent from boggle.games where id = (select id from gw)), 75,
  'create_game stores setup.win_percent on the game');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select boggle.create_game(%L, pg_temp.boggle_setup() || '{"win_percent":33}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop', pg_temp.boggle_board()) $$,
    (select handle from club)),
  'P0001', null, 'win_percent not a multiple of 5 is rejected');
select throws_ok(
  format($$ select boggle.create_game(%L, pg_temp.boggle_setup() || '{"win_percent":45}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop', pg_temp.boggle_board()) $$,
    (select handle from club)),
  'P0001', null, 'win_percent below 50 is rejected');
select throws_ok(
  format($$ select boggle.create_game(%L, pg_temp.boggle_setup() || '{"win_percent":105}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop', pg_temp.boggle_board()) $$,
    (select handle from club)),
  'P0001', null, 'win_percent above 100 is rejected');

-- ── (2) COOP: team reaching the threshold (5 pts) wins ────────
create temp table gc on commit drop as
select * from boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup() || jsonb_build_object('win_percent', 50),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop', pg_temp.boggle_board());

-- 4 points so far (cat+car+arc+cart) — below the 5-pt bar, still playing.
select boggle.submit_word((select id from gc), 'cat', 1, false);
select boggle.submit_word((select id from gc), 'car', 1, false);
select boggle.submit_word((select id from gc), 'arc', 1, false);
select boggle.submit_word((select id from gc), 'cart', 1, false);
reset role; select set_config('request.jwt.claims', '', true);
select is((select play_state from common.games where id = (select id from gc)), 'playing',
  'coop: below the target the game keeps playing');

-- scare (+2 → 6 pts) crosses the bar → team wins.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select boggle.submit_word((select id from gc), 'scare', 2, false);
reset role; select set_config('request.jwt.claims', '', true);
select is((select is_terminal from common.games where id = (select id from gc)), true,
  'coop: reaching the target ends the game');
select is((select status->>'outcome' from common.games where id = (select id from gc)), 'target',
  'coop: the terminal outcome is target');
-- boggle used to land every ending on the neutral 'ended'. A game with a
-- TARGET can now be won or lost against it, like spellingbee's rank target.
select is((select play_state from common.games where id = (select id from gc)), 'won',
  'coop: reaching the target is a WIN, not a neutral end');

-- ── (3) COMPETE: first to cross wins the race ─────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gp on commit drop as
select * from boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup() || jsonb_build_object('win_percent', 50),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete', pg_temp.boggle_board());

-- ada races to 5 points (cat+car+arc+cart+scare = 6) and crosses.
select boggle.submit_word((select id from gp), 'cat', 1, false);
select boggle.submit_word((select id from gp), 'car', 1, false);
select boggle.submit_word((select id from gp), 'arc', 1, false);
select boggle.submit_word((select id from gp), 'cart', 1, false);
select boggle.submit_word((select id from gp), 'scare', 2, false);
reset role; select set_config('request.jwt.claims', '', true);

select is((select is_terminal from common.games where id = (select id from gp)), true,
  'compete: a player reaching the target ends the game');
select is((select status->>'outcome' from common.games where id = (select id from gp)), 'target',
  'compete: the terminal outcome is target');
select is((select status->>'winner_user_id' from common.games where id = (select id from gp)),
  'ada11111-1111-1111-1111-111111111111', 'compete: the crosser is named as the winner');
select is((select play_state from common.games where id = (select id from gp)), 'won_compete',
  'compete: reaching the target is won_compete, not a neutral end');
select is((select (result->>'won')::boolean from common.game_players
             where game_id = (select id from gp) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true, 'compete: the crosser won');
select is((select (result->>'won')::boolean from common.game_players
             where game_id = (select id from gp) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  false, 'compete: the other player lost (first-to-cross, not high score)');

-- ── (3b) COMPETE: bonus finds do NOT count toward the target ──
-- A big bonus find (9 pts, is_bonus) leaves the required-found score at 0, so
-- the 5-pt bar isn't crossed — the game keeps playing.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gb on commit drop as
select * from boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup() || jsonb_build_object('win_percent', 50),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete', pg_temp.boggle_board());
select boggle.submit_word((select id from gb), 'zydeco', 9, true);   -- bonus, 9 pts
reset role; select set_config('request.jwt.claims', '', true);
select is((select play_state from common.games where id = (select id from gb)), 'playing',
  'a bonus find (even a big one) does not cross the target — required score only');

-- ── (4) No target (win_percent null) never auto-ends ──────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gn on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),   -- no win_percent
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop', pg_temp.boggle_board());
-- Find the entire required set (all 9 pts) — with no target, still playing.
select boggle.submit_word((select id from gn), 'cat', 1, false);
select boggle.submit_word((select id from gn), 'car', 1, false);
select boggle.submit_word((select id from gn), 'arc', 1, false);
select boggle.submit_word((select id from gn), 'cart', 1, false);
select boggle.submit_word((select id from gn), 'scare', 2, false);
select boggle.submit_word((select id from gn), 'traces', 3, false);
reset role; select set_config('request.jwt.claims', '', true);
select is((select play_state from common.games where id = (select id from gn)), 'playing',
  'no target: finding everything does not auto-end the game');

-- ── (5) The clock, with and without a target ─────────────────
-- With a target, running out of time means the bar was never reached — a
-- LOSS, the same rule spellingbee/wordwheel apply to their rank target. With
-- no target there was nothing to fail, so the clock is just the neutral end
-- of an exercise.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gto on commit drop as
select * from boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup() || jsonb_build_object('win_percent', 50),
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop', pg_temp.boggle_board());
select boggle.submit_timeout((select id from gto));
reset role; select set_config('request.jwt.claims', '', true);
select is((select play_state from common.games where id = (select id from gto)), 'lost',
  'coop + target: the clock beating the target is a loss');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gtn on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),   -- no win_percent
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop', pg_temp.boggle_board());
select boggle.submit_timeout((select id from gtn));
reset role; select set_config('request.jwt.claims', '', true);
select is((select play_state from common.games where id = (select id from gtn)), 'ended',
  'coop, no target: the clock is a neutral end — there was nothing to fail');

-- ── (6) COMPETE, no target: the clock ranks by score ─────────
-- Nothing to reach, so the highest non-conceded score takes it and the winner
-- is NAMED (the leaderboard is privacy-scoped, so a label can't derive it).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gcs on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),   -- no win_percent
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete', pg_temp.boggle_board());
select boggle.submit_word((select id from gcs), 'traces', 3, false);   -- ada: 3
reset role;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select boggle.submit_word((select id from gcs), 'cat', 1, false);      -- bea: 1
select boggle.submit_timeout((select id from gcs));
reset role; select set_config('request.jwt.claims', '', true);
select is((select play_state from common.games where id = (select id from gcs)), 'won_compete',
  'compete, no target: the clock crowns the top score');
select is((select status->>'winner_username' from common.games where id = (select id from gcs)),
  'ada', 'compete, no target: the sole top scorer is named');

-- ── (7) COMPETE + target: the clock means NOBODY reached it ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gct on commit drop as
select * from boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup() || jsonb_build_object('win_percent', 50),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete', pg_temp.boggle_board());
select boggle.submit_word((select id from gct), 'traces', 3, false);   -- below the 5-pt bar
select boggle.submit_timeout((select id from gct));
reset role; select set_config('request.jwt.claims', '', true);
select is((select play_state from common.games where id = (select id from gct)), 'lost_compete',
  'compete + target: the clock beating the bar is a loss for everyone');
select is((select (result->>'won')::boolean from common.game_players
             where game_id = (select id from gct)
               and user_id = 'ada11111-1111-1111-1111-111111111111'),
  false, 'compete + target: the leading score does NOT win — nobody reached it');

-- ── A timed race NOBODY played: no score to crown → lost_compete ──
-- Same shape as wordiply: "your score is the best score" is true for everyone
-- when every score is 0. Before the guard this ended won_compete with both
-- players flagged won, which the club-page label rendered as
-- "Won (co-winners)" while the play surface said "no words found".
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gz on commit drop as
select * from boggle.create_game(
  (select handle from club),
  pg_temp.boggle_setup() || '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete', pg_temp.boggle_board());
select boggle.submit_timeout((select id from gz));
reset role; select set_config('request.jwt.claims', '', true);
select is((select play_state from common.games where id = (select id from gz)),
  'lost_compete', 'compete, no target, nobody scored: the clock crowns no one');
select is((select count(*)::int from common.game_players
            where game_id = (select id from gz) and result->>'won' = 'true'),
  0, 'compete, nobody scored: no player is flagged won');

select * from finish();
rollback;
