-- cs-unmet

-- ============================================================
-- Test: connections._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end, in both modes — which is what catches a key still
-- written after it was dropped. Then the values that matter, and the one rule
-- about dates: only a call that says so moves status_changed_at.
--
-- The fixture puzzle (setup.psql) has four categories: the A, B, C and D
-- words, ranks 0–3.
-- ============================================================

begin;
set search_path = connections, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(16);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   array['max_mistakes', 'required_categories_count']),
  ('player_status', array['found_categories_count', 'mistake_count', 'player_ended_reason']),
  ('clubpage_info', array['found_categories_count', 'mistake_count', 'winner_user_id']);
grant select on want to authenticated;

create function pg_temp.keys_of(j jsonb) returns text[] language sql as $$
  select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(j) k
$$;

-- Every status of one game against the wanted key sets; a mismatch names
-- which status and which row.
create function pg_temp.shapes_ok(p_game_id uuid) returns text language sql as $$
  select coalesce(string_agg(bad, '; '), 'ok') from (
    select 'game_status' as bad from common.games
     where id = p_game_id
       and pg_temp.keys_of(game_status) <> (select keys from want where status = 'game_status')
    union all
    select 'clubpage_info' from common.games
     where id = p_game_id
       and pg_temp.keys_of(clubpage_info) <> (select keys from want where status = 'clubpage_info')
    union all
    select 'player_status of ' || user_id from common.game_players
     where game_id = p_game_id
       and pg_temp.keys_of(player_status) <> (select keys from want where status = 'player_status')
  ) mismatches
$$;

create temp table puzzle on commit drop as select pg_temp.connections_puzzle() as id;
grant select on puzzle to authenticated;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Connections statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (connections.create_game(
  (select handle from club),
  pg_temp.connections_setup((select id from puzzle)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

-- ── At the start ──
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the start');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the start');
select is(
  (select game_status from common.games where id = (select id from g where mode = 'coop')),
  '{"required_categories_count": 4, "max_mistakes": 4}'::jsonb,
  'game_status holds the four categories and the four mistakes');

-- ── Mid-game: ada matches the A words, bea misses ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_guess((select id from g where mode = 'coop'),
  array['ALPHA','ANGEL','APPLE','ARROW'], 'correct', 0);
select connections.submit_guess((select id from g where mode = 'compete'),
  array['ALPHA','ANGEL','APPLE','ARROW'], 'correct', 0);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select connections.submit_guess((select id from g where mode = 'coop'),
  array['BANANA','BIRCH','BREAD','CLOUD'], 'oneAway');
select connections.submit_guess((select id from g where mode = 'compete'),
  array['BANANA','BIRCH','BREAD','CLOUD'], 'oneAway');
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set mid-game');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set mid-game');
select is(
  (select (clubpage_info->>'found_categories_count') || '/' || (clubpage_info->>'mistake_count')
     from common.games where id = (select id from g where mode = 'coop')),
  '1/1',
  'coop: the club line has the team''s matches and shared mistakes');
select is(
  (select array_agg((player_status->>'found_categories_count')::int order by user_id)
     from common.game_players where game_id = (select id from g where mode = 'coop')),
  array[1, 0],
  'coop: each player''s status has what that player matched');
select is(
  (select array_agg((player_status->>'mistake_count')::int order by user_id)
     from common.game_players where game_id = (select id from g where mode = 'compete')),
  array[0, 1],
  'compete: each racer''s status has their own mistakes');
select is(
  (select clubpage_info->'found_categories_count' from common.games
    where id = (select id from g where mode = 'compete')),
  'null'::jsonb,
  'compete: the club line carries no progress');

-- ── At the end: ada finds the other three and wins the race; coop is Stopped ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select connections.submit_guess((select id from g where mode = 'compete'),
  array['BANANA','BIRCH','BREAD','BRICK'], 'correct', 1);
select connections.submit_guess((select id from g where mode = 'compete'),
  array['CASTLE','CIRCLE','CLOUD','CROWN'], 'correct', 2);
select connections.submit_guess((select id from g where mode = 'compete'),
  array['DAGGER','DELTA','DIAMOND','DRAGON'], 'correct', 3);
select connections.stop_game((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the end');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the end');
select is(
  (select clubpage_info->>'winner_user_id' from common.games
    where id = (select id from g where mode = 'compete')),
  'ada11111-1111-1111-1111-111111111111',
  'compete: the club line names the winner');
select is(
  (select clubpage_info->'winner_user_id' from common.games
    where id = (select id from g where mode = 'coop')),
  'null'::jsonb,
  'coop: the club line names no winner');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select connections._write_statuses(id, p_update_status_changed_at => false) from g;
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  'a rebuild (false) leaves status_changed_at alone');

-- A rebuild assigns, never merges: a key planted in a status does not survive.
update common.game_players set player_status = player_status || '{"stale": 1}'::jsonb
 where game_id = (select id from g where mode = 'coop');
select isnt(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'precondition: the key-set check sees the planted key');
select connections._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'a rebuild drops a stale key from every status');

select * from finish();
rollback;
