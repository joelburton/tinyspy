-- cs-unmet

-- ============================================================
-- Test: psychicnum._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end, in both modes — which is what catches a key still
-- written after it was dropped. Then the values that matter, and the one rule
-- about dates: only a call that says so moves status_changed_at.
-- ============================================================

begin;
set search_path = psychicnum, common, public, extensions;
\ir ../_shared/setup.psql

select plan(20);

-- The key sets, written once.
create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   array['max_guesses', 'required_secrets_count']),
  ('player_status', array['found_secrets_count', 'guesses_used', 'player_ended_reason']),
  ('clubpage_info', array['found_secrets_count', 'guesses_used', 'max_guesses',
                          'required_secrets_count', 'winner_user_id']);
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

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Psychic statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (psychicnum.create_game(
  (select handle from club),
  '{"max_guesses": 5, "word_count": 8, "band": 3, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;
reset role;
update psychicnum.games
   set words = array['zalpha','zbravo','zcharlie','zdelta','zecho','zfoxtrot','zgolf','zhotel'],
       secrets = array['zalpha','zbravo','zcharlie']
 where game_id in (select id from g);

-- ── At the start ──
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the start');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the start');
select is(
  (select game_status from common.games where id = (select id from g where mode = 'coop')),
  '{"required_secrets_count": 3, "max_guesses": 5}'::jsonb,
  'game_status holds the secret count and the budget');

-- ── Mid-game ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.submit_guess((select id from g where mode = 'coop'), 'zalpha');
select psychicnum.submit_guess((select id from g where mode = 'compete'), 'zdelta');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from g where mode = 'coop'), 'zdelta');
select psychicnum.submit_guess((select id from g where mode = 'compete'), 'zalpha');
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set mid-game');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set mid-game');
select is(
  (select clubpage_info->>'found_secrets_count' || '/' || (clubpage_info->>'guesses_used')
     from common.games where id = (select id from g where mode = 'coop')),
  '1/2',
  'coop: the club line has the team''s finds and the shared used count');
select is(
  (select array_agg((player_status->>'found_secrets_count')::int order by user_id)
     from common.game_players where game_id = (select id from g where mode = 'coop')),
  array[1, 0],
  'coop: each player''s status has what that player found');
select is(
  (select clubpage_info->'found_secrets_count' from common.games
    where id = (select id from g where mode = 'compete')),
  'null'::jsonb,
  'compete: the club line carries no progress');
select is(
  (select array_agg((player_status->>'guesses_used')::int order by user_id)
     from common.game_players where game_id = (select id from g where mode = 'compete')),
  array[1, 1],
  'compete: each racer''s status has their own used count');

-- ── At the end: bea wins the race, ada has conceded ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select psychicnum.concede((select id from g where mode = 'compete'));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select psychicnum.submit_guess((select id from g where mode = 'compete'), 'zbravo');
select psychicnum.submit_guess((select id from g where mode = 'compete'), 'zcharlie');
select psychicnum.stop_game((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the end');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the end');
select is(
  (select clubpage_info->>'winner_user_id' from common.games
    where id = (select id from g where mode = 'compete')),
  'bea22222-2222-2222-2222-222222222222',
  'compete: the club line names the winner at the end');
select is(
  (select clubpage_info->'winner_user_id' from common.games
    where id = (select id from g where mode = 'coop')),
  'null'::jsonb,
  'coop: the club line names no winner');
select is(
  (select player_status->>'player_ended_reason' from common.game_players
    where game_id = (select id from g where mode = 'compete')
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded',
  'compete: the conceder''s status says so, for the strip');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select psychicnum._write_statuses(id, p_update_status_changed_at => false) from g;
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  'a rebuild (false) leaves status_changed_at alone');
select psychicnum._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => true);
select is(
  (select status_changed_at from common.games where id = (select id from g where mode = 'coop')),
  now(),
  'an activity call (true) stamps status_changed_at');

-- A rebuild assigns, never merges: a key planted in a status does not survive.
update common.games set game_status = game_status || '{"stale": 1}'::jsonb,
                        clubpage_info = clubpage_info || '{"stale": 1}'::jsonb
 where id = (select id from g where mode = 'coop');
update common.game_players set player_status = player_status || '{"stale": 1}'::jsonb
 where game_id = (select id from g where mode = 'coop');
select isnt(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'precondition: the key-set check sees the planted key');
select psychicnum._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'a rebuild drops a stale key from every status');

-- Opening a game (the current-view pointer) never moves the date.
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select common.unset_current_view((select id from g where mode = 'compete'));
select common.set_current_view((select id from g where mode = 'coop'));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from common.games
    where id in (select id from g) and status_changed_at = '2026-01-01'),
  2,
  'opening and leaving games leaves status_changed_at alone');
select is(
  (select is_current_view from common.games where id = (select id from g where mode = 'coop')),
  true,
  'precondition: the pointer did move');

select * from finish();
rollback;
