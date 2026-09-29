-- cs-unmet

-- ============================================================
-- Test: crosswords._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end, in both modes — which is what catches a key still
-- written after it was dropped. Then the values that matter, that a cell
-- write leaves the statuses alone unless it ends the game, and the one rule
-- about dates: only a call that says so moves status_changed_at.
--
-- The puzzle is a 2×2 all-open grid, answers C A / T S.
-- ============================================================

begin;
set search_path = crosswords, common, public, extensions;
\ir ../_shared/setup.psql

select plan(14);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   '{}'),
  ('player_status', '{}'),
  ('clubpage_info', array['winner_user_id']);
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

create function pg_temp.board() returns jsonb language sql as $$
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'title', 'Toy', 'author', 'T', 'width', 2, 'height', 2,
      'clues', jsonb_build_object('across', '[]'::jsonb, 'down', '[]'::jsonb),
      'cells', jsonb_build_array(
        jsonb_build_array(jsonb_build_object('kind', 'cell'), jsonb_build_object('kind', 'cell')),
        jsonb_build_array(jsonb_build_object('kind', 'cell'), jsonb_build_object('kind', 'cell')))),
    'solution', jsonb_build_array(
      jsonb_build_array(jsonb_build_array('C'), jsonb_build_array('A')),
      jsonb_build_array(jsonb_build_array('T'), jsonb_build_array('S'))))
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Crosswords statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (crosswords.create_game(
  (select handle from club),
  '{"source": "upload", "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode,
  pg_temp.board()
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

-- ── At the start ──
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the start');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the start');
select is(
  (select clubpage_info from common.games where id = (select id from g where mode = 'compete')),
  '{"winner_user_id": null}'::jsonb,
  'compete: the club line names no winner at the start');

-- ── Mid-game: a cell write leaves the statuses alone; a check rewrites them ──
reset role;
select set_config('request.jwt.claims', '', true);
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.set_cell((select id from g where mode = 'compete'), 0, 0, 'C', false);
select crosswords.set_mark((select id from g where mode = 'compete'), 0, 0, 'right', 'break');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status_changed_at from common.games where id = (select id from g where mode = 'compete')),
  '2026-01-01'::timestamptz,
  'a cell fill and a mark do not rewrite the statuses');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.check_cells((select id from g where mode = 'compete'), '[{"row": 0, "col": 0}]'::jsonb);
reset role;
select set_config('request.jwt.claims', '', true);

select isnt(
  (select status_changed_at from common.games where id = (select id from g where mode = 'compete')),
  '2026-01-01'::timestamptz,
  'a check rewrites the statuses');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set mid-game');

-- ── At the end: ada completes her compete grid; the coop game is stopped ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select crosswords.set_cell((select id from g where mode = 'compete'), 0, 1, 'A', false);
select crosswords.set_cell((select id from g where mode = 'compete'), 1, 0, 'T', false);
select crosswords.set_cell((select id from g where mode = 'compete'), 1, 1, 'S', false);
select crosswords.stop_game((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select game_ended_reason from common.games where id = (select id from g where mode = 'compete')),
  'reached_goal',
  'precondition: the last fill completed the grid');
select isnt(
  (select status_changed_at from common.games where id = (select id from g where mode = 'compete')),
  '2026-01-01'::timestamptz,
  'the fill that ends the game rewrites the statuses');
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the end');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the end');
select is(
  (select clubpage_info from common.games where id = (select id from g where mode = 'compete')),
  '{"winner_user_id": "ada11111-1111-1111-1111-111111111111"}'::jsonb,
  'compete: the club line names the winner');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select crosswords._write_statuses(id, p_update_status_changed_at => false) from g;
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  'a rebuild (false) leaves status_changed_at alone');

-- A rebuild assigns, never merges: a key planted in a status does not survive.
update common.games set game_status = game_status || '{"stale": 1}'::jsonb
 where id = (select id from g where mode = 'coop');
select isnt(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'precondition: the key-set check sees the planted key');
select crosswords._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'a rebuild drops a stale key from every status');

select * from finish();
rollback;
