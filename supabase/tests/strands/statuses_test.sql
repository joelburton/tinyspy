-- cs-unmet

-- ============================================================
-- Test: strands._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end, in both modes — which is what catches a key still
-- written after it was dropped. Then the values that matter, and the one rule
-- about dates: only a call that says so moves status_changed_at.
--
-- The fixture board (setup.psql) hides one word per row; row 4 is the
-- spangram, and each row's first four cells spell a hint word.
-- ============================================================

begin;
set search_path = strands, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(15);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   array['hint_cost']),
  ('player_status', array['found_words_count', 'hint_points', 'hints_count', 'player_ended_reason']),
  ('clubpage_info', array['found_words_count', 'winner_hints_count', 'winner_user_id']);
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

-- The path along row `p_row`, `p_len` cells from the left.
create function pg_temp.row_path(p_row int, p_len int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_array(p_row, c) order by c) from generate_series(0, p_len - 1) c
$$;

create function pg_temp.player_numbers(p_game_id uuid) returns text[] language sql as $$
  select array_agg((player_status->>'found_words_count') || '/' || (player_status->>'hint_points')
                   order by user_id)
    from common.game_players where game_id = p_game_id
$$;

select pg_temp.strands_hint_words();
create temp table puzzle on commit drop as select pg_temp.strands_puzzle() as id;
grant select on puzzle to authenticated;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Strands statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select id from puzzle)),
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
  (select clubpage_info from common.games where id = (select id from g where mode = 'coop')),
  '{"found_words_count": 0, "winner_user_id": null, "winner_hints_count": null}'::jsonb,
  'coop: the club line starts at no words found');

-- ── Mid-game: ada finds a theme word and a hint word in coop; bea a theme
-- word in the race ──
select strands.submit_path((select id from g where mode = 'coop'), pg_temp.row_path(0, 6));
select strands.submit_path((select id from g where mode = 'coop'), pg_temp.row_path(1, 4));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.submit_path((select id from g where mode = 'compete'), pg_temp.row_path(0, 6));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set mid-game');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set mid-game');
select is(pg_temp.player_numbers((select id from g where mode = 'coop')), array['1/1', '1/1'],
  'coop: every player''s status has the team''s words and the shared hint bar');
select is(pg_temp.player_numbers((select id from g where mode = 'compete')), array['0/0', '1/0'],
  'compete: each racer''s status has their own words');
select is(
  (select clubpage_info->'found_words_count' from common.games where id = (select id from g where mode = 'compete')),
  'null'::jsonb,
  'compete: the club line carries no progress');

-- ── At the end: ada solves the race and bea concedes; the coop game stops ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select strands.submit_path((select id from g where mode = 'compete'), pg_temp.row_path(r, 6))
  from generate_series(0, 7) r;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select strands.concede((select id from g where mode = 'compete'));
select strands.stop_game((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the end');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the end');
select is(
  (select (clubpage_info->>'winner_user_id') || '/' || (clubpage_info->>'winner_hints_count')
     from common.games where id = (select id from g where mode = 'compete')),
  'ada11111-1111-1111-1111-111111111111/0',
  'compete: the club line names the winner and the hints she solved on');
select is(
  (select array_agg(player_status->>'player_ended_reason' order by user_id)
     from common.game_players where game_id = (select id from g where mode = 'compete')),
  array['reached_goal', 'conceded'],
  'compete: each racer''s status says how they ended, for the strip');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select strands._write_statuses(id, p_update_status_changed_at => false) from g;
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
select strands._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'a rebuild drops a stale key from every status');

select * from finish();
rollback;
