-- cs-unmet

-- ============================================================
-- Test: wordiply._write_statuses — the page's copies of the game
-- ============================================================
-- A status has one shape per game and every key is always present, null when
-- it has no value (plans/common-tables.md → The statuses), so this checks the
-- exact key set of game_status, player_status and clubpage_info at the start,
-- mid-game and at the end, in both modes — which is what catches a key still
-- written after it was dropped. Then the values that matter: the scores stay
-- hidden until the end, a reject writes nothing, and only a call that says so
-- moves status_changed_at.
--
-- The fixture board (setup.psql) has base 'ar' and a longest word of 7.
-- ============================================================

begin;
set search_path = wordiply, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(17);

create temp table want (status text primary key, keys text[]) on commit drop;
insert into want values
  ('game_status',   array[]::text[]),
  ('player_status', array['guesses_used', 'length_score', 'letter_count', 'player_ended_reason']),
  ('clubpage_info', array['guesses_used', 'length_score', 'letter_count',
                          'winner_length_score', 'winner_user_id']);
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

-- Each player's words used, length score and letter count, in user order.
create function pg_temp.player_numbers(p_game_id uuid) returns text[] language sql as $$
  select array_agg(concat_ws('/', player_status->>'guesses_used',
                             coalesce(player_status->>'length_score', '-'),
                             coalesce(player_status->>'letter_count', '-'))
                   order by user_id)
    from common.game_players where game_id = p_game_id
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Wordiply statuses', array['ada', 'bea']) as handle;

create temp table g on commit drop as
select mode, (wordiply.create_game(
  (select handle from club),
  pg_temp.wordiply_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  mode,
  pg_temp.wordiply_board()
)->'data'->>'id')::uuid as id
  from unnest(array['coop', 'compete']) as mode;

-- ── At the start ──
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the start');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the start');
select is(
  (select clubpage_info from common.games where id = (select id from g where mode = 'coop')),
  '{"guesses_used": 0, "length_score": null, "letter_count": null,
    "winner_user_id": null, "winner_length_score": null}'::jsonb,
  'coop: the club line starts at no words used');

-- ── Mid-game: a word each in coop; ada's first in the race ──
select wordiply.submit_guess((select id from g where mode = 'coop'), 'cars');
select wordiply.submit_guess((select id from g where mode = 'compete'), 'stars');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g where mode = 'coop'), 'scar');
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set mid-game');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set mid-game');
select is(pg_temp.player_numbers((select id from g where mode = 'coop')), array['2/-/-', '2/-/-'],
  'coop: every player''s status has the team''s words, and no score before the end');
select is(pg_temp.player_numbers((select id from g where mode = 'compete')), array['1/-/-', '0/-/-'],
  'compete: each racer''s status has their own words, and no score before the end');
select is(
  (select clubpage_info->'guesses_used' from common.games where id = (select id from g where mode = 'compete')),
  'null'::jsonb,
  'compete: the club line carries no progress');

-- A reject changes nothing a status holds, so it writes none.
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.submit_guess((select id from g where mode = 'compete'), 'barn', false);
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select status_changed_at from common.games where id = (select id from g where mode = 'compete')),
  '2026-01-01'::timestamptz,
  'a rejected word leaves the statuses alone');

-- ── At the end: coop spends its five; ada spends hers and bea concedes ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select wordiply.submit_guess((select id from g where mode = 'coop'), w)
  from unnest(array['stars', 'hangars', 'arts']) w;
select wordiply.submit_guess((select id from g where mode = 'compete'), w)
  from unnest(array['cars', 'scar', 'arts', 'bar']) w;
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select wordiply.concede((select id from g where mode = 'compete'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'coop: every status has its full key set at the end');
select is(pg_temp.shapes_ok((select id from g where mode = 'compete')), 'ok',
  'compete: every status has its full key set at the end');
select is(
  (select concat_ws('/', clubpage_info->>'guesses_used', clubpage_info->>'length_score',
                    clubpage_info->>'letter_count')
     from common.games where id = (select id from g where mode = 'coop')),
  '5/100/24',
  'coop: the club line shows the team''s scores once the game has ended');
select is(
  (select (clubpage_info->>'winner_user_id') || '/' || (clubpage_info->>'winner_length_score')
     from common.games where id = (select id from g where mode = 'compete')),
  'ada11111-1111-1111-1111-111111111111/71',
  'compete: the club line names the winner and her length score');
select is(
  (select array_agg(player_status->>'player_ended_reason' order by user_id)
     from common.game_players where game_id = (select id from g where mode = 'compete')),
  array['resource_exhausted', 'conceded'],
  'compete: each racer''s status says how they ended, for the strip');

-- ── The date: only a call that says so moves it ──
update common.games set status_changed_at = '2026-01-01' where id in (select id from g);
select wordiply._write_statuses(id, p_update_status_changed_at => false) from g;
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
select wordiply._write_statuses((select id from g where mode = 'coop'), p_update_status_changed_at => false);
select is(pg_temp.shapes_ok((select id from g where mode = 'coop')), 'ok',
  'a rebuild drops a stale key from every status');

select * from finish();
rollback;
