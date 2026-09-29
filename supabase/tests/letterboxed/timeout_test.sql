-- cs-unmet

-- ============================================================
-- Test: letterboxed.submit_timeout — the coop half, plus the late tick
-- ============================================================
-- COOP is a loss: there is one chain and it didn't reach twelve; there is
-- nothing to rank. (The compete half — coverage ranking, conceded exclusion,
-- shared ranks on a tie — is pinned in concede_timeout_test.sql.) Also the
-- late-tick rule: a timer tick landing on a game that has already ended
-- changes NOTHING and answers the game-over race — every player's client runs
-- the countdown, so the second and third ticks always arrive.

begin;

set search_path = letterboxed, common, public, extensions;

select plan(6);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Timeout club', array['ada','bea']) as handle;

create temp table g on commit drop as
select (letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup_timed(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.lb_board()
)->'data'->>'id')::uuid as id;

-- Three letters covered when the clock runs out.
select letterboxed.submit_word((select id from g), 'adg');
select letterboxed.submit_timeout((select id from g));

reset role;
select is(
  (select game_ended_outcome from common.games where id = (select id from g)),
  'lost',
  'coop timeout is a LOSS — one chain, nothing to rank'
);
-- A free-for-all game has no turn holder, so nobody ended it.
select is(
  (select coalesce(game_ended_by_user_id::text, 'nobody') from common.games where id = (select id from g)),
  'nobody',
  '…the game has ended, by nobody'
);
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g)),
  'timeout/timeout',
  'the ending names the clock as the cause'
);
select is(
  (select clubpage_info->>'letters_covered_count' from common.games where id = (select id from g)),
  '3',
  'the club line restates the coverage the clock froze'
);
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g) and final_ranking is null and outcome = 'lost'),
  2,
  'nobody won — a coop timeout has no winner to crown'
);

-- ── The late tick ───────────────────────────────────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  letterboxed.submit_timeout((select id from g)),
  '{"type":"not-ok","severity":"race","dbcode":"PN486","message":"Game over"}'::jsonb,
  'a tick on a game that has ended is the game-over race, and changes nothing'
);

select * from finish();
rollback;
