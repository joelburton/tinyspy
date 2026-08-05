-- ============================================================
-- Test: letterboxed.submit_timeout — the coop half, plus the late tick
-- ============================================================
-- COOP is a loss: there is one chain and it didn't reach twelve; there is
-- nothing to rank. (The compete half — coverage ranking, conceded exclusion,
-- co-winners — is pinned in concede_timeout_test.sql.) Also the no-op rule:
-- a timer tick landing on an already-terminal game must change NOTHING —
-- every player's client runs the countdown, so the second and third ticks
-- always arrive.

begin;

set search_path = letterboxed, common, public, extensions;

select plan(6);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Timeout club', array['ada','bea']) as handle;

create temp table g on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup_timed(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.lb_board()
);

-- Three letters covered when the clock runs out.
select letterboxed.submit_word((select id from g), 'adg');
select letterboxed.submit_timeout((select id from g));

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'lost',
  'coop timeout is a LOSS — one chain, nothing to rank'
);
select ok(
  (select is_terminal from common.games where id = (select id from g)),
  '…and the game is terminal'
);
select is(
  (select status->>'timed_out' from common.games where id = (select id from g)),
  'true',
  'the blob names the clock as the cause'
);
select is(
  (select status->>'letters_covered' from common.games where id = (select id from g)),
  '3',
  'the blob restates the coverage the clock froze'
);
select ok(
  (select not bool_or((result->>'won')::boolean) from common.game_players
    where game_id = (select id from g)),
  'nobody won — a coop timeout has no winner to crown'
);

-- ── The late tick ───────────────────────────────────────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select lives_ok(
  format('select letterboxed.submit_timeout(%L)', (select id from g)),
  'a tick on an already-terminal game is a silent no-op'
);

select * from finish();
rollback;
