-- cs-unmet

-- ============================================================
-- Test: spellingbee._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end, in both modes — which is what catches a key still
-- written after it was dropped. Then the values that matter, and the one rule
-- about dates: only a call that says so moves status_changed_at.
--
-- The fixture board (setup.psql) has 30 required words worth 50 points; the
-- compete game races to rank 1 (Good, 6 points).
-- ============================================================

begin;
set search_path = spellingbee, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(15);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   array['required_words_count', 'required_words_score', 'target_rank']),
  ('player_status', array['found_words_count', 'found_words_score', 'player_ended_reason']),
  ('clubpage_info', array['found_words_count', 'found_words_score', 'required_words_count',
                          'required_words_score', 'target_rank', 'winner_user_id']);
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

create function pg_temp.player_numbers(p_game_id uuid) returns text[] language sql as $$
  select array_agg((player_status->>'found_words_count') || '/' || (player_status->>'found_words_score')
                   order by user_id)
    from common.game_players where game_id = p_game_id
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Spellingbee statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (spellingbee.create_game(
  (select handle from club),
  pg_temp.spellingbee_setup()
    || case when mode = 'compete' then '{"target_rank": 1}'::jsonb else '{}'::jsonb end,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode,
  pg_temp.spellingbee_board()
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

-- ── At the start ──
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the start');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the start');
select is(
  (select game_status from common.games where id = (select id from g where mode = 'compete')),
  '{"required_words_count": 30, "required_words_score": 50, "target_rank": 1}'::jsonb,
  'game_status holds the board''s totals and the target');
select is(
  (select clubpage_info from common.games where id = (select id from g where mode = 'coop')),
  '{"found_words_count": 0, "found_words_score": 0, "required_words_count": 30,
    "required_words_score": 50, "target_rank": null, "winner_user_id": null}'::jsonb,
  'coop: the club line starts at nothing found, with no target');

-- ── Mid-game: a word each in coop (one a bonus); ada's first in the race ──
select spellingbee.submit_word((select id from g where mode = 'coop'), 'bead', 1, false, false);
select spellingbee.submit_word((select id from g where mode = 'compete'), 'bead', 1, false, false);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select spellingbee.submit_word((select id from g where mode = 'coop'), 'bcdfge', 6, false, true);
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set mid-game');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set mid-game');
select is(pg_temp.player_numbers((select id from g where mode = 'coop')), array['1/1', '1/6'],
  'coop: each player''s status has their own finds, bonus included');
select is(
  (select (clubpage_info->>'found_words_count') || '/' || (clubpage_info->>'found_words_score')
     from common.games where id = (select id from g where mode = 'coop')),
  '2/7',
  'coop: the club line has the team''s finds');
select is(
  (select clubpage_info->'found_words_count' from common.games where id = (select id from g where mode = 'compete')),
  'null'::jsonb,
  'compete: the club line carries no progress');

-- ── At the end: ada's pangram reaches the target; the coop game is stopped ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select spellingbee.submit_word((select id from g where mode = 'compete'), 'gfedcba', 17, true, false);
select spellingbee.stop_game((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the end');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the end');
select is(
  (select clubpage_info->>'winner_user_id' from common.games where id = (select id from g where mode = 'compete')),
  'ada11111-1111-1111-1111-111111111111',
  'compete: the club line names the winner');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select spellingbee._write_statuses(id, p_update_status_changed_at => false) from g;
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
select spellingbee._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'a rebuild drops a stale key from every status');

select * from finish();
rollback;
