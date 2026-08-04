-- ============================================================
-- Test: strands COMPETE — the race, the ranking, and the privacy line
-- ============================================================
--
-- One rule shapes everything here: **the winner is whoever SOLVED using the
-- fewest hints**, earliest solve breaking a tie. That means the race CANNOT end
-- on first solve — a player still going might finish on fewer hints — so a
-- solver goes LOCALLY terminal and the game ends only when nobody is still
-- racing. Test (3) is the whole point: the first solver LOSES to a later one
-- who spent less.
--
-- The privacy line is the other half. Opponents may see exactly one number
-- mid-game — hints used — because it says how the race is going without saying
-- anything about the puzzle. Word counts, the hint BAR (a proxy for words
-- found) and a rival's revealed word all stay hidden until terminal.
--
-- Personas: ada + bea race; cade is a third racer where one is needed.

begin;

set search_path = strands, common, public, extensions;

select plan(18);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;
select pg_temp.strands_hint_words();

-- hint_cost 1, so a single valid word buys a hint — the tests need to SPEND
-- hints cheaply, since spending is the thing being ranked.
create temp table game on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix), 5, 1, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');

-- ============================================================
-- (1)–(2) Compete needs an opponent, and seats everyone
-- ============================================================

select throws_ok(
  format($$ select strands.create_game(%L, %L::jsonb, array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete') $$,
         (select handle from club), pg_temp.strands_setup((select puzzle_id from fix))::text),
  'P0001',
  'compete mode requires at least 2 players',
  'a one-player compete game is refused — a race needs somebody to race'
);

select is(
  (select count(*) from strands.players where game_id = (select id from game)),
  2::bigint,
  'each player gets their own row — own board, own hint bar, own finish'
);

-- ============================================================
-- (3)–(6) THE RACE: each player has their OWN board
-- ============================================================
-- ada finds row 0. In coop that would lock those tiles for everyone; in compete
-- bea's board is untouched, which is what makes it a race over one puzzle
-- rather than a shared solve.

select is(
  strands.submit_path((select id from game), pg_temp.strands_row_path(0))->>'result',
  'theme',
  'ada finds a theme word'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  strands.submit_path((select id from game), pg_temp.strands_row_path(0))->>'result',
  'theme',
  'bea can find the SAME word — her board is her own'
);

select is(
  strands.submit_path((select id from game), pg_temp.strands_prefix_path(1, 4))->>'result',
  'hint_word',
  'and credit is per-player too: a word ada already banked still counts for bea'
);

-- From OUTSIDE the policy (postgres), both finds really are there — one row
-- each, not one shared row.
reset role;
select is(
  (select count(*) from strands.guesses
    where game_id = (select id from game) and result in ('theme','spangram')),
  2::bigint,
  'both finds are logged — one row each, not one shared row'
);

-- ============================================================
-- (7)–(9) THE PRIVACY LINE
-- ============================================================
-- …and from INSIDE it, each racer sees only her own. That gap between the two
-- counts above and below IS the privacy line, which is why the god's-eye check
-- is worth doing first: "ada sees 1" only means something once you know there
-- were 2 to see.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from strands.guesses
    where game_id = (select id from game) and result in ('theme','spangram')),
  1::bigint,
  'ada sees only her OWN find mid-game — bea''s is hidden by RLS'
);

-- bea spent nothing yet, but the COUNTER is public — it's the ranking metric,
-- and it says nothing about the puzzle.
select is(
  (select hints_spent from strands.players_state
    where game_id = (select id from game)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0,
  'a rival''s HINTS USED is visible — that is the race, and it leaks no puzzle'
);

-- …but the bar is not. Its fill is a proxy for how many valid words a rival has
-- found, so publishing it would leak sideways exactly what the guesses RLS
-- hides.
select is(
  (select hint_points from strands.players_state
    where game_id = (select id from game)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  null,
  'a rival''s hint BAR is hidden — it would proxy their word count'
);

-- ============================================================
-- (10)–(13) SOLVING ENDS YOUR RACE, NOT THE RACE
-- ============================================================
-- ada spends a hint (cost 1) then solves all 8 rows.

select strands.submit_path((select id from game), pg_temp.strands_prefix_path(1, 4));
select strands.spend_hint((select id from game));
select strands.submit_path((select id from game), pg_temp.strands_row_path(r))
  from generate_series(1, 7) r;

select is(
  (select solved from strands.players
    where game_id = (select id from game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  true,
  'ada has solved her board'
);

select is(
  (select play_state from common.games where id = (select id from game)),
  'playing',
  'but the GAME is still playing — bea could still beat her on hints'
);

select throws_ok(
  format($$ select strands.spend_hint(%L) $$, (select id from game)),
  'P0001',
  'you have already solved this board',
  'a solved player can''t keep spending hints (their number is final)'
);

-- ── bea solves with FEWER hints, and takes it ──
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.submit_path((select id from game), pg_temp.strands_row_path(r))
  from generate_series(1, 7) r;

select is(
  (select play_state from common.games where id = (select id from game)),
  'won_compete',
  'the last racer finishing ends the game'
);

-- ============================================================
-- (14)–(16) THE RANKING: fewest hints, not first to finish
-- ============================================================

select is(
  (select result from common.game_players
    where game_id = (select id from game)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '{"won": true}'::jsonb,
  'bea WINS on 0 hints — despite finishing SECOND'
);

select is(
  (select result from common.game_players
    where game_id = (select id from game)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '{"won": false}'::jsonb,
  'ada loses on 1 hint — first to solve is NOT the winner'
);

select is(
  (select status->>'best_hints' from common.games where id = (select id from game)),
  '0',
  'the status names the winning hint count'
);

-- ============================================================
-- (17)–(18) CONCEDE: a drop-out doesn't sink a solver
-- ============================================================
-- The reason strands can't use common.concede: that helper ends a game as a
-- collective LOSS when the last player drops. Here a table where one player
-- solved and the rest walked away must end with the solver WINNING.

create temp table game2 on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix), 5, 1, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');

-- ada solves; bea gives up.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select strands.submit_path((select id from game2), pg_temp.strands_row_path(r))
  from generate_series(0, 7) r;

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.concede((select id from game2));

select is(
  (select play_state from common.games where id = (select id from game2)),
  'won_compete',
  'the last rival conceding ends the game — as a WIN for the one who solved'
);

select is(
  (select result from common.game_players
    where game_id = (select id from game2)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '{"won": true}'::jsonb,
  'and the solver takes it, rather than everyone losing to the drop-out'
);

select * from finish();
rollback;
