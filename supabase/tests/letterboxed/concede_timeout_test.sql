-- ============================================================
-- Test: conceded players are OUT; timeout ranks the racers
-- ============================================================
--
-- The two rulings this file pins (both regressions from the 2026-08-05
-- review — the FE gated concede but the server did not):
--
--   1. A conceded player's chain is FROZEN server-side: submit_word /
--      undo_word / clear_chain all refuse, so a stale tab (or a submit
--      in flight when the concede commits) can't keep racing — or cover
--      the twelve and be crowned by submit_word's solve branch.
--   2. submit_timeout resolves among NON-conceded players only (a
--      drop-out forfeits, whatever they had covered — the wordiply
--      ruling: listed on the leaderboard, but can't win), and marks
--      exact ties as CO-winners, with a per-row `won` flag on the
--      status leaderboard that the FE reads instead of trusting row 0.

begin;

set search_path = letterboxed, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql
\ir setup.psql

-- ============================================================
-- Set up: ada + bea club, compete game, ada leads then concedes
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

create temp table ga on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.lb_board()
);

-- ada covers eight of the twelve; bea only three. On coverage alone ada
-- would win the timeout — the concede below is what must undo that.
select letterboxed.submit_word((select id from ga), 'adgjbehk');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from ga), 'adg');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select letterboxed.concede((select id from ga));

-- ── 1. The frozen chain ─────────────────────────────────────
select throws_ok(
  format('select letterboxed.submit_word(%L, %L)', (select id from ga), 'kcf'),
  'P0001',
  'you-conceded|',
  'a conceded player cannot submit a word'
);

select throws_ok(
  format('select letterboxed.undo_word(%L)', (select id from ga)),
  'P0001',
  'you-conceded|',
  'a conceded player cannot undo'
);

select throws_ok(
  format('select letterboxed.clear_chain(%L)', (select id from ga)),
  'P0001',
  'you-conceded|',
  'a conceded player cannot clear'
);

-- ── 2. Timeout crowns the racer, not the drop-out ───────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_timeout((select id from ga));

select is(
  (select play_state from common.games where id = (select id from ga)),
  'won_compete',
  'a timed-out race still resolves to a winner'
);

select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from ga)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  true,
  'the remaining racer wins on coverage among NON-conceded players'
);

select is(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from ga)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  false,
  'the conceded leader does NOT win, despite the higher coverage'
);

-- The status leaderboard still LISTS ada first (coverage order, 8 > 3) —
-- which is exactly why the FE must read the per-row `won` flag rather
-- than crown row 0.
select is(
  (select status->'leaderboard'->0->>'user_id' from common.games
    where id = (select id from ga)),
  'ada11111-1111-1111-1111-111111111111',
  'the leaderboard keeps the conceded player listed, in coverage order'
);

select is(
  (select (status->'leaderboard'->0->>'won')::boolean from common.games
    where id = (select id from ga)),
  false,
  '…with won=false on their row (leaderboard[0] is NOT the winner)'
);

-- ============================================================
-- Exact ties are co-winners
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gb on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.lb_board()
);

-- Both play the same word on their own chains: identical coverage AND
-- word count, the exact tie submit_timeout refuses to break arbitrarily.
select letterboxed.submit_word((select id from gb), 'adg');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from gb), 'adg');

select letterboxed.submit_timeout((select id from gb));

select is(
  (select play_state from common.games where id = (select id from gb)),
  'won_compete',
  'a tied timeout still resolves'
);

select is(
  (select bool_and((result->>'won')::boolean) from common.game_players
    where game_id = (select id from gb)),
  true,
  'an exact tie makes CO-winners — every tied player is marked won'
);

select is(
  (select bool_and((e->>'won')::boolean)
     from common.games,
          jsonb_array_elements(status->'leaderboard') e
    where id = (select id from gb)),
  true,
  'and the status leaderboard flags both rows won'
);

select * from finish();
rollback;
