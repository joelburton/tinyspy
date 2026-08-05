-- ============================================================
-- Test: strands submit_timeout — the clock, in both modes
-- ============================================================
-- Coop: the board had a reachable end (find them all) and the team didn't
-- reach it, so the clock is a LOSS — outcome 'timeout', words_found counted,
-- never the total (that number is part of the answer).
--
-- Compete: the clock stops the race wherever it stands and the ranking is
-- applied to whoever HAD solved — a solver is crowned exactly as if the last
-- racer had finished; nobody solved means lost_compete/'timeout'. (The RPC
-- trusts the caller about expiry, like every game's timeout — the timer is a
-- shared-convention FE clock, not a server one.)
--
-- Plus the terminal RLS flip the race relies on: mid-race a rival's guesses
-- are hidden; the moment the game ends they open for the post-mortem.

begin;

set search_path = strands, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Clock club', array['ada','bea']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;

-- ============================================================
-- (1)–(3) COOP: time out mid-solve → lost / 'timeout'
-- ============================================================

create temp table g_coop on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');

select strands.submit_path((select id from g_coop), pg_temp.strands_row_path(0));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.submit_timeout((select id from g_coop));

reset role;
select is(
  (select play_state from common.games where id = (select id from g_coop)),
  'lost',
  'coop: the clock is a loss — the board had a reachable end'
);
select is(
  (select status->>'outcome' from common.games where id = (select id from g_coop)),
  'timeout',
  '…whose outcome names the clock'
);
select is(
  (select status->>'words_found' from common.games where id = (select id from g_coop)),
  '1',
  '…and counts what was found (never out of how many)'
);

-- ============================================================
-- (4)–(7) COMPETE with a solver: the clock crowns them
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_won on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');

select strands.submit_path((select id from g_won), pg_temp.strands_row_path(r))
  from generate_series(0, 7) r;

-- bea found one word, hadn't finished, and mid-race sees none of ada's rows.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.submit_path((select id from g_won), pg_temp.strands_row_path(0));
select is(
  (select count(*) from strands.events
    where game_id = (select id from g_won) and result in ('theme','spangram')),
  1::bigint,
  'mid-race, bea sees only her own find'
);

select strands.submit_timeout((select id from g_won));

reset role;
select is(
  (select play_state from common.games where id = (select id from g_won)),
  'won_compete',
  'compete: timing out with a solver on the board crowns them'
);
select is(
  (select result from common.game_players
    where game_id = (select id from g_won)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '{"won": true}'::jsonb,
  '…and it is the solver who takes it'
);

-- The post-mortem flip: at terminal the compete guesses open up.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from strands.events
    where game_id = (select id from g_won) and result in ('theme','spangram')),
  9::bigint,
  'at terminal bea sees the whole log — ada''s 8 finds plus her own'
);

-- ============================================================
-- (8)–(9) COMPETE with no solver: the clock is a collective loss
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g_lost on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');

select strands.submit_path((select id from g_lost), pg_temp.strands_row_path(0));
select strands.submit_timeout((select id from g_lost));

reset role;
select is(
  (select play_state from common.games where id = (select id from g_lost)),
  'lost_compete',
  'compete: timing out with no solver is a collective loss'
);
select is(
  (select status->>'outcome' from common.games where id = (select id from g_lost)),
  'timeout',
  '…whose outcome names the clock, not "unsolved" or "conceded"'
);

select * from finish();
rollback;
